import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
  type FakeTurnHandler,
} from "../../src/harness/fake/index.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const PROCESS = { hierarchy: { depth: 2 } };

const GOAL_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`alpha.txt\` | opened i1 | active
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`beta.txt\` | opened i1 | active
`;

const ALPHA_PLAN = `# Epic alpha

## Milestone 1

- \`alpha.fix\` — fix alpha.
  - done: alpha works.
`;

const BETA_PLAN = `# Epic beta

## Milestone 1

- \`beta.fix\` — fix beta.
  - done: beta works.
`;

function turnStep(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).step ?? "";
}

/** The checker prompt's plan list names one epic's plan alone. */
function epicCheck(req: Parameters<FakeTurnHandler>[0], epic: string): boolean {
  return (
    turnStep(req) === PLAN_CHECK_STEP &&
    req.prompt.includes(`epics/${epic}.md`) &&
    !req.prompt.includes(epic === "alpha" ? "epics/beta.md" : "epics/alpha.md")
  );
}

/** The goal checker reads every plan. */
function goalCheck(req: Parameters<FakeTurnHandler>[0]): boolean {
  return (
    turnStep(req) === PLAN_CHECK_STEP &&
    req.prompt.includes("epics/alpha.md") &&
    req.prompt.includes("epics/beta.md")
  );
}

/** One epic checker round that leaves a dead dep for the PM to escalate. */
function scriptAlphaEscalation(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "alpha.fix still depends on a missing task",
          planCheck: {
            verdict: "progress",
            evidence: [
              {
                item: "alpha.fix",
                status: "missing",
                evidence: "its dep gone is not declared by any task",
              },
            ],
            followUps: [
              {
                kind: "cancel",
                slug: "alpha.fix",
                reason: "the dead dep is not derivable from the plan",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicCheck(req, "alpha") },
  );
}

/** The plan-check PM leaves the dead dep alone, so the round exits to the architect. */
function scriptPlanCheckLeave(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "left alpha.fix for the architect",
          planCheckRoutes: [
            {
              slug: "alpha.fix",
              action: "leave",
              reason: "the dead dep is not the plan's to derive",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        turnStep(req) === "pm" &&
        !req.prompt.includes("checker follow-ups: `none`"),
    },
  );
}

/** A clean epic checker: no follow-ups, so the boundary keeps going. */
function scriptCleanCheck(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "plan stands",
          planCheck: { verdict: "architect", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicCheck(req, "beta") || goalCheck(req) },
  );
}

/** Iteration 3's bottom-up reports, one per epic. */
function scriptReports(harness: FakeHarness, iteration: number): void {
  for (const epic of ["alpha", "beta"] as const) {
    harness.script(
      (req, ctx) => {
        expect(req.prompt).toContain("- pass: `report`");
        ctx.writeOutcome(
          outcome({
            summary: `${epic} reports no new gap`,
            decision: "continue",
          }),
        );
        return fakeTurnResult(req);
      },
      {
        when: (req) =>
          turnStep(req) === "subarchitect" &&
          fakeTurnIdentity(req).record.includes(`-i${iteration}-`) &&
          req.prompt.includes(`- epic: \`${epic}\``),
      },
    );
  }
}

/** Iteration 3's top turn ends the goal after the checker budget skipped alpha. */
function scriptTopDone(
  harness: FakeHarness,
  planPath: string,
  iteration: number,
): void {
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        planPath,
        `\n## Milestone ${iteration}\n- hold the interface.\n`,
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "goal complete", decision: "done" }));
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        turnStep(req) === "architect" &&
        fakeTurnIdentity(req).record.includes(`-i${iteration}-`),
    },
  );
}

interface BudgetSetup {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: Awaited<ReturnType<typeof makeRuntime>>;
}

/** A middle iteration where alpha's checker escalates past its own budget. */
async function setUpBudgetGoal(): Promise<BudgetSetup> {
  const { repo, goal, goalDir } = setupFlowRepo({
    process: PROCESS,
    limits: { planCheckRounds: 1 },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(goalDir, "plan.md");
  fs.writeFileSync(planPath, GOAL_PLAN, "utf8");
  fs.mkdirSync(path.join(goalDir, "epics"), { recursive: true });
  fs.writeFileSync(path.join(goalDir, "epics/alpha.md"), ALPHA_PLAN, "utf8");
  fs.writeFileSync(path.join(goalDir, "epics/beta.md"), BETA_PLAN, "utf8");
  await writeTask(
    runtime,
    task("alpha.fix", { deps: ["gone"], epic: "alpha" }),
  );
  await writeTask(runtime, task("beta.fix", { epic: "beta" }));
  // The goal left its first iteration: the next boundary is a middle pass.
  await runtime.store.appendRecord(
    { iteration: 1, step: "architect", round: 1, actor: "agent" },
    {
      stop: { kind: "done" },
      outcome: outcome({
        summary: "registered both epics",
        decision: "continue",
      }),
    },
  );

  // Iteration 2: alpha's checker escalates through its PM and ends the
  // boundary before the top turn. The gate must still see that round.
  scriptAlphaEscalation(harness);
  scriptPlanCheckLeave(harness);
  // The bug would rerun the same escalation in iteration 3.
  scriptAlphaEscalation(harness);
  scriptPlanCheckLeave(harness);
  scriptCleanCheck(harness);
  scriptReports(harness, 3);
  scriptTopDone(harness, planPath, 3);
  return { repo, runtime };
}

/** Iteration 3 checks beta and the goal, skips alpha, and runs the top. */
function expectBudgetRecords(
  records: Awaited<ReturnType<BudgetSetup["runtime"]["store"]["listRecords"]>>,
): void {
  const checks = (iteration: number) =>
    records.filter(
      (record) =>
        record.iteration === iteration &&
        record.step === PLAN_CHECK_STEP &&
        record.actor === "agent",
    );
  expect(
    checks(2).filter((record) => record.architect === "alpha"),
  ).toHaveLength(1);
  // The epic's budget is spent, so iteration 3 checks beta and the goal only;
  // the top turn runs instead of a second escalation.
  expect(
    checks(3).filter((record) => record.architect === "alpha"),
  ).toHaveLength(0);
  expect(
    checks(3).filter((record) => record.architect === undefined),
  ).toHaveLength(1);
  expect(
    records.filter(
      (record) =>
        record.iteration === 3 &&
        record.step === "architect" &&
        record.actor === "agent",
    ),
  ).toHaveLength(1);
}

function registerCheckerBudget(): void {
  it("stops an escalating epic checker at planCheckRounds and still runs the top", async () => {
    const { repo, runtime } = await setUpBudgetGoal();
    try {
      const second = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(second.decision).toBe("continue");
      expect(second.cause).toContain("PM ladder routed to the architect");

      const third = await runBoundary(runtime, {
        relaunch: false,
        iteration: 3,
      });
      expect(third.decision).toBe("done");
      expectBudgetRecords(await runtime.store.listRecords());
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("saga checker budget at depth 2", () => {
  registerCheckerBudget();
});
