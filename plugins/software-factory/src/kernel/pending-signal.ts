/** The mechanical-signal vocabulary, and the kernel turn that decides it. */
import type { FlowDefinition, FlowStep } from "./types.js";

/** The record step and phase of one decide turn. */
export const DECIDE_STEP = "decide";

/**
 * The decide turn is not a configured flow step: a signal raises it, so it
 * reuses the reviewer's prompt role and alias without entering any step
 * sequence. Its verdict makes it a verdict step, never a productive one.
 */
export function decideStep(flow: FlowDefinition): FlowStep {
  const review = flow.steps.find((step) => step.review === true);
  return {
    id: DECIDE_STEP,
    prompt: "decider",
    alias: review?.alias ?? "reviewer",
    review: true,
    deliverable: "verdict",
  };
}

export function isDecideStep(step: FlowStep | string | undefined): boolean {
  return typeof step === "string"
    ? step === DECIDE_STEP
    : step?.id === DECIDE_STEP;
}
