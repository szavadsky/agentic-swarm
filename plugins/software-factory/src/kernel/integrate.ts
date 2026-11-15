import { runWorktreeSetup } from "../core/checks/setup.js";
import { commitAll, isAncestor } from "../core/git/commit.js";
import { GitError, git } from "../core/git/exec.js";
import { KeyedMutex } from "../core/mutex.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { newGateFailures, runGates } from "./gates.js";
import { attemptConflictMerge } from "./merge-attempt.js";
import { finishChecks, scriptMeta, startChecks } from "./record.js";
import type {
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";
import {
  branchExists,
  headSha,
  integrationHead,
  removeMergeScratch,
  resetMergeScratch,
  taskBranchName,
} from "./worktree.js";

export interface MergeResult {
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

/** One serial queue per goal; multiple tasks may ask, they never merge at once. */
const mergeQueue = new KeyedMutex();

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

function causeOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function syncCheckout(
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
class IntegrationMovedError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `integration moved: expected ${expected.slice(0, 10)}, found ${actual ? actual.slice(0, 10) : "a missing ref"}; ` +
        "an outside commit is on the integration branch and this merge left it untouched",
    );
    this.name = "IntegrationMovedError";
  }
}

/**
 * Moves the integration ref only if it is still where the merge was built from.
 * An operator or rogue commit after that point must not be overwritten: the
 * merge fails loudly and the task records it.
 */
async function refMove(
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
    scriptMeta(iteration, "merge", { slug: task.slug, round }),
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
async function recoverOpenMerge(
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
        cause: err.message,
      });
      return true;
    }
  }
  await syncCheckout(runtime, already ? head : commit);
  await recordMerge(runtime, task, iteration, round, {
    ok: true,
    commit,
    cause: "recovered merge after crash",
  });
  return true;
}

/**
 * Serial squash-merge queue. The squash commit is built and gated in a scratch
 * worktree detached at the current integration head; the integration ref moves
 * only after green, and the stable goal checkout is synced afterwards.
 */
export async function mergeTask(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  state: TaskState,
): Promise<MergeResult> {
  return mergeQueue.runExclusive(runtime.paths.goalDir, async () => {
    const round = state.round;
    const records = await runtime.store.listRecords();
    if (
      records.some(
        (r) => r.slug === task.slug && r.step === "merge" && r.ok === true,
      )
    )
      return {};
    if (await recoverOpenMerge(runtime, task, records, iteration, round))
      return {};

    const branch = taskBranchName(runtime, task.slug);
    if (!(await branchExists(runtime, branch))) {
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: `merge failed: branch "${branch}" does not exist`,
      });
      return {};
    }

    let head = await integrationHead(runtime);
    let scratch = await resetMergeScratch(runtime, head);
    let squash = await git(scratch, ["merge", "--squash", branch], {
      allowFail: true,
    });
    if (squash.code !== 0) {
      await removeMergeScratch(runtime);
      const attempt = await attemptConflictMerge(
        runtime,
        task,
        records,
        iteration,
        state,
      );
      if (attempt.infra) return { infra: attempt.infra };
      if (attempt.cancelled) return { cancelled: true };
      if (!attempt.ok) {
        await recordMerge(runtime, task, iteration, round, {
          ok: false,
          cause: `conflict: ${attempt.cause ?? "unresolved"}`,
        });
        return {};
      }
      head = await integrationHead(runtime);
      scratch = await resetMergeScratch(runtime, head);
      squash = await git(scratch, ["merge", "--squash", branch], {
        allowFail: true,
      });
      if (squash.code !== 0) {
        await removeMergeScratch(runtime);
        await recordMerge(runtime, task, iteration, round, {
          ok: false,
          cause:
            "conflict: squash merge still conflicts after one implementer attempt",
        });
        return {};
      }
    }

    const staged = await git(scratch, ["diff", "--cached", "--quiet"], {
      allowFail: true,
    });
    if (staged.code === 0) {
      await removeMergeScratch(runtime);
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: "no-progress: task branch has no changes since dispatch",
      });
      return {};
    }

    try {
      const mergeCommit = await commitAll(
        runtime.repo,
        scratch,
        `factory: merge ${task.slug}`,
      );
      if (!mergeCommit) {
        await removeMergeScratch(runtime);
        await recordMerge(runtime, task, iteration, round, {
          ok: false,
          cause: "no-progress: squash merge produced no commit",
        });
        return {};
      }
    } catch (err) {
      await removeMergeScratch(runtime);
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: `merge failed: ${causeOf(err)}`,
      });
      return {};
    }

    const setup = await runWorktreeSetup({
      commands: runtime.configs.repo.setup,
      cwd: scratch,
    });
    if (!setup.ok) {
      await removeMergeScratch(runtime);
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: `setup: ${setup.error ?? "unknown"}`,
      });
      return {};
    }
    const gate = await startChecks(
      runtime.store,
      { iteration, slug: task.slug, round },
      { step: "merge-checks" },
    );
    const checks = await runGates(runtime, scratch);
    const preexisting = preexistingRed(recordedBaseGates(records));
    await finishChecks(gate, checks, { preexisting });
    const red = newGateFailures(checks, preexisting);
    if (red.length > 0) {
      await removeMergeScratch(runtime);
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: `gates: ${red.map((c) => c.name).join(", ")}`,
        checks,
      });
      return {};
    }

    const commit = await headSha(scratch);
    const turn = await runtime.store.startRecord({
      ...scriptMeta(iteration, "merge", { slug: task.slug, round }),
      commit,
    });
    try {
      await refMove(runtime, commit, head);
    } catch (err) {
      if (!(err instanceof IntegrationMovedError)) throw err;
      await removeMergeScratch(runtime);
      await turn.finish({ ok: false, cause: err.message });
      return {};
    }
    await syncCheckout(runtime, commit);
    await removeMergeScratch(runtime);
    await turn.finish({ ok: true, commit, checks });
    return {};
  });
}
