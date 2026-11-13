import fs from "node:fs";
import path from "node:path";
import { isAncestor } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { parseWorktreeList } from "../core/git/status.js";
import { runWorktreeSetup, type SetupResult } from "../core/checks/setup.js";
import type { KernelRuntime, TaskFile } from "./types.js";

/** Task branches and worktrees are goal-scoped and disposable. */
export function taskBranchName(runtime: KernelRuntime, slug: string): string {
  // Not nested under the integration branch: refs/heads/factory/<goal> would
  // block refs/heads/factory/<goal>/<slug> as a file-vs-directory conflict.
  const goal = path.basename(runtime.paths.goalDir);
  return `factory-task/${goal}/${slug}`;
}

function taskWorktreePath(runtime: KernelRuntime, slug: string): string {
  const goal = path.basename(runtime.paths.goalDir);
  return path.join(runtime.paths.worktreeRoot, `${goal}-tasks`, slug);
}

export async function integrationHead(runtime: KernelRuntime): Promise<string> {
  const res = await git(runtime.paths.repoRoot, ["rev-parse", runtime.paths.integrationBranch]);
  return res.stdout.trim();
}

export async function branchExists(runtime: KernelRuntime, branch: string): Promise<boolean> {
  const res = await git(runtime.paths.repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFail: true,
  });
  return res.code === 0;
}

/** Tree of HEAD, the no-progress component of a committed step. */
export async function treeSha(cwd: string): Promise<string> {
  const res = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
  return res.stdout.trim();
}

async function registeredWorktrees(runtime: KernelRuntime): Promise<string[]> {
  const res = await git(runtime.paths.repoRoot, ["worktree", "list", "--porcelain"]);
  return parseWorktreeList(res.stdout);
}

/** A base advance that cannot merge cleanly into the integration branch. */
export class BaseFollowConflictError extends Error {
  constructor(
    baseBranch: string,
    readonly paths: string[]
  ) {
    const named = paths.length > 0 ? paths.join(", ") : "git reported no unmerged paths";
    super(
      `base "${baseBranch}" conflicts with the integration branch in: ${named}; ` +
        "the integration branch was left untouched — resolve the conflict on base and relaunch"
    );
    this.name = "BaseFollowConflictError";
  }
}

/** A merge cut off by a crash must not block or contaminate the next one. */
async function abortInFlightMerge(cwd: string): Promise<void> {
  const mergeHead = await git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], { allowFail: true });
  if (mergeHead.code === 0) await git(cwd, ["merge", "--abort"]);
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
  const base = (await git(runtime.paths.repoRoot, ["rev-parse", "--verify", `${baseBranch}^{commit}`])).stdout.trim();
  const head = (await git(goalCheckout, ["rev-parse", "HEAD"])).stdout.trim();
  if (await isAncestor(goalCheckout, base, head)) return;

  await runtime.repo.writeLock.runExclusive(async () => {
    if (await isAncestor(goalCheckout, head, base)) {
      await git(goalCheckout, ["merge", "--ff-only", base]);
      return;
    }
    const merge = await git(goalCheckout, ["merge", "--no-edit", base], { allowFail: true });
    if (merge.code === 0) return;
    const unmerged = await git(goalCheckout, ["diff", "--name-only", "--diff-filter=U"], { allowFail: true });
    const paths = unmerged.stdout
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
      .sort();
    await abortInFlightMerge(goalCheckout);
    throw new BaseFollowConflictError(baseBranch, paths);
  });
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
export async function prepareIntegrationCheckout(runtime: KernelRuntime): Promise<void> {
  const { repoRoot, goalCheckout, integrationBranch, worktreeRoot } = runtime.paths;
  fs.mkdirSync(worktreeRoot, { recursive: true });

  for (const wt of await registeredWorktrees(runtime)) {
    const resolved = path.resolve(wt);
    if (resolved === path.resolve(goalCheckout) || resolved === path.resolve(repoRoot)) continue;
    if (!resolved.startsWith(path.resolve(worktreeRoot) + path.sep)) continue;
    await git(repoRoot, ["worktree", "remove", "--force", resolved], { allowFail: true });
  }

  const registered = (await registeredWorktrees(runtime)).map((p) => path.resolve(p));
  if (!registered.includes(path.resolve(goalCheckout))) {
    if (fs.existsSync(goalCheckout)) {
      fs.rmSync(goalCheckout, { recursive: true, force: true });
    }
    if (await branchExists(runtime, integrationBranch)) {
      await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
    } else {
      const base = runtime.configs.repo.baseBranch;
      await git(repoRoot, ["worktree", "add", "-b", integrationBranch, goalCheckout, base]);
    }
  }

  const current = await git(goalCheckout, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  if (current.code !== 0 || current.stdout.trim() !== integrationBranch) {
    await git(repoRoot, ["worktree", "remove", "--force", goalCheckout], { allowFail: true });
    await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
  }
  // A crashed merge must not leave staged or conflicted state for the next launch.
  await git(goalCheckout, ["reset", "--hard", "HEAD"]);
  await git(goalCheckout, ["clean", "-fd"]);
  await abortInFlightMerge(goalCheckout);
  await followBase(runtime);
}

export interface EnsuredWorktree {
  path: string;
  branch: string;
  created: boolean;
  startPoint: string;
  setup?: SetupResult;
  error?: string;
}

/**
 * Setup runs once per worktree, recorded in the worktree's git dir (outside the
 * tree, so it never enters a commit). A crash between `worktree add` and setup
 * therefore still runs setup before the first check.
 */
async function setupMarker(cwd: string): Promise<string | null> {
  const res = await git(cwd, ["rev-parse", "--git-dir"], { allowFail: true });
  if (res.code !== 0) return null;
  return path.join(path.resolve(cwd, res.stdout.trim()), "factory-setup-done");
}

/**
 * Branches from the integration head at dispatch time (never at plan time).
 * A task with `base` continues a parked task from its kept branch tip.
 */
export async function ensureTaskWorktree(runtime: KernelRuntime, task: TaskFile): Promise<EnsuredWorktree> {
  const branch = taskBranchName(runtime, task.slug);
  const wtPath = taskWorktreePath(runtime, task.slug);
  const startPoint = task.base
    ? taskBranchName(runtime, task.base)
    : runtime.paths.integrationBranch;

  const baseExists = await branchExists(runtime, startPoint);
  if (!baseExists) {
    return { path: wtPath, branch, created: false, startPoint, error: `branch "${startPoint}" does not exist` };
  }
  const startSha = (await git(runtime.paths.repoRoot, ["rev-parse", startPoint])).stdout.trim();

  const registered = (await registeredWorktrees(runtime)).map((p) => path.resolve(p));
  let created = false;
  if (!registered.includes(path.resolve(wtPath))) {
    if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    await runtime.repo.writeLock.runExclusive(async () => {
      if (await branchExists(runtime, branch)) {
        await git(runtime.paths.repoRoot, ["worktree", "add", wtPath, branch]);
      } else {
        await git(runtime.paths.repoRoot, ["worktree", "add", "-b", branch, wtPath, startSha]);
      }
    });
    created = true;
  }

  let setup: SetupResult | undefined;
  if (runtime.configs.repo.setup.length > 0) {
    const marker = await setupMarker(wtPath);
    if (created || !marker || !fs.existsSync(marker)) {
      setup = await runWorktreeSetup({ commands: runtime.configs.repo.setup, cwd: wtPath });
      if (!setup.ok) {
        return { path: wtPath, branch, created, startPoint: startSha, setup, error: setup.error };
      }
      if (marker) fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    }
  }
  return { path: wtPath, branch, created, startPoint: startSha, setup };
}

/** Head of the task worktree; also used as the reviewer's diff head. */
export async function headSha(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "HEAD"])).stdout.trim();
}

interface WorktreeState {
  head: string;
  status: string;
}

export interface ContainmentSnapshot {
  branch: string;
  /** The main checkout: only a rogue turn changes it during dispatch. */
  root: WorktreeState;
  /** The integration checkout; a merge moves its HEAD legitimately. */
  checkout: WorktreeState;
}

async function worktreeState(dir: string): Promise<WorktreeState> {
  const head = await git(dir, ["rev-parse", "HEAD"], { allowFail: true });
  const status = await git(dir, ["status", "--porcelain"], { allowFail: true });
  return { head: head.stdout.trim(), status: status.stdout };
}

/**
 * The worktree a turn runs in is the only place it may change (implementer.md).
 * The main checkout and the integration checkout are the shared surfaces a
 * rogue write can damage; sibling task worktrees belong to other live turns and
 * are not attributed here. Taken before the turn; the settle proves them equal.
 */
export async function containmentSnapshot(
  runtime: KernelRuntime,
  taskWorktree: string
): Promise<ContainmentSnapshot> {
  const branch = await git(taskWorktree, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  return {
    branch: branch.stdout.trim(),
    root: await worktreeState(runtime.paths.repoRoot),
    checkout: await worktreeState(runtime.paths.goalCheckout),
  };
}

/** Text for the park cause when a turn left its worktree; undefined when contained. */
export async function containmentViolation(
  runtime: KernelRuntime,
  taskWorktree: string,
  expectedBranch: string,
  snapshot: ContainmentSnapshot
): Promise<string | undefined> {
  const breaches: string[] = [];
  const branch = await git(taskWorktree, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  const now = branch.stdout.trim();
  if (snapshot.branch !== expectedBranch || now !== expectedBranch) {
    breaches.push(`HEAD is on "${now || "detached"}", not the task branch "${expectedBranch}"`);
  }
  const root = await worktreeState(runtime.paths.repoRoot);
  if (root.head !== snapshot.root.head) {
    breaches.push(`HEAD moved outside the worktree in ${runtime.paths.repoRoot}`);
  } else if (root.status !== snapshot.root.status) {
    breaches.push(`files changed outside the worktree in ${runtime.paths.repoRoot}`);
  }
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  // The merge queue moves this checkout's HEAD and resets it; a move is a
  // merge, not an outside write. With HEAD unchanged, dirt is the turn's.
  if (checkout.head === snapshot.checkout.head && checkout.status !== snapshot.checkout.status) {
    breaches.push(`files changed outside the worktree in ${runtime.paths.goalCheckout}`);
  }
  return breaches.length > 0 ? breaches.join("; ") : undefined;
}

/**
 * The merge queue's scratch worktree: detached at the integration head, so a
 * squash commit can be gated without touching the stable goal checkout.
 */
function mergeScratchPath(runtime: KernelRuntime): string {
  const goal = path.basename(runtime.paths.goalDir);
  return path.join(runtime.paths.worktreeRoot, `${goal}-merge`);
}

export async function removeMergeScratch(runtime: KernelRuntime): Promise<void> {
  const scratch = mergeScratchPath(runtime);
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(runtime.paths.repoRoot, ["worktree", "remove", "--force", scratch], { allowFail: true });
    await git(runtime.paths.repoRoot, ["worktree", "prune"], { allowFail: true });
  });
  if (fs.existsSync(scratch)) fs.rmSync(scratch, { recursive: true, force: true });
}

export async function resetMergeScratch(runtime: KernelRuntime, head: string): Promise<string> {
  const scratch = mergeScratchPath(runtime);
  await removeMergeScratch(runtime);
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  await runtime.repo.writeLock.runExclusive(() =>
    git(runtime.paths.repoRoot, ["worktree", "add", "--detach", scratch, head])
  );
  return scratch;
}
