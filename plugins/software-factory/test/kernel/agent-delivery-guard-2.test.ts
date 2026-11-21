import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { boundaryTarget, resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const scope1 = runtimeForPart1();
  return runtimeForPart2(root, fake, scope1);
}

const vars = {
  turn: "boundary",
  iteration: "1",
  intent_path: "/g/intent.md",
  plan_path: "/g/plan.md",
  checkout: "/wt",
  pack_path: "/g/pack.md",
  digest_path: "",
  steers: "none",
};

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-guard-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

const implementerVars = {
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  base_gates: "not recorded",
  findings: "",
};

async function repairsArchitectContinueOverPart1(
  runtime: KernelRuntime,
  root: string,
  fake: FakeHarness,
) {
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n", "utf8");
  const turn = () =>
    runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars: { ...vars, plan_path: planPath },
      expectation: "architect",
      repairTurns: 3,
    });
  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "go",
      decision: "continue",
    });
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "still going",
      decision: "continue",
    });
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "still going",
      decision: "continue",
    });
    return fakeTurnResult(req);
  });

  return { planPath, turn };
}

async function repairsArchitectContinueOverPart2(
  fake: FakeHarness,
  scope: Awaited<ReturnType<typeof repairsArchitectContinueOverPart1>>,
) {
  const { turn, planPath } = scope;
  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "still going",
      decision: "continue",
    });
    return fakeTurnResult(req);
  });

  const result = await turn();

  expect(fake.calls).toHaveLength(4);
  const repair = fake.calls[1]!.prompt;
  expect(repair).toContain("plan edit or stop decision");
  expect(repair).toContain(`${planPath} is unchanged since the turn started`);
  expect(repair).toContain("the plan edit must be on disk");
  expect(result.outcome?.status).toBe("failed");
  expect(result.outcome?.summary).toContain(
    `${planPath} is unchanged since the turn started`,
  );
}

function agentTurnPromptSizePart1() {
  it("records prompt bytes on every agent step", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "ok" });
      return fakeTurnResult(req);
    });

    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
      vars: implementerVars,
      expectation: "any",
    });

    expect(result.record.promptBytes).toBe(
      Buffer.byteLength(fake.calls[0]!.prompt, "utf8"),
    );
    expect(result.record.promptBytes).toBeGreaterThan(0);
    expect(result.record.packBytes).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function runtimeForPart1() {
  const process: ProcessConfig = {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: {
      architect: { harness: "fake", model: "fake-architect" },
      pm: { harness: "fake", model: "fake-pm" },
      implementer: { harness: "fake", model: "fake-implementer" },
      reviewer: { harness: "fake", model: "fake-reviewer" },
      steward: { harness: "fake", model: "fake-steward" },
      "plan-checker": { harness: "fake", model: "fake-check" },
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      front: { harness: "fake", model: "fake-front" },
    },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
  };

  return { process, repo, run };
}

function runtimeForPart2(
  root: string,
  fake: FakeHarness,
  scope: ReturnType<typeof runtimeForPart1>,
): KernelRuntime {
  const { repo, process, run } = scope;
  return {
    paths: {
      repoRoot: root,
      goalDir: path.join(root, "goal"),
      goalCheckout: root,
      integrationBranch: "factory/g",
      worktreeRoot: root,
      sessionsDir: path.join(root, "sessions"),
      artifacts: { backend: "folder", root },
    },
    configs: { repo, process, run },
    repo: new Repo({ mainRoot: root, worktreeRoot: root }),
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root, {}),
    limits: {
      flows: {},
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    },
    exhaustedPools: new Map(),
    // Hermetic prices: the test-local cache, never the network.
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
}

function registerDeliveryGuardPart10(): void {
  it("repairs an architect continue over an untouched plan, then fails naming the plan edit", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const scope1 = await repairsArchitectContinueOverPart1(
        runtime,
        root,
        fake,
      );
      await repairsArchitectContinueOverPart2(fake, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart11(): void {
  it("spends no repair turn when the architect edits or creates the continued plan", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
      fake.script((req, ctx) => {
        fs.writeFileSync(planPath, "# Plan\n\n## alpha\n", "utf8");
        ctx.writeOutcome({
          status: "done",
          summary: "go",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(planPath, "# Plan v2\n", "utf8");
        ctx.writeOutcome({
          status: "done",
          summary: "replanned",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });

      const edited = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(edited.outcome?.decision).toBe("continue");
      fs.rmSync(planPath);
      const created = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 2, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(created.outcome?.decision).toBe("continue");
      expect(fake.calls).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart12(): void {
  it("compares the repair turn against the pre-turn plan, not the first attempt's", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
      fake.script((req) => {
        fs.writeFileSync(planPath, "# Plan\n\n## alpha\n", "utf8");
        fs.writeFileSync(
          req.outcomePath!,
          "status: done\nsummary: no decision\n",
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "fixed",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome?.decision).toBe("continue");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart13(): void {
  it("spends no repair turn when the architect stops without touching the plan", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "met", decision: "done" });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.rmSync(planPath);
        ctx.writeOutcome({
          status: "blocked",
          summary: "stuck",
          decision: "blocked",
        });
        return fakeTurnResult(req);
      });

      const doneTurn = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(doneTurn.outcome?.decision).toBe("done");
      const blockedTurn = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 2, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(blockedTurn.outcome?.decision).toBe("blocked");
      expect(fake.calls).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("delivery guard", () => {
  registerDeliveryGuardPart10();

  registerDeliveryGuardPart11();

  registerDeliveryGuardPart12();

  registerDeliveryGuardPart13();
});

describe("agent turn prompt size", () => {
  agentTurnPromptSizePart1();
});
