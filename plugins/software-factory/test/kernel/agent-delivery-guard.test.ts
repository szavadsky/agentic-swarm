import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { boundaryTarget, resolveTurn } from "../../src/kernel/flow-context.js";
import { frontClassTypesVar } from "../../src/kernel/front.js";
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

const frontVars = {
  iteration: "1",
  intent_path: "/g/intent.md",
  plan_path: "/g/plan.md",
  tasks_dir: "/g/tasks",
  class_path: "/g/class.yaml",
  pack_path: "/g/iterations/1/context-pack.md",
  code_map_path: "/g/code-map.md",
  checkout: "/wt",
  setup_command: "none",
  gate_commands: "none",
  class_types: frontClassTypesVar({
    development: {
      flow: "implement-review",
      kind: "development",
      schema: "outcome",
    },
    trivial: {
      flow: "just-implement",
      kind: "development",
      schema: "outcome",
    },
  }),
};

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-guard-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

const pmVars = {
  iteration: "1",
  intent_path: "/g/intent.md",
  plans: "- goal: /g/plan.md",
  tasks_dir: "/g/tasks",
  existing_tasks: "none",
  repair: "",
  steers: "none",
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

function registerDeliveryGuardPart5(): void {
  it("omits the verdict and decision lines when a bare done delivers", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(2);
      const repair = fake.calls[1]!.prompt;
      expect(repair).toContain(
        "You are the implementer. Your turn did not deliver its outcome.",
      );
      expect(repair).not.toContain("verdict:");
      expect(repair).not.toContain("decision:");
      expect(result.outcome?.summary).toBe("recovered");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart6(): void {
  it("keeps the decision line but no verdict in an architect repair", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "stopped",
          decision: "done",
        });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "architect", round: 1 },
        vars,
        expectation: "architect",
      });

      expect(fake.calls).toHaveLength(2);
      const repair = fake.calls[1]!.prompt;
      expect(repair).toContain(
        "You are the architect. Your turn did not deliver its plan edit or stop decision.",
      );
      expect(repair).toContain("decision: continue | done | blocked");
      expect(repair).not.toContain("verdict:");
      expect(result.outcome?.decision).toBe("done");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart7(): void {
  it("names task files when a PM turn delivers no outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "pm"),
        cwd: root,
        meta: { iteration: 1, step: "pm", round: 1 },
        vars: pmVars,
        expectation: "any",
        repairTurns: 3,
      });

      expect(fake.calls).toHaveLength(4);
      expect(fake.calls[1]!.prompt).toContain(
        "You are the pm. Your turn did not deliver its task files.",
      );
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain(
        "missing deliverable: task files",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart8(): void {
  it("names class, task, and pack when a front turn delivers no outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "front"),
        cwd: root,
        meta: { iteration: 1, step: "front", round: 1 },
        vars: frontVars,
        expectation: "any",
        repairTurns: 3,
      });

      expect(fake.calls).toHaveLength(4);
      expect(fake.calls[1]!.prompt).toContain(
        "You are the front. Your turn did not deliver its class, task, and pack.",
      );
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain(
        "missing deliverable: class, task, and pack",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart9(): void {
  it("repairs an architect continue with no plan on disk, then fails naming the plan", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
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
      expect(repair).toContain(`${planPath} does not exist`);
      expect(repair).toContain("the plan edit must be on disk");
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain(`${planPath} does not exist`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("delivery guard", () => {
  registerDeliveryGuardPart5();

  registerDeliveryGuardPart6();

  registerDeliveryGuardPart7();

  registerDeliveryGuardPart8();

  registerDeliveryGuardPart9();
});
