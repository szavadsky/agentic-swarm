/**
 * The boundary's result helper: every phase builds its result through
 * `boundaryResult`, so the iteration and the seen-steer set are never restated.
 */

import type { BoundaryResult, ConsultContext } from "./boundary-types.js";
import type { GoalDecision } from "./types.js";

/** The result shape every phase returns; packPath appears once the pack exists. */
export function boundaryResult(
  context: ConsultContext,
  decision: GoalDecision,
  extra: Partial<BoundaryResult> = {},
): BoundaryResult {
  return {
    iteration: context.iteration,
    decision,
    ...(context.packRel ? { packPath: context.packRel } : {}),
    seenSteers: context.seenSteers,
    ...extra,
  };
}
