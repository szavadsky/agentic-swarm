// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
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
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
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

/** The plan a plan-review turn read, from its rendered turn block. */
function reviewedPlan(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- plan: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
}

describe("saga boundary at depth 2", () => {
  it("runs one subarchitect per epic, then leaves a done epic out on the second iteration", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const planPath = goal.planPath;
      const alphaPlan = path.join(goal.goalDir, "epics/alpha.md");
      const betaPlan = path.join(goal.goalDir, "epics/beta.md");
      const harness = new FakeHarness({ id: "fake" });

      // Iteration 1: the main architect registers two epics.
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("## Architect register");
          fs.writeFileSync(planPath, GOAL_PLAN, "utf8");
          ctx.writeOutcome(
            outcome({
              summary: "split into alpha and beta",
              decision: "continue",
            }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i1-architect-") },
      );

      // Alpha plans, then tries to edit the main plan it does not own.
      harness.script(
        (req, ctx) => {
          expect(req.session).toBeUndefined();
          expect(req.prompt).toContain("- epic: `alpha`");
          expect(req.prompt).toContain("Completeness check");
          expect(fs.existsSync(alphaPlan)).toBe(false);
          fs.mkdirSync(path.dirname(alphaPlan), { recursive: true });
          fs.writeFileSync(alphaPlan, ALPHA_PLAN, "utf8");
          fs.appendFileSync(planPath, "\nforeign alpha write\n", "utf8");
          ctx.writeOutcome(
            outcome({ summary: "epic alpha planned", decision: "done" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => req.prompt.includes("- epic: `alpha`") },
      );

      harness.script(
        (req, ctx) => {
          expect(req.session).toBeUndefined();
          expect(req.prompt).toContain("- epic: `beta`");
          fs.mkdirSync(path.dirname(betaPlan), { recursive: true });
          fs.writeFileSync(betaPlan, BETA_PLAN, "utf8");
          ctx.writeOutcome(
            outcome({ summary: "epic beta planned", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => req.prompt.includes("- epic: `beta`") },
      );

      // The PM derives one task per epic plan from the all-plans brief.
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("epics/alpha.md");
          expect(req.prompt).toContain("epics/beta.md");
          fs.mkdirSync(goal.tasksDir, { recursive: true });
          fs.writeFileSync(
            path.join(goal.tasksDir, "alpha.build.md"),
            epicTask("alpha.build", "alpha", "alpha.txt"),
            "utf8",
          );
          fs.writeFileSync(
            path.join(goal.tasksDir, "beta.build.md"),
            epicTask("beta.build", "beta", "beta.txt"),
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: "filed both epics' tasks" }));
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i1-pm-") },
      );

      harness.script(implementer("alpha.txt"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "alpha.build" &&
          fakeTurnIdentity(req).step === "implement",
      });
      harness.script(approver("alpha is correct"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "alpha.build" &&
          fakeTurnIdentity(req).step === "review",
      });
      harness.script(implementer("beta.txt"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "beta.build" &&
          fakeTurnIdentity(req).step === "implement",
      });
      harness.script(approver("beta is correct"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "beta.build" &&
          fakeTurnIdentity(req).step === "review",
      });

      // Iteration 2: the main architect assigns no new epic work and also
      // tries to edit beta's plan; alpha's subarchitect must not run.
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("## Architect register");
          fs.appendFileSync(
            planPath,
            "\n## Milestone 2\n- keep the cross-epic interface stable.\n",
            "utf8",
          );
          fs.appendFileSync(betaPlan, "\nforeign main write\n", "utf8");
          ctx.writeOutcome(
            outcome({ summary: "direction holds", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i2-architect-") },
      );

      let betaSecondSession: string | undefined;
      harness.script(
        (req, ctx) => {
          // The prior plan is reviewed first; the main architect's foreign
          // write was rolled back before this turn starts.
          expect(fs.existsSync(betaPlan)).toBe(true);
          expect(fs.readFileSync(betaPlan, "utf8")).not.toContain(
            "foreign main write",
          );
          expect(req.prompt).toContain("Completeness check");
          expect(req.prompt).toContain("- turn: `boundary`");
          expect(req.session?.compacted).toBe(true);
          betaSecondSession = req.session?.id;
          fs.appendFileSync(betaPlan, "\n## Milestone 2\n- hold.\n", "utf8");
          ctx.writeOutcome(
            outcome({ summary: "epic beta reviewed", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => req.prompt.includes("- epic: `beta`") },
      );

      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "no new tasks" }));
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i2-pm-") },
      );

      // Two iterations end an active goal at the iteration limit.
      await expectLaunch(3, goal.repo, harness, 2);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const state = await stateOf(goal.goalDir);

      // Iteration 1: both subarchitects planned, both tasks merged.
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
      expect(
        new Set([alphaSession?.id, betaSession?.id, mainSession]).size,
      ).toBe(3);
      for (const record of subarchitectRecords) {
        expect(record.session?.compacted).toBe(true);
      }

      // The subarchitect's main-plan write was rolled back and recorded.
      expect(fs.readFileSync(planPath, "utf8")).not.toContain(
        "foreign alpha write",
      );
      const alphaReconcile = records.find(
        (record) =>
          record.step === "subarchitect-reconcile" &&
          record.architect === "alpha",
      );
      expect(causeText(alphaReconcile?.cause)).toContain("plan.md");

      // The main architect's epic-plan write was rolled back and recorded.
      expect(fs.readFileSync(betaPlan, "utf8")).not.toContain(
        "foreign main write",
      );
      const mainReconcile = records.find(
        (record) => record.step === "architect-reconcile",
      );
      expect(causeText(mainReconcile?.cause)).toContain("epics/beta.md");

      // Iteration 2: alpha's subarchitect is left out because its job is done.
      const second = subarchitectRecords.filter(
        (record) => record.iteration === 2,
      );
      expect(second.map((record) => record.architect)).toEqual(["beta"]);
      expect(betaSecondSession).toBe(betaSession?.id);

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
          .map((review) => path.relative(goal.goalDir, review.plan))
          .sort(),
      ).toEqual(["epics/alpha.md", "epics/beta.md", "plan.md"]);
      expect(
        reviews
          .filter((review) => review.iteration === 2)
          .map((review) => path.relative(goal.goalDir, review.plan))
          .sort(),
      ).toEqual(["epics/beta.md", "plan.md"]);

      // Each subarchitect wrote its iteration's status summary; the epic left
      // out on iteration 2 has none for that iteration.
      const alphaSummary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/epics/alpha/summary.md"),
        "utf8",
      );
      expect(alphaSummary).toContain("epic alpha planned");
      expect(alphaSummary).toContain("decision: done");
      expect(alphaSummary).toContain("merged (1): alpha.build");
      expect(
        fs.existsSync(
          path.join(goal.goalDir, "iterations/1/epics/beta/summary.md"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(goal.goalDir, "iterations/2/epics/alpha/summary.md"),
        ),
      ).toBe(false);
      const betaSummary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/2/epics/beta/summary.md"),
        "utf8",
      );
      expect(betaSummary).toContain("epic beta reviewed");
    } finally {
      cleanup(goal);
    }
  }, 120_000);
});
