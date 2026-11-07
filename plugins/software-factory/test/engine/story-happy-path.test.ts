import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { readYaml } from "../../src/core/records/io.js";

describe("Engine: Story happy path", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("drives a full story to done exit 0 through plan, edits, wave, item steps, merge, and closeups", async () => {
    const task = "story-happy";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Implement hello world feature\n", "utf8");
    tmpRepo.commit("Add intent for story-happy");

    const harness = new FakeHarness();

    // Script FakeHarness outcomes by label
    // Ingest: triage -> story
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "story",
        rationale: "Requires multiple steps",
        citations: [],
      },
    });

    // Ingest: infra
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    // Iteration 1: Architect plan
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] }],
        itemOutlines: [
          { slug: "item-1", kind: "dev", title: "Item 1 feature", milestoneId: "m1", deps: [] },
        ],
      },
    });

    // Iteration 1: Plan reviewer -> approved
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: {
        status: "approved",
        summary: "Plan looks great",
        suggestions: [],
      },
    });

    // Iteration 1: PM edits with outlineRef matching plan
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "item-1",
            outlineRef: "item-1",
            kind: "dev",
            title: "Item 1 feature",
            assignment: "Write item 1 feature",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });

    // Wave 1: item-1 test-first
    harness.scriptOutcome(`${task}/items/item-1/test-first#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "feature.test.ts"), "// tests\n");
      return { ok: true, data: { status: "ok", summary: "Tests created" } };
    });

    // Wave 1: item-1 develop
    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "feature.ts"), "export const hello = () => 'world';\n");
      return { ok: true, data: { status: "ok", summary: "Feature implemented" } };
    });

    // Wave 1: item-1 qa -> approved
    harness.scriptOutcome(`${task}/items/item-1/qa#a1`, {
      ok: true,
      data: { status: "approved", summary: "QA pass", suggestions: [] },
    });

    // Wave 1: item-1 review -> approved
    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Review pass", suggestions: [] },
    });

    // Wave 1: wave-close-up
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave 1 complete" },
    });

    // Wave 1: architect-wave-report -> continue
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-wave-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });

    // Plan close-up
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All milestones satisfied" },
    });

    // Architect close-up
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        status: "complete",
        summary: "Plan close-up complete",
      },
    });

    // Real Repo with worktreeRoot outside main checkout
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
          "task-reviewer": { model: "deepseek-chat" },
          "wave-close-up": { model: "deepseek-chat" },
          "plan-close-up": { model: "deepseek-chat" },
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
        qa: { role: "task-reviewer" },
        reviewer: { role: "task-reviewer" },
        "wave-close-up": { role: "wave-close-up" },
        "plan-close-up": { role: "plan-close-up" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", role: "workhorse" },
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "qa", agent: "qa", role: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxParallelItems: 2,
        maxParallelTurns: 4,
        maxStepAttempts: 3,
        maxFixRounds: 3,
        maxPlanReviewRounds: 3,
        maxIterations: 3,
      },
    };

    // Real prompt library
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
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
    expect(result.exitCode).toBe(0);

    // Verify observable outcomes on the task worktree and branch
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    expect(fs.existsSync(taskWtPath)).toBe(true);

    // Feature code and test files exist on task branch
    expect(fs.existsSync(path.join(taskWtPath, "feature.ts"))).toBe(true);
    expect(fs.readFileSync(path.join(taskWtPath, "feature.ts"), "utf8")).toContain("world");
    expect(fs.existsSync(path.join(taskWtPath, "feature.test.ts"))).toBe(true);

    // Canonical artifacts exist and validate
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    expect(fs.existsSync(path.join(deployedTaskDir, "triage.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "infra.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "plan-1.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.0.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "closeup-1.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "state.yaml"))).toBe(true);

    // Verify task state derived from disk and git
    const state = await deriveTaskState({
      taskDir: deployedTaskDir,
      task,
      taskWt: taskWtPath,
      pipeline,
    });

    expect(state.status).toBe("done");
    expect(state.items.find((i) => i.slug === "item-1")?.status).toBe("merged");

    // Verify git log includes merge commit
    const logRes = tmpRepo.git(["log", "--oneline", `topic/${task}`]);
    expect(logRes.stdout).toContain("factory: merge item item-1");

    // Rerun on the completed task: still done, no waves re-run, no new turns
    const callsBefore = harness.calls.length;
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
    expect(harness.calls.length).toBe(callsBefore);
  });
});
