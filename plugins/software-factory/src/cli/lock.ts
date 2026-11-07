import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";

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
 * Resolves the runtime directory outside the main repository checkout (§2, §7).
 * Defaults to `{worktreeRoot}/.factory-runtime`.
 */
export function resolveRuntimeDir(repoRoot: string, worktreeRoot?: string): string {
  let wt = worktreeRoot;
  if (!wt) {
    const projectYamlPath = path.join(repoRoot, ".factory", "project.yaml");
    if (fs.existsSync(projectYamlPath)) {
      try {
        const parsed = yaml.parse(fs.readFileSync(projectYamlPath, "utf8"));
        if (parsed?.worktreeRoot) {
          wt = parsed.worktreeRoot;
        }
      } catch {}
    }
  }
  let resolvedWorktreeRoot = path.resolve(repoRoot, wt ?? "../repo.factory-wt");
  if (resolvedWorktreeRoot === repoRoot || resolvedWorktreeRoot.startsWith(repoRoot + path.sep)) {
    resolvedWorktreeRoot = path.resolve(repoRoot, "..", `${path.basename(repoRoot)}.factory-wt`);
  }
  return path.join(resolvedWorktreeRoot, ".factory-runtime");
}

/**
 * Computes the path to the run lock file for a task (§2).
 * Placed in `{runtimeDir}/locks/{task}.lock` outside the main checkout.
 */
export function getRunLockPath(
  repoRoot: string,
  task: string,
  opts?: { runtimeDir?: string; worktreeRoot?: string }
): string {
  const runtimeDir = opts?.runtimeDir ?? resolveRuntimeDir(repoRoot, opts?.worktreeRoot);
  return path.join(runtimeDir, "locks", `${task}.lock`);
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
  task: string,
  opts?: { runtimeDir?: string; worktreeRoot?: string }
): { free: boolean; lockInfo?: LockData } {
  const lockPath = getRunLockPath(repoRoot, task, opts);
  if (!fs.existsSync(lockPath)) {
    return { free: true };
  }

  try {
    const content = fs.readFileSync(lockPath, "utf8");
    const data = JSON.parse(content) as LockData;
    if (data.host && data.host !== os.hostname()) {
      return { free: false, lockInfo: data };
    }
    if (data.pid && isProcessAlive(data.pid)) {
      return { free: false, lockInfo: data };
    }
    // Dead PID on same host allows takeover (§2)
    return { free: true, lockInfo: data };
  } catch {
    // Corrupt or unparseable lock file is considered free/takeover
    return { free: true };
  }
}

export interface AcquireRunLockOptions {
  runtimeDir?: string;
  worktreeRoot?: string;
  taskDir?: string;
  onTakeover?: (info: { previousLock?: LockData; newLock: LockData }) => void;
}

/**
 * Attempts to acquire the exclusive run lock for a task (§2).
 * Uses atomic openSync with 'wx'. On EEXIST, inspects existing lock and takes over
 * via temp file rename if the PID is dead on the same host.
 * Returns a handle with `release()` on success, or `null` if held by a live process.
 */
export function acquireRunLock(
  repoRoot: string,
  task: string,
  opts?: AcquireRunLockOptions
): RunLockHandle | null {
  const lockPath = getRunLockPath(repoRoot, task, opts);
  const lockDir = path.dirname(lockPath);
  fs.mkdirSync(lockDir, { recursive: true });

  const payload: LockData = {
    pid: process.pid,
    host: os.hostname(),
    start: new Date().toISOString(),
  };
  const payloadStr = JSON.stringify(payload, null, 2);

  // 1. Atomic creation via openSync with "wx"
  let fd: number | undefined;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeSync(fd, payloadStr, 0, "utf8");
    fs.closeSync(fd);
    fd = undefined;
    return createRunLockHandle(lockPath);
  } catch (err: any) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  // 2. Lock already exists (EEXIST). Read and inspect existing lock.
  let existingLock: LockData | undefined;
  try {
    const content = fs.readFileSync(lockPath, "utf8");
    existingLock = JSON.parse(content) as LockData;
  } catch {
    // Corrupt or unparseable lock file — treat as stale
    existingLock = undefined;
  }

  // 3. Compare host: locks held by another host cannot be inspected locally
  if (existingLock?.host && existingLock.host !== os.hostname()) {
    return null;
  }

  // 4. Check if PID is alive on this host
  if (existingLock?.pid && isProcessAlive(existingLock.pid)) {
    return null;
  }

  // 5. Stale lock (dead PID on same host or corrupt file): take over atomically via temp file rename
  const tmpLockPath = path.join(
    lockDir,
    `${task}.lock.takeover.${process.pid}.${Date.now()}`
  );
  try {
    fs.writeFileSync(tmpLockPath, payloadStr, "utf8");
    fs.renameSync(tmpLockPath, lockPath);
  } catch {
    try {
      if (fs.existsSync(tmpLockPath)) fs.unlinkSync(tmpLockPath);
    } catch {}
    return null;
  }

  // 6. Log takeover notice (§2)
  console.warn(
    `[factory lock] Stale run lock for task "${task}" (PID ${existingLock?.pid ?? "unknown"} on host ${existingLock?.host ?? "unknown"}) taken over by PID ${process.pid}`
  );

  if (opts?.onTakeover) {
    opts.onTakeover({ previousLock: existingLock, newLock: payload });
  }

  // Append lock_takeover entry to task journal if taskDir is provided
  if (opts?.taskDir) {
    try {
      const journalPath = path.join(opts.taskDir, "journal.ndjson");
      const entry =
        JSON.stringify({
          ts: new Date().toISOString(),
          type: "lock_takeover",
          task,
          previousPid: existingLock?.pid,
          previousHost: existingLock?.host,
          newPid: process.pid,
          newHost: os.hostname(),
        }) + "\n";
      fs.mkdirSync(opts.taskDir, { recursive: true });
      fs.appendFileSync(journalPath, entry, "utf8");
    } catch {
      // Ignore journal write failures during lock takeover
    }
  }

  return createRunLockHandle(lockPath);
}

function createRunLockHandle(lockPath: string): RunLockHandle {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (fs.existsSync(lockPath)) {
        const cur = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (cur.pid === process.pid && cur.host === os.hostname()) {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {
      // ignore
    }
  };
  return { lockPath, release };
}
