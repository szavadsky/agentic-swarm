/** Merge and kept-land result shapes. */

import type { CheckResult } from "../../core/checks/types.js";
import type { StepRecord } from "../types.js";

export interface MergeResult {
  infra?: { kind: "infra"; cause: string; details?: string };
  cancelled?: boolean;
}

export interface MergeOptions {
  /**
   * Kept-land mode: one flake re-run on red merge gates. A kept-land conflict
   * parks in every mode: the wave-end steward owns it, because a boundary merge
   * has no task flow to run a resolve turn in.
   */
  keptLand?: boolean;
}

export interface KeptLandResult {
  /** Parked slugs whose kept branch landed on the integration head. */
  landed: string[];
  /**
   * Parked slugs kept-land handled this pass: attempted, or ruled out on this
   * tip. Anything but a landing leaves the branch parked for the steward.
   */
  attempted: string[];
}

/** The integration head's own gate verdict, keyed by the tree it judged. */
export interface GoalHeadJudgement {
  /** The gate run that judged that tree: this wave's, or the reused one. */
  record: StepRecord;
  /** New failures on the head's tree; empty when the head is green. */
  red: CheckResult[];
}
