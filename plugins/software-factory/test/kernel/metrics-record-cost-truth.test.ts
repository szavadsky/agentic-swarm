import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import { type PriceTable } from "../../src/kernel/pricing.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

const PRICES: PriceTable = {
  "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
  "vendor/tiny-preview:free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoning: 0,
  },
};

async function writesPricedCostListPriceIntoEveryPart1() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-priced-"));
  const fake = new FakeHarness({ id: "fake" });
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
    aliases: { implementer: { harness: "fake", model: "paid/one" } },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
  };
  writePriceCache(path.join(root, "price-cache.json"), PRICES);

  return { root, fake, process, repo, run };
}

async function writesPricedCostListPriceIntoEveryPart2(
  scope: Awaited<ReturnType<typeof writesPricedCostListPriceIntoEveryPart1>>,
) {
  const { root, repo, process, run, fake } = scope;
  const runtime: KernelRuntime = {
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

  return { ...scope, runtime };
}

async function writesPricedCostListPriceIntoEveryPart3(
  scope: Awaited<ReturnType<typeof writesPricedCostListPriceIntoEveryPart2>>,
) {
  const { runtime, fake, root } = scope;
  try {
    await runtime.store.ensureLayout();
    fake.script((req, ctx) => {
      ctx.writeOutcome({
        status: "done",
        summary: "ok",
        concerns: [],
        forward: [],
      });
      return fakeTurnResult(req, {
        usage: { in: 1_000_000, costUsd: 0 },
        // The harness reaches the model through its own provider segment; the
        // price row names the model's provider, so only normalization finds it.
        model: { id: "other-host/paid/one" },
      });
    });
    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
      vars: {
        task_path: "tasks/a.md",
        report_path: "",
        front_pack: "none",
        worktree: root,
        resume_note: "",
        setup_command: "true",
        gate_commands: "true",
        base_gates: "not recorded",
        findings: "none",
      },
      expectation: "any",
    });
    expect(result.record.model?.id).toBe("other-host/paid/one");
    // The turn reported a literal 0, so its priced cost is the table's list
    // estimate; both columns carry it, and the harness figure stays visible.
    expect(result.record.usage?.costUsd).toBeCloseTo(4, 10);
    expect(result.record.usage?.listCostUsd).toBeCloseTo(4, 10);
    expect(result.record.usage?.harnessCostUsd).toBe(0);
    expect(result.record.attempts?.[0]?.usage.costUsd).toBeCloseTo(4, 10);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function registerRecordCostTruthPart5(): void {
  it("writes priced cost and list price into every agent record", async () => {
    const scope1 = await writesPricedCostListPriceIntoEveryPart1();
    const scope2 = await writesPricedCostListPriceIntoEveryPart2(scope1);
    await writesPricedCostListPriceIntoEveryPart3(scope2);
  });
}

describe("record cost truth", () => {
  registerRecordCostTruthPart5();
});
