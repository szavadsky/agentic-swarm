/** The steward's merge attempt: worktree, turn and settle. */

import { commitAll } from "../../core/git/commit.js";
import { git } from "../../core/git/exec.js";
import { unmergedFiles } from "../../core/git/merge.js";
import type { SessionRef } from "../../harness/types.js";
import { runAgentTurn } from "../agent.js";
import { formatCause, makeCause } from "../cause.js";
import { boundaryTarget, compactSession } from "../flow-context.js";
import { abortMerge, resolveVars, settleMergeTurn } from "../merge-conflict.js";
import { KERNEL_TURN_STEPS } from "../outcome.js";
import { materialHash } from "../task-material.js";
import type {
  Cause,
  KernelRuntime,
  Outcome,
  StepRecord,
  TaskFile,
  TaskState,
} from "../types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
  headSha,
  integrationHead,
} from "../worktree.js";
import type { EnsuredWorktree } from "../worktree.js";
import type {
  MergeAttempt,
  StewardAttempt,
  StewardCandidate,
} from "./types.js";

export function pointerConcern(
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

/**
 * A conflict-free merge commits itself; a conflict hands over to the steward.
 * A red-after-merge branch commits the merge, then hands over too: the steward
 * is the agent that repairs the red merged result, and a turn that leaves the
 * merge commit untouched settles no repair, so the attempt holds instead of
 * re-queueing the same red.
 */
async function prepareMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  wtPath: string,
  head: string,
  session: SessionRef | undefined,
  candidate: StewardCandidate,
): Promise<MergeAttempt> {
  const before = await headSha(wtPath);
  const merge = await git(wtPath, ["merge", "--no-ff", "--no-commit", head], {
    allowFail: true,
  });
  if (merge.code === 0) {
    const committed = await commitMerge(runtime, task, wtPath);
    if (!committed.ok) {
      await abortMerge(wtPath);
      return {
        before,
        result: { ok: false, cause: committed.cause, agentTurn: false },
      };
    }
    // The head merged cleanly. A red-after-merge candidate still hands over:
    // its turn repairs the merged result the commit carries, and the merge
    // commit is the baseline a repair must move.
    if (candidate.kind === "red-after-merge") {
      return { before: await headSha(wtPath), conflicts: [] };
    }
    return { before, result: { ok: true, agentTurn: false, session } };
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

/** The steward turn's settle hook: containment, merge settle, compaction. */
function stewardSettle(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  ensured: { path: string; branch: string },
  contained: Awaited<ReturnType<typeof containmentSnapshot>>,
  onBreach: (breach: string | undefined) => void,
): NonNullable<Parameters<typeof runAgentTurn>[1]["settle"]> {
  return async (_record, outcome, live) => {
    const breach = await containmentViolation(
      runtime,
      ensured.path,
      ensured.branch,
      contained,
    );
    onBreach(breach);
    if (breach) {
      return { ok: false, cause: makeCause("containment", breach) };
    }
    const settled = await settleMergeTurn(
      runtime,
      { iteration, slug: task.slug, round },
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
  };
}

async function runStewardTurn(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  ensured: EnsuredWorktree,
  head: string,
  conflicts: string[],
  session: SessionRef | undefined,
  candidate: StewardCandidate,
): Promise<{
  result: Awaited<ReturnType<typeof runAgentTurn>>;
  breach: string | undefined;
}> {
  const target = boundaryTarget(runtime, "steward");
  const base = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.base)
    .sort((a, b) => b.seq - a.seq)[0]?.base;
  const vars = resolveVars(
    runtime,
    ensured.path,
    ensured.branch,
    head,
    conflicts,
    records,
    candidate.gateLogPath,
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
    settle: stewardSettle(
      runtime,
      task,
      iteration,
      state.round,
      ensured,
      contained,
      (found) => {
        breach = found;
      },
    ),
  });
  return { result, breach };
}

export async function attemptStewardMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  session: SessionRef | undefined,
  candidate: StewardCandidate,
): Promise<StewardAttempt> {
  const prepared = await stewardWorktree(runtime, task);
  if ("attempt" in prepared) return prepared.attempt;
  const { ensured } = prepared;

  const head = await integrationHead(runtime);
  const merge = await prepareMerge(
    runtime,
    task,
    ensured.path,
    head,
    session,
    candidate,
  );
  if ("result" in merge) return merge.result;
  const { before, conflicts } = merge;

  const { result, breach } = await runStewardTurn(
    runtime,
    task,
    records,
    iteration,
    state,
    ensured,
    head,
    conflicts,
    session,
    candidate,
  );
  return finishStewardAttempt(runtime, ensured.path, before, breach, result);
}
