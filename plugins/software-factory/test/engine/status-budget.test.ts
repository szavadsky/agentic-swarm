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
import { deriveItemState } from "../../src/core/derive/item.js";
import { scanSpendFromDisk } from "../../src/core/budget.js";
import { readYaml } from "../../src/core/records/io.js";

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
            { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse" },
            { id: "review", agent: "reviewer", role: "task-reviewer" },
          ],
        },
      },
      spike: {},
    },
    limits: { maxPlanReviewRounds: 1, maxStepAttempts: 3, maxFixRounds: 3, maxConsultsPerItem: 3 },
  };
}

describe("Status budget: spend aggregates task runs + item worktrees + epic children", () => {
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
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: ".factory", worktreeRoot };
    pipeline = makePipeline();
    prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("status spend includes item steps committed only in item worktrees (not merged yet)", async () => {
    const task = "spend-item-wt";
    const orchFolder = ".factory";
    const intentDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(intentDir, { recursive: true });
    fs.writeFileSync(path.join(intentDir, "INTENT.md"), "Spend test\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 1.0 },
      data: { kind: "story", rationale: "story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.5 },
      data: { setup: [], gates: [], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      usage: { costUsd: 0.25 },
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "spend-1", kind: "dev", title: "Spend item", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      usage: { costUsd: 0.1 },
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      usage: { costUsd: 0.1 },
      data: {
        iteration: 1,
        items: [{ slug: "spend-1", outlineRef: "spend-1", kind: "dev", title: "Spend item", assignment: "Work", milestone: "m1", wave: 1 }],
      },
    });
    // Item develop step with distinctive cost, then review that blocks the
    // run (human-async) so the item stays unmerged with its worktree live.
    harness.scriptOutcome(`${task}/items/spend-1/develop#a1`, {
      ok: true,
      usage: { inputTokens: 1000, outputTokens: 500, costUsd: 2.5 },
      data: { status: "ok", summary: "Code done" },
    });
    harness.scriptOutcome(`${task}/items/spend-1/review#a1`, {
      ok: true,
      usage: { costUsd: 0.75 },
      data: {
        status: "changes_requested",
        summary: "Need human",
        suggestions: [{ id: "s1", disposition: "human-async", summary: "Ask human", detail: "Which API?" }],
      },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 30 }
    );
    expect(["blocked", "done", "failed"].includes(res.status)).toBe(true);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const taskDir = path.join(taskWtPath, orchFolder, task);
    const derived = await deriveTaskState({ taskDir, task, taskWt: taskWtPath, pipeline });

    // Task-level runs alone sum to 1.95; item steps add 3.25.
    const orchestrationOnly = 1.0 + 0.5 + 0.25 + 0.1 + 0.1;
    expect(derived.budgetSpentUsd).toBeGreaterThan(orchestrationOnly + 1);
    expect(derived.budgetSpentUsd).toBeCloseTo(orchestrationOnly + 2.5 + 0.75, 5);
    expect(derived.spendByItem["spend-1"]?.costUsd).toBeCloseTo(3.25, 5);
    expect(derived.spendByRole["workhorse"]?.costUsd).toBeCloseTo(1.0 + 0.5 + 2.5, 5);
    expect(derived.spendByRole["task-reviewer"]?.costUsd).toBeCloseTo(0.75, 5);

    // state.yaml materialization carries the same totals.
    const state = derived.toStateArtifact();
    expect(state.budgetSpentUsd).toBeCloseTo(derived.budgetSpentUsd, 5);
    expect(state.spendByItem?.["spend-1"]?.costUsd).toBeCloseTo(3.25, 5);
    expect(state.items["spend-1"]?.spendUsd).toBeCloseTo(3.25, 5);
  });

  it("spend scan does not double-count merged item records visible in both worktrees", async () => {
    const task = "spend-nodup";
    const taskWt = path.join(worktreeRoot, `topic_${task}`);
    const orchFolder = ".factory";
    const taskDir = path.join(taskWt, orchFolder, task);
    const itemWt = path.join(worktreeRoot, `topic_${task}--nodup-1`);
    // Task worktree holds merged records; item worktree (not yet removed)
    // holds the identical copies.
    for (const wt of [taskWt, itemWt]) {
      const stepsDir = path.join(wt, orchFolder, task, "items", "nodup-1", "steps", "001-develop-r1-a1");
      fs.mkdirSync(stepsDir, { recursive: true });
      fs.writeFileSync(
        path.join(stepsDir, "meta.yaml"),
        JSON.stringify({
          seq: 1, name: "develop", attempt: 1, fixRound: 1,
          agent: "developer", role: "workhorse", models: ["m"],
          status: "ok", startedAt: "2026-01-01T00:00:00.000Z",
          usage: { inputTokens: 100, outputTokens: 50, costUsd: 1.5 },
        })
      );
    }
    fs.mkdirSync(path.join(taskDir, "items", "nodup-1"), { recursive: true });

    const scan = await scanSpendFromDisk({ taskDir, taskWt, parentBranch: `topic/${task}` });
    expect(scan.total.costUsd).toBeCloseTo(1.5, 5);
    expect(scan.byItem.get("nodup-1")?.costUsd).toBeCloseTo(1.5, 5);
  });

  it("running steps surface with elapsed time, agent, and model", async () => {
    const task = "spend-running";
    const taskWt = path.join(worktreeRoot, `topic_${task}`);
    const orchFolder = ".factory";
    const taskDir = path.join(taskWt, orchFolder, task);
    const startedAt = new Date(Date.now() - 125_000).toISOString();
    const stepsDir = path.join(taskDir, "items", "run-1", "steps", "002-develop-r1-a1");
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "items", "run-1", "assignment.yaml"),
      JSON.stringify({ slug: "run-1", kind: "dev", title: "Running", wave: 1 })
    );
    fs.writeFileSync(
      path.join(stepsDir, "meta.yaml"),
      JSON.stringify({
        seq: 2, name: "develop", attempt: 1, fixRound: 1,
        agent: "developer", role: "workhorse", models: ["deepseek-chat"],
        status: "started", startedAt,
      })
    );

    const derived = await deriveTaskState({ taskDir, task, taskWt, pipeline });
    expect(derived.runningSteps.length).toBe(1);
    const running = derived.runningSteps[0]!;
    expect(running.item).toBe("run-1");
    expect(running.step).toBe("develop");
    expect(running.agent).toBe("developer");
    expect(running.role).toBe("workhorse");
    expect(running.model).toBe("deepseek-chat");
    expect(running.elapsedMs).toBeGreaterThan(100_000);
  });

  it("epic child records count toward parent spend", async () => {
    const task = "spend-epic";
    const taskWt = path.join(worktreeRoot, `topic_${task}`);
    const orchFolder = ".factory";
    const taskDir = path.join(taskWt, orchFolder, task);
    // Epic child layout: <taskDir>/<epic>/runs + <taskDir>/<epic>/items/<sub>/steps
    const childRuns = path.join(taskDir, "big-epic", "runs", "001-architect-plan-1-a1");
    fs.mkdirSync(childRuns, { recursive: true });
    fs.writeFileSync(
      path.join(childRuns, "meta.yaml"),
      JSON.stringify({
        seq: 1, name: "architect-plan-1", attempt: 1,
        agent: "architect", role: "architect", models: ["r"],
        status: "ok", startedAt: "2026-01-01T00:00:00.000Z",
        usage: { costUsd: 4.0 },
      })
    );
    const childSteps = path.join(taskDir, "big-epic", "items", "sub-1", "steps", "001-develop-r1-a1");
    fs.mkdirSync(childSteps, { recursive: true });
    fs.writeFileSync(
      path.join(childSteps, "meta.yaml"),
      JSON.stringify({
        seq: 1, name: "develop", attempt: 1, fixRound: 1,
        agent: "developer", role: "workhorse", models: ["m"],
        status: "ok", startedAt: "2026-01-01T00:00:00.000Z",
        usage: { costUsd: 2.0 },
      })
    );
    fs.mkdirSync(path.join(taskDir, "items", "big-epic"), { recursive: true });

    const scan = await scanSpendFromDisk({ taskDir, taskWt, parentBranch: `topic/${task}` });
    expect(scan.total.costUsd).toBeCloseTo(6.0, 5);
  });

  it("item fix-round re-entry names records unambiguously (research-r2-a1)", async () => {
    const task = "fixround-name";
    const orchFolder = ".factory";
    const intentDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(intentDir, { recursive: true });
    fs.writeFileSync(path.join(intentDir, "INTENT.md"), "Fix round naming\n", "utf8");
    tmpRepo.commit("Add intent");

    const frPipeline: PipelineConfig = {
      ...makePipeline(),
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "task-reviewer" },
            ],
          },
        },
        spike: {},
      },
    };

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true, data: { kind: "story", rationale: "s", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true, data: { setup: [], gates: [], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "fr-1", kind: "dev", title: "FR item", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [{ slug: "fr-1", outlineRef: "fr-1", kind: "dev", title: "FR", assignment: "W", milestone: "m1", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/fr-1/develop#a1`, {
      ok: true, data: { status: "ok", summary: "v1" },
    });
    let reviewCalls = 0;
    harness.scriptOutcome(`${task}/items/fr-1/review#a1`, () => {
      reviewCalls++;
      if (reviewCalls === 1) {
        return {
          ok: true,
          data: {
            status: "changes_requested", summary: "fix it",
            suggestions: [{ id: "s1", disposition: "fix", summary: "Fix bug" }],
          },
        };
      }
      return { ok: true, data: { status: "approved", summary: "ok", suggestions: [] } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["fr-1"], summary: "ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true, data: { id: "d", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => frPipeline, prompts },
      task,
      { maxTicks: 40 }
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const state = await deriveItemState({
      taskDir: path.join(taskWtPath, orchFolder, task),
      itemSlug: "fr-1",
      parentBranch: `topic/${task}`,
      taskWt: taskWtPath,
      pipeline: frPipeline,
    });
    const dirNames = state.records.map((r) => r.dirName);
    // First pass round 1, fix re-entry round 2, final review round 2.
    expect(dirNames).toEqual([
      "001-develop-r1-a1",
      "002-review-r1-a1",
      "003-develop-r2-a1",
      "004-review-r2-a1",
    ]);
    expect(state.records[2]!.meta.fixRound).toBe(2);
    // Legacy-style collision is gone: no two records share a step+attempt suffix.
    const suffixes = state.records.map((r) => `${r.name}-a${r.attempt}`);
    expect(new Set(suffixes).size).toBeLessThan(state.records.length);
    const fullKeys = state.records.map((r) => `${r.name}-r${r.fixRound}-a${r.attempt}`);
    expect(new Set(fullKeys).size).toBe(state.records.length);
  });
});
