/** What launch setup hands the goal loop after its one-shot work. */

import { type RunLockHandle } from "../cli/lock.js";
import { type DrainController } from "./signals.js";
import type { KernelRuntime } from "./types.js";

export interface LaunchSetup {
  repoRoot: string;
  configs: KernelRuntime["configs"];
  paths: KernelRuntime["paths"];
}

export interface PreparedLaunch {
  setup: LaunchSetup;
  store: KernelRuntime["store"];
  runtime: KernelRuntime;
  signals: DrainController;
  uninstall: (() => void) | undefined;
  lock: RunLockHandle;
  /** Stops copying console lines into this launch's file. */
  closeRunLog: () => void;
}
