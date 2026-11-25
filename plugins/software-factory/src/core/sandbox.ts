import { AsyncLocalStorage } from "node:async_hooks";
import type { SandboxCommand } from "./types.js";

export type { SandboxCommand } from "./types.js";

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
