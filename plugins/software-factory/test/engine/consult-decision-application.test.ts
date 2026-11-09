import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { AgentOutcome } from "../../src/harness/types.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { deriveItemState } from "../../src/core/derive/item.js";

describe("Engine: Consult decision application ends loops (§8.5, Finding 10)", () => {
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
        "wave-close-up": { role: "wave-close-up" },
        "plan-close-up": { role: "plan-close-up" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "review", agent: "reviewer", role: "task-reviewer" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxStepAttempts: 2,
        maxFixRounds: 3,
        maxConsultsPerItem: 3,
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

  it("retry-with-guidance consult resets the attempt series and the item completes", async () => {
    const task = "consult-retry-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Consult retry test\n", "utf8");
    tmpRepo.commit("Add intent");

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
    // Iteration
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "retry-1", kind: "dev", title: "Retry item", milestoneId: "m1" }],
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
          { slug: "retry-1", outlineRef: "retry-1", kind: "dev", title: "Retry item", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });

    // Develop fails twice (attempts exhausted with maxStepAttempts=2), then
    // succeeds on the fresh post-consult series at attempt 1.
    let developCalls = 0;
    const developHandler = (): AgentOutcome => {
      developCalls++;
      if (developCalls <= 2) {
        return { ok: false, error: `Build broken attempt ${developCalls}` };
      }
      return { ok: true, data: { status: "ok", summary: "Fixed with guidance" } };
    };
    harness.scriptOutcome(`${task}/items/retry-1/develop#a1`, developHandler);
    harness.scriptOutcome(`${task}/items/retry-1/develop#a2`, developHandler);
    // Fresh series re-runs develop at attempt 1 (same label, third call).
    harness.scriptOutcome(`${task}/items/retry-1/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Approved", suggestions: [] },
    });

    // Consult decides retry-with-guidance
    harness.scriptOutcome(`${task}/runs/consult-retry-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-retry",
        context: "item",
        decision: "retry-with-guidance",
        text: "Check the import paths before building.",
        rationale: "Likely import issue",
        timestamp: new Date().toISOString(),
      },
    });

    // Close-up flow
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["retry-1"], summary: "Wave ok" },
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

    // Exactly one consult ran: the decision ended the loop instead of re-consulting.
    const consultCalls = harness.calls.filter(
      (c) => c.type === "run" && c.run.label.includes("consult-retry-1-")
    );
    expect(consultCalls.length).toBe(1);

    // Item merged
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const state = await deriveTaskState({
      taskDir: path.join(taskWtPath, orchFolder, task),
      task,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(state.items.find((i) => i.slug === "retry-1")?.status).toBe("merged");
  });

  it("decision-vs-record ordering survives mtime reversal (durable afterRecord pointer, not mtimes)", async () => {
    const taskDir = fs.mkdtempSync(path.join(tmpRepo.dir, "derive-"));
    const itemSlug = "mtime-item";
    const stepsDir = path.join(taskDir, "items", itemSlug, "steps");
    const decisionsDir = path.join(taskDir, "decisions");
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.mkdirSync(decisionsDir, { recursive: true });

    fs.writeFileSync(
      path.join(taskDir, "items", itemSlug, "assignment.yaml"),
      `slug: ${itemSlug}\nkind: dev\ntitle: Mtime item\nassignment: Work\nwave: 1\n`
    );

    // Record 1 (pre-decision, attempt 2) and record 2 (post-decision, attempt 1)
    for (const [dir, attempt] of [["001-develop-a2", 2], ["002-develop-a1", 1]] as const) {
      const rd = path.join(stepsDir, dir);
      fs.mkdirSync(rd, { recursive: true });
      fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
      fs.writeFileSync(
        path.join(rd, "meta.yaml"),
        `seq: ${dir.startsWith("001") ? 1 : 2}\nname: develop\nattempt: ${attempt}\nagent: developer\nrole: workhorse\nmodels: [m]\nstatus: ok\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`
      );
      fs.writeFileSync(path.join(rd, "output.yaml"), `status: ok\nsummary: done\n`);
    }

    // Decision taken after record 1, retrying with guidance
    const decisionPath = path.join(decisionsDir, `001-item-${itemSlug}.yaml`);
    fs.writeFileSync(
      decisionPath,
      `id: dec-1\ncontext: item\nitem: ${itemSlug}\nafterRecord: 001-develop-a2\ndecision: retry-with-guidance\ntext: fix imports\ntimestamp: 2026-01-01T00:00:02.000Z\n`
    );

    const opts = { taskDir, itemSlug, parentBranch: `topic/${path.basename(taskDir)}`, pipeline, taskWt: tmpRepo.dir };
    const before = await deriveItemState(opts);
    // Only the post-decision record counts: attempt 1, series started fresh
    expect(before.currentAttempt).toBe(1);
    expect(before.freshSeries).toBe(false);

    // Reverse all mtimes: decision oldest, pre-decision record newest.
    // A durable pointer must derive identically.
    const now = Date.now() / 1000;
    fs.utimesSync(decisionPath, now - 300, now - 300);
    fs.utimesSync(path.join(stepsDir, "002-develop-a1", "meta.yaml"), now - 200, now - 200);
    fs.utimesSync(path.join(stepsDir, "001-develop-a2", "meta.yaml"), now - 100, now - 100);

    const after = await deriveItemState(opts);
    expect(after.currentAttempt).toBe(before.currentAttempt);
    expect(after.currentFixRound).toBe(before.currentFixRound);
    expect(after.freshSeries).toBe(before.freshSeries);
    expect(after.guidanceText).toBe(before.guidanceText);
    expect(after.consultCount).toBe(1);
  });

  it("abandon consult decision fails the item without further turns", async () => {
    const task = "consult-abandon-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Consult abandon test\n", "utf8");
    tmpRepo.commit("Add intent");

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

    // Iteration
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "doomed-1", kind: "dev", title: "Doomed item", milestoneId: "m1" }],
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
          { slug: "doomed-1", outlineRef: "doomed-1", kind: "dev", title: "Doomed item", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });

    // Develop always fails (both attempts of maxStepAttempts=2)
    harness.scriptOutcome(`${task}/items/doomed-1/develop#a1`, {
      ok: false,
      error: "Unfixable breakage",
    });
    harness.scriptOutcome(`${task}/items/doomed-1/develop#a2`, {
      ok: false,
      error: "Unfixable breakage",
    });

    // Consult decides abandon
    harness.scriptOutcome(`${task}/runs/consult-doomed-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-abandon",
        context: "item",
        decision: "abandon",
        reason: "Not feasible",
        rationale: "Blocked by upstream",
        timestamp: new Date().toISOString(),
      },
    });

    // Close-up flow still runs
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "has_failures", mergedItems: [], failedItems: ["doomed-1"], summary: "Wave had failures" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "end-iteration", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Partial" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done with failure recorded" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("done");

    // Exactly one consult ran
    const consultCalls = harness.calls.filter(
      (c) => c.type === "run" && c.run.label.includes("consult-doomed-1-")
    );
    expect(consultCalls.length).toBe(1);

    // Item derived as failed via the abandon decision
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const state = await deriveTaskState({
      taskDir: path.join(taskWtPath, orchFolder, task),
      task,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(state.items.find((i) => i.slug === "doomed-1")?.status).toBe("failed");
  });
});
