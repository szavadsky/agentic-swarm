import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { countOutcomeRepairs } from "../../src/harness/usage.js";
import { OUTCOME_SETTLE_MS, runAgentTurn } from "../../src/kernel/agent.js";
import { renderContextPack } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { boundaryTarget, resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY, task } from "./helpers.js";

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

const pmVars = {
  iteration: "1",
  intent_path: "/g/intent.md",
  plans: "- goal: /g/plan.md",
  tasks_dir: "/g/tasks",
  existing_tasks: "none",
  repair: "",
  steers: "none",
  concerns: "none",
  holds_dir: "/g/mailbox/holds",
  stalls: "none",
  plan_checks: "none",
};

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

function packFixture(): string {
  const tasks = [task("a"), task("b", { deps: ["a"] })];
  return renderContextPack({
    goal: "demo",
    iteration: 1,
    intentPath: "/g/intent.md",
    planPath: "/g/plan.md",
    checkout: "/wt",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/g/records",
    tasksDir: "/g/tasks",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [{ id: "test", command: "bun test" }],
    forwarded: [],
    debts: [],
  });
}

async function setupLocal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-repair-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function agentTurnPromptSizePart2() {
  it("records pack bytes on architect and PM records", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const pack = packFixture();
    await runtime.store.writeFile("iterations/1/context-pack.md", pack);

    fake.script((req, ctx) => {
      ctx.writeOutcome({
        status: "done",
        summary: "plan",
        decision: "done",
      });
      return fakeTurnResult(req);
    });
    const architect = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });
    expect(architect.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));

    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "tasks" });
      return fakeTurnResult(req);
    });
    const pm = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "pm"),
      cwd: root,
      meta: { iteration: 1, step: "pm", round: 1 },
      vars: pmVars,
      expectation: "any",
    });
    expect(pm.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
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

function registerBoundedRepairsPart1(): void {
  it("defaults to one reminder from process config", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      expect(runtime.configs.process.reminders).toBe(1);
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome?.status).toBe("failed");
      expect(countOutcomeRepairs(result.record.attempts)).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart2(): void {
  it("delivers when the second repair fixes the outcome", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered on repair 2" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 2,
      });

      expect(fake.calls).toHaveLength(3);
      expect(result.outcome?.status).toBe("done");
      expect(result.outcome?.summary).toBe("recovered on repair 2");
      expect(result.record.attempts).toHaveLength(3);
      expect(countOutcomeRepairs(result.record.attempts)).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart3(): void {
  it("delivers when the third repair fixes the outcome", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered on repair 3" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 3,
      });

      expect(fake.calls).toHaveLength(4);
      expect(result.outcome?.status).toBe("done");
      expect(result.outcome?.summary).toBe("recovered on repair 3");
      expect(result.record.attempts).toHaveLength(4);
      expect(countOutcomeRepairs(result.record.attempts)).toBe(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart4(): void {
  it("stops at once on a valid outcome", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "clean" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.outcome?.summary).toBe("clean");
      expect(countOutcomeRepairs(result.record.attempts)).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart5(): void {
  it("accepts an outcome written just after the harness returns", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => {
        const outcomePath = req.outcomePath!;
        // The write lands after the turn returned, like a tool's flush racing
        // the harness's own exit.
        setTimeout(() => {
          fs.mkdirSync(path.dirname(outcomePath), { recursive: true });
          fs.writeFileSync(
            outcomePath,
            "status: done\nsummary: written late\n",
            "utf8",
          );
        }, 10);
        return fakeTurnResult(req, { text: "done" });
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.outcome?.status).toBe("done");
      expect(result.outcome?.summary).toBe("written late");
      expect(result.record.repairFindings).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart6(): void {
  it("settles a missing outcome once for the whole turn", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      const waits: number[] = [];

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 2,
        sleep: async (ms) => {
          waits.push(ms);
        },
      });

      expect(fake.calls).toHaveLength(3);
      expect(waits).toEqual([OUTCOME_SETTLE_MS]);
      expect(result.outcome?.status).toBe("failed");
      expect(result.record.repairFindingsResolved).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("agent turn prompt size", () => {
  agentTurnPromptSizePart2();
});

describe("bounded repairs", () => {
  registerBoundedRepairsPart1();

  registerBoundedRepairsPart2();

  registerBoundedRepairsPart3();

  registerBoundedRepairsPart4();

  registerBoundedRepairsPart5();

  registerBoundedRepairsPart6();
});
