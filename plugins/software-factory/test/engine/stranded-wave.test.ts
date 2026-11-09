import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { tickItemMachine } from "../../src/core/flows/item-machine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";
import { readJournal } from "../../src/core/journal.js";
import { recoverStrandedItems } from "../../src/core/flows/iteration.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import { deriveItemState } from "../../src/core/derive/item.js";

// Stranded-wave fix: review-ok-with-fix-dispositions + rounds remaining must
// start the next fix round (never strand `running`); wave/plan close-up gates
// refuse with non-terminal items; restart re-queues stranded items.

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
      pm: { role: "alt-workhorse", tools: [] },
      developer: { role: "workhorse" },
      reviewer: { role: "task-reviewer" },
      "fact-finder": { role: "workhorse" },
      factfinder: { role: "workhorse" },
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
      spike: {
        "fact-finder": {
          fixLoopTo: "research",
          steps: [
            { id: "research", agent: "fact-finder", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "task-reviewer" },
          ],
        },
      },
    },
    limits: {
      maxStepAttempts: 3,
      maxFixRounds: 3,
      maxConsultsPerItem: 3,
      maxPlanReviewRounds: 1,
    },
  };
}

describe("Stranded-wave fix", () => {
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

  it("review ok with fix dispositions + rounds remaining starts the next fix round (no wave close)", async () => {
    // Direct item-machine proof of the stranded bug's fix-round half: after a
    // `changes_requested` review carrying fix dispositions (rounds remaining),
    // the next tick re-enters the fix-loop target with Review Feedback — the
    // continuation that used to never fire, stranding the item `running`.
    const task = "fix-round-continues";
    const itemSlug = "probe-1";
    const itemDir = path.join(tmpRepo.dir, orchFolder, task, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "fact-finder", title: "Probe", assignment: "Probe X", milestone: "m1", wave: 1, deps: [] }, null, 2)
    );
    tmpRepo.commit("task scaffolding");
    tmpRepo.createBranch(`topic/${task}`);
    const childWt = tmpRepo.createWorktree(`topic/${task}--${itemSlug}`);
    const tRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const tProject: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: tRepo.worktreeRoot };
    const tPrompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const pipeline = makePipeline();
    const harness = new FakeHarness();

    const researchPrompts: string[] = [];
    harness.scriptOutcome(`${task}/items/${itemSlug}/research#a1`, (run) => {
      researchPrompts.push((run as { prompt: string }).prompt);
      return { ok: true, data: { status: "ok", summary: "researched", findings: "f" } };
    });
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "needs fixes",
        suggestions: [{ id: "f1", disposition: "fix", summary: "Cover the unparsed-tool case" }],
      },
    });

    const tick = () =>
      tickItemMachine({
        task, itemSlug, parentBranch: `topic/${task}`, taskWt: tmpRepo.dir,
        childWt, taskDir: path.join(tmpRepo.dir, orchFolder, task),
        repo: tRepo, harness, pipeline, project: tProject, prompts: tPrompts,
      });
    await tick(); // research a1
    await tick(); // review a1 -> fix requested
    const fixTick = await tick(); // fix re-entry round must run research, not stall
    expect(fixTick.stepRan).toBe("research");
    expect(researchPrompts.length).toBe(2);
    expect(researchPrompts[0]).not.toContain("Cover the unparsed-tool case");
    expect(researchPrompts[1]).toContain("Review Feedback");
    expect(researchPrompts[1]).toContain("[FIX] Cover the unparsed-tool case");
  });

  it("second consult for the same item fires a fresh turn (no step_reused sham loop)", async () => {
    const task = "consult-refire-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
    tmpRepo.commit(`Add intent for ${task}`);

    const pipeline: PipelineConfig = {
      ...makePipeline(),
      limits: { ...makePipeline().limits, maxFixRounds: 1, maxConsultsPerItem: 3 },
    };
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
        itemOutlines: [{ slug: "loop-1", kind: "dev", title: "Loop", milestoneId: "m1" }],
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
          { slug: "loop-1", outlineRef: "loop-1", kind: "dev", title: "Loop", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    let developCalls = 0;
    harness.scriptOutcome(`${task}/items/loop-1/develop#a1`, (run) => {
      developCalls++;
      fs.writeFileSync(path.join((run as { cwd: string }).cwd, `impl-${developCalls}.ts`), `export const v${developCalls} = ${developCalls};\n`);
      return { ok: true, data: { status: "ok", summary: `v${developCalls}` } };
    });
    let reviewCalls = 0;
    harness.scriptOutcome(`${task}/items/loop-1/review#a1`, () => {
      reviewCalls++;
      return {
        ok: true,
        data: {
          status: "changes_requested",
          summary: `round ${reviewCalls}`,
          suggestions: [{ id: `s${reviewCalls}`, disposition: "fix", summary: `Fix bug round ${reviewCalls}` }],
        },
      };
    });
    // First consult: retry-with-guidance; second consult (after another
    // exhausted fix round): escalate. Sequenced stepIds per consult.
    harness.scriptOutcome(`${task}/runs/consult-loop-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-1", context: "item", decision: "retry-with-guidance",
        text: "Try again with guidance.", rationale: "r1", timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/consult-loop-1-2#a1`, {
      ok: true,
      data: {
        id: "dec-2", context: "item", decision: "escalate",
        rationale: "r2", timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: [], failedItems: [], summary: "Wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-w", context: "wave", decision: "end-iteration", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "done" },
    });

    await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
    );
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = await readJournal(deployedTaskDir);
    // No done-ness reuse shadowed either consult: both decisions recorded.
    expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
    expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
  });

  it("restart with a stranded item re-queues it, journals item_stranded, and the round resumes", async () => {
    const task = "stranded-resume-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const parentBranch = `topic/${task}`;
    // Prior iteration 1 closed (closeup file) while probe-1 sat mid-flow.
    fs.mkdirSync(path.join(taskDir, "items", "probe-1", "steps"), { recursive: true });
    fs.mkdirSync(path.join(taskDir, "plan"), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "items", "probe-1", "assignment.yaml"),
      JSON.stringify({ slug: "probe-1", kind: "fact-finder", title: "Probe", assignment: "Probe X", milestone: "m1", wave: 1, deps: [] }, null, 2),
    );
    fs.writeFileSync(path.join(taskDir, "closeup-1.yaml"), "iteration: 1\nstatus: complete\nsummary: closed early\n");
    // Two committed review records: r1 clean, then r2 ok-with-fix (fix round pending).
    for (const [dir, fixRound] of [["001-research-r1-a1", 1], ["002-review-r1-a1", 1]] as const) {
      const rd = path.join(taskDir, "items", "probe-1", "steps", dir);
      fs.mkdirSync(rd, { recursive: true });
      fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
      fs.writeFileSync(
        path.join(rd, "meta.yaml"),
        `seq: ${dir.startsWith("001") ? 1 : 2}\nname: ${dir.startsWith("001") ? "research" : "review"}\nattempt: 1\nfixRound: ${fixRound}\nagent: factfinder\nrole: workhorse\nmodels: [m]\nstatus: ok\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`,
      );
      const output =
        dir.startsWith("001")
          ? `status: ok\nsummary: researched\n`
          : `status: ok\nsummary: ok with fixes\nsuggestions:\n  - id: f1\n    disposition: fix\n    summary: Cover the unparsed-tool case\n`;
      fs.writeFileSync(path.join(rd, "output.yaml"), output);
    }
    const pipeline = makePipeline();
    const before = await deriveItemState({
      taskDir, itemSlug: "probe-1", parentBranch, taskWt: tmpRepo.dir, pipeline,
    });
    expect(before.status).toBe("running");

    const requeued = await recoverStrandedItems({
      taskDir, task, taskWt: tmpRepo.dir, parentBranch, pipeline,
      iteration: 2, currentIterationItems: [],
    });
    expect(requeued).toContain("probe-1");
    const journal = await readJournal(taskDir);
    expect(journal.some((e) => e.type === "item_stranded" && (e as { item?: string }).item === "probe-1")).toBe(true);

    // Re-queue keeps branch/records: derive again and confirm mid-flow state intact.
    const after = await deriveItemState({
      taskDir, itemSlug: "probe-1", parentBranch, taskWt: tmpRepo.dir, pipeline,
    });
    expect(after.status).toBe("running");
    expect(after.records.length).toBe(2);
    // Not stranded twice: idempotent journaling.
    await recoverStrandedItems({
      taskDir, task, taskWt: tmpRepo.dir, parentBranch, pipeline,
      iteration: 2, currentIterationItems: requeued,
    });
    const journal2 = await readJournal(taskDir);
    expect(journal2.filter((e) => e.type === "item_stranded" && (e as { item?: string }).item === "probe-1").length).toBe(1);

    // The wave gate sees the straggler: non-terminal, so no close-up.
    const waveState = deriveWaveState({ wave: 1, items: [after] });
    expect(waveState.canMerge).toBe(false);
    expect(waveState.isComplete).toBe(false);
  });

  it("plan close-up refuses while a ready-but-unmerged item is still open", async () => {
    const task = "closeup-refused-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
    tmpRepo.commit(`Add intent for ${task}`);

    const pipeline = makePipeline();
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
        itemOutlines: [{ slug: "slow-1", kind: "dev", title: "Slow", milestoneId: "m1" }],
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
          { slug: "slow-1", outlineRef: "slow-1", kind: "dev", title: "Slow", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    // Develop ok, review requests a fix; fix round completes and merges.
    harness.scriptOutcome(`${task}/items/slow-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "built" },
    });
    harness.scriptOutcome(`${task}/items/slow-1/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "needs fix",
        suggestions: [{ id: "f1", disposition: "fix", summary: "Polish the edge case" }],
      },
    });
    harness.scriptOutcome(`${task}/items/slow-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "fixed" },
    });
    harness.scriptOutcome(`${task}/items/slow-1/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "clean", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["slow-1"], summary: "Wave ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
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
      task,
    );
    expect(res.status).toBe("done");
    // Fix round ran to completion and merged; nothing stranded.
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = await readJournal(deployedTaskDir);
    expect(journal.some((e) => e.type === "plan_closeup_refused")).toBe(false);
    const closeup = await readYaml<{ status: string }>(path.join(deployedTaskDir, "closeup-1.yaml"));
    expect(closeup.status).toBe("complete");
  });
});
