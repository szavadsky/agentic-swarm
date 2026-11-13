import fs from "node:fs";
import path from "node:path";
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
