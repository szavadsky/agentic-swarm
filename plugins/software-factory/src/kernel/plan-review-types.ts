/** The plan review's delivered round. */

import type { PlanReviewOutcome } from "./types.js";

export interface PlanReviewRound {
  /** Undefined when no reviewer delivered a findings outcome. */
  findings: PlanReviewOutcome | undefined;
  /** The aliases that delivered a valid findings outcome, in run order. */
  reviewers: string[];
}
