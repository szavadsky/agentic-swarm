import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import {
  latestPlanReview,
  PLAN_REVIEW_STEP,
} from "../../src/kernel/plan-review.js";
import type { Outcome } from "../../src/kernel/types.js";
import { outcome } from "./e2e-helpers.js";
import { rec } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const PLAN_REVIEW_ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

async function runsFreshPlanReviewAfterArchitectPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");

  const probe = { reviewPrompt: "" };
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("planReviewMarks");
    expect(req.prompt).toContain("helpful");
    expect(req.prompt).toContain("unhelpful");
    fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script(
    (req, ctx) => {
      probe.reviewPrompt = req.prompt;
      ctx.writeOutcome(
        outcome({
          summary:
            "alpha's done-when names no test; name the command that proves it.",
          planReview: {
            technical: [],
            planNotes: [
              {
                planLine: "plan.md:3",
                finding:
                  "alpha's done-when names no test; name the command that proves it.",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
  );

  return { harness, runtime, planPath, probe };
}

async function runsFreshPlanReviewAfterArchitectPart2(
  scope: Awaited<ReturnType<typeof runsFreshPlanReviewAfterArchitectPart1>>,
) {
  const { harness, runtime, probe, planPath } = scope;
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });

  const first = await runBoundary(runtime, { relaunch: false });
  expect(first.decision).toBe("continue");

  const reviewCall = harness.calls.find(
    (call) => fakeTurnIdentity(call).step === PLAN_REVIEW_STEP,
  );
  expect(reviewCall).toBeDefined();
  expect(reviewCall!.model.id).toBe("fake-plan-review");
  expect(reviewCall!.session).toBeUndefined();
  expect(probe.reviewPrompt).toContain("You review the architect's plan");
  expect(probe.reviewPrompt).toContain("advisory input, never a veto");
  expect(probe.reviewPrompt).not.toContain("You review the task diff");
  expect(probe.reviewPrompt).toContain(planPath);
  expect(probe.reviewPrompt).toContain(runtime.paths.goalCheckout);

  const records = await runtime.store.listRecords();
  const review = records.find(
    (record) => record.step === PLAN_REVIEW_STEP && record.actor === "agent",
  );
  expect(review?.alias).toBe("plan-reviewer");
  expect(review?.outcome?.summary).toContain("no test");
}

async function runsFreshPlanReviewAfterArchitectPart3(
  scope: Awaited<ReturnType<typeof runsFreshPlanReviewAfterArchitectPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    const pack = fs.readFileSync(
      path.join(runtime.store.goalDir, contextPackRelPath(2)),
      "utf8",
    );
    expect(pack).toContain("## Plan review");
    expect(pack).toContain("iteration 1, reviewers `plan-reviewer`");
    expect(pack).toContain(
      "1. plan.md:3 — alpha's done-when names no test; name the command that proves it.",
    );
    expect(req.prompt).toContain("mark every numbered finding");
    ctx.writeOutcome(
      outcome({
        summary: "marked the review",
        decision: "done",
        planReviewMarks: [{ finding: 1, mark: "helpful" }],
      }),
    );
    return fakeTurnResult(req);
  });
  const second = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  expect(second.decision).toBe("done");
  const architect = (await runtime.store.listRecords())
    .filter(
      (record) =>
        record.step === "architect" && record.iteration === 2 && record.endedAt,
    )
    .at(-1);
  expect(architect?.outcome?.planReviewMarks).toEqual([
    { finding: 1, mark: "helpful" },
  ]);
}

describe("boundary plan review", () => {
  it("runs a fresh plan review after the architect and packs its findings for the next consult", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: PLAN_REVIEW_ALIASES });
    try {
      const scope1 = await runsFreshPlanReviewAfterArchitectPart1(repo, goal);
      await runsFreshPlanReviewAfterArchitectPart2(scope1);
      await runsFreshPlanReviewAfterArchitectPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("packs only the latest plan review attempt, never stale findings", () => {
    const older = rec(1, {
      slug: undefined,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        summary: "stale",
        planReview: {
          technical: [{ planLine: "plan.md", finding: "stale finding" }],
          planNotes: [],
        },
      }) as Outcome,
    });
    const newer = rec(2, {
      slug: undefined,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        summary: "fresh",
        planReview: {
          technical: [{ planLine: "plan.md", finding: "fresh finding" }],
          planNotes: [],
        },
      }) as Outcome,
    });
    expect(latestPlanReview([older, newer])?.technical[0]?.finding).toContain(
      "fresh finding",
    );
    const failed = rec(3, {
      slug: undefined,
      iteration: 3,
      step: PLAN_REVIEW_STEP,
      outcome: outcome({
        status: "failed",
        summary: "invalid outcome",
      }) as Outcome,
    });
    expect(latestPlanReview([older, newer, failed])).toBeUndefined();
  });
});
