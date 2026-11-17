import type { FlowStep } from "./types.js";

/** Reviewer default: the first two reviews may request changes; the third is the last call. */
export const DEFAULT_CHANGE_REQUESTS = 2;

/** Change requests a step's agent may issue before its call is the last one. */
function changeRequestBound(step: FlowStep): number {
  return step.changeRequests ?? DEFAULT_CHANGE_REQUESTS;
}

/** Total review calls the bound allows: one per accepted change request plus the last call. */
export function reviewRoundLimit(step: FlowStep): number {
  return changeRequestBound(step) + 1;
}

/** True when this review round is the step's last call: no change request is honored. */
export function isLastReviewCall(step: FlowStep, round: number): boolean {
  return round > changeRequestBound(step);
}
