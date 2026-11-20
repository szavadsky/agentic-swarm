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
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
} from "./e2e-helpers.js";

const PROCESS = "hierarchy:\n  depth: 2\n";

const ALPHA_RISK = "alpha task concern: the timeout path has no owner";
const BETA_RISK = "beta task concern: cache keys can collide";
const ALPHA_BRIEF = "alpha brief: the timeout path needs a goal-level decision";

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

function implementer(file: string, risk: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(
      outcome({
        summary: `${file} created`,
        concerns: [
          {
            kind: "risk",
            calibration: "architect",
            text: risk,
            evidence: `${file}:1`,
          },
        ],
      }),
    );
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

/** The pack a turn was pointed at, from its rendered turn block. */
function packPathOf(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- context pack: `([^`]+)`/.exec(req.prompt);
  if (!match?.[1]) throw new Error("turn prompt names no context pack");
  return match[1];
}

/** The pack a turn was pointed at, read from disk. */
function readPack(req: Parameters<FakeTurnHandler>[0]): string {
  return fs.readFileSync(packPathOf(req), "utf8");
}

describe("saga concern chain at depth 2", () => {
  it("keeps a task concern in its epic's pack until the subarchitect carries it up", async () => {
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

      // Both subarchitects plan and keep their epic open.
      for (const [epic, plan, text] of [
        ["alpha", alphaPlan, ALPHA_PLAN],
        ["beta", betaPlan, BETA_PLAN],
      ] as const) {
        harness.script(
          (req, ctx) => {
            expect(req.prompt).toContain(`- epic: \`${epic}\``);
            fs.mkdirSync(path.dirname(plan), { recursive: true });
            fs.writeFileSync(plan, text, "utf8");
            ctx.writeOutcome(
              outcome({
                summary: `epic ${epic} planned`,
                decision: "continue",
              }),
            );
            return fakeTurnResult(req);
          },
          {
            when: (req) =>
              iterationOf(req).includes("-i1-subarchitect-") &&
              req.prompt.includes(`- epic: \`${epic}\``),
          },
        );
      }

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

      harness.script(implementer("alpha.txt", ALPHA_RISK), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "alpha.build" &&
          fakeTurnIdentity(req).step === "implement",
      });
      harness.script(approver("alpha is correct"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "alpha.build" &&
          fakeTurnIdentity(req).step === "review",
      });
      harness.script(implementer("beta.txt", BETA_RISK), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "beta.build" &&
          fakeTurnIdentity(req).step === "implement",
      });
      harness.script(approver("beta is correct"), {
        when: (req) =>
          fakeTurnIdentity(req).slug === "beta.build" &&
          fakeTurnIdentity(req).step === "review",
      });

      // Iteration 2: the top architect reads no epic's task concern. It keeps
      // the goal going so its subarchitects can finish their scopes.
      harness.script(
        (req, ctx) => {
          const pack = readPack(req);
          expect(pack).not.toContain(ALPHA_RISK);
          expect(pack).not.toContain(BETA_RISK);
          expect(pack).toContain("- `alpha`: open");
          expect(pack).toContain("- `beta`: open");
          fs.appendFileSync(
            planPath,
            "\n## Milestone 2\n- keep the cross-epic interface stable.\n",
            "utf8",
          );
          ctx.writeOutcome(
            outcome({ summary: "direction holds", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i2-architect-") },
      );

      // Alpha's subarchitect sees its epic's concern, never beta's; it closes
      // the epic and carries one brief concern upward.
      harness.script(
        (req, ctx) => {
          const pack = readPack(req);
          expect(pack).toContain(
            "# Context pack — goal demo, epic `alpha`, iteration 2",
          );
          expect(pack).toContain(ALPHA_RISK);
          expect(pack).not.toContain(BETA_RISK);
          expect(pack).toContain("- `alpha`: open");
          ctx.writeOutcome(
            outcome({
              summary: "alpha complete",
              decision: "done",
              concerns: [
                {
                  kind: "risk",
                  calibration: "architect",
                  text: ALPHA_BRIEF,
                  evidence: "alpha.txt:1",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        {
          when: (req) =>
            iterationOf(req).includes("-i2-subarchitect-") &&
            req.prompt.includes("- epic: `alpha`"),
        },
      );

      // Beta's subarchitect sees only its own concern and carries nothing up.
      harness.script(
        (req, ctx) => {
          const pack = readPack(req);
          expect(pack).toContain(BETA_RISK);
          expect(pack).not.toContain(ALPHA_RISK);
          ctx.writeOutcome(
            outcome({ summary: "beta complete", decision: "done" }),
          );
          return fakeTurnResult(req);
        },
        {
          when: (req) =>
            iterationOf(req).includes("-i2-subarchitect-") &&
            req.prompt.includes("- epic: `beta`"),
        },
      );

      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "no new tasks" }));
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i2-pm-") },
      );

      // Iteration 3: only the brief reaches the top, and both epics are done,
      // so the top architect's done lands the goal.
      let topDonePack = "";
      harness.script(
        (req, ctx) => {
          topDonePack = readPack(req);
          expect(topDonePack).toContain(ALPHA_BRIEF);
          expect(topDonePack).not.toContain(BETA_RISK);
          expect(topDonePack).not.toContain(ALPHA_RISK);
          expect(topDonePack).toContain("- `alpha`: done");
          expect(topDonePack).toContain("- `beta`: done");
          ctx.writeOutcome(
            outcome({ summary: "goal complete", decision: "done" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => iterationOf(req).includes("-i3-architect-") },
      );

      await expectLaunch(0, goal.repo, harness, 3);

      // The task concerns reached exactly one pack: their own epic's.
      const alphaPack = fs.readFileSync(
        path.join(goal.goalDir, "iterations/2/epics/alpha/context-pack.md"),
        "utf8",
      );
      expect(alphaPack).toContain(ALPHA_RISK);
      expect(alphaPack).not.toContain(BETA_RISK);
      const betaPack = fs.readFileSync(
        path.join(goal.goalDir, "iterations/2/epics/beta/context-pack.md"),
        "utf8",
      );
      expect(betaPack).toContain(BETA_RISK);
      expect(betaPack).not.toContain(ALPHA_RISK);
      expect(topDonePack).not.toContain(BETA_RISK);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("done");
      expect(state.epics.alpha?.done).toBe(true);
      expect(state.epics.beta?.done).toBe(true);
      expect(state.tasks["alpha.build"]?.status).toBe("merged");
      expect(state.tasks["beta.build"]?.status).toBe("merged");
      expect(
        records.filter(
          (record) => record.step === "subarchitect" && record.iteration === 2,
        ),
      ).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
});
