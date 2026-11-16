import {
  type FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";

const EMPTY = {
  status: "done" as const,
  summary: "",
  concerns: [],
  forward: [],
};
const PLAN_STEPS = new Set([PLAN_CHECK_STEP, PLAN_REVIEW_STEP]);

/**
 * Every run config now requires both plan roles. Tests focused on other turns
 * still execute them; bind neutral outcomes so the mandatory calls do not
 * consume another step's scripted turn.
 */
export function scriptPlanRoleFallbacks(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome({
        ...EMPTY,
        planCheck: { verdict: "architect", evidence: [], followUps: [] },
      });
      return fakeTurnResult(req);
    },
    {
      when: (req) => fakeTurnIdentity(req).step === PLAN_CHECK_STEP,
      fallback: true,
    },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(EMPTY);
      return fakeTurnResult(req);
    },
    {
      when: (req) => fakeTurnIdentity(req).step === PLAN_REVIEW_STEP,
      fallback: true,
    },
  );
}

/** Register the mandatory plan-role fallbacks and return the harness inline. */
export function withPlanRoleFallbacks<T extends FakeHarness>(harness: T): T {
  scriptPlanRoleFallbacks(harness);
  return harness;
}

/** The harness calls that did work other than the two mandatory plan roles. */
export function workCalls(harness: FakeHarness) {
  return harness.calls.filter(
    (call) => !PLAN_STEPS.has(fakeTurnIdentity(call).step ?? ""),
  );
}
