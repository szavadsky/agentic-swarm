import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import {
  emptyUsage,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { derive } from "../../src/kernel/derive.js";
import { boundaryTarget } from "../../src/kernel/flow-context.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { createAcpxStub } from "../harness/acpx-stub.js";
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

function registerAgentTurnOutcomeDeliveryPart1(): void {
  it("repairs an invalid outcome once in the same session", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const planPath = path.join(runtime.store.goalDir, "plan.md");
    fs.writeFileSync(planPath, "# Plan\n", "utf8");
    fake.script((req) => {
      fs.writeFileSync(
        req.outcomePath!,
        "status: done\nsummary: no decision\n",
      );
      return fakeTurnResult(req, { usage: { in: 10 } });
    });
    fake.script((req, ctx) => {
      expect(req.session).toBeDefined();
      fs.writeFileSync(planPath, "# Plan\n\n## edited on repair\n", "utf8");
      ctx.writeOutcome({
        status: "done",
        summary: "fixed",
        decision: "continue",
      });
      return fakeTurnResult(req, { usage: { in: 3 } });
    });

    const result = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars: { ...vars, plan_path: planPath },
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.session?.id).toBe("fake-session-1");
    expect(result.outcome?.decision).toBe("continue");
    expect(result.record.usage?.in).toBe(13);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function registerAgentTurnOutcomeDeliveryPart2(): void {
  it("records the acpx turn's persisted stdout transcript", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-acpx-"));
    const stub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/beam-free": {
          reply:
            "```yaml\nstatus: done\nsummary: observed\ndecision: done\n```",
        },
      },
    });
    const sessionDir = path.join(root, "sessions");
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir,
      acpx: { agent: "pi" },
    });
    const runtime = runtimeFor(new FakeHarness({ id: "fake" }), root);
    runtime.harnesses = new Map([["pi", harness]]);
    runtime.configs.run.aliases.architect = {
      harness: "pi",
      model: "opencode-go/beam-free",
    };
    await runtime.store.ensureLayout();
    const planPath = path.join(runtime.store.goalDir, "plan.md");
    fs.writeFileSync(planPath, "# Plan\n", "utf8");
    try {
      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });

      expect(result.outcome?.status).toBe("done");
      const transcript = result.record.transcript;
      expect(transcript).toBeDefined();
      expect(transcript!.startsWith(`${sessionDir}${path.sep}`)).toBe(true);
      expect(fs.existsSync(transcript!)).toBe(true);
      // The record file, not only the in-memory result, carries the path.
      const records = await runtime.store.listRecords();
      expect(records.at(-1)?.transcript).toBe(transcript);
      // The recorded file is the prompt process's event stream.
      expect(fs.readFileSync(transcript!, "utf8")).toContain(
        '"method":"session/prompt"',
      );
    } finally {
      stub.cleanup();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerAgentTurnOutcomeDeliveryPart3(): void {
  it("records the models a call served and prices each at its own row", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    writePriceCache(path.join(root, "price-cache.json"), {
      "free/zero": { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
      "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
    });
    const planPath = path.join(runtime.store.goalDir, "plan.md");
    fs.writeFileSync(planPath, "# Plan\n", "utf8");
    fake.script((req) => {
      fs.writeFileSync(
        req.outcomePath!,
        "status: done\nsummary: served two models\ndecision: done\n",
      );
      return fakeTurnResult(req, {
        model: { id: "@free" },
        usage: { in: 2_000_000 },
        served: [
          {
            model: { id: "free/zero" },
            usage: { ...emptyUsage(), in: 1_000_000 },
          },
          {
            model: { id: "paid/one" },
            usage: { ...emptyUsage(), in: 1_000_000 },
          },
        ],
      });
    });

    const result = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars: { ...vars, plan_path: planPath },
      expectation: "architect",
    });

    // The configured alias stays the record's model; the served models are
    // measurement only and add no attempt hop.
    expect(result.record.model).toEqual({ id: "@free" });
    expect(result.record.attempts).toHaveLength(1);
    expect(result.record.served?.map((entry) => entry.model.id)).toEqual([
      "free/zero",
      "paid/one",
    ]);
    expect(result.record.served?.[1]?.usage.costUsd).toBeCloseTo(4, 10);
    expect(result.record.usage?.in).toBe(2_000_000);
    expect(result.record.usage?.costUsd).toBeCloseTo(4, 10);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function registerAgentTurnOutcomeDeliveryPart4(): void {
  it("turns a second invalid outcome into failed after one reminder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
    fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

    const result = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(2);
    expect(result.outcome?.status).toBe("failed");
    expect(result.outcome?.summary).toContain("invalid outcome");
    expect(result.record.repairFindingsResolved).toBeUndefined();
    expect(derive([], await runtime.store.listRecords()).iteration).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

describe("agent turn outcome delivery", () => {
  registerAgentTurnOutcomeDeliveryPart1();

  registerAgentTurnOutcomeDeliveryPart2();

  registerAgentTurnOutcomeDeliveryPart3();

  registerAgentTurnOutcomeDeliveryPart4();
});
