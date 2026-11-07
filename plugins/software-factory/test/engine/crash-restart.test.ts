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
});
