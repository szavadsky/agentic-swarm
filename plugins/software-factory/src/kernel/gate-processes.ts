/**
 * Gate process groups and the worktree each runs in. A gate runs detached in
 * its own group, so killing the group kills its whole tree; this module names
 * the groups a live gate run owns and finds groups whose owner died with the
 * factory, which a worktree removal must stop before the directory goes away.
 */

import fs from "node:fs";
import path from "node:path";

/** Grace between SIGTERM and SIGKILL on a reaped group. */
const REAP_GRACE_MS = 200;

/** `/proc` renders a working directory that no longer exists with this suffix. */
const DELETED_SUFFIX = " (deleted)";

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

/** A process's group id from /proc; comm may contain spaces and parentheses. */
function processGroup(pid: number): number | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const group = Number(fields[2]);
    return Number.isInteger(group) && group > 1 ? group : undefined;
  } catch {
    return undefined;
  }
}

/** A process's working directory, without the kernel's deleted marker. */
function processCwd(pid: number): string | undefined {
  try {
    const link = fs.readlinkSync(`/proc/${pid}/cwd`);
    return link.endsWith(DELETED_SUFFIX)
      ? link.slice(0, -DELETED_SUFFIX.length)
      : link;
  } catch {
    return undefined;
  }
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
  let entries: string[];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return [];
  }
  const own = processGroup(process.pid);
  const groups: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    const cwd = processCwd(pid);
    if (cwd === undefined || !roots.some((root) => below(cwd, root))) continue;
    const group = processGroup(pid);
    if (group !== undefined && group !== own) groups.push(group);
  }
  return groups;
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal);
  } catch {
    // The group is gone, which is the outcome the caller wants.
  }
}

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0);
    return true;
  } catch {
    return false;
  }
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
  for (const group of groups) signalGroup(group, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, REAP_GRACE_MS));
  for (const group of groups) {
    if (groupAlive(group)) signalGroup(group, "SIGKILL");
  }
}
