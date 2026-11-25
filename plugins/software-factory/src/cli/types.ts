/** The CLI's run-lock shapes, held apart from the lock's file operations. */

/** The lock file's payload: who holds the task and since when. */
export interface LockData {
  pid: number;
  host: string;
  start: string;
}

/** A held lock, and the release that removes it when this process still owns it. */
export interface RunLockHandle {
  lockPath: string;
  release: () => void;
}

/** Options `acquireRunLock` reads: where the lock lives and whether to journal a takeover. */
export interface AcquireRunLockOptions {
  runtimeDir?: string;
  worktreeRoot?: string;
  taskDir?: string;
  onTakeover?: (info: { previousLock?: LockData; newLock: LockData }) => void;
}
