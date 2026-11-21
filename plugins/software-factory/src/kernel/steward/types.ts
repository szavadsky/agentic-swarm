/** Steward result shapes and the attempt it tracks. */

import type { SessionRef } from "../../harness/types.js";
import type { Cause, Outcome } from "../types.js";

/** One conflict candidate whose steward leg stopped on infra. */
export interface StewardDead {
  slug: string;
  /** The stop's cause verbatim: dispatch classifies it for the backoff. */
  cause: string;
  details?: string;
}

export interface StewardResult {
  skipped: boolean;
  attempted: string[];
  landed: string[];
  unmerged: string[];
  /**
   * Candidates whose leg stopped on infra. Dispatch books the fault against
   * the slug; the remaining candidates still ran.
   */
  dead: StewardDead[];
  cancelled?: boolean;
}

export interface StewardOptions {
  /**
   * Slugs whose infra fault has no live leg this pass: a fatal cause, spent
   * re-dispatches, or a backoff the loop will not spend (a drain or a stop
   * request). Their work waits for the next launch, so the steward skips them.
   */
  frozen?: ReadonlySet<string>;
}

export interface StewardAttempt {
  ok: boolean;
  cause?: Cause;
  infra?: { kind: "infra"; cause: string; details?: string };
  cancelled?: boolean;
  session?: SessionRef;
  outcome?: Outcome;
  agentTurn: boolean;
}

export type MergeAttempt =
  | { before: string; conflicts: string[] }
  | { before: string; result: StewardAttempt };

export type StewardCandidateOutcome =
  | { kind: "dead"; dead: StewardDead; session?: SessionRef }
  | { kind: "cancelled"; session?: SessionRef }
  | { kind: "landed"; session?: SessionRef }
  | { kind: "unmerged"; session?: SessionRef };
