/** Candidate selection, holds and landing. */

import type { SessionRef } from "../../harness/types.js";
import { formatCause, makeCause } from "../cause.js";
import { derive } from "../derive.js";
import { mergeTask } from "../integrate.js";
import { scriptMeta } from "../record.js";
import type {
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
 * conflict. Each conflict gets one steward turn in the shared steward session
 * (compacted at settle), then the merge queue lands it with gates; failures
 * hold the task and leave an architect pointer (status, worktree, branch) as
 * a forwarded concern. A candidate whose leg stops on infra is reported as
 * dead and the remaining candidates still run; only a frozen slug (its bounded
 * re-dispatches spent, or a fatal cause) is left for the next launch. Unmerged
 * tasks relaunch via continuations on the new head through the existing
 * `base:` path.
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

/** Parked conflicts this wave may attempt, in slug order. */
export function stewardCandidates(
  tasks: readonly TaskFile[],
  state: ReturnType<typeof derive>,
  attempted: ReadonlySet<string>,
  frozen: ReadonlySet<string> | undefined,
): string[] {
  return tasks
    .filter((t) => {
      const s = state.tasks[t.slug];
      return (
        s?.status === "parked" &&
        s.cause?.kind === "conflict" &&
        !attempted.has(t.slug) &&
        !frozen?.has(t.slug)
      );
    })
    .map((t) => t.slug)
    .sort();
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

/** Attempts one parked conflict, then lands or holds its branch. */
export async function stewardCandidate(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  session: SessionRef | undefined,
): Promise<StewardCandidateOutcome> {
  const attempt = await attemptStewardMerge(
    runtime,
    task,
    records,
    iteration,
    state,
    session,
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
