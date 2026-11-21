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

const reviewerVars = {
  task_path: "/g/tasks/a.md",
  worktree: "/wt/a",
  base_hash: "aaa",
  head_hash: "bbb",
  round: "1",
  max_rounds: "2",
  base_gates: "not recorded",
  prior_findings: "",
  upscope_ask: "",
  last_call: "false",
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

async function resolvesDebtClosedIdAgainstRecordsPart1(
  runtime: KernelRuntime,
  fake: FakeHarness,
  root: string,
) {
  const seed = await runtime.store.startRecord({
    iteration: 1,
    slug: "a",
    step: "review",
    round: 1,
    actor: "agent",
    alias: "reviewer",
    model: { id: "fake" },
  });
  await seed.finish({
    stop: { kind: "done" },
    outcome: {
      status: "done",
      summary: "raised a debt",
      concerns: [
        {
          kind: "debt",
          calibration: "architect",
          text: "shim in the writer",
        },
      ],
      forward: [],
      verdict: "approve",
    },
  });
  const debtId = `${path.basename(seed.dir)}#1`;

  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "closed",
      debtClosed: [{ id: debtId, reason: "shim removed" }],
    });
    return fakeTurnResult(req);
  });
  await runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: root,
    meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
  expect(fake.calls).toHaveLength(1);
}

async function resolvesDebtClosedIdAgainstRecordsPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
  root: string,
) {
  fake.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "closed the wrong id",
      debtClosed: [{ id: "nope#1", reason: "shim removed" }],
    });
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome({ status: "done", summary: "repaired" });
    return fakeTurnResult(req);
  });
  const repaired = await runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: root,
    meta: { iteration: 1, slug: "c", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
  expect(fake.calls).toHaveLength(3);
  expect(fake.calls[2]!.prompt).toContain(
    "- unknown debt id: nope#1: no ingested debt concern has that id",
  );
  expect(repaired.outcome?.summary).toBe("repaired");
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

function registerAgentTurnOutcomeDeliveryPart6(): void {
  it("takes turn timeouts from the alias, and a step may override them", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const turn = async (timeouts?: { idleMs: number; wallMs: number }) => {
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "ok",
          decision: "done",
        });
        return fakeTurnResult(req);
      });
      return runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars,
        expectation: "architect",
        ...(timeouts ? { timeouts } : {}),
      });
    };

    await turn();
    expect(fake.calls[0]!.timeouts).toEqual({
      idleMs: 20 * 60_000,
      wallMs: 60 * 60_000,
    });
    runtime.configs.run.aliases.architect!.timeouts = {
      idleMs: 111,
      wallMs: 222,
    };
    await turn();
    expect(fake.calls[1]!.timeouts).toEqual({ idleMs: 111, wallMs: 222 });
    await turn({ idleMs: 7, wallMs: 9 });
    expect(fake.calls[2]!.timeouts).toEqual({ idleMs: 7, wallMs: 9 });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function registerDeliveryGuardPart1(): void {
  it("repairs a verdict-less review from the template, then fails naming the verdict", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "looks fine" });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "still no verdict" });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "still no verdict" });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "still no verdict" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "reviewer", "reviewer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "review", round: 1 },
        vars: reviewerVars,
        expectation: "review",
        repairTurns: 3,
      });

      expect(fake.calls).toHaveLength(4);
      const repair = fake.calls[1]!.prompt;
      expect(repair).toContain(
        "You are the reviewer. Your turn did not deliver its verdict.",
      );
      expect(repair).toContain("- verdict is required on a completed review");
      expect(repair).toContain("verdict: approve | changes | reject");
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain("verdict is required");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart2(): void {
  it("refuses a changes verdict on the last review call and names it in the repair", async () => {
    const { root, fake, runtime } = await setup();
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        fake.script((req, ctx) => {
          ctx.writeOutcome({
            status: "done",
            summary: "more work remains",
            verdict: "changes",
          });
          return fakeTurnResult(req);
        });
      }

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "reviewer", "reviewer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "review", round: 3 },
        vars: {
          ...reviewerVars,
          round: "3",
          max_rounds: "3",
          last_call: "true",
        },
        expectation: "review",
        lastCall: true,
        repairTurns: 1,
      });

      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.prompt).toContain(
        '- verdict "changes" is not available on the last review call: approve with concerns, or reject',
      );
      expect(result.record.repairFindings).toContain(
        'verdict "changes" is not available on the last review call: approve with concerns, or reject',
      );
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain(
        'verdict "changes" is not available on the last review call',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart3(): void {
  it("resolves a debtClosed id against the records and repairs an unknown one", async () => {
    const { root, fake, runtime } = await setup();
    try {
      await resolvesDebtClosedIdAgainstRecordsPart1(runtime, fake, root);
      await resolvesDebtClosedIdAgainstRecordsPart2(runtime, fake, root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerDeliveryGuardPart4(): void {
  it("refuses a debt raised and closed in the same record", async () => {
    const { root, fake, runtime } = await setup();
    try {
      let ownId = "";
      fake.script((req, ctx) => {
        if (!req.outcomePath) throw new Error("turn has no outcome path");
        ownId = `${path.basename(path.dirname(req.outcomePath))}#1`;
        ctx.writeOutcome({
          status: "done",
          summary: "raised and closed its own debt",
          concerns: [
            {
              kind: "debt",
              calibration: "fyi",
              text: "shim in the reader",
            },
          ],
          debtClosed: [{ id: ownId, reason: "shim removed" }],
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "repaired" });
        return fakeTurnResult(req);
      });
      const repaired = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(ownId).not.toBe("");
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.prompt).toContain(
        `- unknown debt id: ${ownId}: no ingested debt concern has that id`,
      );
      expect(repaired.outcome?.summary).toBe("repaired");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("agent turn outcome delivery", () => {
  registerAgentTurnOutcomeDeliveryPart6();
});

describe("delivery guard", () => {
  registerDeliveryGuardPart1();

  registerDeliveryGuardPart2();

  registerDeliveryGuardPart3();

  registerDeliveryGuardPart4();
});
