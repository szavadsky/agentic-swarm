import { terminateAllChildGroups } from "../core/shutdown.js";
import type {
  DrainSignal,
  Terminator,
  DrainController,
} from "./signals-types.js";
export type { DrainController, DrainSignal } from "./signals-types.js";

/**
 * SIGINT/SIGTERM policy: first drains, second aborts and lets the in-flight
 * harness turn return its partial usage into the end record, third force-exits.
 */
export function createDrainController(
  terminate: Terminator = terminateAllChildGroups,
): DrainController {
  let draining = false;
  let aborted = false;
  let interruptedBy: DrainSignal | undefined;
  let count = 0;
  let uninstall: (() => void) | undefined;

  const handleSignal = (signal: DrainSignal): void => {
    count += 1;
    interruptedBy ??= signal;
    if (count === 1) {
      draining = true;
      console.warn(
        "[factory] signal received: draining (no new dispatch; signal again to abort in-flight turns)",
      );
      return;
    }
    if (count === 2) {
      draining = true;
      aborted = true;
      console.warn(
        "[factory] second signal: aborting in-flight turns; partial usage will be recorded",
      );
      void terminate(500);
      return;
    }
    console.warn("[factory] third signal: forcing exit");
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  const controller: DrainController = {
    get draining() {
      return draining;
    },
    get aborted() {
      return aborted;
    },
    get interruptedBy() {
      return interruptedBy;
    },
    shouldStop() {
      return draining;
    },
    handleSignal,
    install() {
      if (uninstall) return uninstall;
      const onInt = () => handleSignal("SIGINT");
      const onTerm = () => handleSignal("SIGTERM");
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      uninstall = () => {
        process.removeListener("SIGINT", onInt);
        process.removeListener("SIGTERM", onTerm);
        uninstall = undefined;
      };
      return uninstall;
    },
  };
  return controller;
}
