import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import {
  createDrainController,
  type DrainController,
} from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  DEFAULT_RUN_YAML,
  type E2EGoal,
  expectDispatch,
  expectLaunch,
  makeGoal,
  outcome,
  pmScopeOf,
  stateOf,
} from "./e2e-helpers.js";
import {
  approver,
  epicTask,
  iterationOf,
  passOf,
  readPack,
  SAGA_PROCESS,
} from "./saga-helpers.js";

/** Two tasks may run at once, so both branches exist before either merge. */
const CONCURRENT_RUN_YAML = DEFAULT_RUN_YAML.replace(
  "overall: 1",
  "overall: 2",
);

const SHARED = "shared.txt";

/** The two epic tasks that write shared.txt: the later merge conflicts. */
const SHARED_TASKS = ["alpha.build", "beta.build"] as const;

const GOAL_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`shared.txt\` | opened i1 | active
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`shared.txt\` | opened i1 | active
`;

const CLOSED_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`shared.txt\` | opened i1 | closed i2: merged
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`shared.txt\` | opened i1 | closed i2: merged
`;

const ALPHA_PLAN = `# Epic alpha

## Milestone 1

- \`alpha.build\` — write alpha's line to shared.txt.
  - done: shared.txt carries alpha.
`;

const BETA_PLAN = `# Epic beta

## Milestone 1

- \`beta.build\` — write beta's line to shared.txt.
  - done: shared.txt carries beta.
- \`beta.zeta\` — write zeta.txt after beta lands.
  - done: zeta.txt exists.
`;

/** The goal, its epic plans, both launches' harnesses and the drain signal. */
interface SagaE2ECtx {
  goal: E2EGoal;
  alphaPlan: string;
  betaPlan: string;
  first: FakeHarness;
  second: FakeHarness;
  controller: DrainController;
}

type TurnRequest = Parameters<FakeTurnHandler>[0];

function writeFile(dir: string, file: string, text: string): void {
  fs.writeFileSync(path.join(dir, file), text, "utf8");
}

/** Writes `file` in the turn's worktree. */
function writes(file: string, text: string): FakeTurnHandler {
  return (req, ctx) => {
    writeFile(req.cwd!, file, text);
    ctx.writeOutcome(outcome({ summary: `${file} written` }));
    return fakeTurnResult(req);
  };
}

function epicTurn(
  req: TurnRequest,
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

function taskTurn(slug: string, step: string): (req: TurnRequest) => boolean {
  return (req) =>
    fakeTurnIdentity(req).slug === slug && fakeTurnIdentity(req).step === step;
}

/** The in-flow resolve turn of whichever shared.txt task merge conflicts. */
function sharedResolve(req: TurnRequest): boolean {
  const slug = fakeTurnIdentity(req).slug;
  return (
    fakeTurnIdentity(req).step === "resolve" &&
    SHARED_TASKS.includes(slug as (typeof SHARED_TASKS)[number])
  );
}

/** The shared.txt task whose merge conflicts, from its park record. */
function sharedLoser(
  records: ReadonlyArray<{
    slug?: string;
    step: string;
    cause?: { kind: string };
  }>,
): string {
  const park = records.find(
    (record) =>
      record.step === "park" &&
      record.cause?.kind === "conflict" &&
      SHARED_TASKS.includes(record.slug as (typeof SHARED_TASKS)[number]),
  );
  if (!park?.slug) throw new Error("no shared.txt task parked on a conflict");
  return park.slug;
}

function pmTurn(req: TurnRequest, epic: string, iteration: string): boolean {
  return (
    pmScopeOf(req) === epic && iterationOf(req).includes(`-i${iteration}-`)
  );
}

/**
 * Iteration 1's planning: the top registers both epics, the direction pass
 * writes their plans, and each PM files its tasks.
 */
function scriptPlanning(ctx: SagaE2ECtx): void {
  ctx.first.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Architect register");
      writeFile(ctx.goal.goalDir, "plan.md", GOAL_PLAN);
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
    ctx.first.script(
      (req, turnedCtx) => {
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
  scriptAlphaPm(ctx);
  scriptBetaPm(ctx);
  ctx.first.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("alpha.build");
      expect(req.prompt).toContain("beta.build");
      // The planning turn is the last of iteration 1; the drain it raises
      // stops the launch before dispatch and the relaunch resumes iteration 1.
      ctx.controller.handleSignal("SIGINT");
      turnedCtx.writeOutcome(outcome({ summary: "no goal-level tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => pmTurn(req, "goal", "1") },
  );
}

/** Each epic PM files that epic's tasks; the top PM files none. */
function scriptAlphaPm(ctx: SagaE2ECtx): void {
  fileTasks(ctx, "alpha", [["alpha.build", SHARED]]);
}

function scriptBetaPm(ctx: SagaE2ECtx): void {
  fileTasks(ctx, "beta", [
    ["beta.build", SHARED],
    ["beta.zeta", "zeta.txt"],
  ]);
}

function fileTasks(
  ctx: SagaE2ECtx,
  epic: string,
  tasks: ReadonlyArray<readonly [string, string]>,
): void {
  ctx.first.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain(`epics/${epic}.md`);
      fs.mkdirSync(ctx.goal.tasksDir, { recursive: true });
      for (const [slug, file] of tasks) {
        writeFile(ctx.goal.tasksDir, `${slug}.md`, epicTask(slug, epic, file));
      }
      turnedCtx.writeOutcome(outcome({ summary: `filed ${epic}'s tasks` }));
      return fakeTurnResult(req);
    },
    { when: (req) => pmTurn(req, epic, "1") },
  );
}

/**
 * Launch 2 resumes iteration 1 and runs every task turn. Alpha and beta start
 * together, so both branches carry a shared.txt before either merge; the later
 * merge conflicts, its in-flow resolve leaves the conflict, and the one
 * wave-end steward repairs it after zeta lands.
 */
function scriptResumedTasks(ctx: SagaE2ECtx): void {
  ctx.second.script(writes(SHARED, "alpha\n"), {
    when: taskTurn("alpha.build", "implement"),
  });
  ctx.second.script(approver("alpha approved"), {
    when: taskTurn("alpha.build", "review"),
  });
  ctx.second.script(writes(SHARED, "beta\n"), {
    when: taskTurn("beta.build", "implement"),
  });
  ctx.second.script(approver("beta approved"), {
    when: taskTurn("beta.build", "review"),
  });
  ctx.second.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain(SHARED);
      turnedCtx.writeOutcome(outcome({ summary: "left the conflict" }));
      return fakeTurnResult(req);
    },
    { when: sharedResolve },
  );
  ctx.second.script(writes("zeta.txt", "zeta\n"), {
    when: taskTurn("beta.zeta", "implement"),
  });
  ctx.second.script(approver("zeta approved"), {
    when: taskTurn("beta.zeta", "review"),
  });
  ctx.second.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("You are the steward (merge agent)");
      expect(req.prompt).toContain(SHARED);
      writeFile(req.cwd!, SHARED, "alpha\nbeta\n");
      turnedCtx.writeOutcome(outcome({ summary: "the conflict resolved" }));
      return fakeTurnResult(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "steward" },
  );
  scriptReports(ctx);
  scriptClosingArchitect(ctx);
}

/** Iteration 2's bottom-up reports: each epic reports before the top turn. */
function scriptReports(ctx: SagaE2ECtx): void {
  for (const epic of ["alpha", "beta"] as const) {
    ctx.second.script(
      (req, turnedCtx) => {
        expect(passOf(req)).toBe("report");
        expect(readPack(req)).toContain(`- \`${epic}\`: open`);
        turnedCtx.writeOutcome(
          outcome({ summary: `${epic} complete`, decision: "done" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicTurn(req, "-i2-", epic, "report") },
    );
  }
}

/** The top reads both done epics, closes their rows and ends the goal. */
function scriptClosingArchitect(ctx: SagaE2ECtx): void {
  ctx.second.script(
    (req, turnedCtx) => {
      const pack = readPack(req);
      expect(pack).toContain("- `alpha`: done");
      expect(pack).toContain("- `beta`: done");
      writeFile(ctx.goal.goalDir, "plan.md", CLOSED_PLAN);
      turnedCtx.writeOutcome(
        outcome({ summary: "both epics closed", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
}

/** Launch 1 stopped inside iteration 1 before dispatch: every task is ready. */
async function expectInterruptedFirstLaunch(goal: E2EGoal): Promise<void> {
  const state = await stateOf(goal.goalDir);
  expect(state.goal).toBe("active");
  for (const slug of [...SHARED_TASKS, "beta.zeta"]) {
    expect(state.tasks[slug]!.status).toBe("ready");
  }
}

/** The saga ended done with both epics closed by the one steward's repair. */
async function expectSagaDone(ctx: SagaE2ECtx): Promise<void> {
  const { goal } = ctx;
  const state = await stateOf(goal.goalDir);
  expect(state.goal).toBe("done");
  expect(state.epics.alpha?.done).toBe(true);
  expect(state.epics.beta?.done).toBe(true);
  for (const slug of [...SHARED_TASKS, "beta.zeta"]) {
    expect(state.tasks[slug]!.status).toBe("merged");
  }

  const plan = fs.readFileSync(goal.planPath, "utf8");
  expect(plan.match(/closed i2: merged/g)).toHaveLength(2);

  const records = await createFolderStore(
    goal.goalDir,
    undefined,
    {},
  ).listRecords();
  const loser = sharedLoser(records);
  expect(
    fs.readFileSync(path.join(goal.tasksDir, `${loser}.md`), "utf8"),
  ).toContain(`epic: ${loser.split(".")[0]}`);
  const stewards = records.filter((record) => record.step === "steward");
  expect(stewards).toHaveLength(1);
  expect(stewards[0]!.slug).toBe(loser);
  expect(stewards[0]!.actor).toBe("agent");
  expect(
    stewards[0]!.seq > records.find((record) => record.step === "park")!.seq,
  ).toBe(true);
  // The relaunch resumed iteration 1, where the park was recorded.
  expect(
    records.filter(
      (record) => record.step === "resume" && record.iteration === 1,
    ),
  ).toHaveLength(1);
  expect(
    records
      .filter((record) => record.slug === loser && record.actor === "agent")
      .every((record) => record.iteration === 1),
  ).toBe(true);

  expect(goal.repo.git(["show", "factory/demo:shared.txt"]).stdout.trim()).toBe(
    "alpha\nbeta",
  );
  expect(goal.repo.git(["show", "factory/demo:zeta.txt"]).stdout.trim()).toBe(
    "zeta",
  );
}

function registerSagaE2E(): void {
  it("runs a two-epic saga through a mid-iteration relaunch and one parked task to done", async () => {
    const goal = makeGoal({
      processYaml: SAGA_PROCESS,
      runYaml: CONCURRENT_RUN_YAML,
    });
    const ctx: SagaE2ECtx = {
      goal,
      alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
      betaPlan: path.join(goal.goalDir, "epics/beta.md"),
      first: new FakeHarness({ id: "fake" }),
      second: new FakeHarness({ id: "fake" }),
      controller: createDrainController(),
    };
    try {
      scriptPlanning(ctx);
      await expectDispatch(
        130,
        ["run", "--repo", goal.repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: ctx.first }, signals: ctx.controller },
      );
      await expectInterruptedFirstLaunch(goal);

      scriptResumedTasks(ctx);
      await expectLaunch(0, goal.repo, ctx.second, 3);
      await expectSagaDone(ctx);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
}

describe("two-epic saga from launch to done", () => {
  registerSagaE2E();
});
