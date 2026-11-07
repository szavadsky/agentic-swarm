import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

function makePipeline(): PipelineConfig {
  return {
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
      maxAmendmentsPerIteration: 3,
    },
  };
}

describe("Engine: Wave-report amend + maxIterations (§8.4.6, §12.2)", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let prompts: any;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: ".factory", worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("wave-report amend runs pm-amend, writes plan-N.k, and schedules the new item", async () => {
    const task = "amend-flow-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Amend flow test\n", "utf8");
    tmpRepo.commit("Add intent");

    const pipeline = makePipeline();
    const harness = new FakeHarness();

    // Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Standard story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });

    // Iteration 1: plan with two outlines (second added via amend)
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [
          { slug: "first-1", kind: "dev", title: "First", milestoneId: "m1" },
          { slug: "added-1", kind: "dev", title: "Added", milestoneId: "m1" },
        ],
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
          { slug: "first-1", outlineRef: "first-1", kind: "dev", title: "First", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });

    // Wave 1: first item completes
    harness.scriptOutcome(`${task}/items/first-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "first.ts"), "export const first = 1;\n");
      return { ok: true, data: { status: "ok", summary: "First done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["first-1"], summary: "Wave 1 ok" },
    });

    // Wave report decides AMEND with a plan delta
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        rationale: "Need an extra hardening item",
        timestamp: new Date().toISOString(),
      },
    });

    // PM amend produces the new item
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "added-1", outlineRef: "added-1", kind: "dev", title: "Added", assignment: "Harden", milestone: "m1", wave: 2 },
        ],
      },
    });

    // Wave 2 (from amendment): added item completes
    harness.scriptOutcome(`${task}/items/added-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "added.ts"), "export const added = 1;\n");
      return { ok: true, data: { status: "ok", summary: "Added done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["added-1"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-cont", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });

    // Close-up
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Delivered" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);

    // Amendment artifacts exist
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "plan-1.1.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.1.yaml"))).toBe(true);

    // Both items' code landed on the task branch
    expect(fs.existsSync(path.join(taskWtPath, "first.ts"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "added.ts"))).toBe(true);
  });

  it("maxIterations caps iterations: next-iteration beyond the cap blocks", async () => {
    const task = "max-iter-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Max iterations test\n", "utf8");
    tmpRepo.commit("Add intent");

    const pipeline = makePipeline();
    pipeline.limits.maxIterations = 1;
    const harness = new FakeHarness();

    // Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Standard story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });

    // Iteration 1 ends with next-iteration
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "it-1", kind: "dev", title: "It", milestoneId: "m1" }],
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
          { slug: "it-1", outlineRef: "it-1", kind: "dev", title: "It", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/it-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["it-1"], summary: "Wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Partial" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "next-iteration", summary: "More work remains" },
    });

    // Run 1: iteration 1 completes with next-iteration → runTask loops to iteration 2,
    // which exceeds maxIterations=1 → blocked.
    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);
  });
});
