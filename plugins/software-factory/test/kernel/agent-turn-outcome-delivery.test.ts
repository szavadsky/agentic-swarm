import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { derive } from "../../src/kernel/derive.js";
import { boundaryTarget, resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  FlowDefinition,
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

async function retriesOnceDeNovoFullPromptChargesPart1(
  priorSession: (root: string) => SessionRef,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  // An item already through one review round: implement r1, green checks,
  // review changes. The r2 fix turn is the one that overflows.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "implement",
      round: 1,
      actor: "agent",
      alias: "implementer",
      model: { id: "fake-implementer" },
    },
    {
      stop: { kind: "done" },
      outcome: {
        status: "done",
        summary: "implemented",
        concerns: [],
        forward: [],
      },
      session: priorSession(root),
    },
  );
  await runtime.store.appendRecord(
    { iteration: 1, slug: "a", step: "checks", round: 1, actor: "script" },
    { ok: true, checks: [] },
  );

  return { root, fake, runtime };
}

async function retriesOnceDeNovoFullPromptChargesPart2(
  priorSession: (root: string) => SessionRef,
  scope: Awaited<ReturnType<typeof retriesOnceDeNovoFullPromptChargesPart1>>,
) {
  const { runtime, fake, root } = scope;
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "a",
      step: "review",
      round: 1,
      actor: "agent",
      alias: "reviewer",
      model: { id: "fake-reviewer" },
    },
    {
      stop: { kind: "done" },
      outcome: {
        status: "done",
        summary: "needs a fix",
        concerns: [],
        forward: [],
        verdict: "changes",
      },
    },
  );
  fake.script((req) => {
    expect(req.session?.id).toBe("prior-session");
    return fakeTurnResult(req, {
      stop: { kind: "infra", cause: "overflow" },
      usage: { in: 40 },
    });
  });
  fake.script((req, ctx) => {
    ctx.writeOutcome({ status: "done", summary: "implemented" });
    return fakeTurnResult(req, { usage: { in: 2 } });
  });

  const result = await runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: root,
    meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
    vars: implementerVars,
    expectation: "any",
    session: priorSession(root),
  });

  expect(fake.calls).toHaveLength(2);
  expect(fake.calls[1]!.session).toBeUndefined();

  return { ...scope, result };
}

async function retriesOnceDeNovoFullPromptChargesPart3(
  flows: { "implement-review": FlowDefinition },
  scope: Awaited<ReturnType<typeof retriesOnceDeNovoFullPromptChargesPart2>>,
) {
  const { fake, result, runtime, root } = scope;
  expect(fake.calls[1]!.prompt).toBe(fake.calls[0]!.prompt);
  expect(result.record.stop).toEqual({ kind: "done" });
  expect(result.outcome?.status).toBe("done");
  expect(result.record.usage?.in).toBe(42);
  expect(result.record.session?.id).not.toBe("prior-session");

  const records = await runtime.store.listRecords();
  expect(
    records.filter(
      (r) => r.step === "implement" && r.actor === "agent" && r.endedAt,
    ),
  ).toHaveLength(2);
  const state = derive([task("a")], records, flows);
  expect(state.tasks.a!.turns).toBe(3);
  expect(state.tasks.a!.round).toBe(2);
  expect(state.tasks.a!.status).toBe("ready");
  expect(state.tasks.a!.park).toBeUndefined();
  fs.rmSync(root, { recursive: true, force: true });
}

function resumedOverflowPart1() {
  const flow: FlowDefinition = {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      {
        id: "review",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 2,
      },
    ],
  };
  const flows = { "implement-review": flow };

  function priorSession(root: string): SessionRef {
    return {
      harness: "fake",
      id: "prior-session",
      cwd: root,
      model: { id: "fake-implementer" },
      lastRequestStartedAt: new Date(0).toISOString(),
      retentionTier: "short",
      compacted: false,
    };
  }

  it("retries once de novo with the full prompt and charges one turn", async () => {
    const scope1 = await retriesOnceDeNovoFullPromptChargesPart1(priorSession);
    const scope2 = await retriesOnceDeNovoFullPromptChargesPart2(
      priorSession,
      scope1,
    );
    await retriesOnceDeNovoFullPromptChargesPart3(flows, scope2);
  });

  return { flows, priorSession };
}

function resumedOverflowPart2(scope: ReturnType<typeof resumedOverflowPart1>) {
  const { priorSession } = scope;
  it("does not accept an outcome left by the overflowed attempt", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => {
      fs.writeFileSync(
        req.outcomePath!,
        JSON.stringify({
          status: "done",
          summary: "stale from the resumed attempt",
        }),
      );
      return fakeTurnResult(req, {
        stop: { kind: "infra", cause: "overflow" },
      });
    });
    fake.script((req) => fakeTurnResult(req));
    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "delivered after retry" });
      return fakeTurnResult(req);
    });

    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
      vars: implementerVars,
      expectation: "any",
      session: priorSession(root),
    });

    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[1]!.session).toBeUndefined();
    expect(result.outcome?.summary).toBe("delivered after retry");
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function resumedOverflowPart3(scope: ReturnType<typeof resumedOverflowPart1>) {
  const { flows } = scope;
  it("raises the overflow signal when the de-novo retry overflows", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
    );

    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
      vars: implementerVars,
      expectation: "any",
    });

    expect(fake.calls).toHaveLength(1);
    expect(result.record.stop).toEqual({ kind: "infra", cause: "overflow" });
    const records = await runtime.store.listRecords();
    expect(records.find((r) => r.step === "park")).toBeUndefined();
    const state = derive([task("a")], records, flows);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "overflow",
      evidence: "overflow in implement",
    });
    expect(state.tasks.a!.turns).toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function resumedOverflowPart4(scope: ReturnType<typeof resumedOverflowPart1>) {
  const { priorSession, flows } = scope;
  it("raises the overflow signal when the de-novo retry overflows too", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
    );
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
    );

    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
      vars: implementerVars,
      expectation: "any",
      session: priorSession(root),
    });

    expect(fake.calls).toHaveLength(2);
    expect(result.record.stop).toEqual({ kind: "infra", cause: "overflow" });
    const state = derive([task("a")], await runtime.store.listRecords(), flows);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "overflow",
      evidence: "overflow in implement",
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function resumedOverflowPart5(scope: ReturnType<typeof resumedOverflowPart1>) {
  const { priorSession, flows } = scope;
  it("does not retry a resumed turn on another infra cause", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }),
    );

    const result = await runAgentTurn(runtime, {
      target: resolveTurn(runtime, "implementer", "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
      vars: implementerVars,
      expectation: "any",
      session: priorSession(root),
    });

    expect(fake.calls).toHaveLength(1);
    expect(result.record.stop).toEqual({ kind: "infra", cause: "auth" });
    const records = await runtime.store.listRecords();
    expect(records.filter((r) => r.step === "park")).toHaveLength(0);
    expect(derive([task("a")], records, flows).tasks.a!.park).toBeUndefined();
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

function registerAgentTurnOutcomeDeliveryPart5(): void {
  it("never spends a repair turn on an infra stop", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
    );

    const result = await runAgentTurn(runtime, {
      target: boundaryTarget(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(1);
    expect(result.outcome).toBeUndefined();
    expect(result.record.stop).toEqual({ kind: "infra", cause: "quota" });
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("resumed overflow", () => {
    const scope1 = resumedOverflowPart1();
    resumedOverflowPart2(scope1);
    resumedOverflowPart3(scope1);
    resumedOverflowPart4(scope1);
    resumedOverflowPart5(scope1);
  });
}

describe("agent turn outcome delivery", () => {
  registerAgentTurnOutcomeDeliveryPart5();
});
