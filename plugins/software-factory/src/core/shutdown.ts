/**
 * Child process-group registry used by signal handling and the process runner.
 */

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
 * Terminates a single child process group by PID (SIGTERM then SIGKILL).
 * Ensures it NEVER kills the factory's own process group (requires pid > 0).
 */
function terminateChildGroup(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (pid <= 0) return;
  try {
    process.kill(-pid, signal);
  } catch (err: any) {
    if (err?.code !== "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch {}
    }
  }
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
    terminateChildGroup(pid, "SIGKILL");
  }

  activeChildGroups.clear();
}
