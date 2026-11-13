import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { derive } from "../../src/kernel/derive.js";
import type { KernelRuntime, ProcessConfig, RepoConfig, RunConfig } from "../../src/kernel/types.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    flows: {},
    roles: { architect: { prompt: "architect" } },
    itemTurns: 8,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: { architect: { harness: "fake", model: "fake-architect" } },
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
    const runtime = runtimeFor(new FakeHarness({ id: "fake" }), root);
    await runtime.store.ensureLayout();
    const fake = new FakeHarness({ id: "fake" });
    runtime.harnesses.set("fake", fake);
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
});
