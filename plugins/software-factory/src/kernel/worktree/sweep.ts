/** Removes this goal's disposable worktrees and merge scratch under every registered root. */

import fs from "node:fs";
import path from "node:path";
import { git } from "../../core/git/exec.js";
import { derive } from "../derive.js";
import { reapGateProcesses } from "../gates.js";
import type { KernelRuntime, TaskStatus } from "../types.js";
import { goalName, mergeScratchPath, taskBranchPrefix } from "./names.js";

interface WorktreeEntry {
  path: string;
  branch?: string;
  detached: boolean;
}

function field(block: string, key: string): string | undefined {
  const prefix = `${key} `;
  const line = block
    .split("\n")
    .find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length);
}

function parseWorktreeEntries(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  for (const block of output.split("\n\n")) {
    const wt = field(block, "worktree");
    if (!wt) continue;
    entries.push({
      path: wt,
      branch: field(block, "branch"),
      detached: block.split("\n").includes("detached"),
    });
  }
  return entries;
}

/** Statuses whose worktree no longer carries work the factory needs. */
const TERMINAL: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "merged",
  "finished",
  "cancelled",
]);

/**
 * A worktree with uncommitted work is not swept; an unreadable one is treated
 * the same way, so a status probe never turns into a deletion.
 */
async function hasUncommittedWork(wt: string): Promise<boolean> {
  const status = await git(
    wt,
    ["status", "--porcelain", "--untracked-files=normal"],
    { allowFail: true },
  );
  return status.code !== 0 || status.stdout.trim() !== "";
}

async function removeWorktree(
  runtime: KernelRuntime,
  wt: string,
): Promise<void> {
  await reapGateProcesses(wt);
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(runtime.paths.repoRoot, ["worktree", "remove", "--force", wt], {
      allowFail: true,
    });
  });
  if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
}

function isProtected(
  wt: string,
  repoRoot: string,
  goalCheckout: string,
): boolean {
  return wt === repoRoot || wt === goalCheckout;
}

function isScratch(
  entry: WorktreeEntry,
  wt: string,
  scratch: string,
  name: string,
): boolean {
  return (
    wt === scratch || (entry.detached === true && path.basename(wt) === name)
  );
}

function taskSlug(entry: WorktreeEntry, prefix: string): string | undefined {
  return entry.branch?.startsWith(prefix)
    ? entry.branch.slice(prefix.length)
    : undefined;
}

/**
 * Sweeps this goal's disposable worktrees wherever git has them registered:
 * task worktrees of merged, finished or cancelled tasks and the merge scratch.
 * Parked and unmerged tasks keep theirs, as does a terminal task whose tree
 * has uncommitted work, and another goal's worktree is never ours to remove.
 */
export async function sweepWorktrees(runtime: KernelRuntime): Promise<void> {
  const { repoRoot, goalCheckout } = runtime.paths;
  const root = path.resolve(repoRoot);
  const checkout = path.resolve(goalCheckout);
  const branchPrefix = `refs/heads/${taskBranchPrefix(runtime)}`;
  const scratch = path.resolve(mergeScratchPath(runtime));
  const scratchName = `${goalName(runtime)}-merge`;
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  const listing = await git(repoRoot, ["worktree", "list", "--porcelain"]);
  let removed = false;

  for (const entry of parseWorktreeEntries(listing.stdout)) {
    const resolved = path.resolve(entry.path);
    if (isProtected(resolved, root, checkout)) continue;
    if (isScratch(entry, resolved, scratch, scratchName)) {
      await removeWorktree(runtime, resolved);
      removed = true;
      continue;
    }
    const slug = taskSlug(entry, branchPrefix);
    if (slug === undefined) continue;
    const status = state.tasks[slug]?.status;
    if (status === undefined || !TERMINAL.has(status)) continue;
    if (await hasUncommittedWork(resolved)) continue;
    await removeWorktree(runtime, resolved);
    removed = true;
  }

  if (removed) {
    await git(repoRoot, ["worktree", "prune"], { allowFail: true });
  }
}
