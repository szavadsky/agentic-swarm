/** Merge and kept-land result shapes. */

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
  /** Parked slugs attempted this boundary, landed or still parked. */
  attempted: string[];
}
