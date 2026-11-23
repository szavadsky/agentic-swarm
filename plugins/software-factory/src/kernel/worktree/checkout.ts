/** Ref moves, base following, the integration checkout and the task-worktree sweep. */

import fs from "node:fs";
import path from "node:path";
import { isAncestor } from "../../core/git/commit.js";
import { GitError, git } from "../../core/git/exec.js";
import { parseWorktreeList } from "../../core/git/status.js";
import { reapGateProcesses } from "../gates.js";
import { landStoreCommits } from "../store-backend.js";
import type { KernelRuntime } from "../types.js";
import type { MergeAttempt } from "./types.js";
import { goalWorktreeRoot, mergeScratchPath } from "./names.js";
import { sweepWorktrees } from "./sweep.js";

export async function integrationHead(runtime: KernelRuntime): Promise<string> {
  const res = await git(runtime.paths.repoRoot, [
    "rev-parse",
    runtime.paths.integrationBranch,
  ]);
  return res.stdout.trim();
}

export async function branchExists(
  runtime: KernelRuntime,
  branch: string,
): Promise<boolean> {
  const res = await git(
    runtime.paths.repoRoot,
    ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
    {
      allowFail: true,
    },
  );
  return res.code === 0;
}

/** Tree of HEAD, the no-progress component of a committed step. */
export async function treeSha(cwd: string): Promise<string> {
  const res = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
  return res.stdout.trim();
}

export async function registeredWorktrees(
  runtime: KernelRuntime,
): Promise<string[]> {
  const res = await git(runtime.paths.repoRoot, [
    "worktree",
    "list",
    "--porcelain",
  ]);
  return parseWorktreeList(res.stdout);
}

/** A base advance that cannot merge cleanly into the integration branch. */
export class BaseFollowConflictError extends Error {
  constructor(
    baseBranch: string,
    readonly paths: string[],
  ) {
    const named =
      paths.length > 0 ? paths.join(", ") : "git reported no unmerged paths";
    super(
      `base "${baseBranch}" conflicts with the integration branch in: ${named}; ` +
        "the integration branch was left untouched — resolve the conflict on base and relaunch",
    );
    this.name = "BaseFollowConflictError";
  }
}

/** Clears a merge left in flight before it can block the next one; true when there was one. */
export async function abortInFlightMerge(cwd: string): Promise<boolean> {
  const mergeHead = await git(
    cwd,
    ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    { allowFail: true },
  );
  if (mergeHead.code !== 0) return false;
  await git(cwd, ["merge", "--abort"]);
  return true;
}

/**
 * Merges `ref` into the checkout at `cwd`. A conflict aborts the merge so no
 * state is left behind and returns the unmerged paths; any other refusal
 * (merge.ff=only, unrelated histories) leaves no merge state either, and git's
 * own reason is the only diagnosis, so it is thrown. With `leaveConflict` a
 * conflict stays in progress (MERGE_HEAD plus unmerged paths) for the caller's
 * turn to resolve; only a non-conflict refusal still throws.
 */
export async function mergeRef(
  cwd: string,
  ref: string,
  env: Record<string, string> | undefined,
  opts?: { leaveConflict?: boolean },
): Promise<MergeAttempt> {
  const merge = await git(cwd, ["merge", "--no-edit", ref], {
    allowFail: true,
    env,
  });
  if (merge.code === 0) return { ok: true };
  const unmerged = await git(cwd, ["diff", "--name-only", "--diff-filter=U"], {
    allowFail: true,
  });
  const paths = unmerged.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
  if (opts?.leaveConflict) {
    const head = await git(
      cwd,
      ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
      { allowFail: true },
    );
    if (head.code !== 0 && paths.length === 0) {
      throw new GitError(
        `merge --no-edit ${ref}`,
        merge.code,
        merge.stderr,
        merge.stdout,
      );
    }
    return { ok: false, paths };
  }
  const inFlight = await abortInFlightMerge(cwd);
  if (!inFlight && paths.length === 0) {
    throw new GitError(
      `merge --no-edit ${ref}`,
      merge.code,
      merge.stderr,
      merge.stdout,
    );
  }
  return { ok: false, paths };
}

/**
 * Restores the worktree at `cwd` to `commit`: any merge is aborted, tracked
 * files reset and untracked ones removed. The caller stops the timed-out
 * orphan first, so no live writer can land after the reset.
 */
export async function resetWorktreeToCommit(
  cwd: string,
  commit: string,
): Promise<void> {
  await abortInFlightMerge(cwd);
  await git(cwd, ["reset", "--hard", commit]);
  await git(cwd, ["clean", "-fd"]);
}

/**
 * Operator fixes on base never reach task worktrees unless the stable checkout
 * follows them. Fast-forward when the integration branch is behind; otherwise
 * a merge commit — never a rebase, because task branches and records name
 * integration commits. A conflict aborts the merge and leaves the ref where it
 * was, so the next launch tries again.
 */
async function followBase(runtime: KernelRuntime): Promise<void> {
  const { goalCheckout } = runtime.paths;
  const baseBranch = runtime.configs.repo.baseBranch;
  const base = (
    await git(runtime.paths.repoRoot, [
      "rev-parse",
      "--verify",
      `${baseBranch}^{commit}`,
    ])
  ).stdout.trim();
  const head = (await git(goalCheckout, ["rev-parse", "HEAD"])).stdout.trim();
  if (await isAncestor(goalCheckout, base, head)) return;

  await runtime.repo.writeLock.runExclusive(async () => {
    if (await isAncestor(goalCheckout, head, base)) {
      await git(goalCheckout, ["merge", "--ff-only", base]);
      return;
    }
    const attempt = await mergeRef(
      goalCheckout,
      base,
      runtime.repo.identityEnv(),
    );
    if (!attempt.ok)
      throw new BaseFollowConflictError(baseBranch, attempt.paths);
  });
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
/**
 * Removes this goal's leftover task worktrees and merge scratch, except the
 * worktrees of tasks whose interrupted turn the relaunch continues.
 */
async function removeOwnWorktrees(
  runtime: KernelRuntime,
  goalCheckout: string,
  ownTasks: string,
  ownScratch: string,
  keepSlugs: ReadonlySet<string>,
): Promise<void> {
  const { repoRoot } = runtime.paths;
  const keep = new Set(
    [...keepSlugs].map((slug) => path.resolve(path.join(ownTasks, slug))),
  );
  // Recovery owns this goal's worktrees only: a sibling goal's checkout and
  // task worktrees, and another repo sharing the root, are not ours to remove.
  for (const wt of await registeredWorktrees(runtime)) {
    const resolved = path.resolve(wt);
    if (
      resolved === path.resolve(goalCheckout) ||
      resolved === path.resolve(repoRoot) ||
      keep.has(resolved)
    )
      continue;
    const own =
      resolved === path.resolve(ownScratch) ||
      resolved.startsWith(path.resolve(ownTasks) + path.sep);
    if (!own) continue;
    await reapGateProcesses(resolved);
    await git(repoRoot, ["worktree", "remove", "--force", resolved], {
      allowFail: true,
    });
  }
}

/** Creates the integration worktree, or recreates it on the wrong branch. */
async function ensureIntegrationCheckout(
  runtime: KernelRuntime,
  goalCheckout: string,
  integrationBranch: string,
): Promise<void> {
  const { repoRoot } = runtime.paths;
  const registered = (await registeredWorktrees(runtime)).map((p) =>
    path.resolve(p),
  );
  if (!registered.includes(path.resolve(goalCheckout))) {
    if (fs.existsSync(goalCheckout)) {
      await reapGateProcesses(goalCheckout);
      fs.rmSync(goalCheckout, { recursive: true, force: true });
    }
    if (await branchExists(runtime, integrationBranch)) {
      await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
    } else {
      const base = runtime.configs.repo.baseBranch;
      await git(repoRoot, [
        "worktree",
        "add",
        "-b",
        integrationBranch,
        goalCheckout,
        base,
      ]);
    }
  }

  const current = await git(
    goalCheckout,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { allowFail: true },
  );
  if (current.code !== 0 || current.stdout.trim() !== integrationBranch) {
    await reapGateProcesses(goalCheckout);
    await git(repoRoot, ["worktree", "remove", "--force", goalCheckout], {
      allowFail: true,
    });
    await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
  }
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
export async function prepareIntegrationCheckout(
  runtime: KernelRuntime,
  keepSlugs: ReadonlySet<string> = new Set(),
): Promise<void> {
  const { goalCheckout, integrationBranch } = runtime.paths;
  fs.mkdirSync(goalWorktreeRoot(runtime), { recursive: true });
  await removeOwnWorktrees(
    runtime,
    goalCheckout,
    ownTasks,
    ownScratch,
    keepSlugs,
  );
  await ensureIntegrationCheckout(runtime, goalCheckout, integrationBranch);
  // A crashed merge must not leave staged or conflicted state for the next launch.
  await git(goalCheckout, ["reset", "--hard", "HEAD"]);
  await git(goalCheckout, ["clean", "-fd"]);
  // The goal branch receives the store's writes before it follows the base: a
  // store write lands on both heads, so the merge sees one content, not two.
  await landStoreCommits(runtime.paths);
  await followBase(runtime);
}

export async function removeMergeScratch(
  runtime: KernelRuntime,
): Promise<void> {
  const scratch = mergeScratchPath(runtime);
  await reapGateProcesses(scratch);
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(
      runtime.paths.repoRoot,
      ["worktree", "remove", "--force", scratch],
      { allowFail: true },
    );
    await git(runtime.paths.repoRoot, ["worktree", "prune"], {
      allowFail: true,
    });
  });
  if (fs.existsSync(scratch))
    fs.rmSync(scratch, { recursive: true, force: true });
}

export async function resetMergeScratch(
  runtime: KernelRuntime,
  head: string,
): Promise<string> {
  const scratch = mergeScratchPath(runtime);
  await removeMergeScratch(runtime);
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  await runtime.repo.writeLock.runExclusive(() =>
    git(runtime.paths.repoRoot, ["worktree", "add", "--detach", scratch, head]),
  );
  return scratch;
}
