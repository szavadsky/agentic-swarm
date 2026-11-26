/**
 * The one platform seam: process state, group signals, the shell and repo
 * paths. `linux.ts` and `darwin.ts` implement it; no other module checks the
 * platform or names the host primitives.
 */

/** One process as the host reports it; `cwd` is absent when unreadable. */
export interface OsProcess {
  pid: number;
  ppid: number;
  pgid: number;
  cwd?: string;
}

/**
 * The host primitives a driver may use. Tests inject fakes; production wires
 * Node's fs, `kill(2)` and process spawning.
 */
export interface OsPrimitives {
  /** `kill(2)`: a negative pid names a process group; signal 0 probes. */
  signal(pid: number, signal: NodeJS.Signals | 0): void;
  /** A UTF-8 file's contents. */
  readText(path: string): string;
  /** A symlink's target. */
  readLink(path: string): string;
  /** A directory's entry names. */
  listDir(path: string): string[];
  /** A utility's stdout; throws only when it cannot be executed. */
  exec(executable: string, args: readonly string[]): string;
}

/** An executable and argv for one shell command string. */
export interface ShellSpec {
  executable: string;
  args: string[];
}

/** The OS-specific calls every module shares. */
export interface Os {
  /** Live processes; empty when the process table cannot be read. */
  processes(): OsProcess[];
  /** True when the pid exists; `EPERM` counts as alive. */
  isProcessAlive(pid: number): boolean;
  /** True when the group has a member; `EPERM` counts as alive. */
  isGroupAlive(pgid: number): boolean;
  /** Best-effort signal to the group, falling back to its leader. */
  killGroup(pgid: number, signal: NodeJS.Signals): void;
  /** Executable and argv for running `command` through the host shell. */
  shell(command: string): ShellSpec;
  /** A native path in repo form: forward slashes. */
  repoPath(native: string): string;
  /** The components of a repo-relative path. */
  repoPathParts(rel: string): string[];
  /** Joins repo-relative components with the forward slash git uses. */
  joinRepoPath(...parts: readonly string[]): string;
}
