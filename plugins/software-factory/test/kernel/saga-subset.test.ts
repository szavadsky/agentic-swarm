import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
  type FakeTurnHandler,
} from "../../src/harness/fake/index.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, expectLaunch, makeGoal, outcome } from "./e2e-helpers.js";

const PROCESS = "hierarchy:\n  depth: 2\n";

const GOAL_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`alpha.txt\` | opened i1 | active
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`beta.txt\` | opened i1 | active
`;

const ALPHA_PLAN = `# Epic alpha

## Milestone 1

- \`alpha.build\` — create alpha.txt.
  - done: alpha.txt exists.
`;

const BETA_PLAN = `# Epic beta

## Milestone 1

- \`beta.build\` — create beta.txt.
  - done: beta.txt exists.
`;

function iterationOf(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).record;
}

/** The saga pass a subarchitect turn runs, from its rendered turn block. */
function passOf(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- pass: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
}

/** The plan a plan-review turn read, from its rendered turn block. */
function reviewedPlan(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- plan: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
}

/** The two-epic goal whose direction subset the test pins. */
interface SubsetCtx {
  goal: ReturnType<typeof makeGoal>;
  planPath: string;
  alphaPlan: string;
  betaPlan: string;
  harness: FakeHarness;
}

function epicTurn(
  req: Parameters<FakeTurnHandler>[0],
  iteration: string,
  epic: string,
  pass: "report" | "direction",
): boolean {
  return (
    iterationOf(req).includes(iteration) &&
    req.prompt.includes(`- epic: \`${epic}\``) &&
    passOf(req) === pass
  );
}

/** Iteration 1: the top registers both epics; the direction pass plans them. */
function scriptInitialIteration(ctx: SubsetCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      fs.writeFileSync(ctx.planPath, GOAL_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "split into alpha and beta", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i1-architect-") },
  );
  for (const [epic, plan, text] of [
    ["alpha", ctx.alphaPlan, ALPHA_PLAN],
    ["beta", ctx.betaPlan, BETA_PLAN],
  ] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(passOf(req)).toBe("direction");
        fs.mkdirSync(path.dirname(plan), { recursive: true });
        fs.writeFileSync(plan, text, "utf8");
        turnedCtx.writeOutcome(
          outcome({ summary: `epic ${epic} planned`, decision: "continue" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicTurn(req, "-i1-", epic, "direction") },
    );
  }
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no tasks yet" }));
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i1-pm-") },
  );
}

/**
 * Iteration 2: both epics are open and report upward, but the top names only
 * beta, so alpha must keep the plan its report covered.
 */
function scriptMiddleIteration(ctx: SubsetCtx): void {
  for (const epic of ["alpha", "beta"] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(passOf(req)).toBe("report");
        turnedCtx.writeOutcome(
          outcome({ summary: `${epic} still owes work`, decision: "continue" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicTurn(req, "-i2-", epic, "report") },
    );
  }
  ctx.harness.script(
    (req, turnedCtx) => {
      fs.appendFileSync(
        ctx.planPath,
        "\n## Milestone 2\n- keep alpha's interface stable.\n",
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({
          summary: "only beta takes the direction",
          decision: "continue",
          epicConsults: ["beta"],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("direction");
      fs.appendFileSync(ctx.betaPlan, "\n## Milestone 2\n- hold.\n", "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "beta takes new direction", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicTurn(req, "-i2-", "beta", "direction") },
  );
  // A direction turn for the unnamed epic is the regression this test pins.
  // Run it like a healthy consult so the trace assertions name that fault.
  ctx.harness.script(
    (req, turnedCtx) => {
      fs.appendFileSync(ctx.alphaPlan, "\n## Milestone 2\n- hold.\n", "utf8");
      turnedCtx.writeOutcome(
        outcome({
          summary: "alpha took an unnamed direction",
          decision: "continue",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicTurn(req, "-i2-", "alpha", "direction") },
  );
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-pm-") },
  );
}

/** The pass records of one iteration, in record order. */
function passTrace(
  records: Awaited<
    ReturnType<ReturnType<typeof createFolderStore>["listRecords"]>
  >,
  iteration: number,
): string[] {
  return records
    .filter(
      (record) =>
        record.iteration === iteration &&
        (record.step === "plancheck" ||
          record.step === "subarchitect" ||
          record.step === "architect"),
    )
    .sort((a, b) => a.seq - b.seq)
    .map((record) => {
      if (record.step === "plancheck")
        return `check:${record.architect ?? "goal"}`;
      if (record.step === "subarchitect")
        return `subarchitect:${record.architect}`;
      return "top";
    });
}

/** Plan reviews of one iteration, in the order they ran. */
function reviewOrder(harness: FakeHarness, iteration: number): string[] {
  return harness.calls
    .filter(
      (call) =>
        fakeTurnIdentity(call).step === PLAN_REVIEW_STEP &&
        fakeTurnIdentity(call).record.includes(`-i${iteration}-`),
    )
    .map((call) => path.basename(reviewedPlan(call)));
}

/** The epics the direction pass actually consulted in one iteration. */
function directionEpics(harness: FakeHarness, iteration: number): string[] {
  return harness.calls
    .filter(
      (call) =>
        fakeTurnIdentity(call).record.includes(`-i${iteration}-`) &&
        passOf(call) === "direction",
    )
    .map((call) => /- epic: `([^`]+)`/.exec(call.prompt)?.[1] ?? "");
}

describe("saga direction subset at depth 2", () => {
  it("consults only the epics the top names while an unnamed open epic keeps its plan", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const ctx: SubsetCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        harness: new FakeHarness({ id: "fake" }),
      };
      scriptInitialIteration(ctx);
      scriptMiddleIteration(ctx);

      // Both epics stay open, so two iterations end at the iteration limit.
      await expectLaunch(3, goal.repo, ctx.harness, 2);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      // Both report upward; only the named beta takes the direction pass.
      expect(passTrace(records, 2)).toEqual([
        "check:alpha",
        "check:beta",
        "check:goal",
        "subarchitect:alpha",
        "subarchitect:beta",
        "top",
        "subarchitect:beta",
      ]);
      expect(directionEpics(ctx.harness, 2)).toEqual(["beta"]);
      // The unnamed epic's plan did not change, so only beta's is reviewed.
      expect(reviewOrder(ctx.harness, 2)).toEqual(["beta.md", "plan.md"]);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
});
