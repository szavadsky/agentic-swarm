/**
 * Shapes shared by the core process, environment and sandbox helpers, so each
 * implementation module carries no public type of its own.
 */

/** Options one child environment is built from. */
export interface ChildEnvOptions {
  /** Extra names the run config allows (`envAllowlist`). */
  allow?: readonly string[];
  /** Values the caller sets explicitly; they always reach the child. */
  set?: Record<string, string>;
  /** Parent environment; callers default to `process.env`, tests pass a fixture. */
  source?: NodeJS.ProcessEnv;
}

/** The result of one process run, bounded and timed by the runner. */
export interface ProcessResult {
  code: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The run ended because `signal` fired; the child was killed, not reaped. */
  aborted: boolean;
  durationMs: number;
  suspendDetected?: boolean;
  suspendGapMs?: number;
}

/**
 * One process-level wrapper for a whole run. `args` are the wrapper's own
 * flags (for bwrap: namespace and bind arguments); the wrapped command
 * follows a `--` separator, so a wrapper that takes its program after `--`
 * accepts every child the run starts.
 */
export interface SandboxCommand {
  binary: string;
  args: readonly string[];
}
