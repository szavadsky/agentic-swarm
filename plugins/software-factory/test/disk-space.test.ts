import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { runInit } from "../src/cli/init.js";
import { runPreflight } from "../src/cli/preflight.js";
import {
  checkDiskSpace,
  assertDiskSpace,
  setDiskSpaceProbe,
  resetDiskSpaceProbe,
  LowDiskSpaceStopError,
  DEFAULT_MIN_FREE_DISK_MB,
} from "../src/core/disk-space.js";
import { runTask, type EngineDeps } from "../src/core/engine.js";
import { Repo } from "../src/core/git/repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { readJournal } from "../src/core/journal.js";
import { readYaml } from "../src/core/records/io.js";
import type { SteerItemArtifact, PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";
import { runGates } from "../src/core/checks/gates.js";
import type { CheckContext } from "../src/core/checks/types.js";
import { runAgentStep } from "../src/core/flows/step-runner.js";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");

describe("Disk-space guards (§limits.minFreeDiskMb)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    resetDiskSpaceProbe();
  });

  afterEach(() => {
    resetDiskSpaceProbe();
    tmpRepo.cleanup();
  });

  it("checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir", async () => {
    const probe = (targetPath: string) => {
      if (targetPath.includes(".factory-runtime/tmp")) return 500; // low
      return 5000;
    };

    const res = await checkDiskSpace({
      repoRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, "wt"),
      minFreeDiskMb: 2048,
      probe,
    });

    expect(res.ok).toBe(false);
    expect(res.minFreeDiskMb).toBe(2048);
    expect(res.failingPaths.length).toBe(1);
    expect(res.failingPaths[0]!.name).toBe(".factory-runtime/tmp");
    expect(res.failingPaths[0]!.freeMb).toBe(500);

    // All monitored paths are present in res.paths
    const names = res.paths.map((p) => p.name);
    expect(names).toContain("worktreeRoot");
    expect(names).toContain(".factory-runtime/tmp");
    expect(names).toContain("repoRoot");
    expect(names).toContain("tmpdir");
  });

  it("preflight passes when free disk space is above threshold", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "disk-pass-task";
    const taskDir = path.join(tmpRepo.dir, ".factory/tasks", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Intent\nTest goal.", "utf8");

    const healthyProbe = () => 10000;
    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: healthyProbe,
    });

    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("preflight fails when free space is below limits.minFreeDiskMb and reports each path with free MB", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "disk-fail-task";
    const taskDir = path.join(tmpRepo.dir, ".factory/tasks", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Intent\nTest goal.", "utf8");

    // Probe returns low free space on /tmp or system temp dir
    const failingProbe = (targetPath: string) => {
      const resolvedSysTmp = path.resolve(os.tmpdir());
      if (path.resolve(targetPath) === resolvedSysTmp || targetPath === "/tmp") {
        return 512; // 512 MB < 2048 MB default
      }
      return 10000;
    };

    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: failingProbe,
    });

    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    const diskError = res.errors.find((e) => e.includes("Insufficient disk space"));
    expect(diskError).toBeDefined();
    // Must report each path with free MB
    expect(diskError).toContain("512 MB free");
    expect(diskError).toContain("10000 MB free");
    expect(diskError).toContain("threshold: 2048 MB");
  });

  it("preflight respects custom limits.minFreeDiskMb from pipeline config", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "custom-disk-task";
    const taskDir = path.join(tmpRepo.dir, ".factory/tasks", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Intent\nTest goal.", "utf8");

    // Project pipeline overrides minFreeDiskMb to 500
    const projectPipelineDir = path.join(tmpRepo.dir, ".factory");
    fs.mkdirSync(projectPipelineDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectPipelineDir, "pipeline.yaml"),
      "limits:\n  minFreeDiskMb: 500\n",
      "utf8"
    );
    tmpRepo.commit("add project pipeline", [".factory/pipeline.yaml"]);

    // 800 MB free: passes with threshold 500 MB, but would fail with default 2048 MB
    const probe = () => 800;
    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: probe,
    });

    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("engine runTask checks disk space and stops cleanly (exit 10, journal, tousertoreview)", async () => {
    const task = "engine-disk-stop-task";
    const orchFolder = ".factory/tasks";
    const wtRoot = path.join(tmpRepo.dir, "worktrees");
    fs.mkdirSync(wtRoot, { recursive: true });

    const taskDirInMain = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDirInMain, { recursive: true });
    fs.writeFileSync(path.join(taskDirInMain, "INTENT.md"), "# Intent\nBuild thing.", "utf8");

    const repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: wtRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "claude-haiku" },
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
        minFreeDiskMb: 2048,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../plugins/software-factory/agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // Inject probe that reports low disk space on worktreeRoot
    const lowDiskProbe = (targetPath: string) => {
      if (targetPath.includes("worktrees")) {
        return 1024; // 1024 MB < 2048 MB
      }
      return 8000;
    };

    const deps: EngineDeps = {
      harness,
      repo,
      project,
      pipelineFor: async () => pipeline,
      prompts,
      diskSpaceProbe: lowDiskProbe,
    };

    const runRes = await runTask(deps, task);

    // Below threshold -> stop cleanly (exit 10, status blocked)
    expect(runRes.exitCode).toBe(10);
    expect(runRes.status).toBe("blocked");
    expect(runRes.summary).toContain("Low disk space");

    // The task worktree directory
    const taskWtDir = path.join(wtRoot, `topic_${task}`, orchFolder, task);

    // Verified: journal contains low_disk_space
    const journalEntries = await readJournal(taskWtDir);
    const lowDiskEvent = journalEntries.find((e) => e.type === "low_disk_space");
    expect(lowDiskEvent).toBeDefined();
    expect(lowDiskEvent?.minFreeDiskMb).toBe(2048);

    // Verified: stable-id tousertoreview item exists
    const qPath = path.join(taskWtDir, "steer", "tousertoreview", "low-disk-space.yaml");
    expect(fs.existsSync(qPath)).toBe(true);

    const questionItem = await readYaml<SteerItemArtifact>(qPath);
    expect(questionItem.id).toBe("low-disk-space");
    expect(questionItem.disposition).toBe("human-stop");
    expect(questionItem.status).toBe("open");
    expect(questionItem.question).toContain("Low disk space detected");
  });

  it("runGates checks disk space and throws LowDiskSpaceStopError below threshold", async () => {
    const wtRoot = path.join(tmpRepo.dir, "wt-gates");
    fs.mkdirSync(wtRoot, { recursive: true });
    const repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });

    const taskDir = path.join(wtRoot, ".factory/tasks", "gate-disk-task");
    fs.mkdirSync(taskDir, { recursive: true });

    const ctx: CheckContext = {
      repo,
      wt: tmpRepo.dir,
      base: "HEAD",
      project: { orchestrationFolder: ".factory/tasks", worktreeRoot: wtRoot },
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: { minFreeDiskMb: 2048, gateRetries: 1 },
      },
      infra: {
        setup: [],
        gates: [{ id: "lint", command: "true" }],
        testRunner: { command: "true" },
      },
      limits: { minFreeDiskMb: 2048, gateRetries: 1 },
      outputBytes: 4000,
      task: "gate-disk-task",
      taskDir,
      taskWt: wtRoot,
    };

    setDiskSpaceProbe(() => 200); // 200 MB < 2048 MB

    expect(runGates(ctx)).rejects.toThrow(LowDiskSpaceStopError);

    try {
      await runGates(ctx);
    } catch (err: any) {
      expect(err).toBeInstanceOf(LowDiskSpaceStopError);
      expect(err.code).toBe("LOW_DISK_SPACE");
    }

    // Verify journal and tousertoreview were written
    const journalEntries = await readJournal(taskDir);
    expect(journalEntries.some((e) => e.type === "low_disk_space")).toBe(true);

    const qPath = path.join(taskDir, "steer", "tousertoreview", "low-disk-space.yaml");
    expect(fs.existsSync(qPath)).toBe(true);
  });

  it("runAgentStep checks disk space and halts before executing harness turn", async () => {
    const wtRoot = path.join(tmpRepo.dir, "wt-step");
    fs.mkdirSync(wtRoot, { recursive: true });
    const repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });

    const taskDir = path.join(wtRoot, ".factory/tasks", "step-disk-task");
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    let harnessTurnInvoked = false;
    harness.scriptOutcome("step-disk-task/runs/developer#a1", () => {
      harnessTurnInvoked = true;
      return { ok: true, data: { status: "ok" } };
    });

    setDiskSpaceProbe(() => 100); // 100 MB < 2048 MB

    const pipeline: PipelineConfig = {
      models: { roles: { workhorse: { model: "m" } } },
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [{ id: "developer", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
      limits: { minFreeDiskMb: 2048 },
    };

    expect(
      runAgentStep({
        task: "step-disk-task",
        stepId: "developer",
        agent: "developer",
        cwd: tmpRepo.dir,
        taskDir,
        recordsDir,
        taskWt: wtRoot,
        repo,
        harness,
        pipeline,
        project: { orchestrationFolder: ".factory/tasks", worktreeRoot: wtRoot },
        prompts: {},
        promptVars: {},
      })
    ).rejects.toThrow(LowDiskSpaceStopError);

    // Harness was NEVER invoked because disk guard stopped execution before step run!
    expect(harnessTurnInvoked).toBe(false);

    // Verify journal and tousertoreview written
    const journalEntries = await readJournal(taskDir);
    expect(journalEntries.some((e) => e.type === "low_disk_space")).toBe(true);

    const qPath = path.join(taskDir, "steer", "tousertoreview", "low-disk-space.yaml");
    expect(fs.existsSync(qPath)).toBe(true);
  });
});
