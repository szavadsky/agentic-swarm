import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

describe("Engine: No fabricated artifacts on agent failure (§6.4, Finding 4 & 5)", () => {
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
        "plan-close-up": { role: "alt-workhorse" },
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
        maxStepAttempts: 1,
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

  it("triage failure fails the task and never fabricates story kind or triage.yaml", async () => {
    const task = "triage-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Triage failure test\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: false,
      error: "LLM refused to triage",
    });

    try {
      await runTask(
        { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
        task
      );
    } catch (err: any) {
      expect(err.message).toContain("Triage step failed");
    }

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const triagePath = path.join(taskWtPath, ".factory", task, "triage.yaml");
    // Verify triage.yaml was NOT fabricated
    expect(fs.existsSync(triagePath)).toBe(false);
  });

  it("infra failure fails the task and never fabricates mock gates or infra.yaml", async () => {
    const task = "infra-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Infra failure test\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Standard story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: false,
      error: "Infrastructure discovery crashed",
    });

    try {
      await runTask(
        { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
        task
      );
    } catch (err: any) {
      expect(err.message).toContain("Infra step failed");
    }

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const infraPath = path.join(taskWtPath, ".factory", task, "infra.yaml");
    // Verify infra.yaml was NOT fabricated
    expect(fs.existsSync(infraPath)).toBe(false);
  });

  it("architect plan failure never fabricates a synthetic plan", async () => {
    const task = "plan-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Plan failure test\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Standard story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: false,
      error: "Context window exceeded",
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("failed");
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const planPath = path.join(taskWtPath, ".factory", task, "plan", "plan-1.yaml");
    // Verify plan-1.yaml was NOT fabricated
    expect(fs.existsSync(planPath)).toBe(false);
  });

  it("architect close-up failure reports failure and does not mark complete", async () => {
    const task = "closeup-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Closeup failure test\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Standard story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "i1", kind: "dev", title: "I1", milestoneId: "m1" }],
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
        items: [{ slug: "i1", outlineRef: "i1", kind: "dev", title: "I1", assignment: "Work", milestone: "m1", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/i1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Milestones done" },
    });

    // Close-up architect step fails!
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: false,
      error: "Harness timeout in closeup",
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    // Finding 5: Must fail, never report complete
    expect(res.status).toBe("failed");
    expect(res.exitCode).toBe(1);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const closeupPath = path.join(taskWtPath, ".factory", task, "closeup-1.yaml");
    // Verify closeup-1 was NOT written as "complete"
    expect(fs.existsSync(closeupPath)).toBe(false);
  });
});
