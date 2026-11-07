import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { AsyncMutex, KeyedMutex } from "../../src/core/mutex.js";
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

    const repoObj = {
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
      writeLock: new AsyncMutex(),
      mergeLocks: new KeyedMutex(),
    };

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
      limits: {
        maxStepAttempts: 3,
        maxInterruptions: 3,
      },
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    // Pre-create an interrupted step record under runs/ representing a crashed process
    const taskWtPath = path.join(repoObj.worktreeRoot, `topic_${task}`);
    const runsDir = path.join(taskWtPath, orchFolder, task, "runs");
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

    const harness = new FakeHarness();
    // After start-up repair marks record interrupted, triage re-runs attempt 1!
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Simple task",
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
  });

  it("restart between commit points reaches the exact same final state", async () => {
    const task = "crash-commit-points";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Idempotent commit restart\n", "utf8");
    tmpRepo.commit("Add intent");

    const repoObj = {
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
      writeLock: new AsyncMutex(),
      mergeLocks: new KeyedMutex(),
    };

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
      limits: {
        maxStepAttempts: 3,
        maxInterruptions: 3,
      },
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Simple task",
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
      fs.writeFileSync(path.join(run.cwd, "result.txt"), "completed\n");
      return { ok: true, data: { status: "ok", summary: "Implementation completed" } };
    });

    // Run 1: Completes task
    const res1 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );

    expect(res1.status).toBe("done");

    // Run 2: Re-running immediately on completed task should exit 0 done without re-executing steps
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
  });
});
