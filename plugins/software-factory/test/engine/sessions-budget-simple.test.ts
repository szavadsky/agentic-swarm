import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { PersistentAgent } from "../../src/core/sessions.js";
import { AsyncMutex, KeyedMutex } from "../../src/core/mutex.js";
import type { PipelineConfig, ProjectConfig, SteerItemArtifact } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";

describe("Engine: Sessions rehydration, budget exceed, and simple-guard fallback (§8.1, §12.4, §12.5)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("handles session resume threading and rehydration on sessionLost (§4, §6.3.7)", async () => {
    const harness = new FakeHarness();

    // Turn 1: Fresh session kept
    harness.scriptOutcome("test-agent#a1", {
      ok: true,
      sessionId: "sess-abc-123",
      data: { answer: 1 },
    });

    // Turn 2: Resumed session succeeds
    harness.scriptOutcome("test-agent#a2", {
      ok: true,
      sessionId: "sess-abc-123",
      data: { answer: 2 },
    });

    const agent = new PersistentAgent({
      harness,
      labelBase: "test-agent#a1",
      agent: "architect",
      role: "architect",
      models: ["deepseek-reasoner"],
      definition: "You are architect",
      tools: [],
      cwd: tmpRepo.dir,
      defaultOutputSchema: {},
    });

    const out1 = await agent.turn("Prompt 1");
    expect(out1.ok).toBe(true);
    expect(agent.sessionId).toBe("sess-abc-123");

    // Invalidate session in harness to simulate session lost
    harness.invalidateSession("sess-abc-123");

    // Script rehydrated turn
    harness.scriptOutcome("test-agent#a1#rehydrated", {
      ok: true,
      sessionId: "sess-xyz-789",
      data: { answer: "rehydrated-ok" },
    });

    let rehydratedCalled = false;
    const out2 = await agent.turn("Prompt 2", undefined, {
      rehydrate: () => {
        rehydratedCalled = true;
        return "HYDRATION: Context and prior decisions";
      },
    });

    expect(out2.ok).toBe(true);
    expect(rehydratedCalled).toBe(true);
    expect(agent.sessionId).toBe("sess-xyz-789");
  });

  it("enforces task budget limit and writes human-stop item exiting with code 10 (§12.5)", async () => {
    const task = "budget-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Budget exceed test\n", "utf8");
    tmpRepo.commit("Add intent");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      budget: {
        perTaskUsd: 10, // $10 limit
      },
      limits: {},
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const harness = new FakeHarness();

    // Triage reports usage of $15 (exceeding $10 budget)
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      usage: { inputTokens: 10000, outputTokens: 5000, costUsd: 15 },
      data: {
        kind: "story",
        rationale: "Requires work",
        citations: [],
      },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    const result = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );

    expect(result.status).toBe("blocked");
    expect(result.exitCode).toBe(10);
    expect(result.summary).toContain("budget exceeded");

    // Verify human-stop question was written to tousertoreview (stable id, committed)
    const taskWtPath = path.join(repoObj.worktreeRoot, `topic_${task}`);
    const touserDir = path.join(taskWtPath, orchFolder, task, "steer", "tousertoreview");
    expect(fs.existsSync(path.join(touserDir, "budget-stop.yaml"))).toBe(true);
    const qFiles = fs.readdirSync(touserDir);
    expect(qFiles.length).toBe(1);

    const qPath = path.join(touserDir, "budget-stop.yaml");
    const q = await readYaml<SteerItemArtifact>(qPath);
    expect(q.disposition).toBe("human-stop");
    expect(q.status).toBe("open");

    // Rerun: idempotent — no duplicate question, still blocked exit 10
    const result2 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );
    expect(result2.status).toBe("blocked");
    expect(result2.exitCode).toBe(10);
    expect(fs.readdirSync(touserDir).length).toBe(1);
  });

  it("handles simple-guard fallback: converts to no-behavior item when prod lines exceed limit (§8.1.4)", async () => {
    const task = "simple-guard-fallback";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Simple guard fallback test\n", "utf8");
    tmpRepo.commit("Add intent");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          "alt-workhorse": { model: "deepseek-chat" },
          architect: { model: "deepseek-reasoner" },
          "alt-architect": { model: "deepseek-reasoner" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        infra: { role: "workhorse" },
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
        developer: { role: "workhorse" },
        qa: { role: "alt-workhorse" },
        reviewer: { role: "alt-workhorse" },
        "wave-close-up": { role: "alt-workhorse" },
        "plan-close-up": { role: "alt-workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          "no-behavior": {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "qa", agent: "qa", role: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        simpleMaxProdLines: 10, // Small limit
      },
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const harness = new FakeHarness();

    // Triage classifies as simple
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "simple", rationale: "Looks like a simple fix", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    // In simple-implement, developer writes 50 lines (exceeding simpleMaxProdLines of 10)
    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      const code = Array.from({ length: 50 }, (_, i) => `console.log(${i});`).join("\n") + "\n";
      fs.writeFileSync(path.join(run.cwd, "huge.ts"), code);
      return { ok: true, data: { status: "ok", summary: "Implementation done" } };
    });

    // Run engine: simple-guard fails -> scratch branch converted to no-behavior item (§8.1.4)
    await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task,
      { maxTicks: 1 }
    );

    // Verify item "simple" was created as a "no-behavior" item!
    const taskWtPath = path.join(repoObj.worktreeRoot, `topic_${task}`);
    const assignmentPath = path.join(taskWtPath, orchFolder, task, "items", "simple", "assignment.yaml");

    expect(fs.existsSync(assignmentPath)).toBe(true);
    const assignment = await readYaml<any>(assignmentPath);
    expect(assignment.slug).toBe("simple");
    expect(assignment.kind).toBe("no-behavior");
  });
});
