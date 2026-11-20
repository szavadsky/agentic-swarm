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
const BACKGROUND_STEPS = new Set([PLAN_CHECK_STEP, PLAN_REVIEW_STEP, "digest"]);

/**
 * Every run config requires the full boundary vocabulary. Tests focused on
 * other turns still execute those calls; bind neutral outcomes so they do not
 * consume another step's scripted turn.
 */
export function scriptKernelRoleFallbacks(harness: FakeHarness): void {
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
      ctx.writeOutcome({
        ...EMPTY,
        planReview: { technical: [], planNotes: [] },
      });
      return fakeTurnResult(req);
    },
    {
      when: (req) => fakeTurnIdentity(req).step === PLAN_REVIEW_STEP,
      fallback: true,
    },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome({ ...EMPTY, summary: "digest scout done" });
      return fakeTurnResult(req);
    },
    {
      when: (req) => fakeTurnIdentity(req).step === "digest",
      fallback: true,
    },
  );
}

/** Register the mandatory boundary fallbacks and return the harness inline. */
export function withKernelRoleFallbacks<T extends FakeHarness>(harness: T): T {
  scriptKernelRoleFallbacks(harness);
  return harness;
}

/** The harness calls that did work other than the mandatory background turns. */
export function workCalls(harness: FakeHarness) {
  return harness.calls.filter(
    (call) => !BACKGROUND_STEPS.has(fakeTurnIdentity(call).step ?? ""),
  );
}
