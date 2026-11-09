import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

function makePipeline(maxEmptyWaves?: number): PipelineConfig {
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
      pm: { role: "alt-workhorse", tools: [] },
      developer: { role: "workhorse" },
      reviewer: { role: "task-reviewer" },
      "wave-close-up": { role: "wave-close-up" },
      "plan-close-up": { role: "plan-close-up" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {
        dev: {
          steps: [
            { id: "develop", agent: "developer", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "task-reviewer" },
          ],
        },
      },
      spike: {},
    },
    limits: {
      maxPlanReviewRounds: 1,
      maxAmendmentsPerIteration: 3,
      ...(maxEmptyWaves !== undefined ? { maxEmptyWaves } : {}),
    } as any,
  };
}

describe("D4: empty-wave streak consults architect instead of another empty wave", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let prompts: any;
  const orchFolder = ".factory";

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: orchFolder, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("maxEmptyWaves=1: single blocked wave consults architect, journals streak", async () => {
    const task = "empty-consult-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
    tmpRepo.commit(`Add intent for ${task}`);

    const pipeline = makePipeline(1);
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "t", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "e1", kind: "dev", title: "E1", milestoneId: "m1" }],
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
          { slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w", milestone: "m1", wave: 1 },
        ],
      },
    });
    // e1 develops fine, then review raises human-async -> item blocked.
    harness.scriptOutcome(`${task}/items/e1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "done" },
    });
    harness.scriptOutcome(`${task}/items/e1/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "need operator",
        suggestions: [{ id: "s1", disposition: "human-async", summary: "Which API?", detail: "Which API should e1 use?" }],
      },
    });
    // Empty-wave exits ALWAYS run the current wave's close-up/report
    // ceremony first: the consult fires, then the ceremony still runs.
    let consultCalled = false;
    harness.scriptOutcome(`${task}/runs/consult-empty-waves-1-1#a1`, () => {
      consultCalled = true;
      return {
        ok: true,
        data: {
          id: "dec-empty",
          context: "non-item",
          decision: "accept-with-debt",
          debt: "blocked on operator",
          timestamp: new Date().toISOString(),
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { status: "complete", summary: "empty wave closed with ceremony" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "done" },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("empty_wave_streak");
    expect(consultCalled).toBe(true);
    expect(journal).toContain("wave-close-up-1-1");
    expect(journal).toContain("empty_wave_exit");
    expect(res.status).toBe("blocked");
  });
});
