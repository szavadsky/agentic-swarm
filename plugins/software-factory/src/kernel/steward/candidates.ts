/** Candidate selection, holds and landing. */

import type { SessionRef } from "../../harness/types.js";
import { preexistingRed, recordedBaseGates } from "../baseline.js";
import { formatCause, makeCause } from "../cause.js";
import { derive } from "../derive.js";
import { newRedChecks } from "../gates.js";
import { type GoalHeadJudgement, mergeTask } from "../integrate.js";
import { scriptMeta } from "../record.js";
import type {
  ArtifactStore,
  Cause,
  KernelRuntime,
  Outcome,
  StepRecord,
  TaskFile,
  TaskState,
} from "../types.js";
import { ensureTaskWorktree, taskBranchName } from "../worktree.js";
import { attemptStewardMerge, pointerConcern } from "./merge.js";
import type {
  StewardAttempt,
  StewardCandidate,
  StewardCandidateOutcome,
  StewardResult,
} from "./types.js";

function hasPointer(outcome: Outcome | undefined, branch: string): boolean {
  if (!outcome) return false;
  const texts = [
    ...outcome.concerns.map((c) => `${c.text} ${c.evidence ?? ""}`),
    ...outcome.forward,
  ].join("\n");
  return texts.includes(branch);
}

async function ensurePointer(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  status: Cause,
  worktree: string,
  branch: string,
  outcome: Outcome | undefined,
): Promise<void> {
  if (hasPointer(outcome, branch)) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, "steward", { slug: task.slug, round }),
    {
      ok: false,
      cause: makeCause("held", formatCause(status)),
      outcome: pointerConcern(task.slug, status, worktree, branch),
    },
  );
}

/**
 * End-of-wave steward: the one agent that owns cross-task merge state. Runs
 * once per wave end; skipped (and recorded) when no task parks on a merge
 * conflict, a base conflict or a red gate. Each candidate gets one steward turn
 * in the shared steward session (compacted at settle), then the merge queue
 * lands it with gates; failures hold the task and leave an architect pointer
 * (status, worktree, branch) as a forwarded concern. A red-after-merge
 * candidate's turn receives the gate log to repair: the goal head's own red
 * when the head is red, else the merged result's. A candidate whose leg stops
 * on infra is reported as dead and the remaining candidates still run; only a
 * frozen slug (its bounded re-dispatches spent, or a fatal cause) is left for
 * the next launch. Unmerged tasks relaunch via continuations on the new head
 * through the existing `base:` path.
 */
export function attemptedThisWave(
  records: readonly StepRecord[],
  iteration: number,
): Set<string> {
  return new Set(
    records
      .filter(
        (r) =>
          r.iteration === iteration &&
          r.step === "steward" &&
          r.slug &&
          r.stop?.kind !== "infra",
      )
      .map((r) => r.slug!),
  );
}

/**
 * A branch the kept-land will land on its own needs no steward turn: the
 * boundary retries its unchanged tip through the queue, recomputes the gate
 * verdict there, and a steward turn would re-queue the same merge with the
 * same evidence. Kept-land claims the tip when the newest approve covers it,
 * or — under a review-less flow — green checks ran after it. `own` is in seq
 * order.
 */
function keptLandOwnsTip(own: readonly StepRecord[]): boolean {
  const tip = own.filter((r) => r.actor === "agent" && r.commit).at(-1)?.commit;
  if (tip === undefined) return false;
  const approved = own
    .filter((r) => r.actor === "agent" && r.outcome?.verdict === "approve")
    .at(-1);
  if (approved) return approved.commit === tip;
  const tipIndex = own.findLastIndex(
    (r) =>
      r.actor === "agent" &&
      r.commit === tip &&
      // A verdict turn (a review, or the decider the kernel raises) reads the
      // tip; it never moves it, so green checks between the code turn and the
      // verdict still cover the branch.
      r.outcome?.verdict === undefined,
  );
  if (tipIndex < 0) return false;
  return own
    .slice(tipIndex + 1)
    .some((r) => r.step === "checks" && r.ok === true);
}

/**
 * A park the wave-end steward may attempt, in slug order, before its gate
 * evidence is read. `conflict` owns a branch the integration head must merge
 * into; `gates` waits on a red the head has to establish.
 */
export interface StewardPark {
  slug: string;
  kind: "conflict" | "gates";
}

/**
 * Parks a steward turn may own this wave: a merge conflict (the merge or the
 * kept-land left the branch unresolved) and a base conflict (the branch could
 * not take the head in — the same merge caught one step earlier, so the same
 * turn owns it). A gates park is listed too; whether it is a candidate is the
 * gate evidence's call.
 */
export function stewardParks(
  tasks: readonly TaskFile[],
  state: ReturnType<typeof derive>,
  attempted: ReadonlySet<string>,
  frozen: ReadonlySet<string> | undefined,
): StewardPark[] {
  const parks: StewardPark[] = [];
  for (const t of tasks) {
    if (attempted.has(t.slug) || frozen?.has(t.slug)) continue;
    const s = state.tasks[t.slug];
    if (s?.status !== "parked") continue;
    const cause = s.cause?.kind;
    if (cause === "conflict" || cause === "base-conflict")
      parks.push({ slug: t.slug, kind: "conflict" });
    else if (cause === "gates") parks.push({ slug: t.slug, kind: "gates" });
  }
  return parks.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * A gates park whose red is still on the goal head, or on the branch's own
 * merged result. Head redness comes from the goal-head gate run — a result
 * keyed by the head's tree — never from a task's merge-check, which judges a
 * merged result that did not land. A branch whose merged result ran red on a
 * green head is still the steward's: the merge split it, not either side.
 * Inherited and infra reds never judge. The head's log wins when both are red:
 * it is the state the branch has to merge onto.
 */
function redAfterMerge(
  slug: string,
  records: readonly StepRecord[],
  preexisting: ReadonlySet<string>,
  store: ArtifactStore | undefined,
  goalHead: GoalHeadJudgement | undefined,
): StewardCandidate | undefined {
  const own = records
    .filter((r) => r.slug === slug && r.endedAt)
    .sort((a, b) => a.seq - b.seq);
  if (keptLandOwnsTip(own)) return undefined;
  if (goalHead && goalHead.red.length > 0) {
    return {
      slug,
      kind: "red-after-merge",
      gateLogPath: store
        ? store.records.file(goalHead.record, "end.yaml")
        : undefined,
    };
  }
  const last = own.filter((r) => r.step === "merge-checks").at(-1);
  if (!last?.checks) return undefined;
  if (newRedChecks(last.checks, preexisting).length === 0) return undefined;
  return {
    slug,
    kind: "red-after-merge",
    gateLogPath: store ? store.records.file(last, "end.yaml") : undefined,
  };
}

/**
 * Parked conflicts, base conflicts and red gates this wave may attempt, in
 * slug order. A conflict candidate needs no gate evidence, so records stay
 * optional for tests that only ask for it.
 */
export function stewardCandidates(
  tasks: readonly TaskFile[],
  state: ReturnType<typeof derive>,
  attempted: ReadonlySet<string>,
  frozen: ReadonlySet<string> | undefined,
  records: readonly StepRecord[] = [],
  store?: ArtifactStore,
  goalHead?: GoalHeadJudgement,
): StewardCandidate[] {
  const preexisting = preexistingRed(recordedBaseGates(records));
  const candidates: StewardCandidate[] = [];
  for (const park of stewardParks(tasks, state, attempted, frozen)) {
    if (park.kind === "conflict") {
      candidates.push({ slug: park.slug, kind: "conflict" });
      continue;
    }
    const candidate = redAfterMerge(
      park.slug,
      records,
      preexisting,
      store,
      goalHead,
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

async function recordSkippedSteward(
  runtime: KernelRuntime,
  records: readonly StepRecord[],
  iteration: number,
): Promise<void> {
  const recorded = records.some(
    (r) => r.iteration === iteration && r.step === "steward",
  );
  if (recorded) return;
  await runtime.store.appendRecord(scriptMeta(iteration, "steward"), {
    ok: true,
    cause: makeCause("note", "skipped: no conflicts"),
  });
}

/** Records how a failed attempt held its task: a script note or an architect pointer. */
async function holdAttempt(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  state: TaskState,
  attempt: StewardAttempt,
  worktree: string,
  branch: string,
): Promise<void> {
  const status = attempt.cause ?? makeCause("held", "unresolved");
  if (attempt.agentTurn) {
    await ensurePointer(
      runtime,
      task,
      iteration,
      state.round,
      status,
      worktree,
      branch,
      attempt.outcome,
    );
    return;
  }
  await runtime.store.appendRecord(
    scriptMeta(iteration, "steward", {
      slug: task.slug,
      round: state.round,
    }),
    {
      ok: false,
      cause: makeCause("held", formatCause(status)),
      outcome: pointerConcern(task.slug, status, worktree, branch),
    },
  );
}

/** The dead leg's payload, with details only when present. */
function deadDetails(infra: { cause: string; details?: string }): {
  cause: string;
  details?: string;
} {
  return {
    cause: infra.cause,
    ...(infra.details ? { details: infra.details } : {}),
  };
}

/** Lands a steward attempt's branch through the kept-land queue. */
async function landStewardCandidate(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  state: TaskState,
  attempt: StewardAttempt,
  worktree: string,
  branch: string,
): Promise<StewardCandidateOutcome> {
  if (!attempt.agentTurn) {
    await runtime.store.appendRecord(
      scriptMeta(iteration, "steward", {
        slug: task.slug,
        round: state.round,
      }),
      {
        ok: true,
        cause: makeCause("note", `auto-merged ${branch} without a turn`),
      },
    );
  }
  // The branch now carries the head; land through the queue without a second
  // agent attempt (kept-land mode: conflict parks, red gates get one flake
  // re-run). Gates are the steward's CI run.
  const merged = await mergeTask(runtime, task, iteration, state, {
    keptLand: true,
  });
  if (merged.infra) {
    return {
      kind: "dead",
      dead: { slug: task.slug, ...deadDetails(merged.infra) },
      session: attempt.session,
    };
  }
  if (merged.cancelled) return { kind: "cancelled" };
  const after = await runtime.store.listRecords();
  const merge = after
    .filter((r) => r.slug === task.slug && r.step === "merge" && r.endedAt)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (merge?.ok === true && merge.iteration === iteration) {
    return { kind: "landed", session: attempt.session };
  }
  // Parked is terminal: a red gates run cannot ready a fix turn here, so the
  // steward holds and the relaunch happens via a continuation.
  const cause = merge?.cause ?? makeCause("merge-failed", "merge did not land");
  await ensurePointer(
    runtime,
    task,
    iteration,
    state.round,
    cause,
    worktree,
    branch,
    attempt.outcome,
  );
  return { kind: "unmerged", session: attempt.session };
}

/** Attempts one parked conflict or red merged result, then lands or holds it. */
export async function stewardCandidate(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  session: SessionRef | undefined,
  candidate: StewardCandidate,
): Promise<StewardCandidateOutcome> {
  const attempt = await attemptStewardMerge(
    runtime,
    task,
    records,
    iteration,
    state,
    session,
    candidate,
  );
  if (attempt.infra) {
    return {
      kind: "dead",
      dead: { slug: task.slug, ...deadDetails(attempt.infra) },
    };
  }
  if (attempt.cancelled) return { kind: "cancelled" };

  const branch = taskBranchName(runtime, task.slug);
  // The worktree path is stable per slug; read it from the ensured checkout
  // when present, else the branch name is the pointer's locator.
  const ensured = await ensureTaskWorktree(runtime, task);
  const worktree = ensured.path;

  if (!attempt.ok) {
    await holdAttempt(
      runtime,
      task,
      iteration,
      state,
      attempt,
      worktree,
      branch,
    );
    return { kind: "unmerged", session: attempt.session };
  }

  return landStewardCandidate(
    runtime,
    task,
    iteration,
    state,
    attempt,
    worktree,
    branch,
  );
}

/** Records a wave with no candidates and returns its empty result. */
export async function skipStewardWave(
  runtime: KernelRuntime,
  records: StepRecord[],
  iteration: number,
): Promise<StewardResult> {
  await recordSkippedSteward(runtime, records, iteration);
  return { skipped: true, attempted: [], landed: [], unmerged: [], dead: [] };
}

/** The candidate's state derived from the newest records and task list. */
export async function stewardCandidateState(
  runtime: KernelRuntime,
  records: StepRecord[],
  slug: string,
): Promise<TaskState> {
  const tasks = await runtime.store.listTasks();
  return derive(tasks, records, runtime.configs.process.flows).tasks[slug]!;
}
