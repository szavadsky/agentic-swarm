import { AsyncLocalStorage } from "node:async_hooks";

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

const active = new AsyncLocalStorage<SandboxCommand | undefined>();

/** Runs `fn` in the sandbox the run configured; nested async work inherits it. */
export function runInSandbox<T>(
  sandbox: SandboxCommand | undefined,
  fn: () => T,
): T {
  return active.run(sandbox, fn);
}

/** The wrapper active in this async context, when the run configured one. */
export function currentSandbox(): SandboxCommand | undefined {
  return active.getStore();
}

/** An executable and argv, prefixed by the active wrapper and `--`. */
export function sandboxedSpec(
  executable: string,
  args: readonly string[],
): { executable: string; args: string[] } {
  const sandbox = currentSandbox();
  if (!sandbox) return { executable, args: [...args] };
  return {
    executable: sandbox.binary,
    args: [...sandbox.args, "--", executable, ...args],
  };
}
