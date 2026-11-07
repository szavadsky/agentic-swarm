import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, StepMetaArtifact } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";

describe("Engine: Crash / Restart resilience (§6.3, §12.2)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("repairs interrupted record (started w/o final meta -> interrupted) and next attempt does not count until maxInterruptions", async () => {
    const task = "crash-step";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Simple crash recovery test\n", "utf8");
    tmpRepo.commit("Add intent");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot,
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
        infra: { role: "workhorse" },
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxInterruptions: 3,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    // Create the task worktree topic/crash-step and pre-populate an interrupted record
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createBranch(`topic/${task}`);
    tmpRepo.createWorktree(`topic/${task}`, taskWtPath);

    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    fs.mkdirSync(deployedTaskDir, { recursive: true });
    fs.copyFileSync(path.join(taskDir, "INTENT.md"), path.join(deployedTaskDir, "INTENT.md"));

    const runsDir = path.join(deployedTaskDir, "runs");
    const crashedRecordDir = path.join(runsDir, "001-triage-a1");
    fs.mkdirSync(crashedRecordDir, { recursive: true });
    fs.writeFileSync(path.join(crashedRecordDir, "input.md"), "Interrupted prompt\n");

    const startedMeta: StepMetaArtifact = {
      seq: 1,
      name: "triage",
      attempt: 1,
      agent: "triage",
      role: "workhorse",
      models: ["deepseek-chat"],
      status: "started",
      startedAt: new Date(Date.now() - 10000).toISOString(),
    };
    fs.writeFileSync(path.join(crashedRecordDir, "meta.yaml"), JSON.stringify(startedMeta, null, 2));

    // Invariant 1: Started record is committed before launch
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: triage a1 [started]"], { cwd: taskWtPath });
    const harness = new FakeHarness();
    // After start-up repair marks record interrupted, triage re-runs attempt 1!
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Simple task",
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

    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "simple.txt"), "done\n");
      return { ok: true, data: { status: "ok", summary: "Simple done" } };
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

    expect(result.status).toBe("done");

    // Verify the crashed record was marked interrupted
    const repairedMeta = await readYaml<StepMetaArtifact>(path.join(crashedRecordDir, "meta.yaml"));
    expect(repairedMeta.status).toBe("interrupted");

    // Verify work is present on the task branch
    expect(fs.existsSync(path.join(taskWtPath, "simple.txt"))).toBe(true);
  });

  it("restart between commit points reaches the exact same final state", async () => {
    const task = "crash-commit-points";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Idempotent commit restart\n", "utf8");
    tmpRepo.commit("Add intent");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot,
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
        infra: { role: "workhorse" },
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxInterruptions: 3,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Simple task",
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

    // Injected crash on first run during simple-implement: throw error simulating process death
    let crashedOnce = false;
    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      if (!crashedOnce) {
        crashedOnce = true;
        throw new Error("Simulated process crash between commit points");
      }
      fs.writeFileSync(path.join(run.cwd, "result.txt"), "completed\n");
      return { ok: true, data: { status: "ok", summary: "Implementation completed" } };
    });

    // Run 1: Crash occurs during turn
    try {
      await runTask(
        {
          harness,
          repo: repoObj,
          project,
          pipelineFor: async () => pipeline,
          prompts,
        },
        task
      );
    } catch (err: any) {
      expect(err.message).toContain("Simulated process crash");
    }

    // Run 2: Restart after crash resumes, repairs interrupted record, and completes cleanly
    const res2 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );

    expect(res2.status).toBe("done");
    expect(res2.exitCode).toBe(0);

    // Verify result file exists on task branch
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    expect(fs.existsSync(path.join(taskWtPath, "result.txt"))).toBe(true);

    // Run 3: Re-running immediately on completed task returns done without re-executing steps
    const res3 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );

    expect(res3.status).toBe("done");
    expect(res3.exitCode).toBe(0);
  });

  it("crash after triage ok (infra record started, no infra.yaml) -> rerun runs infra once, triage not re-run, architect prompt gets infra content", async () => {
    const task = "crash-infra-restart";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Story task recovering from infra crash\n", "utf8");
    tmpRepo.commit("Add intent");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot,
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
        "wave-close-up": { role: "alt-workhorse" },
        "plan-close-up": { role: "alt-workhorse" },
      },
      flows: {
        story: {
          dev: {
            steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
          },
        },
        simple: { steps: [] },
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxInterruptions: 3,
        maxPlanReviewRounds: 1,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    // Create task worktree
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createBranch(`topic/${task}`);
    tmpRepo.createWorktree(`topic/${task}`, taskWtPath);

    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    fs.mkdirSync(deployedTaskDir, { recursive: true });
    fs.copyFileSync(path.join(taskDir, "INTENT.md"), path.join(deployedTaskDir, "INTENT.md"));

    // 1. Triage completed and committed with ok record
    fs.writeFileSync(
      path.join(deployedTaskDir, "triage.yaml"),
      JSON.stringify({ kind: "story", rationale: "Story task", citations: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "context.yaml"),
      JSON.stringify({ citations: [] }, null, 2)
    );
    const runsDir = path.join(deployedTaskDir, "runs");
    const triageRecDir = path.join(runsDir, "001-triage-a1");
    fs.mkdirSync(triageRecDir, { recursive: true });
    fs.writeFileSync(path.join(triageRecDir, "input.md"), "Triage prompt\n");
    fs.writeFileSync(
      path.join(triageRecDir, "meta.yaml"),
      JSON.stringify(
        {
          seq: 1,
          name: "triage",
          attempt: 1,
          agent: "triage",
          role: "workhorse",
          models: ["deepseek-chat"],
          status: "ok",
          startedAt: new Date(Date.now() - 20000).toISOString(),
          endedAt: new Date(Date.now() - 10000).toISOString(),
        },
        null,
        2
      )
    );
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: triage a1 [ok]"], { cwd: taskWtPath });

    // 2. Infra record started, but process crashed: no infra.yaml exists
    const infraRecDir = path.join(runsDir, "002-infra-a1");
    fs.mkdirSync(infraRecDir, { recursive: true });
    fs.writeFileSync(path.join(infraRecDir, "input.md"), "Infra prompt\n");
    fs.writeFileSync(
      path.join(infraRecDir, "meta.yaml"),
      JSON.stringify(
        {
          seq: 2,
          name: "infra",
          attempt: 1,
          agent: "infra",
          role: "workhorse",
          models: ["deepseek-chat"],
          status: "started",
          startedAt: new Date(Date.now() - 5000).toISOString(),
        },
        null,
        2
      )
    );
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: infra a1 [started]"], { cwd: taskWtPath });

    // Assert initial crash condition: infra.yaml is absent
    expect(fs.existsSync(path.join(deployedTaskDir, "infra.yaml"))).toBe(false);

    const harness = new FakeHarness();
    // NOTE: Triage outcome is intentionally NOT scripted. If triage re-runs, FakeHarness throws!
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: ["npm install unique-infra-tool"],
        gates: [{ id: "infra-special-gate", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    let architectPromptCaptured = "";
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
      architectPromptCaptured = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [{ slug: "i1", kind: "dev", title: "Item 1", milestoneId: "m1" }],
        },
      };
    });

    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: "i1", outlineRef: "i1", kind: "dev", title: "Item 1", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/i1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "done.txt"), "ok\n");
      return { ok: true, data: { status: "ok", summary: "Done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["i1"], summary: "Wave 1 complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Complete" },
    });

    // Rerun after crash
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

    expect(result.status).toBe("done");

    // 1. Triage was NOT re-run; FakeHarness call labels prove it
    const callLabels = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run.label);
    expect(callLabels.some((l) => l.includes("/runs/triage#"))).toBe(false);
    // 2. Infra ran exactly once
    const infraCalls = callLabels.filter((l) => l.includes("/runs/infra#"));
    expect(infraCalls.length).toBe(1);

    // 3. Architect prompt contains the infra content
    expect(architectPromptCaptured).toContain("infra-special-gate");
    expect(architectPromptCaptured).toContain("unique-infra-tool");
  });
});
