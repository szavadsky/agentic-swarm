import type { FlowDefinition, FlowStep } from "./types.js";

/** Reviewer default: the first two reviews may request changes; the third is the last call. */
export const DEFAULT_CHANGE_REQUESTS = 2;

/**
 * A step that accepts or sends back the work: a review or QA. Both consume the
 * same acceptance round, both are gated before they read the tree, and both
 * end with a verdict rather than a product.
 */
export function isAcceptanceStep(step: FlowStep | undefined): boolean {
  return step?.review === true || step?.qa === true;
}

/** Change requests a step's agent may issue before its call is the last one. */
function changeRequestBound(step: FlowStep): number {
  return step.changeRequests ?? DEFAULT_CHANGE_REQUESTS;
}

/** Total acceptance calls the bound allows: one per accepted change request plus the last call. */
export function reviewRoundLimit(step: FlowStep): number {
  return changeRequestBound(step) + 1;
}

/** True when this acceptance round is the step's last call: no change request is honored. */
export function isLastReviewCall(step: FlowStep, round: number): boolean {
  return round > changeRequestBound(step);
}

/**
 * Configured flow steps that dispatch to agents, filtering out the script
 * steps. `checks` is the gate phase; `resolve` runs only after a merge
 * conflicts, never in the normal sequence.
 */
export function agentSteps(flow: FlowDefinition): FlowStep[] {
  return flow.steps.filter((s) => s.id !== "checks" && s.id !== "resolve");
}

/** Checks step in flow definition, if configured. */
function checksStep(flow: FlowDefinition): FlowStep | undefined {
  return flow.steps.find((s) => s.id === "checks");
}

/** Change requests the checks step may issue before its call is the last one. */
function checksChangeRequestBound(flow: FlowDefinition): number {
  const step = checksStep(flow);
  return step?.changeRequests ?? DEFAULT_CHANGE_REQUESTS;
}

/** Total fix calls the bound allows: one per accepted change request plus the last call. */
export function checksFixLimit(flow: FlowDefinition): number {
  return checksChangeRequestBound(flow) + 1;
}

/** True when this gate-fix turn is the step's last call: no further red gates are allowed. */
export function isLastChecksFixCall(
  flow: FlowDefinition,
  fixCount: number,
): boolean {
  return fixCount > checksChangeRequestBound(flow);
}
