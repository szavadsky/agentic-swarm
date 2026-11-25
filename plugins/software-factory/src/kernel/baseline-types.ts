/** The base-gate shapes pre-flight records and every task's gate verdict reads. */

import type { CheckResult } from "../core/checks/types.js";

export interface BaselineResult {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
  /** False when an identical base commit was already checked (reported once). */
  fresh: boolean;
  /** The baseline could not run; it is journaled as infra, never red, and retried next launch. */
  infra?: boolean;
}

/** The last recorded base-gate run; absent before pre-flight has checked a base. */
export interface BaseGateState {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
}
