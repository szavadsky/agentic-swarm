import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { Caps, LiveAgents } from "../../src/harness/types.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
  type FakeTurnHandler,
} from "../../src/harness/fake/index.js";
import { subarchitectDelivery } from "../../src/kernel/hierarchy.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
} from "./e2e-helpers.js";

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

function recordOf(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).record;
}

/** The outcome path a steered consult names. */
function steeredOutcome(prompt: string): string {
  const match = /- outcome path: `([^`]+)`/.exec(prompt);
  if (!match?.[1]) throw new Error("steered consult names no outcome path");
  return match[1];
}

describe("subarchitect delivery strategy", () => {
  registerSubarchitectDeliveryStrategyPart1();
  registerSubarchitectDeliveryStrategyPart2();
});

function registerSubarchitectDeliveryStrategyPart1(): void {
  it("selects steer only where the harness advertises it", async () => {
    const model = { id: "fake-model" };
    const steer = new FakeHarness({ caps: { subagents: "steer" } });
    const spawn = new FakeHarness({ caps: { subagents: "spawn" } });
    const none = new FakeHarness({ caps: { subagents: "none" } });
    expect(await subarchitectDelivery({ harness: steer, model })).toBe("steer");
    expect(await subarchitectDelivery({ harness: spawn, model })).toBe(
      "report",
    );
    expect(await subarchitectDelivery({ harness: none, model })).toBe("report");
  });

  it("keeps the written report when the capability probe fails", async () => {
    class BrokenCaps extends FakeHarness {
      override async caps(): Promise<Caps> {
        throw new Error("probe failed");
      }
    }
    expect(
      await subarchitectDelivery({
        harness: new BrokenCaps(),
        model: { id: "fake-model" },
      }),
    ).toBe("report");
  });
}

/** What the live-child monitor exposes to the test. */
interface SagaIrcState {
  childLive: boolean;
  polls: number;
  childSteer: ((id: string, message: string) => void) | undefined;
  steers: Array<{ id: string; message: string }>;
}

/** The shared state of the steered-consult test. */
interface SagaIrcCtx {
  goal: ReturnType<typeof makeGoal>;
  planPath: string;
  alphaPlan: string;
  betaPlan: string;
  childFile: string;
  harness: FakeHarness;
  live: SagaIrcState;
}

/** Iteration 1: the main architect registers two epics. */
function scriptIrcRegister(ctx: SagaIrcCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Architect register");
      fs.writeFileSync(ctx.planPath, GOAL_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "split into two epics", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => recordOf(req).includes("-i1-architect-") },
  );
}

/** Both subarchitects plan their epic in iteration 1. */
function scriptIrcPlans(ctx: SagaIrcCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.onLive).toBeUndefined();
      expect(req.prompt).not.toContain("## Subarchitects in this session");
      fs.mkdirSync(path.dirname(ctx.alphaPlan), { recursive: true });
      fs.writeFileSync(ctx.alphaPlan, ALPHA_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "epic alpha planned", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => req.prompt.includes("- epic: `alpha`") },
  );
  ctx.harness.script(
    (req, turnedCtx) => {
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

/** The iteration-1 PM derives one task per epic plan. */
function scriptIrcPmI1(ctx: SagaIrcCtx): void {
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
      turnedCtx.writeOutcome(outcome({ summary: "filed both tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => recordOf(req).includes("-i1-pm-") },
  );
}

/** Both epics' task implement/approve turns. */
function scriptIrcTasks(ctx: SagaIrcCtx): void {
  for (const [slug, file] of [
    ["alpha.build", "alpha.txt"],
    ["beta.build", "beta.txt"],
  ] as const) {
    ctx.harness.script(implementer(file), {
      when: (req) =>
        fakeTurnIdentity(req).slug === slug &&
        fakeTurnIdentity(req).step === "implement",
    });
    ctx.harness.script(approver(`${slug} is correct`), {
      when: (req) =>
        fakeTurnIdentity(req).slug === slug &&
        fakeTurnIdentity(req).step === "review",
    });
  }
}

/** Iteration 2's architect hosts beta as a live child and writes alpha's plan. */
function scriptIrcArchitectI2(ctx: SagaIrcCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("## Subarchitects in this session");
      expect(req.prompt).toContain("- epic `beta`");
      expect(req.prompt).toContain("write agent://");
      expect(req.onLive).toBeDefined();
      if (Array.isArray((req.opaque as any)?.agents)) {
        expect((req.opaque as any).agents[0].name).toBe("subarchitect");
      } else {
        throw new Error("architect turn carried no agent definitions");
      }
      fs.appendFileSync(ctx.planPath, "\n## Milestone 2\n- hold.\n", "utf8");
      fs.appendFileSync(ctx.alphaPlan, "\nforeign main write\n", "utf8");
      ctx.live.childLive = true;
      turnedCtx.writeOutcome(
        outcome({ summary: "direction holds", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => recordOf(req).includes("-i2-architect-") },
  );
}

/** The steer is the consult: the child edits its plan and writes its outcome. */
function scriptIrcChildSteer(ctx: SagaIrcCtx): void {
  ctx.live.childSteer = (_id, message) => {
    const outcomePath = steeredOutcome(message);
    fs.writeFileSync(
      ctx.betaPlan,
      `${BETA_PLAN.replace(
        "- `beta.build` — create beta.txt.\n  - done: beta.txt exists.\n",
        "- `beta.build` — merged.\n",
      )}\n## Milestone 2\n- child review.\n`,
      "utf8",
    );
    fs.mkdirSync(path.dirname(outcomePath), { recursive: true });
    fs.writeFileSync(
      outcomePath,
      JSON.stringify({
        status: "done",
        summary: "epic beta reviewed live",
        concerns: [],
        forward: [],
        decision: "continue",
      }),
      "utf8",
    );
  };
}

/** The iteration-2 PM files no new tasks. */
function scriptIrcPmI2(ctx: SagaIrcCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => recordOf(req).includes("-i2-pm-") },
  );
}

/** The child's consult ran over IRC, not as a written-report turn. */
function expectIrcSteered(ctx: SagaIrcCtx): void {
  expect(ctx.live.steers.map((steer) => steer.id)).toEqual(["epic-beta"]);
  expect(
    ctx.harness.calls.some((call) =>
      recordOf(call).includes("-i2-subarchitect-"),
    ),
  ).toBe(false);
  expect(
    ctx.harness.calls.some(
      (call) =>
        recordOf(call).includes("-i2-planreview-") &&
        call.prompt.includes("epics/beta.md"),
    ),
  ).toBe(true);
  expect(ctx.harness.compactions.map((ref) => ref.id)).toContain(ctx.childFile);
  expect(fs.readFileSync(ctx.alphaPlan, "utf8")).not.toContain(
    "foreign main write",
  );
  expect(fs.readFileSync(ctx.betaPlan, "utf8")).toContain("child review");
}

/** The beta consult record carries the live child's outcome and session. */
async function expectIrcConsultAndState(ctx: SagaIrcCtx): Promise<void> {
  const store = createFolderStore(ctx.goal.goalDir, undefined, {});
  const records = await store.listRecords();
  const betaConsult = records.find(
    (record) =>
      record.iteration === 2 &&
      record.step === "subarchitect" &&
      record.architect === "beta",
  );
  expect(betaConsult?.outcome?.summary).toBe("epic beta reviewed live");
  expect(betaConsult?.session?.id).toBe(ctx.childFile);
  expect(betaConsult?.session?.compacted).toBe(true);
  expect(
    records.some(
      (record) =>
        record.iteration === 2 &&
        record.step === "subarchitect" &&
        record.architect === "alpha",
    ),
  ).toBe(false);
  expect(
    fs.readFileSync(
      path.join(ctx.goal.goalDir, "iterations/2/epics/beta/summary.md"),
      "utf8",
    ),
  ).toContain("epic beta reviewed live");
  const state = await stateOf(ctx.goal.goalDir);
  expect(state.tasks["alpha.build"]?.status).toBe("merged");
  expect(state.tasks["beta.build"]?.status).toBe("merged");
}

/** The live child registry: first poll before admission, then steerable. */
function ircLiveAgents(state: SagaIrcState, childFile: string): LiveAgents {
  return {
    // The first poll answers before the child is admitted, so the monitor
    // exercises the retry the probe saw ("Subagent not running").
    list: async () => {
      state.polls += 1;
      return state.childLive && state.polls > 1
        ? [
            {
              id: "epic-beta",
              agent: "subarchitect",
              status: "running",
              sessionFile: childFile,
            },
          ]
        : [];
    },
    steer: async (id, message) => {
      if (!state.childLive) throw new Error(`Subagent not running: ${id}`);
      state.steers.push({ id, message });
      state.childSteer?.(id, message);
    },
  };
}

function registerSubarchitectDeliveryStrategyPart2(): void {
  it("steers an epic's consult into the architect's live session", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const childFile = path.join(goal.goalDir, "sessions", "epic-beta.jsonl");
      const live: SagaIrcState = {
        childLive: false,
        polls: 0,
        childSteer: undefined,
        steers: [],
      };
      const agents = ircLiveAgents(live, childFile);
      const harness = new FakeHarness({
        id: "fake",
        caps: { subagents: "steer" },
        live: () => agents,
      });
      const ctx: SagaIrcCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        childFile,
        harness,
        live,
      };
      scriptIrcRegister(ctx);
      scriptIrcPlans(ctx);
      scriptIrcPmI1(ctx);
      scriptIrcTasks(ctx);
      scriptIrcArchitectI2(ctx);
      scriptIrcChildSteer(ctx);
      scriptIrcPmI2(ctx);

      // The child is live from the start of iteration 2's architect turn; the
      // monitor's first registry poll steers it without waiting for a spawn.
      live.childLive = true;
      await expectLaunch(3, goal.repo, harness, 2);
      expectIrcSteered(ctx);
      await expectIrcConsultAndState(ctx);
    } finally {
      cleanup(goal);
    }
  }, 30_000);
}
