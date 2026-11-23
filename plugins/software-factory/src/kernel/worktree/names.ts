/** Goal-scoped branch and path names a sweep can recognise without the checkout. */

import path from "node:path";
import type { KernelRuntime } from "../types.js";

/** The goal slug every one of its branches, worktrees and checkouts carries. */
export function goalName(runtime: KernelRuntime): string {
  return path.basename(runtime.paths.goalDir);
}

/** Task branches and worktrees are goal-scoped and disposable. */
export function taskBranchName(runtime: KernelRuntime, slug: string): string {
  return `${taskBranchPrefix(runtime)}${slug}`;
}

/** The branch prefix every task worktree of this goal checks out. */
export function taskBranchPrefix(runtime: KernelRuntime): string {
  // Not nested under the integration branch: refs/heads/factory/<goal> would
  // block refs/heads/factory/<goal>/<slug> as a file-vs-directory conflict.
  return `factory-task/${goalName(runtime)}/`;
}

export function taskWorktreePath(runtime: KernelRuntime, slug: string): string {
  return path.join(
    goalWorktreeRoot(runtime),
    `${goalName(runtime)}-tasks`,
    slug,
  );
}

/**
 * The directory holding this goal's checkouts and nothing else. It follows the
 * resolved checkout, so an existing checkout at the pre-repo-id path keeps its
 * task worktrees and merge scratch beside it.
 */
export function goalWorktreeRoot(runtime: KernelRuntime): string {
  return path.dirname(runtime.paths.goalCheckout);
}

/**
 * The merge queue's scratch worktree: detached at the integration head, so a
 * squash commit can be gated without touching the stable goal checkout.
 */
export function mergeScratchPath(runtime: KernelRuntime): string {
  return path.join(goalWorktreeRoot(runtime), `${goalName(runtime)}-merge`);
}
