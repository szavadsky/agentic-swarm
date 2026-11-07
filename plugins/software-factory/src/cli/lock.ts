import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface LockData {
  pid: number;
  host: string;
  start: string;
}

export interface RunLockHandle {
  lockPath: string;
  release: () => void;
}

/**
 * Computes the path to the run lock file for a task (§2).
 * Placed in $(git rev-parse --git-common-dir)/factory/{task}.lock outside git tracking.
 */
export function getRunLockPath(repoRoot: string, task: string): string {
  let gitCommonDir: string | undefined;
  try {
    const stdout = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (stdout) {
      gitCommonDir = path.isAbsolute(stdout) ? stdout : path.resolve(repoRoot, stdout);
    }
  } catch {
    // If not a git repo or git command fails, use runtime directory outside git
  }

  const baseDir = gitCommonDir
    ? path.join(gitCommonDir, "factory")
    : path.join(repoRoot, ".factory-runtime", "locks");

  return path.join(baseDir, `${task}.lock`);
}

/**
 * Checks if a PID is currently alive on the host.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM"; // EPERM means process exists but we lack permission to signal
  }
}

/**
 * Checks whether the run lock for a task is free.
 */
export function isRunLockFree(
  repoRoot: string,
  task: string
): { free: boolean; lockInfo?: LockData } {
  const lockPath = getRunLockPath(repoRoot, task);
  if (!fs.existsSync(lockPath)) {
    return { free: true };
  }

  try {
    const content = fs.readFileSync(lockPath, "utf8");
    const data = JSON.parse(content) as LockData;
    if (data.pid && isProcessAlive(data.pid)) {
      return { free: false, lockInfo: data };
    }
    // Dead PID allows takeover (§2)
    return { free: true, lockInfo: data };
  } catch {
    // Corrupt or unparseable lock file is considered free/takeover
    return { free: true };
  }
}

/**
 * Attempts to acquire the exclusive run lock for a task (§2).
 * Returns a handle with `release()` on success, or `null` if held by a live process.
 */
export function acquireRunLock(repoRoot: string, task: string): RunLockHandle | null {
  const lockPath = getRunLockPath(repoRoot, task);
  const lockDir = path.dirname(lockPath);
  fs.mkdirSync(lockDir, { recursive: true });

  const status = isRunLockFree(repoRoot, task);
  if (!status.free) {
    return null;
  }

  const payload: LockData = {
    pid: process.pid,
    host: os.hostname(),
    start: new Date().toISOString(),
  };

  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), "utf8");

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (fs.existsSync(lockPath)) {
        const cur = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (cur.pid === process.pid) {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {
      // ignore
    }
  };

  return { lockPath, release };
}
