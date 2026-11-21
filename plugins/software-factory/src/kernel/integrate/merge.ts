/** Recording a merge: ref moves, merge starts and their recovery. */

import type { CheckResult } from "../../core/checks/types.js";
import { commitAll, isAncestor } from "../../core/git/commit.js";
import { GitError, git } from "../../core/git/exec.js";
import { unmergedFiles } from "../../core/git/merge.js";
import { makeCause } from "../cause.js";
import { newGateFailures } from "../gates.js";
import { scriptMeta } from "../record.js";
import { taskArchitect } from "../tasks.js";
import type {
  Cause,
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
} from "../types.js";
import {
  branchExists,
  integrationHead,
  removeMergeScratch,
  resetMergeScratch,
  taskBranchName,
} from "../worktree.js";

export function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

export function causeOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function syncCheckout(
  runtime: KernelRuntime,
  commit: string,
): Promise<void> {
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(runtime.paths.goalCheckout, ["reset", "--hard", commit]);
    await git(runtime.paths.goalCheckout, ["clean", "-fd"], {
      allowFail: true,
    });
  });
}

/** An outside commit moved the integration branch while the queue was building a merge. */
export class IntegrationMovedError extends Error {
  /** The cause detail, without the kind prefix the error message carries. */
  readonly detail: string;
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    const detail =
      `expected ${expected.slice(0, 10)}, found ${actual ? actual.slice(0, 10) : "a missing ref"}; ` +
      "an outside commit is on the integration branch and this merge left it untouched";
    super(`integration moved: ${detail}`);
    this.detail = detail;
    this.name = "IntegrationMovedError";
  }
}

/**
 * Moves the integration ref only if it is still where the merge was built from.
 * An operator or rogue commit after that point must not be overwritten: the
 * merge fails loudly and the task records it.
 */
export async function refMove(
  runtime: KernelRuntime,
  commit: string,
  expected: string,
): Promise<void> {
  const ref = `refs/heads/${runtime.paths.integrationBranch}`;
  await runtime.repo.writeLock.runExclusive(async () => {
    const res = await git(
      runtime.paths.repoRoot,
      ["update-ref", ref, commit, expected],
      { allowFail: true },
    );
    if (res.code === 0) return;
    const actual = await git(
      runtime.paths.repoRoot,
      ["rev-parse", "--verify", "--quiet", ref],
      { allowFail: true },
    );
    const found = actual.stdout.trim();
    // A refused update that still sees the expected value is a lock or git
    // failure, not an outside commit; keep git's own reason.
    if (found === expected) {
      throw new GitError(
        `update-ref ${ref} ${commit} ${expected}`,
        res.code,
        res.stderr,
        res.stdout,
      );
    }
    throw new IntegrationMovedError(expected, found);
  });
}

async function recordMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  end: RecordEnd,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(iteration, "merge", {
      slug: task.slug,
      round,
      architect: taskArchitect(task),
    }),
    end,
  );
}

/**
 * A merge start that carries the planned commit and did not succeed. Recovery
 * seals interrupted records as `infra: crash` before dispatch, so the match
 * includes those; an explicit failure of any other kind is a real outcome.
 */
function recoverableMergeStart(record: StepRecord): boolean {
  if (!record.commit || record.ok === true) return false;
  if (!record.endedAt) return true;
  return record.stop?.kind === "infra";
}

/**
 * A crash after the planned commit was recorded but before (or just after) the
 * ref moved must complete that merge, never squash it a second time. The open
 * record carries the planned commit; the parent check makes a stale plan inert.
 */
export async function recoverOpenMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  round: number,
): Promise<boolean> {
  const open = records
    .filter(
      (r) =>
        r.slug === task.slug && r.step === "merge" && recoverableMergeStart(r),
    )
    .sort(bySeq)
    .at(-1);
  if (!open?.commit) return false;
  const commit = open.commit;
  const exists = await git(
    runtime.paths.repoRoot,
    ["cat-file", "-e", `${commit}^{commit}`],
    { allowFail: true },
  );
  if (exists.code !== 0) return false;
  const head = await integrationHead(runtime);
  const already =
    commit === head || (await isAncestor(runtime.paths.repoRoot, commit, head));
  const parent = await git(
    runtime.paths.repoRoot,
    ["rev-parse", `${commit}^`],
    { allowFail: true },
  );
  const movable = parent.code === 0 && parent.stdout.trim() === head;
  if (!already && !movable) return false;
  if (movable) {
    try {
      await refMove(runtime, commit, head);
    } catch (err) {
      if (!(err instanceof IntegrationMovedError)) throw err;
      // A failure record parks the task; the stale open record stays inert.
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: makeCause("integration-moved", err.detail),
      });
      return true;
    }
  }
  await syncCheckout(runtime, already ? head : commit);
  await recordMerge(runtime, task, iteration, round, {
    ok: true,
    commit,
    cause: makeCause("note", "recovered merge after crash"),
  });
  return true;
}

/**
 * The last task-checks record that already judged `tree` under the current
 * inherited-failure set. Tree identity, not commit: the squash commit always
 * differs from the task tip. A gate-flake re-run that closed green counts —
 * the checks record carries the re-run result.
 */
export function judgedChecks(
  records: StepRecord[],
  slug: string,
  tree: string,
  preexisting: ReadonlySet<string>,
): StepRecord | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.step === "checks" &&
        r.endedAt &&
        r.tree === tree &&
        r.checks !== undefined &&
        newGateFailures(r.checks, preexisting).length === 0,
    )
    .sort(bySeq)
    .at(-1);
}

/**
 * Serial squash-merge queue. The squash commit is built and gated in a scratch
 * worktree detached at the current integration head; the integration ref moves
 * only after green, and the stable goal checkout is synced afterwards.
 */
/** Records a merge failure and removes the scratch worktree. */
export async function failMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  cause: Cause,
  checks?: CheckResult[],
): Promise<void> {
  await removeMergeScratch(runtime);
  await recordMerge(runtime, task, iteration, round, {
    ok: false,
    cause,
    ...(checks ? { checks } : {}),
  });
}

/** Commits the staged squash; records the failure that prevents it. */
async function commitSquashedBranch(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  scratch: string,
): Promise<boolean> {
  const staged = await git(scratch, ["diff", "--cached", "--quiet"], {
    allowFail: true,
  });
  if (staged.code === 0) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("no-progress", "task branch has no changes since dispatch"),
    );
    return false;
  }

  try {
    const mergeCommit = await commitAll(
      runtime.repo,
      scratch,
      `factory: merge ${task.slug}`,
    );
    if (!mergeCommit) {
      await failMerge(
        runtime,
        task,
        iteration,
        round,
        makeCause("no-progress", "squash merge produced no commit"),
      );
      return false;
    }
  } catch (err) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("merge-failed", causeOf(err)),
    );
    return false;
  }
  return true;
}

/**
 * Squashes the task branch in a scratch worktree at the integration head.
 * Undefined means the merge already failed and its record is written.
 */
export async function squashTaskBranch(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
): Promise<{ scratch: string; head: string } | undefined> {
  const branch = taskBranchName(runtime, task.slug);
  if (!(await branchExists(runtime, branch))) {
    await recordMerge(runtime, task, iteration, round, {
      ok: false,
      cause: makeCause("merge-failed", `branch "${branch}" does not exist`),
    });
    return undefined;
  }

  const head = await integrationHead(runtime);
  const scratch = await resetMergeScratch(runtime, head);
  const squash = await git(scratch, ["merge", "--squash", branch], {
    allowFail: true,
  });
  if (squash.code !== 0) {
    // The record is the signal, not a park: the task's resolve step merges the
    // head into the branch and resolves it, then checks and re-merges. A second
    // conflict, a flow with no resolve step, or a kept-land merge parks the
    // branch and leaves it to the wave-end steward.
    const paths = await unmergedFiles(scratch);
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause(
        "conflict",
        paths.join(", ") || "squash merge conflicts with the integration head",
      ),
    );
    return undefined;
  }

  if (!(await commitSquashedBranch(runtime, task, iteration, round, scratch))) {
    return undefined;
  }
  return { scratch, head };
}
