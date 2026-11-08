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

  it("crash after plan-review ok and during architect-revise -> restart runs revise (resumed) without re-running the review", async () => {
    const task = "crash-plan-rev";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Story task recovering from revise crash\n", "utf8");
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
        maxPlanReviewRounds: 2,
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
    const triageMeta: StepMetaArtifact = {
      seq: 1,
      name: "triage",
      attempt: 1,
      agent: "triage",
      role: "workhorse",
      models: ["deepseek-chat"],
      status: "ok",
      startedAt: new Date(Date.now() - 20000).toISOString(),
      endedAt: new Date(Date.now() - 19000).toISOString(),
    };
    fs.writeFileSync(path.join(triageRecDir, "meta.yaml"), JSON.stringify(triageMeta, null, 2));

    // 2. Infra completed and committed with ok record
    fs.writeFileSync(
      path.join(deployedTaskDir, "infra.yaml"),
      JSON.stringify({ setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true", selectorArgs: [], junitArg: "" } }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "gates-baseline.yaml"),
      JSON.stringify({ status: "green", results: [] }, null, 2)
    );
    const infraRecDir = path.join(runsDir, "002-infra-a1");
    fs.mkdirSync(infraRecDir, { recursive: true });
    fs.writeFileSync(path.join(infraRecDir, "input.md"), "Infra prompt\n");
    const infraMeta: StepMetaArtifact = {
      seq: 2,
      name: "infra",
      attempt: 1,
      agent: "infra",
      role: "workhorse",
      models: ["deepseek-chat"],
      status: "ok",
      startedAt: new Date(Date.now() - 18000).toISOString(),
      endedAt: new Date(Date.now() - 17000).toISOString(),
    };
    fs.writeFileSync(path.join(infraRecDir, "meta.yaml"), JSON.stringify(infraMeta, null, 2));

    // 3. Architect plan completed and committed with ok record
    const planDir = path.join(deployedTaskDir, "plan");
    fs.mkdirSync(planDir, { recursive: true });
    const initialPlan = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "i1", kind: "dev", title: "Item 1 Initial", milestoneId: "m1" }],
    };
    fs.writeFileSync(path.join(planDir, "plan-1.yaml"), JSON.stringify(initialPlan, null, 2));
    const planRecDir = path.join(runsDir, "003-architect-plan-1-a1");
    fs.mkdirSync(planRecDir, { recursive: true });
    fs.writeFileSync(path.join(planRecDir, "input.md"), "Plan prompt\n");
    fs.writeFileSync(path.join(planRecDir, "output.yaml"), JSON.stringify(initialPlan, null, 2));
    const planMeta: StepMetaArtifact = {
      seq: 3,
      name: "architect-plan-1",
      attempt: 1,
      agent: "architect",
      role: "architect",
      models: ["deepseek-reasoner"],
      status: "ok",
      startedAt: new Date(Date.now() - 16000).toISOString(),
      endedAt: new Date(Date.now() - 15000).toISOString(),
    };
    fs.writeFileSync(path.join(planRecDir, "meta.yaml"), JSON.stringify(planMeta, null, 2));

    // 4. Plan review 1-1 completed and committed with ok record (requesting fixes)
    const reviewRecDir = path.join(runsDir, "004-plan-review-1-1-a1");
    fs.mkdirSync(reviewRecDir, { recursive: true });
    fs.writeFileSync(path.join(reviewRecDir, "input.md"), "Review prompt\n");
    const reviewOutput = {
      status: "needs_fix",
      summary: "Please revise plan",
      suggestions: [
        {
          id: "s1",
          disposition: "fix",
          detail: "Specific fix: rename Item 1 to Item 1 Revised",
        },
      ],
    };
    fs.writeFileSync(path.join(reviewRecDir, "output.yaml"), JSON.stringify(reviewOutput, null, 2));
    const reviewMeta: StepMetaArtifact = {
      seq: 4,
      name: "plan-review-1-1",
      attempt: 1,
      agent: "plan-reviewer",
      role: "alt-architect",
      models: ["deepseek-reasoner"],
      status: "ok",
      startedAt: new Date(Date.now() - 14000).toISOString(),
      endedAt: new Date(Date.now() - 13000).toISOString(),
    };
    fs.writeFileSync(path.join(reviewRecDir, "meta.yaml"), JSON.stringify(reviewMeta, null, 2));

    // Commit triage, infra, plan, and review
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: plan-review-1-1 a1 [ok]"], { cwd: taskWtPath });

    // 5. Architect revise 1-1 was started and interrupted by crash
    const reviseRecDir = path.join(runsDir, "005-architect-revise-1-1-a1");
    fs.mkdirSync(reviseRecDir, { recursive: true });
    fs.writeFileSync(path.join(reviseRecDir, "input.md"), "Revise prompt\n");
    const reviseMeta: StepMetaArtifact = {
      seq: 5,
      name: "architect-revise-1-1",
      attempt: 1,
      agent: "architect",
      role: "architect",
      models: ["deepseek-reasoner"],
      status: "started",
      session: "session-arch-prev",
      startedAt: new Date(Date.now() - 12000).toISOString(),
    };
    fs.writeFileSync(path.join(reviseRecDir, "meta.yaml"), JSON.stringify(reviseMeta, null, 2));
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: architect-revise-1-1 a1 [started]"], { cwd: taskWtPath });

    const harness = new FakeHarness();
    harness.knownSessionIds.add("session-arch-prev");
    // plan-review-1-1 is intentionally NOT scripted: if it re-runs, FakeHarness throws!

    let capturedRevisePrompt = "";
    harness.scriptOutcome(`${task}/runs/architect-revise-1-1#a1`, (run) => {
      capturedRevisePrompt = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [{ slug: "i1", kind: "dev", title: "Item 1 Revised", milestoneId: "m1" }],
        },
      };
    });

    harness.scriptOutcome(`${task}/runs/plan-review-1-2#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });

    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: "i1", outlineRef: "i1", kind: "dev", title: "Item 1 Revised", assignment: "Work", milestone: "m1", wave: 1 },
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

    const callLabels = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run.label);
    // plan-review-1-1 was NOT re-run
    expect(callLabels.some((l) => l.includes("/runs/plan-review-1-1#"))).toBe(false);
    // architect-revise-1-1 ran as attempt 1 (resumed)
    expect(callLabels.some((l) => l.includes("/runs/architect-revise-1-1#a1"))).toBe(true);
    // plan-review-1-2 ran
    expect(callLabels.some((l) => l.includes("/runs/plan-review-1-2#a1"))).toBe(true);
    // Revise was resumed with INTERRUPTED_RESUME_PROMPT
    expect(capturedRevisePrompt).toBe("you were interrupted; continue and yield");
  });

  it("attempts increment on a rejected orchestration step", async () => {
    const task = "rejected-orch-step";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Task testing attempt increment on rejected orchestration step\n", "utf8");
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

    // Pre-populate triage, infra, plan
    fs.writeFileSync(
      path.join(deployedTaskDir, "triage.yaml"),
      JSON.stringify({ kind: "story", rationale: "Story task", citations: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "context.yaml"),
      JSON.stringify({ citations: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "infra.yaml"),
      JSON.stringify({ setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true", selectorArgs: [], junitArg: "" } }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "gates-baseline.yaml"),
      JSON.stringify({ status: "green", results: [] }, null, 2)
    );

    const runsDir = path.join(deployedTaskDir, "runs");
    fs.mkdirSync(path.join(runsDir, "001-triage-a1"), { recursive: true });
    fs.writeFileSync(path.join(runsDir, "001-triage-a1", "meta.yaml"), JSON.stringify({ seq: 1, name: "triage", attempt: 1, status: "ok" }, null, 2));

    fs.mkdirSync(path.join(runsDir, "002-infra-a1"), { recursive: true });
    fs.writeFileSync(path.join(runsDir, "002-infra-a1", "meta.yaml"), JSON.stringify({ seq: 2, name: "infra", attempt: 1, status: "ok" }, null, 2));

    const planDir = path.join(deployedTaskDir, "plan");
    fs.mkdirSync(planDir, { recursive: true });
    const plan = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "i1", kind: "dev", title: "Item 1", milestoneId: "m1" }],
    };
    fs.writeFileSync(path.join(planDir, "plan-1.yaml"), JSON.stringify(plan, null, 2));
    fs.mkdirSync(path.join(runsDir, "003-architect-plan-1-a1"), { recursive: true });
    fs.writeFileSync(path.join(runsDir, "003-architect-plan-1-a1", "output.yaml"), JSON.stringify(plan, null, 2));
    fs.writeFileSync(path.join(runsDir, "003-architect-plan-1-a1", "meta.yaml"), JSON.stringify({ seq: 3, name: "architect-plan-1", attempt: 1, status: "ok" }, null, 2));

    // Pre-populate a REJECTED attempt 1 for plan-review-1-1
    const rejectedReviewDir = path.join(runsDir, "004-plan-review-1-1-a1");
    fs.mkdirSync(rejectedReviewDir, { recursive: true });
    fs.writeFileSync(path.join(rejectedReviewDir, "input.md"), "Review prompt attempt 1\n");
    const rejectedMeta: StepMetaArtifact = {
      seq: 4,
      name: "plan-review-1-1",
      attempt: 1,
      agent: "plan-reviewer",
      role: "alt-architect",
      models: ["deepseek-reasoner"],
      status: "rejected",
      error: "Malformed reviewer output",
      startedAt: new Date(Date.now() - 10000).toISOString(),
      endedAt: new Date(Date.now() - 9000).toISOString(),
    };
    fs.writeFileSync(path.join(rejectedReviewDir, "meta.yaml"), JSON.stringify(rejectedMeta, null, 2));

    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "factory: plan-review-1-1 a1 [rejected]"], { cwd: taskWtPath });

    const harness = new FakeHarness();
    // Script plan-review-1-1#a2 (NOT #a1 - if #a1 is called, FakeHarness throws)
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a2`, {
      ok: true,
      data: { status: "approved", summary: "Looks good on attempt 2", suggestions: [] },
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

    const callLabels = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run.label);
    // Did NOT run attempt 1
    expect(callLabels.some((l) => l.includes("/runs/plan-review-1-1#a1"))).toBe(false);
    // Increment to attempt 2 ran!
    expect(callLabels.some((l) => l.includes("/runs/plan-review-1-1#a2"))).toBe(true);

    // Verify record directory created on disk has a2
    const entries = fs.readdirSync(runsDir);
    const a2Record = entries.find((e) => e.includes("plan-review-1-1-a2"));
    expect(a2Record).toBeDefined();
    const a2Meta = await readYaml<StepMetaArtifact>(path.join(runsDir, a2Record!, "meta.yaml"));
    expect(a2Meta.attempt).toBe(2);
    expect(a2Meta.status).toBe("ok");
  });
});
