/**
 * Gate process groups and the worktree each runs in. A gate runs detached in
 * its own group; a timed-out or cancelled run, and a worktree removal, must
 * kill the whole tree, including grandchildren that outlive their leader.
 */

import fs from "node:fs";
import path from "node:path";
import { hostOs } from "../core/os/index.js";

/** Grace between SIGTERM and SIGKILL on a reaped group. */
const REAP_GRACE_MS = 200;

/** Live gate groups, by the resolved worktree they run in. */
const gateGroups = new Map<string, Set<number>>();

/**
 * Registers a gate's process group under its worktree. The returned function
 * releases the registration when the gate ends; a group already removed by a
 * reap makes the release a no-op.
 */
export function trackGateGroup(worktree: string, group: number): () => void {
  const key = path.resolve(worktree);
  let groups = gateGroups.get(key);
  if (groups === undefined) {
    groups = new Set();
    gateGroups.set(key, groups);
  }
  const tracked = groups;
  tracked.add(group);
  return () => {
    tracked.delete(group);
    if (tracked.size === 0 && gateGroups.get(key) === tracked) {
      gateGroups.delete(key);
    }
  };
}

/** True when `cwd` is `root` or below it. */
function below(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(`${root}${path.sep}`);
}

/**
 * Groups with a live process inside `roots`. A gate whose owner died keeps the
 * worktree as its cwd, so this is the only handle on an orphan whose factory
 * process is gone and whose group is unknown to the registry.
 */
function groupsUnder(roots: readonly string[]): number[] {
  const processes = hostOs().processes();
  const own = processes.find((entry) => entry.pid === process.pid)?.pgid;
  const groups: number[] = [];
  for (const entry of processes) {
    if (entry.pid === process.pid) continue;
    const cwd = entry.cwd;
    if (cwd === undefined || !roots.some((root) => below(cwd, root))) continue;
    if (entry.pgid > 1 && entry.pgid !== own) groups.push(entry.pgid);
  }
  return groups;
}

/**
 * Kills every gate process group working inside `worktree`: the groups this
 * process tracks, plus orphans (PPID 1) whose cwd still names the worktree.
 * Removal calls this before deleting the directory; the factory's own group is
 * never a target.
 */
export async function reapGateProcesses(worktree: string): Promise<void> {
  const absolute = path.resolve(worktree);
  const roots = [absolute];
  try {
    const real = fs.realpathSync(absolute);
    if (real !== absolute) roots.push(real);
  } catch {
    // The directory is already gone; the live registry is all that is left.
  }
  const groups = new Set<number>(gateGroups.get(absolute) ?? []);
  for (const group of groupsUnder(roots)) groups.add(group);
  gateGroups.delete(absolute);
  if (groups.size === 0) return;
  const os = hostOs();
  for (const group of groups) os.killGroup(group, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, REAP_GRACE_MS));
  for (const group of groups) {
    if (os.isGroupAlive(group)) os.killGroup(group, "SIGKILL");
  }
}
