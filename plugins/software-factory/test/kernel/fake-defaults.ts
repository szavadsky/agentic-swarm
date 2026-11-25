import {
  type FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import fs from "node:fs";
import path from "node:path";
import { INFRA_FILE } from "../../src/kernel/infra.js";
import { CODE_MAP_FILE } from "../../src/kernel/ingestion.js";
import { PACK_PREP_STEP } from "../../src/kernel/pack-prep.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";

const EMPTY = {
  status: "done" as const,
  summary: "",
  concerns: [],
  forward: [],
};
const BACKGROUND_STEPS = new Set([
  PLAN_CHECK_STEP,
  PLAN_REVIEW_STEP,
  PACK_PREP_STEP,
  "digest",
  "infra",
  "scout",
]);

const planCheckFallback: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome({
    ...EMPTY,
    planCheck: { verdict: "architect", evidence: [], followUps: [] },
  });
  return fakeTurnResult(req);
};

const planReviewFallback: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome({ ...EMPTY, planReview: { technical: [], planNotes: [] } });
  return fakeTurnResult(req);
};

const packPrepFallback: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome(EMPTY);
  return fakeTurnResult(req);
};

const digestFallback: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome({ ...EMPTY, summary: "digest scout done" });
  return fakeTurnResult(req);
};

const infraFallback: FakeTurnHandler = (req, ctx) => {
  const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
  // Unrelated runs keep the configured gates; discovery is exercised by the
  // tests that script this step themselves.
  fs.writeFileSync(path.join(goalDir, INFRA_FILE), "gates: []\n");
  ctx.writeOutcome(EMPTY);
  return fakeTurnResult(req);
};

const scoutFallback: FakeTurnHandler = (req, ctx) => {
  const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
  fs.writeFileSync(
    path.join(goalDir, CODE_MAP_FILE),
    "- src/ — fixture files\n- test/ — fixture tests\n",
  );
  ctx.writeOutcome(EMPTY);
  return fakeTurnResult(req);
};

const qaFallback: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome({
    ...EMPTY,
    summary: "qa accepted",
    qa: { verdict: "accept", findings: [] },
  });
  return fakeTurnResult(req);
};

/** Binds a neutral turn to one background step, behind every explicit script. */
function background(
  harness: FakeHarness,
  step: string,
  handler: FakeTurnHandler,
): void {
  harness.script(handler, {
    when: (req) => fakeTurnIdentity(req).step === step,
    fallback: true,
  });
}

/**
 * Every run config requires the full boundary vocabulary. Tests focused on
 * other turns still execute those calls; bind neutral outcomes so they do not
 * consume another step's scripted turn.
 */
export function scriptKernelRoleFallbacks(harness: FakeHarness): void {
  background(harness, PLAN_CHECK_STEP, planCheckFallback);
  background(harness, PLAN_REVIEW_STEP, planReviewFallback);
  background(harness, PACK_PREP_STEP, packPrepFallback);
  background(harness, "digest", digestFallback);
  // The shipped ingestion sequence discovers gates and scouts a bigger goal
  // before the architect; tests focused on other turns still run those steps.
  background(harness, "infra", infraFallback);
  background(harness, "scout", scoutFallback);
  // The default development flow includes QA. A test that wants QA findings
  // binds its own handler for the step, which wins over this fallback.
  background(harness, "qa", qaFallback);
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
