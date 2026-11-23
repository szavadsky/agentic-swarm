import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repositoryId } from "../kernel/config.js";

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
 * Uses `worktreeRoot` when it is outside the checkout; when omitted, it defaults
 * to the sibling `wt-<repository name>`; a root at or inside the checkout is
 * relocated to that sibling. The result is `<worktree root>/.factory-runtime`.
 */
export function resolveRuntimeDir(
  repoRoot: string,
  worktreeRoot?: string,
): string {
  let resolvedWorktreeRoot = path.resolve(
    repoRoot,
    worktreeRoot ?? `../wt-${path.basename(repoRoot)}`,
  );
  if (
    resolvedWorktreeRoot === repoRoot ||
    resolvedWorktreeRoot.startsWith(repoRoot + path.sep)
  ) {
    resolvedWorktreeRoot = path.resolve(
      repoRoot,
      "..",
      `wt-${path.basename(repoRoot)}`,
    );
  }
  return path.join(resolvedWorktreeRoot, ".factory-runtime");
}

/**
 * Computes the path to the run lock file for a task (§2).
 * Placed in `{runtimeDir}/locks/{repo id}/{task}.lock` outside the main
 * checkout, so two repositories sharing a runtime dir never share a lock.
 */
export function getRunLockPath(
  repoRoot: string,
  task: string,
  opts?: { runtimeDir?: string; worktreeRoot?: string },
): string {
  const runtimeDir =
    opts?.runtimeDir ?? resolveRuntimeDir(repoRoot, opts?.worktreeRoot);
  return path.join(runtimeDir, "locks", repositoryId(repoRoot), `${task}.lock`);
}

/**
 * Checks if a PID is currently alive on the host.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means process exists but we lack permission to signal
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Checks whether the run lock for a task is free.
 */
export function isRunLockFree(
  repoRoot: string,
  task: string,
  opts?: { runtimeDir?: string; worktreeRoot?: string },
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

/** Creates the lock file atomically; undefined when it already exists. */
function createLockFile(
  lockPath: string,
  payloadStr: string,
): RunLockHandle | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeSync(fd, payloadStr, 0, "utf8");
    fs.closeSync(fd);
    fd = undefined;
    return createRunLockHandle(lockPath);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return undefined;
  }
}

/** The existing lock and its stat, or that it could not be read at all. */
function readExistingLock(lockPath: string): {
  lock?: LockData;
  stat?: fs.Stats;
  unreadable?: boolean;
} {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(lockPath);
    const content = fs.readFileSync(lockPath, "utf8");
    return { lock: JSON.parse(content) as LockData, stat };
  } catch {
    return { stat, unreadable: true };
  }
}

/** Writes our payload under a temp name and renames it over the lock. */
function replaceLockFile(
  tmpLockPath: string,
  lockPath: string,
  payloadStr: string,
): boolean {
  try {
    fs.writeFileSync(tmpLockPath, payloadStr, "utf8");
    fs.renameSync(tmpLockPath, lockPath);
    return true;
  } catch {
    try {
      if (fs.existsSync(tmpLockPath)) fs.unlinkSync(tmpLockPath);
    } catch {}
    return false;
  }
}

/** Whether the lock file now carries our payload. */
function lockHoldsPayload(lockPath: string, payload: LockData): boolean {
  try {
    const verified = JSON.parse(fs.readFileSync(lockPath, "utf8")) as LockData;
    return verified.pid === payload.pid && verified.host === payload.host;
  } catch {
    return false;
  }
}

function clearTakeoverMarker(fd: number | undefined, marker: string): void {
  if (fd === undefined) return;
  try {
    fs.closeSync(fd);
    fs.unlinkSync(marker);
  } catch {}
}

/** Takes over a stale lock behind an exclusive takeover marker. */
function takeOverStaleLock(
  lockDir: string,
  task: string,
  lockPath: string,
  payloadStr: string,
  payload: LockData,
): boolean {
  const takeoverMarker = path.join(lockDir, `${task}.lock.takeover`);
  let takeoverFd: number | undefined;
  try {
    takeoverFd = fs.openSync(takeoverMarker, "wx");
  } catch {
    // Another takeover in progress
    return false;
  }
  try {
    const tmpLockPath = path.join(
      lockDir,
      `${task}.lock.takeover.${process.pid}.${Date.now()}`,
    );
    if (!replaceLockFile(tmpLockPath, lockPath, payloadStr)) return false;
    return lockHoldsPayload(lockPath, payload);
  } finally {
    clearTakeoverMarker(takeoverFd, takeoverMarker);
  }
}

/** Appends the `lock_takeover` journal entry, ignoring write failures. */
function appendTakeoverJournal(
  taskDir: string,
  task: string,
  previousLock: LockData | undefined,
): void {
  try {
    const journalPath = path.join(taskDir, "journal.ndjson");
    const entry = `${JSON.stringify({
      ts: new Date().toISOString(),
      type: "lock_takeover",
      task,
      previousPid: previousLock?.pid,
      previousHost: previousLock?.host,
      newPid: process.pid,
      newHost: os.hostname(),
    })}\n`;
    fs.mkdirSync(taskDir, { recursive: true });
    fs.appendFileSync(journalPath, entry, "utf8");
  } catch {
    // Ignore journal write failures during lock takeover
  }
}

/** Reports a takeover and records it in the task journal when one is named. */
function recordTakeover(
  opts: AcquireRunLockOptions | undefined,
  task: string,
  previousLock: LockData | undefined,
  payload: LockData,
): void {
  console.warn(
    `[factory lock] Stale run lock for task "${task}" (PID ${previousLock?.pid ?? "unknown"} on host ${previousLock?.host ?? "unknown"}) taken over by PID ${process.pid}`,
  );
  if (opts?.onTakeover) {
    opts.onTakeover({ previousLock, newLock: payload });
  }
  if (opts?.taskDir) {
    appendTakeoverJournal(opts.taskDir, task, previousLock);
  }
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
  opts?: AcquireRunLockOptions,
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
  const created = createLockFile(lockPath, payloadStr);
  if (created) return created;

  // 2. Lock already exists (EEXIST). Read and inspect existing lock.
  const existing = readExistingLock(lockPath);
  if (existing.unreadable) {
    // Corrupt or unparseable lock file. If it was just created (< 5000 ms ago),
    // treat it as a live/pending creation to prevent a race.
    const mtimeMs = existing.stat?.mtimeMs ?? 0;
    if (Date.now() - mtimeMs < 5000) return null;
  }
  const existingLock = existing.unreadable ? undefined : existing.lock;

  // 3. Compare host: locks held by another host cannot be inspected locally
  if (existingLock?.host && existingLock.host !== os.hostname()) {
    return null;
  }

  // 4. Check if PID is alive on this host
  if (existingLock?.pid && isProcessAlive(existingLock.pid)) {
    return null;
  }

  // 5. Stale lock (dead PID on same host or corrupt file): take it over.
  if (!takeOverStaleLock(lockDir, task, lockPath, payloadStr, payload)) {
    return null;
  }

  // 6. Log takeover notice (§2)
  recordTakeover(opts, task, existingLock, payload);

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
