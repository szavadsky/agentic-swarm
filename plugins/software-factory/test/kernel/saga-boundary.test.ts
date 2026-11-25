import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { PLAN_REVIEW_STEP } from "../../src/kernel/plan-review.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  pmScopeOf,
  stateOf,
} from "./e2e-helpers.js";
import { causeText } from "./helpers.js";

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

/** The pack a turn was pointed at, read from disk. */
function readPack(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- context pack: `([^`]+)`/.exec(req.prompt);
  if (!match?.[1]) throw new Error("turn prompt names no context pack");
  return fs.readFileSync(match[1], "utf8");
}

/** The plan a plan-review turn read, from its rendered turn block. */
function reviewedPlan(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- plan: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
}

describe("saga boundary at depth 2", () => {
  registerSagaBoundaryAtDepth2Part1();
});

/** The shared state of the saga-boundary test. */
interface SagaBoundaryCtx {
  goal: ReturnType<typeof makeGoal>;
  planPath: string;
  alphaPlan: string;
  betaPlan: string;
  harness: FakeHarness;
  betaSecondSession: string | undefined;
}

/** Iteration 1: the main architect registers two epics. */
function scriptBoundaryArchitectI1(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Architect register");
      fs.writeFileSync(ctx.planPath, GOAL_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({
          summary: "split into alpha and beta",
          decision: "continue",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i1-architect-") },
  );
}

/** Alpha plans, then tries to edit the main plan it does not own. */
function scriptBoundaryAlphaPlan(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.session).toBeUndefined();
      expect(req.prompt).toContain("- epic: `alpha`");
      expect(req.prompt).toContain("Completeness check");
      expect(fs.existsSync(ctx.alphaPlan)).toBe(false);
      fs.mkdirSync(path.dirname(ctx.alphaPlan), { recursive: true });
      fs.writeFileSync(ctx.alphaPlan, ALPHA_PLAN, "utf8");
      fs.appendFileSync(ctx.planPath, "\nforeign alpha write\n", "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "epic alpha planned", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => req.prompt.includes("- epic: `alpha`") },
  );
}

/** Beta plans its epic. */
function scriptBoundaryBetaPlan(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.session).toBeUndefined();
      expect(req.prompt).toContain("- epic: `beta`");
      fs.mkdirSync(path.dirname(ctx.betaPlan), { recursive: true });
      fs.writeFileSync(ctx.betaPlan, BETA_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "epic beta planned", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => req.prompt.includes("- epic: `beta`") },
  );
}

/** Each PM derives only its own scope; the top files no goal task. */
function scriptBoundaryPmI1(ctx: SagaBoundaryCtx): void {
  for (const [epic, slug, file] of [
    ["alpha", "alpha.build", "alpha.txt"],
    ["beta", "beta.build", "beta.txt"],
    [undefined, undefined, undefined],
  ] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(pmScopeOf(req)).toBe(epic ?? "goal");
        if (epic === undefined) {
          turnedCtx.writeOutcome(outcome({ summary: "no goal-level tasks" }));
          return fakeTurnResult(req);
        }
        expect(req.prompt).toContain(`epics/${epic}.md`);
        expect(req.prompt).not.toContain("- goal:");
        fs.mkdirSync(ctx.goal.tasksDir, { recursive: true });
        fs.writeFileSync(
          path.join(ctx.goal.tasksDir, `${slug}.md`),
          epicTask(slug, epic, file),
          "utf8",
        );
        turnedCtx.writeOutcome(outcome({ summary: `filed ${slug}` }));
        return fakeTurnResult(req);
      },
      {
        when: (req) =>
          pmScopeOf(req) === (epic ?? "goal") &&
          iterationOf(req).includes("-i1-"),
      },
    );
  }
}
/** Both epics' task implement/approve turns. */
function scriptBoundaryTasks(
  ctx: Pick<SagaBoundaryCtx, "goal" | "harness">,
): void {
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

/** Iteration 2's bottom-up report: beta reports upward before the top turn. */
function scriptBoundaryI2Report(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      // The report changes no plan and the top turn has not run yet.
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
    { when: (req) => iterationOf(req).includes("-i2-subarchitect-") },
  );
}

/** Iteration 2's top turn chooses beta; the report brief already reached its pack. */
function scriptBoundaryI2Architect(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Architect register");
      expect(readPack(req)).toContain("beta needs a goal-level decision");
      fs.appendFileSync(
        ctx.planPath,
        "\n## Milestone 2\n- keep the cross-epic interface stable.\n",
        "utf8",
      );
      fs.appendFileSync(ctx.betaPlan, "\nforeign main write\n", "utf8");
      turnedCtx.writeOutcome(
        outcome({
          summary: "direction holds",
          decision: "continue",
          epicConsults: ["beta"],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
}

/** Iteration 2's top-down direction: only beta runs, in its own session. */
function scriptBoundaryI2Direction(ctx: SagaBoundaryCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("direction");
      // The main architect's foreign write was rolled back before this turn.
      expect(fs.existsSync(ctx.betaPlan)).toBe(true);
      expect(fs.readFileSync(ctx.betaPlan, "utf8")).not.toContain(
        "foreign main write",
      );
      expect(req.prompt).toContain("Completeness check");
      expect(req.prompt).toContain("- turn: `boundary`");
      expect(req.session?.compacted).toBe(true);
      ctx.betaSecondSession = req.session?.id;
      fs.writeFileSync(
        ctx.betaPlan,
        `${BETA_PLAN.replace(
          "- `beta.build` — create beta.txt.\n  - done: beta.txt exists.\n",
          "- `beta.build` — merged.\n",
        )}\n## Milestone 2\n- hold.\n`,
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({ summary: "epic beta reviewed", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        req.prompt.includes("- epic: `beta`") && passOf(req) === "direction",
    },
  );
}

/** Iteration 2: beta reports upward, the architect chooses, beta takes direction. */
function scriptBoundaryIteration2(ctx: SagaBoundaryCtx): void {
  scriptBoundaryI2Report(ctx);
  scriptBoundaryI2Architect(ctx);
  scriptBoundaryI2Direction(ctx);
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    {
      fallback: true,
      when: (req) =>
        pmScopeOf(req) !== undefined && iterationOf(req).includes("-i2-"),
    },
  );
}

/** Iteration 1: both subarchitects planned, both tasks merged, sessions distinct. */
function expectBoundaryFirstIteration(
  ctx: SagaBoundaryCtx,
  records: Awaited<
    ReturnType<ReturnType<typeof createFolderStore>["listRecords"]>
  >,
  state: Awaited<ReturnType<typeof stateOf>>,
): void {
  const subarchitectRecords = records.filter(
    (record) => record.step === "subarchitect",
  );
  expect(
    subarchitectRecords
      .filter((record) => record.iteration === 1)
      .map((record) => record.architect)
      .sort(),
  ).toEqual(["alpha", "beta"]);
  expect(state.tasks["alpha.build"]?.status).toBe("merged");
  expect(state.tasks["beta.build"]?.status).toBe("merged");
  // Each has its own compacted session, distinct from the main architect's.
  const firstIteration = subarchitectRecords.filter(
    (record) => record.iteration === 1,
  );
  const alphaSession = firstIteration.find(
    (record) => record.architect === "alpha",
  )?.session;
  const betaSession = firstIteration.find(
    (record) => record.architect === "beta",
  )?.session;
  const mainSession = records.find((record) => record.step === "architect")
    ?.session?.id;
  expect(alphaSession?.id).toBeDefined();
  expect(betaSession?.id).toBeDefined();
  expect(new Set([alphaSession?.id, betaSession?.id, mainSession]).size).toBe(
    3,
  );
  for (const record of subarchitectRecords) {
    expect(record.session?.compacted).toBe(true);
  }
  // The subarchitect's main-plan write was rolled back and recorded.
  expect(fs.readFileSync(ctx.planPath, "utf8")).not.toContain(
    "foreign alpha write",
  );
  const alphaReconcile = records.find(
    (record) =>
      record.step === "subarchitect-reconcile" && record.architect === "alpha",
  );
  expect(causeText(alphaReconcile?.cause)).toContain("plan.md");
  // The main architect's epic-plan write was rolled back and recorded.
  expect(fs.readFileSync(ctx.betaPlan, "utf8")).not.toContain(
    "foreign main write",
  );
  const mainReconcile = records.find(
    (record) => record.step === "architect-reconcile",
  );
  expect(causeText(mainReconcile?.cause)).toContain("epics/beta.md");
}

/** Iteration 2: only beta's subarchitect runs, reusing its session. */
function expectBoundarySecondIteration(
  ctx: SagaBoundaryCtx,
  records: Awaited<
    ReturnType<ReturnType<typeof createFolderStore>["listRecords"]>
  >,
  harness: FakeHarness,
): void {
  const subarchitectRecords = records.filter(
    (record) => record.step === "subarchitect",
  );
  const second = subarchitectRecords.filter((record) => record.iteration === 2);
  // The middle iteration reports beta upward before the top turn and takes its
  // direction after; alpha is job-done, so neither pass consults it.
  expect(second.map((record) => record.architect)).toEqual(["beta", "beta"]);
  const architectRecord = records.find(
    (record) => record.step === "architect" && record.iteration === 2,
  );
  expect(second[0]?.seq).toBeLessThan(architectRecord?.seq ?? 0);
  expect(second[1]?.seq).toBeGreaterThan(architectRecord?.seq ?? 0);
  const betaSession = subarchitectRecords.find(
    (record) => record.architect === "beta" && record.iteration === 1,
  )?.session;
  expect(ctx.betaSecondSession).toBe(betaSession?.id);
  // Plan review ran once per changed plan: both in i1, the goal and beta
  // plans (not alpha's unchanged one) in i2.
  const reviews = harness.calls
    .filter((call) => fakeTurnIdentity(call).step === PLAN_REVIEW_STEP)
    .map((call) => ({
      iteration: fakeTurnIdentity(call).record.includes("-i1-") ? 1 : 2,
      plan: reviewedPlan(call),
    }));
  expect(
    reviews
      .filter((review) => review.iteration === 1)
      .map((review) => path.relative(ctx.goal.goalDir, review.plan))
      .sort(),
  ).toEqual(["epics/alpha.md", "epics/beta.md", "plan.md"]);
  expect(
    reviews
      .filter((review) => review.iteration === 2)
      .map((review) => path.relative(ctx.goal.goalDir, review.plan))
      .sort(),
  ).toEqual(["epics/beta.md", "plan.md"]);
}

/** Each subarchitect wrote its iteration's status summary; alpha has none in i2. */
function expectBoundarySummaries(ctx: SagaBoundaryCtx): void {
  const alphaSummary = fs.readFileSync(
    path.join(ctx.goal.goalDir, "iterations/1/epics/alpha/summary.md"),
    "utf8",
  );
  expect(alphaSummary).toContain("epic alpha planned");
  expect(alphaSummary).toContain("decision: done");
  expect(alphaSummary).toContain("merged (1): alpha.build");
  expect(
    fs.existsSync(
      path.join(ctx.goal.goalDir, "iterations/1/epics/beta/summary.md"),
    ),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(ctx.goal.goalDir, "iterations/2/epics/alpha/summary.md"),
    ),
  ).toBe(false);
  const betaSummary = fs.readFileSync(
    path.join(ctx.goal.goalDir, "iterations/2/epics/beta/summary.md"),
    "utf8",
  );
  expect(betaSummary).toContain("epic beta reviewed");
}

function registerSagaBoundaryAtDepth2Part1(): void {
  it("runs one subarchitect per epic, then leaves a done epic out on the second iteration", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const ctx: SagaBoundaryCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        harness: new FakeHarness({ id: "fake" }),
        betaSecondSession: undefined,
      };
      scriptBoundaryArchitectI1(ctx);
      scriptBoundaryAlphaPlan(ctx);
      scriptBoundaryBetaPlan(ctx);
      scriptBoundaryPmI1(ctx);
      scriptBoundaryTasks(ctx);
      scriptBoundaryIteration2(ctx);

      // Two iterations end an active goal at the iteration limit.
      await expectLaunch(3, goal.repo, ctx.harness, 2);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const state = await stateOf(goal.goalDir);
      expectBoundaryFirstIteration(ctx, records, state);
      expectBoundarySecondIteration(ctx, records, ctx.harness);
      expectBoundarySummaries(ctx);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
}
