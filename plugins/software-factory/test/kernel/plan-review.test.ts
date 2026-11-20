// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { numberedPlanFindings } from "../../src/kernel/context-pack.js";
import {
  latestPlanReview,
  PLAN_REVIEW_STEP,
  PLAN_RETURN_STEP,
  validatePlanReturnDelivery,
  validatePlanReviewDelivery,
  validatePlanReviewMarks,
} from "../../src/kernel/plan-review.js";
import type { Outcome, PlanReviewOutcome } from "../../src/kernel/types.js";
import { rec, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const FINDINGS: PlanReviewOutcome = {
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

const ALIASES = {
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
function reviewed(summary: string, findings: PlanReviewOutcome): Outcome {
  return outcome({ summary, planReview: findings }) as Outcome;
}

function planReviewBy(model: string) {
  return (req: Parameters<FakeHarness["turn"]>[0]) =>
    whenTurn({ step: PLAN_REVIEW_STEP })(req) && req.model.id === model;
}

describe("plan review findings", () => {
  it("numbers technical first, then plan notes", () => {
    expect(numberedPlanFindings(FINDINGS)).toEqual([
      { ...FINDINGS.technical[0]!, number: 1, kind: "technical" },
      { ...FINDINGS.planNotes[0]!, number: 2, kind: "planNote" },
    ]);
  });

  it("requires every finding marked once, within range", () => {
    expect(
      validatePlanReviewMarks(FINDINGS, [
        { finding: 1, mark: "helpful" },
        { finding: 2, mark: "unhelpful" },
      ]),
    ).toEqual([]);
    expect(validatePlanReviewMarks(FINDINGS, [])).toEqual([
      "planReviewMarks: finding 1 is unmarked",
      "planReviewMarks: finding 2 is unmarked",
    ]);
    expect(
      validatePlanReviewMarks(FINDINGS, [
        { finding: 1, mark: "helpful" },
        { finding: 1, mark: "unhelpful" },
        { finding: 3, mark: "helpful" },
      ]),
    ).toEqual([
      "planReviewMarks: finding 1 is marked twice",
      "planReviewMarks: finding 3 is outside 1..2",
      "planReviewMarks: finding 2 is unmarked",
    ]);
  });

  it("a completed plan review delivers planReview and no verdict", () => {
    expect(
      validatePlanReviewDelivery(
        outcome({ planReview: { technical: [], planNotes: [] } }) as Outcome,
      ),
    ).toEqual([]);
    expect(validatePlanReviewDelivery(outcome({}) as Outcome)).toEqual([
      "planReview is required on a completed plan review: {technical: [], planNotes: []} when the plan has no findings",
    ]);
    expect(
      validatePlanReviewDelivery(
        outcome({
          verdict: "reject",
          planReview: { technical: [], planNotes: [] },
        }) as Outcome,
      ),
    ).toEqual([
      "a plan review has no verdict: deliver `planReview` findings instead",
    ]);
  });

  it("a return marks every finding and takes no decision or verdict", () => {
    const marked = (patch: Record<string, unknown>) =>
      validatePlanReturnDelivery(
        FINDINGS,
        outcome({
          planReviewMarks: [
            { finding: 1, mark: "helpful" },
            { finding: 2, mark: "helpful" },
          ],
          ...patch,
        }) as Outcome,
      );
    expect(marked({})).toEqual([]);
    expect(marked({ decision: "continue" })).toEqual([
      "a plan-review return takes no decision: the consult already decided continue",
    ]);
    expect(marked({ verdict: "approve" })).toEqual([
      "a plan-review return takes no verdict",
    ]);
    expect(
      validatePlanReturnDelivery(
        FINDINGS,
        outcome({
          status: "blocked",
          summary: "cannot answer finding 1 without owner input",
        }) as Outcome,
      ),
    ).toEqual([]);
  });

  it("aggregates every reviewer of the round and hides it once the architect answers", () => {
    const first = rec(1, {
      slug: undefined,
      iteration: 2,
      step: PLAN_REVIEW_STEP,
      alias: "plan-reviewer",
      outcome: reviewed("first", {
        technical: [FINDINGS.technical[0]!],
        planNotes: [],
      }),
    });
    const second = rec(2, {
      slug: undefined,
      iteration: 2,
      step: PLAN_REVIEW_STEP,
      alias: "plan-reviewer-b",
      outcome: reviewed("second", {
        technical: [],
        planNotes: [FINDINGS.planNotes[0]!],
      }),
    });
    expect(latestPlanReview([first, second])).toMatchObject({
      iteration: 2,
      reviewers: ["plan-reviewer", "plan-reviewer-b"],
      technical: FINDINGS.technical,
      planNotes: FINDINGS.planNotes,
    });
    const answered = rec(3, {
      slug: undefined,
      iteration: 2,
      step: PLAN_RETURN_STEP,
      alias: "architect",
      outcome: outcome({
        summary: "addressed",
        planReviewMarks: [
          { finding: 1, mark: "helpful" },
          { finding: 2, mark: "helpful" },
        ],
      }) as Outcome,
    });
    expect(latestPlanReview([first, second, answered])).toBeUndefined();
  });

  it("answers one plan without hiding another plan's findings", () => {
    const epicFinding = {
      planLine: "epics/auth.md:8",
      finding: "the epic plan assumes an interface the goal plan never fixes",
    };
    const goal = rec(1, {
      slug: undefined,
      iteration: 2,
      step: PLAN_REVIEW_STEP,
      alias: "plan-reviewer",
      outcome: reviewed("goal review", {
        technical: [FINDINGS.technical[0]!],
        planNotes: [],
      }),
    });
    const epic = rec(2, {
      slug: undefined,
      iteration: 2,
      step: PLAN_REVIEW_STEP,
      alias: "plan-reviewer",
      architect: "auth",
      outcome: reviewed("epic review", {
        technical: [epicFinding],
        planNotes: [],
      }),
    });
    const goalReturn = rec(3, {
      slug: undefined,
      iteration: 2,
      step: PLAN_RETURN_STEP,
      alias: "architect",
      outcome: outcome({
        summary: "answered the goal plan",
        planReviewMarks: [{ finding: 1, mark: "helpful" }],
      }) as Outcome,
    });
    const remaining = latestPlanReview([goal, epic, goalReturn]);
    expect(remaining?.technical).toEqual([epicFinding]);
    expect(remaining?.reviewers).toEqual(["plan-reviewer"]);
  });

  it("hides an older round when the newest one delivered nothing", () => {
    const older = rec(1, {
      slug: undefined,
      iteration: 1,
      step: PLAN_REVIEW_STEP,
      outcome: reviewed("older", FINDINGS),
    });
    const failed = rec(2, {
      slug: undefined,
      iteration: 2,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        status: "failed",
        summary: "invalid outcome",
      }) as Outcome,
    });
    expect(latestPlanReview([older, failed])).toBeUndefined();
  });
});

describe("architecture flow", () => {
  it("runs one return on technical findings before the PM and records its marks", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      const strayPath = path.join(runtime.store.tasksDir, "stray.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");
      let returnPrompt = "";
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("## Bounds");
          expect(req.prompt).toContain("## What the plan carries");
          expect(req.prompt).toContain(
            "Temporary debt only with a named remover",
          );
          expect(req.prompt).not.toContain("## Turn order");
          ctx.writeOutcome(reviewed("reviewed", FINDINGS));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
      );
      harness.script(
        (req, ctx) => {
          returnPrompt = req.prompt;
          fs.appendFileSync(planPath, "\n## addressed the finding\n", "utf8");
          fs.writeFileSync(strayPath, "# Stray\n", "utf8");
          ctx.writeOutcome(
            outcome({
              summary: "addressed the technical finding",
              planReviewMarks: [
                { finding: 1, mark: "helpful" },
                { finding: 2, mark: "helpful" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_RETURN_STEP }) },
      );
      harness.script((req, ctx) => {
        expect(fs.existsSync(strayPath)).toBe(false);
        expect(fs.readFileSync(planPath, "utf8")).toContain(
          "## addressed the finding",
        );
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      const first = await runBoundary(runtime, { relaunch: false });
      expect(first.decision).toBe("continue");
      expect(harness.calls.map((call) => fakeTurnIdentity(call).step)).toEqual([
        "architect",
        PLAN_REVIEW_STEP,
        PLAN_RETURN_STEP,
        "pm",
      ]);
      expect(returnPrompt).toContain("1. plan.md:12 —");
      expect(returnPrompt).toContain("2. plan.md:40 —");
      expect(returnPrompt).toContain("1..2");
      const records = await runtime.store.listRecords();
      const returned = records.find(
        (record) => record.step === PLAN_RETURN_STEP,
      );
      expect(returned?.outcome?.planReviewMarks).toEqual([
        { finding: 1, mark: "helpful" },
        { finding: 2, mark: "helpful" },
      ]);
      expect(fs.existsSync(strayPath)).toBe(false);
      expect(
        causeText(
          records.find((record) => record.step === "plan-return-reconcile")
            ?.cause,
        ),
      ).toContain("stray.md");
      // The return answered the findings, so the next pack does not re-ask.
      expect(latestPlanReview(records)).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("skips the return when the config never allows one and leaves the findings for the next pack", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      process: { architecture: { architectReturn: "never" } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(reviewed("reviewed", FINDINGS));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await runBoundary(runtime, { relaunch: false });
      expect(
        harness.calls.some(
          (call) => fakeTurnIdentity(call).step === PLAN_RETURN_STEP,
        ),
      ).toBe(false);
      expect(latestPlanReview(await runtime.store.listRecords())).toMatchObject(
        {
          iteration: 1,
          technical: FINDINGS.technical,
          planNotes: FINDINGS.planNotes,
        },
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("runs every configured reviewer and merges their findings", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      process: {
        architecture: { reviewers: ["plan-reviewer", "plan-reviewer-b"] },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            reviewed("first", {
              technical: [FINDINGS.technical[0]!],
              planNotes: [],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: planReviewBy("fake-plan-review") },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            reviewed("second", {
              technical: [],
              planNotes: [FINDINGS.planNotes[0]!],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: planReviewBy("fake-plan-review-b") },
      );
      let returnPrompt = "";
      harness.script(
        (req, ctx) => {
          returnPrompt = req.prompt;
          fs.appendFileSync(planPath, "\n## addressed the finding\n", "utf8");
          ctx.writeOutcome(
            outcome({
              summary: "addressed the technical finding",
              planReviewMarks: [
                { finding: 1, mark: "helpful" },
                { finding: 2, mark: "helpful" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_RETURN_STEP }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await runBoundary(runtime, { relaunch: false });
      const reviews = harness.calls.filter(
        (call) => fakeTurnIdentity(call).step === PLAN_REVIEW_STEP,
      );
      expect(reviews.map((call) => call.model.id)).toEqual([
        "fake-plan-review",
        "fake-plan-review-b",
      ]);
      expect(returnPrompt).toContain("1. plan.md:12 —");
      expect(returnPrompt).toContain("2. plan.md:40 —");
      const records = await runtime.store.listRecords();
      const returned = records.find(
        (record) => record.step === PLAN_RETURN_STEP,
      );
      expect(returned?.outcome?.planReviewMarks).toHaveLength(2);
      expect(latestPlanReview(records)).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});
