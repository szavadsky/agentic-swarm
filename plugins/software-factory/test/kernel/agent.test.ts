import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { Repo } from "../../src/core/git/repo.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveRole } from "../../src/kernel/flow-context.js";
import { renderContextPack } from "../../src/kernel/context-pack.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { derive } from "../../src/kernel/derive.js";
import type { FlowDefinition, KernelRuntime, ProcessConfig, RepoConfig, RunConfig } from "../../src/kernel/types.js";
import { task } from "./helpers.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    flows: {},
    roles: {
      architect: { prompt: "architect" },
      pm: { prompt: "pm" },
      implementer: { prompt: "implementer" },
    },
    itemTurns: 8,
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
    },
    limits: { concurrency: 1, perHarness: {}, iterations: 1 },
    sessions: { dir: "", keepRuns: 1 },
  };
  return {
    paths: {
      repoRoot: root,
      goalDir: path.join(root, "goal"),
      goalCheckout: root,
      integrationBranch: "factory/g",
      worktreeRoot: root,
      sessionsDir: path.join(root, "sessions"),
    },
    configs: { repo, process, run },
    repo: new Repo({ mainRoot: root, worktreeRoot: root }),
    store: createFolderStore(path.join(root, "goal")),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root),
    limits: {
      itemTurns: 8,
      flows: {},
      iterations: 1,
      concurrency: 1,
      perHarness: {},
    },
  };
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

describe("agent turn outcome delivery", () => {
  it("repairs an invalid outcome once in the same session", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => {
      fs.writeFileSync(req.outcomePath!, "status: done\nsummary: no decision\n");
      return fakeTurnResult(req, { usage: { in: 10 } });
    });
    fake.script((req, ctx) => {
      expect(req.session).toBeDefined();
      ctx.writeOutcome({ status: "done", summary: "fixed", decision: "continue" });
      return fakeTurnResult(req, { usage: { in: 3 } });
    });

    const result = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.session?.id).toBe("fake-session-1");
    expect(result.outcome?.decision).toBe("continue");
    expect(result.record.usage?.in).toBe(13);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("turns a second invalid outcome into failed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
    fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

    const result = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(2);
    expect(result.outcome?.status).toBe("failed");
    expect(result.outcome?.summary).toContain("invalid outcome");
    expect(derive([], await runtime.store.listRecords()).iteration).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never spends a repair turn on an infra stop", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }));

    const result = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
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
    const flow: FlowDefinition = {
      reviewRounds: 2,
      steps: [
        { id: "implement", role: "implementer" },
        { id: "review", role: "reviewer", review: true },
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
          outcome: { status: "done", summary: "implemented", concerns: [], forward: [] },
          session: priorSession(root),
        }
      );
      await runtime.store.appendRecord(
        { iteration: 1, slug: "a", step: "checks", round: 1, actor: "script" },
        { ok: true, checks: [] }
      );
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
          outcome: { status: "done", summary: "needs a fix", concerns: [], forward: [], verdict: "changes" },
        }
      );
      fake.script((req) => {
        expect(req.session?.id).toBe("prior-session");
        return fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" }, usage: { in: 40 } });
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "implemented" });
        return fakeTurnResult(req, { usage: { in: 2 } });
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
        vars: implementerVars,
        expectation: "any",
        session: priorSession(root),
      });

      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.session).toBeUndefined();
      expect(fake.calls[1]!.prompt).toBe(fake.calls[0]!.prompt);
      expect(result.record.stop).toEqual({ kind: "done" });
      expect(result.outcome?.status).toBe("done");
      expect(result.record.usage?.in).toBe(42);
      expect(result.record.session?.id).not.toBe("prior-session");

      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "implement" && r.actor === "agent" && r.endedAt)).toHaveLength(2);
      const state = derive([task("a")], records, flows);
      expect(state.tasks.a!.turns).toBe(3);
      expect(state.tasks.a!.round).toBe(2);
      expect(state.tasks.a!.status).toBe("ready");
      expect(state.tasks.a!.park).toBeUndefined();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("does not accept an outcome left by the overflowed attempt", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
      const fake = new FakeHarness({ id: "fake" });
      const runtime = runtimeFor(fake, root);
      await runtime.store.ensureLayout();
      fake.script((req) => {
        fs.writeFileSync(
          req.outcomePath!,
          JSON.stringify({ status: "done", summary: "stale from the resumed attempt" })
        );
        return fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } });
      });
      fake.script((req) => fakeTurnResult(req));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "delivered after retry" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
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

    it("parks a de-novo overflow with cause overflow", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
      const fake = new FakeHarness({ id: "fake" });
      const runtime = runtimeFor(fake, root);
      await runtime.store.ensureLayout();
      fake.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.record.stop).toEqual({ kind: "infra", cause: "overflow" });
      const records = await runtime.store.listRecords();
      expect(records.find((r) => r.step === "park")?.cause).toBe("overflow");
      const state = derive([task("a")], records, flows);
      expect(state.tasks.a!.status).toBe("parked");
      expect(state.tasks.a!.cause).toBe("overflow");
      expect(state.tasks.a!.turns).toBe(0);
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("parks when the de-novo retry overflows too", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
      const fake = new FakeHarness({ id: "fake" });
      const runtime = runtimeFor(fake, root);
      await runtime.store.ensureLayout();
      fake.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }));
      fake.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
        vars: implementerVars,
        expectation: "any",
        session: priorSession(root),
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.record.stop).toEqual({ kind: "infra", cause: "overflow" });
      const state = derive([task("a")], await runtime.store.listRecords(), flows);
      expect(state.tasks.a!.status).toBe("parked");
      expect(state.tasks.a!.cause).toBe("overflow");
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("does not retry a resumed turn on another infra cause", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
      const fake = new FakeHarness({ id: "fake" });
      const runtime = runtimeFor(fake, root);
      await runtime.store.ensureLayout();
      fake.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
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
  });

  it("takes turn timeouts from the alias, and a step may override them", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const turn = async (timeouts?: { idleMs: number; wallMs: number }) => {
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "ok", decision: "continue" });
        return fakeTurnResult(req);
      });
      return runAgentTurn(runtime, {
        target: resolveRole(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars,
        expectation: "architect",
        ...(timeouts ? { timeouts } : {}),
      });
    };

    await turn();
    expect(fake.calls[0]!.timeouts).toEqual({ idleMs: 20 * 60_000, wallMs: 60 * 60_000 });
    runtime.configs.run.aliases.architect!.timeouts = { idleMs: 111, wallMs: 222 };
    await turn();
    expect(fake.calls[1]!.timeouts).toEqual({ idleMs: 111, wallMs: 222 });
    await turn({ idleMs: 7, wallMs: 9 });
    expect(fake.calls[2]!.timeouts).toEqual({ idleMs: 7, wallMs: 9 });
    fs.rmSync(root, { recursive: true, force: true });
  });
});

const pmVars = {
  iteration: "1",
  intent_path: "/g/intent.md",
  plan_path: "/g/plan.md",
  tasks_dir: "/g/tasks",
  existing_tasks: "none",
  repair: "",
  steers: "none",
  holds_dir: "/g/mailbox/holds",
};

const implementerVars = {
  task_path: "/g/tasks/a.md",
  worktree: "/wt/a",
  setup_command: "none",
  gate_commands: "none",
  baseline_checks: "none",
  findings: "",
};

function packFixture(maxBytes?: number): string {
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
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
}

describe("agent turn prompt size", () => {
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
      target: resolveRole(runtime, "implementer"),
      cwd: root,
      meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
      vars: implementerVars,
      expectation: "any",
    });

    expect(result.record.promptBytes).toBe(Buffer.byteLength(fake.calls[0]!.prompt, "utf8"));
    expect(result.record.promptBytes).toBeGreaterThan(0);
    expect(result.record.packBytes).toBeUndefined();
    expect(result.record.packTruncated).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("records an over-cap pack as truncated on architect and PM records", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const pack = packFixture(300);
    expect(pack).toContain("truncated");
    await runtime.store.writeFile("iterations/1/context-pack.md", pack);

    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "plan", decision: "continue" });
      return fakeTurnResult(req);
    });
    const architect = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });
    expect(architect.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    expect(architect.record.packTruncated).toBe(true);

    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "tasks" });
      return fakeTurnResult(req);
    });
    const pm = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "pm"),
      cwd: root,
      meta: { iteration: 1, step: "pm", round: 1 },
      vars: pmVars,
      expectation: "any",
    });
    expect(pm.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    expect(pm.record.packTruncated).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("records an under-cap pack as not truncated", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    const pack = packFixture();
    await runtime.store.writeFile("iterations/1/context-pack.md", pack);
    fake.script((req, ctx) => {
      ctx.writeOutcome({ status: "done", summary: "plan", decision: "continue" });
      return fakeTurnResult(req);
    });

    const result = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(result.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    expect(result.record.packTruncated).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
