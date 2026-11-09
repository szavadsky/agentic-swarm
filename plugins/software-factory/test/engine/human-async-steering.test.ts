import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, SteerItemArtifact } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";

describe("Engine: human-async disposition & steering (§8.7, §8.8)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("human-async disposition blocks item, written to tousertoreview, and answering via fromuserpending unblocks it single-flight", async () => {
    const task = "steer-async-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Human-async steering test\n", "utf8");
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
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "review", agent: "reviewer", role: "task-reviewer" },
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
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // 1. Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Needs human review", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "t", command: "true" }],
        testRunner: { command: "true" },
      },
    });

    // 2. Plan
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "item-q", kind: "dev", title: "Item with question", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "item-q",
            outlineRef: "item-q",
            kind: "dev",
            title: "Item with question",
            assignment: "Ask user",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });

    // 3. Item-q develop ok
    harness.scriptOutcome(`${task}/items/item-q/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "some code");
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });

    // 4. Reviewer raises human-async question!
    harness.scriptOutcome(`${task}/items/item-q/review#a1`, [
      {
        ok: true,
        data: {
          status: "changes_requested",
          summary: "Need human input",
          suggestions: [
            {
              id: "s1",
              disposition: "human-async",
              summary: "Should we use Option A or Option B?",
              detail: "Choice of algorithm",
            },
          ],
        },
      },
      {
        ok: true,
        data: { status: "approved", summary: "Approved with option A", suggestions: [] },
      },
    ]);

    // Close-up outcomes
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    // Resume re-runs wave close-up + report (new merge landed in run 2).
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a2`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report (resume)" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a2`, {
      ok: true,
      data: { id: "dec-r", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan satisfied" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
    });

    // Run engine: will run triage, plan, edits, develop, review -> block on human-async question
    const res1 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task,
      { maxTicks: 5 }
    );

    expect(res1.status).toBe("blocked");
    expect(res1.exitCode).toBe(10);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const touserDir = path.join(taskWtPath, orchFolder, task, "steer", "tousertoreview");

    // Verify question was written to steer/tousertoreview (§8.8, Finding 23)
    expect(fs.existsSync(touserDir)).toBe(true);
    const qFiles = fs.readdirSync(touserDir);
    expect(qFiles.length).toBeGreaterThan(0);

    const qPath = path.join(touserDir, qFiles[0]!);
    const qArtifact = await readYaml<SteerItemArtifact>(qPath);
    expect(qArtifact.status).toBe("open");
    expect(qArtifact.disposition).toBe("human-async");
    expect(qArtifact.ref).toBe("item-q");

    // Now user answers via fromuserpending/ (§8.8)
    const pendingDir = path.join(taskWtPath, orchFolder, task, "steer", "fromuserpending");
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, "answer-01.txt"),
      "Use Option A please."
    );

    // Mock harness.complete for simpler classification of answer
    harness.scriptComplete(({ prompt }) => {
      return {
        refs: ["item-q"],
        kind: "answer",
        urgency: "now",
        summary: "Use Option A",
      };
    });

    // Follow-up developer step after user answer
    harness.scriptOutcome(`${task}/items/item-q/develop#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "option A code");
      return { ok: true, data: { status: "ok", summary: "Option A implemented" } };
    });

    // Second run: engine processes steering, unblocks item-q, runs develop a2, review approves, completes
    const res2 = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task,
      { maxTicks: 10 }
    );

    expect(res2.status).toBe("done");
    expect(res2.exitCode).toBe(0);

    // Verify question is now marked answered
    const updatedQ = await readYaml<SteerItemArtifact>(qPath);
    expect(updatedQ.status).toBe("answered");
  });
});
