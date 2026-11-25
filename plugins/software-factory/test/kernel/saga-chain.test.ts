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

/** The saga pass a subarchitect turn runs, from its rendered turn block. */
function passOf(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- pass: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
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
  registerSagaConcernChainAtDepth2Part1();
});

/** The shared state of the saga concern-chain test. */
interface SagaChainCtx {
  goal: ReturnType<typeof makeGoal>;
  planPath: string;
  alphaPlan: string;
  betaPlan: string;
  harness: FakeHarness;
  topDonePack: string;
}

/** Iteration 1: the main architect registers two epics. */
function scriptChainArchitectI1(ctx: SagaChainCtx): void {
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
}

/** Both subarchitects plan their epic and keep it open. */
function scriptChainPlans(ctx: SagaChainCtx): void {
  for (const [epic, plan, text] of [
    ["alpha", ctx.alphaPlan, ALPHA_PLAN],
    ["beta", ctx.betaPlan, BETA_PLAN],
  ] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(req.prompt).toContain(`- epic: \`${epic}\``);
        fs.mkdirSync(path.dirname(plan), { recursive: true });
        fs.writeFileSync(plan, text, "utf8");
        turnedCtx.writeOutcome(
          outcome({ summary: `epic ${epic} planned`, decision: "continue" }),
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
}

/** The PM derives one task per epic plan from the all-plans brief. */
function scriptChainPmI1(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("epics/alpha.md");
      expect(req.prompt).toContain("epics/beta.md");
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

/** Both epics' task implement/approve turns, each carrying its risk concern. */
function scriptChainTasks(ctx: SagaChainCtx): void {
  ctx.harness.script(implementer("alpha.txt", ALPHA_RISK), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "alpha.build" &&
      fakeTurnIdentity(req).step === "implement",
  });
  ctx.harness.script(approver("alpha is correct"), {
    when: (req) =>
      fakeTurnIdentity(req).slug === "alpha.build" &&
      fakeTurnIdentity(req).step === "review",
  });
  ctx.harness.script(implementer("beta.txt", BETA_RISK), {
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

/** Iteration 2: the top architect reads no epic's task concern. */
function scriptChainArchitectI2(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      const pack = readPack(req);
      expect(pack).not.toContain(ALPHA_RISK);
      expect(pack).not.toContain(BETA_RISK);
      // The bottom-up reports ran before this turn: both epics are done and
      // alpha's brief already reached the top pack.
      expect(pack).toContain(ALPHA_BRIEF);
      expect(pack).toContain("- `alpha`: done");
      expect(pack).toContain("- `beta`: done");
      fs.appendFileSync(
        ctx.planPath,
        "\n## Milestone 2\n- keep the cross-epic interface stable.\n",
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({ summary: "direction holds", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
}

/** Alpha's subarchitect closes its epic and carries one brief concern up. */
function scriptChainAlphaI2(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("report");
      const pack = readPack(req);
      expect(pack).toContain(
        "# Context pack — goal demo, epic `alpha`, iteration 2",
      );
      expect(pack).toContain(ALPHA_RISK);
      expect(pack).not.toContain(BETA_RISK);
      expect(pack).toContain("- `alpha`: open");
      turnedCtx.writeOutcome(
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
}

/** Beta's subarchitect sees only its own concern and carries nothing up. */
function scriptChainBetaI2(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(passOf(req)).toBe("report");
      const pack = readPack(req);
      expect(pack).toContain(BETA_RISK);
      expect(pack).not.toContain(ALPHA_RISK);
      turnedCtx.writeOutcome(
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
}

/** The iteration-2 PM files no new tasks. */
function scriptChainPmI2(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-pm-") },
  );
}

/** Iteration 3 is the goal's last: both epics report upward and take no direction. */
function scriptChainReportsI3(ctx: SagaChainCtx): void {
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
      {
        when: (req) =>
          iterationOf(req).includes("-i3-subarchitect-") &&
          req.prompt.includes(`- epic: \`${epic}\``),
      },
    );
  }
}

/** Iteration 3: only the brief reaches the top; both epics are done. */
function scriptChainArchitectI3(ctx: SagaChainCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      ctx.topDonePack = readPack(req);
      expect(ctx.topDonePack).toContain(ALPHA_BRIEF);
      expect(ctx.topDonePack).not.toContain(BETA_RISK);
      expect(ctx.topDonePack).not.toContain(ALPHA_RISK);
      expect(ctx.topDonePack).toContain("- `alpha`: done");
      expect(ctx.topDonePack).toContain("- `beta`: done");
      turnedCtx.writeOutcome(
        outcome({ summary: "goal complete", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i3-architect-") },
  );
}

/** The task concerns reached exactly one pack: their own epic's. */
function expectChainPacks(ctx: SagaChainCtx): void {
  const alphaPack = fs.readFileSync(
    path.join(ctx.goal.goalDir, "iterations/2/epics/alpha/context-pack.md"),
    "utf8",
  );
  expect(alphaPack).toContain(ALPHA_RISK);
  expect(alphaPack).not.toContain(BETA_RISK);
  const betaPack = fs.readFileSync(
    path.join(ctx.goal.goalDir, "iterations/2/epics/beta/context-pack.md"),
    "utf8",
  );
  expect(betaPack).toContain(BETA_RISK);
  expect(betaPack).not.toContain(ALPHA_RISK);
  expect(ctx.topDonePack).not.toContain(BETA_RISK);
}

/** The goal and both epics ended done, with both tasks merged. */
async function expectChainState(ctx: SagaChainCtx): Promise<void> {
  const store = createFolderStore(ctx.goal.goalDir, undefined, {});
  const records = await store.listRecords();
  const state = await stateOf(ctx.goal.goalDir);
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
}

function registerSagaConcernChainAtDepth2Part1(): void {
  it("keeps a task concern in its epic's pack until the subarchitect carries it up", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const ctx: SagaChainCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        harness: new FakeHarness({ id: "fake" }),
        topDonePack: "",
      };
      scriptChainArchitectI1(ctx);
      scriptChainPlans(ctx);
      scriptChainPmI1(ctx);
      scriptChainTasks(ctx);
      scriptChainArchitectI2(ctx);
      scriptChainAlphaI2(ctx);
      scriptChainBetaI2(ctx);
      scriptChainPmI2(ctx);
      scriptChainReportsI3(ctx);
      scriptChainArchitectI3(ctx);

      await expectLaunch(0, goal.repo, ctx.harness, 3);
      expectChainPacks(ctx);
      await expectChainState(ctx);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
}
