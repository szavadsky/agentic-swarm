import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { renderContextPack } from "../../src/kernel/context-pack.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { derive } from "../../src/kernel/derive.js";
import type { KernelRuntime, ProcessConfig, RepoConfig, RunConfig } from "../../src/kernel/types.js";
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
      role: "architect",
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
      role: "architect",
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
      role: "architect",
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
        role: "architect",
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
      role: "implementer",
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
      role: "architect",
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
      role: "pm",
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
      role: "architect",
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
