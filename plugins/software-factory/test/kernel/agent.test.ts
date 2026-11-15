import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { REPAIR_TURNS, runAgentTurn } from "../../src/kernel/agent.js";
import { renderContextPack } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { countOutcomeRepairs } from "../../src/kernel/metrics.js";
import { resolveRole } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  FlowDefinition,
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { task } from "./helpers.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    flows: {},
    roles: {
      architect: { prompt: "architect" },
      pm: { prompt: "pm" },
      implementer: { prompt: "implementer" },
      reviewer: { prompt: "reviewer" },
      front: { prompt: "front" },
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
      reviewer: { harness: "fake", model: "fake-reviewer" },
      front: { harness: "fake", model: "fake-front" },
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
      target: resolveRole(runtime, "architect"),
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

  it("turns a fourth invalid outcome into failed after three repairs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
    fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
    fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
    fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

    const result = await runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: root,
      meta: { iteration: 1, step: "architect", round: 1 },
      vars,
      expectation: "architect",
    });

    expect(fake.calls).toHaveLength(4);
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
    fake.script((req) =>
      fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
    );

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
    });

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
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
      );

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
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
      );
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "overflow" } }),
      );

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
      const state = derive(
        [task("a")],
        await runtime.store.listRecords(),
        flows,
      );
      expect(state.tasks.a!.status).toBe("parked");
      expect(state.tasks.a!.cause).toBe("overflow");
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("does not retry a resumed turn on another infra cause", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-"));
      const fake = new FakeHarness({ id: "fake" });
      const runtime = runtimeFor(fake, root);
      await runtime.store.ensureLayout();
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }),
      );

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
        ctx.writeOutcome({
          status: "done",
          summary: "ok",
          decision: "done",
        });
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
});
describe("delivery guard", () => {
  const reviewerVars = {
    task_path: "/g/tasks/a.md",
    worktree: "/wt/a",
    base_hash: "aaa",
    head_hash: "bbb",
    round: "1",
    max_rounds: "2",
    baseline_checks: "none",
    prior_findings: "",
    upscope_ask: "",
  };

  const frontVars = {
    iteration: "1",
    intent_path: "/g/intent.md",
    plan_path: "/g/plan.md",
    tasks_dir: "/g/tasks",
    class_path: "/g/class.yaml",
    pack_path: "/g/iterations/1/context-pack.md",
    checkout: "/wt",
    setup_command: "none",
    gate_commands: "none",
  };

  async function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-guard-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    return { root, fake, runtime };
  }

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
        target: resolveRole(runtime, "reviewer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "review", round: 1 },
        vars: reviewerVars,
        expectation: "review",
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

  it("omits the verdict and decision lines when a bare done delivers", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
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

  it("names task files when a PM turn delivers no outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "pm"),
        cwd: root,
        meta: { iteration: 1, step: "pm", round: 1 },
        vars: pmVars,
        expectation: "any",
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

  it("names class, task, and pack when a front turn delivers no outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "front"),
        cwd: root,
        meta: { iteration: 1, step: "front", round: 1 },
        vars: frontVars,
        expectation: "any",
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

  it("repairs an architect continue with no plan on disk, then fails naming the plan", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      const turn = () =>
        runAgentTurn(runtime, {
          target: resolveRole(runtime, "architect"),
          cwd: root,
          meta: { iteration: 1, step: "architect", round: 1 },
          vars: { ...vars, plan_path: planPath },
          expectation: "architect",
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

  it("repairs an architect continue over an untouched plan, then fails naming the plan edit", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
      const turn = () =>
        runAgentTurn(runtime, {
          target: resolveRole(runtime, "architect"),
          cwd: root,
          meta: { iteration: 1, step: "architect", round: 1 },
          vars: { ...vars, plan_path: planPath },
          expectation: "architect",
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
      expect(repair).toContain(
        `${planPath} is unchanged since the turn started`,
      );
      expect(repair).toContain("the plan edit must be on disk");
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain(
        `${planPath} is unchanged since the turn started`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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
        target: resolveRole(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(edited.outcome?.decision).toBe("continue");
      fs.rmSync(planPath);
      const created = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "architect"),
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
        target: resolveRole(runtime, "architect"),
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
        target: resolveRole(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });
      expect(doneTurn.outcome?.decision).toBe("done");
      const blockedTurn = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "architect"),
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
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  baseline_checks: "none",
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

    expect(result.record.promptBytes).toBe(
      Buffer.byteLength(fake.calls[0]!.prompt, "utf8"),
    );
    expect(result.record.promptBytes).toBeGreaterThan(0);
    expect(result.record.packBytes).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });

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
      target: resolveRole(runtime, "architect"),
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
      target: resolveRole(runtime, "pm"),
      cwd: root,
      meta: { iteration: 1, step: "pm", round: 1 },
      vars: pmVars,
      expectation: "any",
    });
    expect(pm.record.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("bounded repairs", () => {
  async function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-repair-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    await runtime.store.ensureLayout();
    return { root, fake, runtime };
  }

  function invalidYaml(line: string): string {
    return `status: [unclosed ${line}\nsummary: x\n`;
  }

  it("defaults to three repair turns", () => {
    expect(REPAIR_TURNS).toBe(3);
  });

  it("delivers when the second repair fixes the outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered on repair 2" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
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

  it("delivers when the third repair fixes the outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered on repair 3" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
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

  it("stops at once on a valid outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "clean" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
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

  it("carries each repair latest YAML finding verbatim with line and column", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const firstBad = invalidYaml("one");
      const secondBad = `status: done\nsummary: [bad\n: oops\n`;
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, firstBad, "utf8");
        return fakeTurnResult(req);
      });
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, secondBad, "utf8");
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(3);
      expect(result.outcome?.summary).toBe("recovered");
      const firstAsk = fake.calls[1]!.prompt;
      const secondAsk = fake.calls[2]!.prompt;
      expect(firstAsk).toContain("not valid YAML");
      expect(firstAsk).toMatch(/line \d+, column \d+/);
      expect(secondAsk).toContain("not valid YAML");
      expect(secondAsk).toMatch(/line \d+, column \d+/);
      expect(secondAsk).not.toContain(firstBad.trim());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails without a repair when the item budget has no turn left", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        itemBudget: { used: 7, limit: 8 },
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain("no outcome");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("caps repairs at the remaining item budget", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        itemBudget: { used: 6, limit: 8 },
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome?.status).toBe("failed");
      expect(countOutcomeRepairs(result.record.attempts)).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets a task repairTurns override shrink the loop", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      const zero = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 0,
      });
      expect(fake.calls).toHaveLength(1);
      expect(zero.outcome?.status).toBe("failed");

      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      const one = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 1,
      });
      expect(fake.calls).toHaveLength(3);
      expect(one.outcome?.status).toBe("failed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("spends no repair on refusal or cancelled stops", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "no" } }),
      );
      const refused = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(1);
      expect(refused.outcome).toBeUndefined();

      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "cancelled" } }),
      );
      const cancelled = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(2);
      expect(cancelled.outcome).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ends the loop when a repair is interrupted without an outcome", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
      );

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome).toBeUndefined();
      expect(result.record.stop).toEqual({ kind: "infra", cause: "quota" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks the architect plan finding on every repair round", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
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
        fs.writeFileSync(planPath, "# Plan\n\n## alpha\n", "utf8");
        ctx.writeOutcome({
          status: "done",
          summary: "fixed",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveRole(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
      });

      expect(fake.calls).toHaveLength(3);
      expect(result.outcome?.decision).toBe("continue");
      expect(fake.calls[1]!.prompt).toContain(
        "is unchanged since the turn started",
      );
      expect(fake.calls[2]!.prompt).toContain(
        "is unchanged since the turn started",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
