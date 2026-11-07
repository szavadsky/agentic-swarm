import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { deriveItemState } from "../../src/core/derive/item.js";

describe("Engine: Epic child task runs on the parent branch (§8.6, Finding 7)", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let pipeline: PipelineConfig;
  let prompts: any;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });
    project = {
      orchestrationFolder: ".factory",
      worktreeRoot,
    };
    pipeline = {
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
        "wave-close-up": { role: "wave-close-up" },
        "plan-close-up": { role: "plan-close-up" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
          },
        },
        spike: {},
      },
      limits: {
        maxPlanReviewRounds: 1,
      },
    };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("epic item runs as a child task from the parent tip with INTENT from the parent branch", async () => {
    const task = "epic-parent-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Parent task with an epic\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    const epicSlug = "big-epic";

    // Parent ingest: epic kind
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "epic", rationale: "Large multi-part initiative", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });

    // Parent plan with an epic
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: epicSlug, kind: "epic", title: "Big epic", milestoneId: "m1" }],
        epics: [{ slug: epicSlug, intent: "Epic intent: build the big feature.\n" }],
      },
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
          { slug: epicSlug, outlineRef: epicSlug, kind: "epic", title: "Big epic", assignment: "Run epic", milestone: "m1", wave: 1 },
        ],
      },
    });

    // Child task turns (labels use the child task name parent--epic)
    const childTask = `${task}--${epicSlug}`;
    harness.scriptOutcome(`${childTask}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Child M1" }],
        itemOutlines: [{ slug: "child-item", kind: "dev", title: "Child item", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "child plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${childTask}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: "child-item", outlineRef: "child-item", kind: "dev", title: "Child item", assignment: "Child work", milestone: "m1", wave: 1 },
        ],
      },
    });
    harness.scriptOutcome(`${childTask}/items/child-item/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "epic-feature.ts"), "export const epic = true;\n");
      return { ok: true, data: { status: "ok", summary: "Epic feature done" } };
    });
    harness.scriptOutcome(`${childTask}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["child-item"], summary: "Child wave ok" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child milestones done" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child task delivered" },
    });

    // Parent wave/iteration close-up flow
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: [epicSlug], summary: "Parent wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-p1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Parent milestones done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Parent task delivered" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);

    // Epic INTENT was written by the edits commit on the parent branch
    const epicIntentPath = path.join(deployedTaskDir, epicSlug, "INTENT.md");
    expect(fs.existsSync(epicIntentPath)).toBe(true);

    // Epic child branch exists and was created from the parent tip
    const epicBranch = `topic/${task}--${epicSlug}`;
    const branchCheck = tmpRepo.git(["rev-parse", "--verify", `refs/heads/${epicBranch}`]);
    expect(branchCheck.code).toBe(0);

    // Parent epic item derived as merged; child close-up recorded
    const epicState = await deriveItemState({
      taskDir: deployedTaskDir,
      itemSlug: epicSlug,
      parentBranch: `topic/${task}`,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(epicState.status).toBe("merged");
    expect(fs.existsSync(path.join(deployedTaskDir, "items", epicSlug, "child-closeup.yaml"))).toBe(true);
  }, 60000);
});
