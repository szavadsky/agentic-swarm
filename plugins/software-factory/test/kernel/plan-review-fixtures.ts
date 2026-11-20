import type { FakeHarness } from "../../src/harness/fake/index.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";
import type { Outcome, PlanReviewOutcome } from "../../src/kernel/types.js";
import { outcome, whenTurn } from "./s2-helpers.js";

export const FINDINGS: PlanReviewOutcome = {
  technical: [
    {
      planLine: "plan.md:12",
      finding: "the bullet assumes a module the repo lacks",
    },
  ],
  planNotes: [
    { planLine: "plan.md:40", finding: "the done-when names no command" },
  ],
};

export const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "plan-reviewer-b": { harness: "fake", model: "fake-plan-review-b" },
};

/** A plan review outcome carrying the given findings. */
export function reviewed(
  summary: string,
  findings: PlanReviewOutcome,
): Outcome {
  return outcome({ summary, planReview: findings }) as Outcome;
}

export function planReviewBy(model: string) {
  return (req: Parameters<FakeHarness["turn"]>[0]) =>
    whenTurn({ step: PLAN_REVIEW_STEP })(req) && req.model.id === model;
}
