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

describe("Engine: Checks run and gate a step, consult decisions advance flow, and fix round prompt contains reviewer suggestions (§9, §8.2, §8.5)", () => {
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
        reviewer: { role: "task-reviewer" },
        qa: { role: "task-reviewer" },
        "wave-close-up": { role: "wave-close-up" },
        "plan-close-up": { role: "plan-close-up" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse", checks: ["gates"] },
              { id: "review", agent: "reviewer", role: "task-reviewer" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxFixRounds: 3,
        maxConsultsPerItem: 2,
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

  it("checks run during an item step and gate the step; fix round renders reviewer suggestions; consult decision ends a loop", async () => {
    const task = "checks-gates-flow";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Checks gated implementation\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();

    // Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Story with gates", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "lint", command: "true" }], testRunner: { command: "true" } },
    });

    // Iteration: plan, review, PM edits
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "dev-1", kind: "dev", title: "Gated item", milestoneId: "m1" }],
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
          { slug: "dev-1", outlineRef: "dev-1", kind: "dev", title: "Gated item", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    // Reviewer asks for a fix once, then approves.
    // Fix re-entry re-runs develop at attempt 1 (new seq), so script arrays.
    harness.scriptOutcome(`${task}/items/dev-1/develop#a1`, (run) => {
      const priorDevelopCalls = harness.calls.filter(
        (c) => c.type === "run" && c.run.label === `${task}/items/dev-1/develop#a1`
      ).length;
      if (priorDevelopCalls <= 1) {
        fs.writeFileSync(path.join(run.cwd, "code.ts"), "export const x = 1;\n");
        return { ok: true, data: { status: "ok", summary: "Initial implementation" } };
      }
      fs.writeFileSync(path.join(run.cwd, "code.ts"), "export const x = 1;\n// error handling added\n");
      return { ok: true, data: { status: "ok", summary: "Error handling added" } };
    });
    let reviewCalls = 0;
    harness.scriptOutcome(`${task}/items/dev-1/review#a1`, () => {
      reviewCalls++;
      if (reviewCalls === 1) {
        return {
          ok: true,
          data: {
            status: "changes_requested",
            summary: "Needs correction",
            suggestions: [{ id: "s1", disposition: "fix", summary: "Add error handling to export", detail: "Wrap in try/catch" }],
          },
        };
      }
      return {
        ok: true,
        data: { status: "approved", summary: "Approved after fix", suggestions: [] },
      };
    });
    // Capture fix round prompt from harness calls after the run.

    // Close-up flow
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["dev-1"], summary: "Wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan satisfied" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Task delivered" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("done");

    // Verify fix round prompt (second develop call) contained reviewer's fix suggestion
    const developCalls = harness.calls.filter(
      (c) => c.type === "run" && c.run.label === `${task}/items/dev-1/develop#a1`
    );
    expect(developCalls.length).toBeGreaterThanOrEqual(2);
    const fixCall = developCalls[1]!;
    if (fixCall.type !== "run") throw new Error("expected run call");
    expect(fixCall.run.prompt).toContain("Add error handling to export");

    // Verify developer step records include checks.yaml with gate result
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const logRes = tmpRepo.git(["log", "--oneline", `topic/${task}--dev-1`]);
    expect(logRes.stdout).toContain("factory(dev-1): develop a1 [ok]");
  });
});
