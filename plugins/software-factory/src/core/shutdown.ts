/**
 * Child process-group registry used by signal handling and the process runner.
 */

import { hostOs } from "./os/index.js";

const activeChildGroups = new Set<number>();

/**
 * Registers an active child process group PID.
 */
export function registerChildGroup(pid: number): void {
  if (pid > 0) {
    activeChildGroups.add(pid);
  }
}

/**
 * Unregisters a child process group PID upon exit.
 */
export function unregisterChildGroup(pid: number): void {
  activeChildGroups.delete(pid);
}

/**
 * Whether a child process group still has a live member. `EPERM` means the
 * group exists but belongs to another user; only `ESRCH` proves it is gone.
 */
export function isChildGroupAlive(pid: number): boolean {
  return pid > 0 && hostOs().isGroupAlive(pid);
}

/**
 * Terminates a single child process group by PID (SIGTERM then SIGKILL).
 * Ensures it NEVER kills the factory's own process group (requires pid > 0).
 */
function terminateChildGroup(
  pid: number,
  signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
): void {
  hostOs().killGroup(pid, signal);
}

/**
 * Terminates all registered child process groups (SIGTERM followed by SIGKILL after grace period).
 */
export async function terminateAllChildGroups(graceMs = 500): Promise<void> {
  const pids = Array.from(activeChildGroups);
  if (pids.length === 0) return;

  // 1. Send SIGTERM to all child groups
  for (const pid of pids) {
    terminateChildGroup(pid, "SIGTERM");
  }

  // 2. Wait up to graceMs
  if (graceMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, graceMs));
  }

  // 3. For any still active, send SIGKILL
  for (const pid of pids) {
    if (activeChildGroups.has(pid)) {
      terminateChildGroup(pid, "SIGKILL");
      activeChildGroups.delete(pid);
    }
  }
}
