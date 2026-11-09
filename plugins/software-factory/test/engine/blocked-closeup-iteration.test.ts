import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, SteerItemArtifact } from "../../src/core/artifacts.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";

describe("Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6)", () => {
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
        maxIterations: 5,
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

  it("blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated", async () => {
    const task = "blocked-closeup-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Implement multi-format export\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();

    // Ingest
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Multi-iteration story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });

    // Iteration 1
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "i1", kind: "dev", title: "Format A", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan 1 approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [{ slug: "i1", outlineRef: "i1", kind: "dev", title: "Format A", assignment: "Do A", milestone: "m1", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/i1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Done format A" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Iteration 1 verified" },
    });

    // Iteration 1 Close-up: Blocked with a question!
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        status: "blocked",
        summary: "Blocked on format B decision",
        question: "Should we also support format B in the next iteration?",
      },
    });

    // Run 1: Finishes iteration 1 and exits 10 blocked
    const res1 = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res1.status).toBe("blocked");
    expect(res1.exitCode).toBe(10);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);

    // Verify closeup-1.yaml exists and is blocked
    const closeup1 = await readYaml<any>(path.join(deployedTaskDir, "closeup-1.yaml"));
    expect(closeup1.status).toBe("blocked");

    // Verify question was written to steer/tousertoreview/
    const qPath = path.join(deployedTaskDir, "steer", "tousertoreview", "closeup-1.yaml");
    expect(fs.existsSync(qPath)).toBe(true);
    const q = await readYaml<SteerItemArtifact>(qPath);
    expect(q.status).toBe("open");
    expect(q.question).toContain("support format B");

    // Verify deriveTaskState reports blocked while question is open
    const derivedBlocked = await deriveTaskState({
      taskDir: deployedTaskDir,
      task,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(derivedBlocked.status).toBe("blocked");

    // Operator answers the question: "Yes, definitely support format B"
    q.status = "answered";
    q.answer = "Yes, definitely support format B in iteration 2.";
    await writeYamlAtomic(qPath, q);
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "operator: answer closeup question"], { cwd: taskWtPath });

    // Verify deriveTaskState now returns active because question was answered!
    const derivedActive = await deriveTaskState({
      taskDir: deployedTaskDir,
      task,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(derivedActive.status).toBe("active");

    // Script Iteration 2 outcomes!
    let iter2PromptSeen = "";
    harness.scriptOutcome(`${task}/runs/architect-plan-2#a1`, (run) => {
      iter2PromptSeen = run.prompt;
      // Iteration N+1 starts a fresh architect session (§8.4.7)
      expect(run.session.resume).toBeUndefined();
      return {
        ok: true,
        data: {
          iteration: 2,
          milestones: [{ id: "m2", title: "M2 Format B" }],
          itemOutlines: [{ slug: "i2", kind: "dev", title: "Format B", milestoneId: "m2" }],
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/plan-review-2-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan 2 ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-2#a1`, {
      ok: true,
      data: {
        iteration: 2,
        items: [{ slug: "i2", outlineRef: "i2", kind: "dev", title: "Format B", assignment: "Do B", milestone: "m2", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/i2/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Format B done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-2-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 2, status: "complete", summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-2-1#a1`, {
      ok: true,
      data: { id: "dec-2", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-2#a1`, {
      ok: true,
      data: { iteration: 2, status: "complete", summary: "All milestones complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-2#a1`, {
      ok: true,
      data: {
        iteration: 2,
        status: "complete",
        summary: "Task delivery complete",
      },
    });

    // Run 2: Starts iteration 2 with answer and completes to done exit 0!
    const res2 = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res2.status).toBe("done");
    expect(res2.exitCode).toBe(0);

    // Verify iteration 2 closeup exists with status complete
    const closeup2 = await readYaml<any>(path.join(deployedTaskDir, "closeup-2.yaml"));
    expect(closeup2.status).toBe("complete");
    expect(closeup2.iteration).toBe(2);

    // Verify architect-plan-2 had prior closeup context (one-line brief entry with file path)
    expect(iter2PromptSeen).toContain("[closeup:closeup-1.yaml]");
    // Heavy test: two full runTask cycles (git worktrees + harness). Measured
    // 4.7-7.9s on a loaded host, over bun's 5s default; allow 30s. No
    // assertion is changed.
  }, 30_000);
});
