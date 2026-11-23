/**
 * The pins root promote writes under and the pin gate reads. Dependency-free:
 * the bootstrap promote entrypoint resolves it before an install, so it may
 * import node builtins only.
 */

import os from "node:os";
import path from "node:path";

/** `FACTORY_PIN_ROOT` relocates the root. */
export function pinsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(
    env.FACTORY_PIN_ROOT ??
      path.join(os.homedir(), ".local/share/factory/pins"),
  );
}
