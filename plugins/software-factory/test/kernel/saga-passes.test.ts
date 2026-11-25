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

function epicTask(slug: string, epic: string, file: string): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    "kind: development",
    "flow: implement-review",
    "deps: []",
    `scope: [${file}]`,
    `epic: ${epic}`,
    "source: plan",
    "---",
    "",
    `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

function implementer(file: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}

function approver(summary: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary, verdict: "approve" }));
    return fakeTurnResult(req);
  };
}

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

/** The pack a turn was pointed at, read from disk. */
function readPack(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- context pack: `([^`]+)`/.exec(req.prompt);
  if (!match?.[1]) throw new Error("turn prompt names no context pack");
  return fs.readFileSync(match[1], "utf8");
}

/** Both epics' task implement/approve turns. */
function scriptSagaTasks(ctx: {
  goal: ReturnType<typeof makeGoal>;
  harness: FakeHarness;
}): void {
  ctx.harness.script(implementer("alpha.txt"), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "alpha.build" &&
      fakeTurnIdentity(req).step === "implement",
  });
  ctx.harness.script(approver("alpha is correct"), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "alpha.build" &&
      fakeTurnIdentity(req).step === "review",
  });
  ctx.harness.script(implementer("beta.txt"), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "beta.build" &&
      fakeTurnIdentity(req).step === "implement",
  });
  ctx.harness.script(approver("beta is correct"), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "beta.build" &&
      fakeTurnIdentity(req).step === "review",
  });
}

/** The two-epic goal the pass-order test drives through first, middle and done. */
interface SagaPassCtx {
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
function scriptPassFirstIteration(ctx: SagaPassCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Architect register");
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
      fs.mkdirSync(ctx.goal.tasksDir, { recursive: true });
      fs.writeFileSync(
        path.join(ctx.goal.tasksDir, "alpha.build.md"),
        epicTask("alpha.build", "alpha", "alpha.txt"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(ctx.goal.tasksDir, "beta.build.md"),
        epicTask("beta.build", "beta", "beta.txt"),
        "utf8",
      );
      turnedCtx.writeOutcome(outcome({ summary: "filed both epics' tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i1-pm-") },
  );
}

/** Iteration 2's bottom-up reports: alpha and beta report before the top turn. */
function scriptPassI2Reports(ctx: SagaPassCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("report");
      expect(readPack(req)).toContain("- `alpha`: open");
      turnedCtx.writeOutcome(
        outcome({ summary: "alpha reports complete", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicTurn(req, "-i2-", "alpha", "report") },
  );
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("report");
      expect(readPack(req)).toContain("- `beta`: open");
      turnedCtx.writeOutcome(
        outcome({
          summary: "beta reports one gap",
          decision: "continue",
          concerns: [
            {
              kind: "risk",
              calibration: "architect",
              text: "beta needs a goal-level decision",
              evidence: "beta.txt:1",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicTurn(req, "-i2-", "beta", "report") },
  );
}

/** Iteration 2's top turn: beta's brief already reached it; it chooses beta. */
function scriptPassI2Architect(ctx: SagaPassCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(readPack(req)).toContain("beta needs a goal-level decision");
      fs.appendFileSync(
        ctx.planPath,
        "\n## Milestone 2\n- keep the cross-epic interface stable.\n",
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({
          summary: "beta takes the direction",
          decision: "continue",
          epicConsults: ["beta"],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
}

/** Iteration 2's direction pass: only the chosen beta runs. */
function scriptPassI2Direction(ctx: SagaPassCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("direction");
      fs.writeFileSync(
        ctx.betaPlan,
        `${BETA_PLAN.replace(
          "- `beta.build` — create beta.txt.\n  - done: beta.txt exists.\n",
          "- `beta.build` — merged.\n",
        )}\n## Milestone 2\n- hold.\n`,
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({ summary: "epic beta complete", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicTurn(req, "-i2-", "beta", "direction") },
  );
}

/**
 * Iteration 2: both epics report upward, the top chooses beta, and only beta
 * takes the direction pass.
 */
function scriptPassMiddleIteration(ctx: SagaPassCtx): void {
  scriptPassI2Reports(ctx);
  scriptPassI2Architect(ctx);
  scriptPassI2Direction(ctx);
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-pm-") },
  );
}

/** The goal's last iteration reports both epics upward, then the top stops. */
function scriptPassDoneIteration(ctx: SagaPassCtx): void {
  for (const epic of ["alpha", "beta"] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(passOf(req)).toBe("report");
        expect(readPack(req)).toContain(`- \`${epic}\`: done`);
        turnedCtx.writeOutcome(
          outcome({ summary: `${epic} final report`, decision: "done" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicTurn(req, "-i3-", epic, "report") },
    );
  }
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(
        outcome({ summary: "goal complete", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i3-architect-") },
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

function registerSagaPassOrder(): void {
  it("records the saga passes in order across first, middle and done, consulting the chosen subset", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const ctx: SagaPassCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        harness: new FakeHarness({ id: "fake" }),
      };
      scriptPassFirstIteration(ctx);
      scriptSagaTasks(ctx);
      scriptPassMiddleIteration(ctx);
      scriptPassDoneIteration(ctx);

      await expectLaunch(0, goal.repo, ctx.harness, 3);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      // First: top-down only. Middle: checkers and reports bottom-to-top, the
      // top turn, then the top's chosen subset downward. Done: no direction.
      expect(passTrace(records, 1)).toEqual([
        "top",
        "subarchitect:alpha",
        "subarchitect:beta",
      ]);
      expect(passTrace(records, 2)).toEqual([
        "check:alpha",
        "check:beta",
        "check:goal",
        "subarchitect:alpha",
        "subarchitect:beta",
        "top",
        "subarchitect:beta",
      ]);
      expect(passTrace(records, 3)).toEqual([
        "check:alpha",
        "check:beta",
        "check:goal",
        "subarchitect:alpha",
        "subarchitect:beta",
        "top",
      ]);
      // Epic plans review before the goal plan, after the direction pass.
      expect(reviewOrder(ctx.harness, 2)).toEqual(["beta.md", "plan.md"]);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
}

describe("saga passes at depth 2", () => {
  registerSagaPassOrder();
});
