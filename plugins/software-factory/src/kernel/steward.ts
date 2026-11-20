// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { unmergedFiles } from "../core/git/merge.js";
import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { boundaryTarget, compactSession } from "./flow-context.js";
import { mergeTask } from "./integrate.js";
import { abortMerge, resolveVars, settleMergeTurn } from "./merge-conflict.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import type {
  Cause,
  KernelRuntime,
  Outcome,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
  type EnsuredWorktree,
  headSha,
  integrationHead,
  taskBranchName,
} from "./worktree.js";

/** One conflict candidate whose steward leg stopped on infra. */
export interface StewardDead {
  slug: string;
  /** The stop's cause verbatim: dispatch classifies it for the backoff. */
  cause: string;
  details?: string;
}

export interface StewardResult {
  skipped: boolean;
  attempted: string[];
  landed: string[];
  unmerged: string[];
  /**
   * Candidates whose leg stopped on infra. Dispatch books the fault against
   * the slug; the remaining candidates still ran.
   */
  dead: StewardDead[];
  cancelled?: boolean;
}

export interface StewardOptions {
  /**
   * Slugs whose infra fault has no live leg this pass: a fatal cause, spent
   * re-dispatches, or a backoff the loop will not spend (a drain or a stop
   * request). Their work waits for the next launch, so the steward skips them.
   */
  frozen?: ReadonlySet<string>;
}

interface StewardAttempt {
  ok: boolean;
  cause?: Cause;
  infra?: { kind: "infra"; cause: string; details?: string };
  cancelled?: boolean;
  session?: SessionRef;
  outcome?: Outcome;
  agentTurn: boolean;
}

function pointerConcern(
  slug: string,
  status: Cause,
  worktree: string,
  branch: string,
): Outcome {
  return {
    status: "done",
    summary: `steward held ${slug}: unresolvable merge`,
    concerns: [
      {
        kind: "risk",
        calibration: "architect",
        text: `steward: ${slug} unmerged (${formatCause(status)}); worktree ${worktree}; branch ${branch}`,
        evidence: `records steward ${slug}`,
      },
    ],
    forward: [],
  };
}

/** Commits the merge HEAD already built in the steward worktree. */
async function commitMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  cwd: string,
): Promise<{ ok: true } | { ok: false; cause: Cause }> {
  try {
    const commit = await commitAll(
      runtime.repo,
      cwd,
      `factory: ${task.slug} merge integration head`,
    );
    if (commit) return { ok: true };
    return {
      ok: false,
      cause: makeCause("merge-failed", "merge produced no commit"),
    };
  } catch (err) {
    return {
      ok: false,
      cause: makeCause(
        "merge-failed",
        `merge commit failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    };
  }
}

/** The worktree a steward attempt needs, or the failure that ends it. */
async function stewardWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
): Promise<{ ensured: EnsuredWorktree } | { attempt: StewardAttempt }> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    return {
      attempt: {
        ok: false,
        cause: makeCause("setup", ensured.error),
        agentTurn: false,
      },
    };
  }
  if (ensured.setup && !ensured.setup.ok) {
    return {
      attempt: {
        ok: false,
        cause: makeCause("setup", ensured.setup.error ?? "unknown"),
        agentTurn: false,
      },
    };
  }
  if (ensured.mergeConflict) {
    const named =
      ensured.mergeConflict.paths.join(", ") ||
      "git reported no unmerged paths";
    await abortMerge(ensured.path);
    return {
      attempt: {
        ok: false,
        cause: makeCause("base-conflict", named),
        agentTurn: false,
      },
    };
  }
  return { ensured };
}

type MergeAttempt =
  | { before: string; conflicts: string[] }
  | { before: string; result: StewardAttempt };

/** A conflict-free merge commits itself; a conflict hands over to the steward. */
async function prepareMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  wtPath: string,
  head: string,
  session: SessionRef | undefined,
): Promise<MergeAttempt> {
  const before = await headSha(wtPath);
  const merge = await git(wtPath, ["merge", "--no-ff", "--no-commit", head], {
    allowFail: true,
  });
  if (merge.code === 0) {
    const committed = await commitMerge(runtime, task, wtPath);
    if (committed.ok) {
      return { before, result: { ok: true, agentTurn: false, session } };
    }
    await abortMerge(wtPath);
    return {
      before,
      result: { ok: false, cause: committed.cause, agentTurn: false },
    };
  }
  const conflicts = await unmergedFiles(wtPath);
  if (conflicts.length === 0) {
    await abortMerge(wtPath);
    return {
      before,
      result: {
        ok: false,
        cause: makeCause(
          "merge-failed",
          merge.stderr.trim().slice(-500) || "merge failed without conflicts",
        ),
        agentTurn: false,
      },
    };
  }
  return { before, conflicts };
}

/** A finished turn that produced no merge commit. */
function failedTurn(
  message: string,
  storedSession: SessionRef | undefined,
  outcome: Outcome | undefined,
): StewardAttempt {
  return {
    ok: false,
    cause: makeCause("merge-failed", message),
    ...(storedSession ? { session: storedSession } : {}),
    ...(outcome ? { outcome } : {}),
    agentTurn: true,
  };
}

/** Turns a finished steward turn into the attempt the launch records. */
async function finishStewardAttempt(
  runtime: KernelRuntime,
  wtPath: string,
  before: string,
  breach: string | undefined,
  result: Awaited<ReturnType<typeof runAgentTurn>>,
): Promise<StewardAttempt> {
  if (breach) {
    await abortMerge(wtPath);
    return {
      ok: false,
      cause: makeCause("containment", breach),
      agentTurn: true,
    };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    await abortMerge(wtPath);
    return {
      ok: false,
      infra: {
        kind: "infra",
        cause: stop.cause,
        ...(stop.details ? { details: stop.details } : {}),
      },
      agentTurn: true,
    };
  }
  if (stop?.kind === "cancelled") {
    await abortMerge(wtPath);
    return { ok: false, cancelled: true, agentTurn: true };
  }
  const storedSession = result.record.session;
  const after = await headSha(wtPath);
  if (after === before) {
    await abortMerge(wtPath);
    return failedTurn(
      result.outcome?.summary ?? "steward made no merge commit",
      storedSession,
      result.outcome,
    );
  }
  const mergeHead = await git(
    wtPath,
    ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
    {
      allowFail: true,
    },
  );
  if (mergeHead.code === 0) {
    await abortMerge(wtPath);
    return failedTurn(
      "merge still in progress after the steward attempt",
      storedSession,
      result.outcome,
    );
  }
  return {
    ok: true,
    ...(storedSession ? { session: storedSession } : {}),
    ...(result.outcome ? { outcome: result.outcome } : {}),
    agentTurn: true,
  };
}

async function attemptStewardMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  session: SessionRef | undefined,
): Promise<StewardAttempt> {
  const prepared = await stewardWorktree(runtime, task);
  if ("attempt" in prepared) return prepared.attempt;
  const { ensured } = prepared;

  const head = await integrationHead(runtime);
  const merge = await prepareMerge(runtime, task, ensured.path, head, session);
  if ("result" in merge) return merge.result;
  const { before, conflicts } = merge;

  const target = boundaryTarget(runtime, "steward", iteration);
  const base = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.base)
    .sort((a, b) => a.seq - b.seq)[0]?.base;
  const vars = resolveVars(
    runtime,
    ensured.path,
    ensured.branch,
    head,
    conflicts,
    records,
  );
  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const result = await runAgentTurn(runtime, {
    target,
    cwd: ensured.path,
    meta: {
      iteration,
      slug: task.slug,
      step: "steward",
      round: state.round,
      ...(base ? { base } : {}),
      taskHash: materialHash(task),
    },
    vars,
    expectation: KERNEL_TURN_STEPS.steward,
    session,
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(
        runtime,
        ensured.path,
        ensured.branch,
        contained,
      );
      if (breach) {
        return { ok: false, cause: makeCause("containment", breach) };
      }
      const settled = await settleMergeTurn(
        runtime,
        { iteration, slug: task.slug, round: state.round },
        ensured.path,
        `factory: ${task.slug} merge integration head`,
      );
      if (!outcome || !live) return settled;
      const compacted = await compactSession(runtime, live);
      if (!compacted) return settled;
      return {
        ...settled,
        session: compacted.session,
        ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
      };
    },
  });

  return finishStewardAttempt(runtime, ensured.path, before, breach, result);
}

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
function attemptedThisWave(
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
function stewardCandidates(
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

type StewardCandidateOutcome =
  | { kind: "dead"; dead: StewardDead; session?: SessionRef }
  | { kind: "cancelled"; session?: SessionRef }
  | { kind: "landed"; session?: SessionRef }
  | { kind: "unmerged"; session?: SessionRef };

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
async function stewardCandidate(
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

/**
 * Steward-merge launch step: every parked conflict is attempted once by a
 * model turn in its own worktree (compacted at settle), then the merge queue
 * lands it with gates; failures hold the task and leave an architect pointer
 * (status, worktree, branch) as a forwarded concern. A candidate whose leg
 * stops on infra is reported as dead and the remaining candidates still run;
 * only a frozen slug (its bounded re-dispatches spent, or a fatal cause) is
 * left for the next launch. Unmerged tasks relaunch via continuations on the
 * new head through the existing `base:` path.
 */
export async function runSteward(
  runtime: KernelRuntime,
  iteration: number,
  opts: StewardOptions = {},
): Promise<StewardResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  // A turn that stopped on infra is not an attempt: its slug gets the
  // task-turn backoff, so a later wave retries it instead of skipping it.
  const attempted = attemptedThisWave(records, iteration);
  const candidates = stewardCandidates(tasks, state, attempted, opts.frozen);
  if (candidates.length === 0) {
    await recordSkippedSteward(runtime, records, iteration);
    return { skipped: true, attempted: [], landed: [], unmerged: [], dead: [] };
  }

  const attemptedSlugs: string[] = [];
  const landed: string[] = [];
  const unmerged: string[] = [];
  const dead: StewardDead[] = [];
  let session: SessionRef | undefined;

  for (const slug of candidates) {
    const task = tasks.find((t) => t.slug === slug)!;
    const fresh = await runtime.store.listRecords();
    const taskState = derive(
      await runtime.store.listTasks(),
      fresh,
      runtime.configs.process.flows,
    ).tasks[slug]!;
    attemptedSlugs.push(slug);
    const outcome = await stewardCandidate(
      runtime,
      task,
      fresh,
      iteration,
      taskState,
      session,
    );
    if (outcome.session) session = outcome.session;
    if (outcome.kind === "cancelled") {
      return {
        skipped: false,
        attempted: attemptedSlugs,
        landed,
        unmerged,
        dead,
        cancelled: true,
      };
    }
    if (outcome.kind === "dead") {
      dead.push(outcome.dead);
      continue;
    }
    if (outcome.kind === "landed") landed.push(slug);
    else unmerged.push(slug);
  }

  return {
    skipped: false,
    attempted: attemptedSlugs,
    landed,
    unmerged,
    dead,
  };
}
