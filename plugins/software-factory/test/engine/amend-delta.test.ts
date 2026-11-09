import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { buildSchedulerWaitEvent, SCHEDULER_IDLE_THRESHOLD_MS } from "../../src/core/flows/iteration.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary, resolveAgentTools } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, PlanArtifact } from "../../src/core/artifacts.js";
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
      pm: { role: "alt-workhorse", tools: [] },
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

function setupTask(tmpRepo: TmpRepo, task: string, orchFolder: string): void {
  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
  tmpRepo.commit(`Add intent for ${task}`);
}

function scriptIngest(harness: FakeHarness, task: string): void {
  harness.scriptOutcome(`${task}/runs/triage#a1`, {
    ok: true,
    data: { kind: "story", rationale: "Standard story", citations: [] },
  });
  harness.scriptOutcome(`${task}/runs/infra#a1`, {
    ok: true,
    data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
  });
}

function scriptPlan(
  harness: FakeHarness,
  task: string,
  outlines: Array<{ slug: string; kind: string; title: string; milestoneId: string }>,
  editsItems: Array<Record<string, unknown>>
): void {
  harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
    ok: true,
    data: {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: outlines,
    },
  });
  harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
    ok: true,
    data: { status: "approved", summary: "ok", suggestions: [] },
  });
  harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
    ok: true,
    data: { iteration: 1, items: editsItems },
  });
}

function scriptCloseup(harness: FakeHarness, task: string): void {
  harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "All done" },
  });
  harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "Delivered" },
  });
}

describe("Engine: amend delta semantics, resumed repair, removal, tool-less PM (§8.4.6)", () => {
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

  it("amend end-to-end: decision outlines merge into plan-N.k, PM delta validates and schedules", async () => {
    const task = "amend-e2e-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
      [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "base.txt"), "base\n");
      return { ok: true, data: { status: "ok", summary: "Base done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "Split follow-up into split-a and split-b",
        outlines: [
          { slug: "split-a", kind: "dev", title: "Split A", milestoneId: "m1" },
          { slug: "split-b", kind: "dev", title: "Split B", milestoneId: "m1" },
        ],
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "split-a", outlineRef: "split-a", kind: "dev", title: "Split A", assignment: "A", milestone: "m1", wave: 2 },
          { slug: "split-b", outlineRef: "split-b", kind: "dev", title: "Split B", assignment: "B", milestone: "m1", wave: 2 },
        ],
      },
    });
    for (const slug of ["split-a", "split-b"]) {
      harness.scriptOutcome(`${task}/items/${slug}/develop#a1`, (run) => {
        fs.writeFileSync(path.join(run.cwd, `${slug}.txt`), `${slug}\n`);
        return { ok: true, data: { status: "ok", summary: `${slug} done` } };
      });
    }
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["split-a", "split-b"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    // plan-1.1.yaml carries the merged outlines; edits-1.1.yaml the delta
    const amendPlan = await readYaml<PlanArtifact>(path.join(deployedTaskDir, "plan", "plan-1.1.yaml"));
    const outlineSlugs = (amendPlan.itemOutlines ?? []).map((o) => o.slug).sort();
    expect(outlineSlugs).toEqual(["base-1", "split-a", "split-b"]);
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.1.yaml"))).toBe(true);
    // Amended items scheduled and merged
    expect(fs.existsSync(path.join(deployedTaskDir, "items", "split-a", "assignment.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(deployedTaskDir, "items", "split-b", "assignment.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "split-a.txt"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "split-b.txt"))).toBe(true);
    // PM-amend prompt got the UPDATED plan (with new outlines) + planDelta feedback + taskStatus
    const pmAmendCall = harness.calls.find(
      (c) => c.type === "run" && (c as any).run.label === `${task}/runs/pm-amend-1-1#a1`
    ) as any;
    expect(pmAmendCall).toBeDefined();
    expect(pmAmendCall.run.prompt).toContain("split-a");
    expect(pmAmendCall.run.prompt).toContain("Split follow-up into split-a and split-b");
    expect(pmAmendCall.run.prompt).toContain("Task Status");
    // PM ran yield-only
    expect(pmAmendCall.run.tools).toEqual([]);
  });

  it("re-emitted existing slugs are dropped; all-existing output discards the amendment and continues", async () => {
    const task = "amend-reemit-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
      [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "Add extra",
        outlines: [{ slug: "extra-1", kind: "dev", title: "Extra", milestoneId: "m1" }],
        timestamp: new Date().toISOString(),
      },
    });
    // PM re-emits the existing base-1 plus the new extra-1
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
          { slug: "extra-1", outlineRef: "extra-1", kind: "dev", title: "Extra", assignment: "X", milestone: "m1", wave: 2 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/extra-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "extra.txt"), "extra\n");
      return { ok: true, data: { status: "ok", summary: "Extra done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["extra-1"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("amend_existing_dropped");
    expect(journal).toContain("base-1");
    // New item applied; no duplicate base-1 edits
    expect(fs.existsSync(path.join(taskWtPath, "extra.txt"))).toBe(true);
  });

  it("empty delta (only re-emits) discards the amendment and continues current waves", async () => {
    const task = "amend-empty-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
      [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "No-op amend",
        outlines: [{ slug: "ghost-1", kind: "dev", title: "Ghost", milestoneId: "m1" }],
        timestamp: new Date().toISOString(),
      },
    });
    // PM re-emits ONLY the existing item → empty delta after drop
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("amend_existing_dropped");
    expect(journal).toContain("pm_amend_discarded");
    // No amendment edits file: nothing new to apply
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.1.yaml"))).toBe(false);
  });

  it("removeItemSlugs rejects merged/running removals but valid parts still apply (D2)", async () => {
    const task = "amend-remove-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [
        { slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" },
        { slug: "stale-1", kind: "dev", title: "Stale", milestoneId: "m1" },
      ],
      [
        { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
        { slug: "stale-1", outlineRef: "stale-1", kind: "dev", title: "Stale", assignment: "Stale work", milestone: "m1", wave: 2 },
      ]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    // Amend removes pending stale-1 AND (invalidly) merged base-1 → the base-1
    // removal is rejected + journaled, but valid parts still apply (D2):
    // stale-1 superseded, fresh-1 scheduled.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "Replace stale with fresh",
        outlines: [{ slug: "fresh-1", kind: "dev", title: "Fresh", milestoneId: "m1" }],
        removeItemSlugs: ["stale-1", "base-1"],
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "fresh-1", outlineRef: "fresh-1", kind: "dev", title: "Fresh", assignment: "F", milestone: "m1", wave: 2 },
        ],
      },
    });
    // fresh-1 runs in wave 2 (valid part applied); stale-1 was superseded.
    harness.scriptOutcome(`${task}/items/fresh-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "fresh.txt"), "fresh\n");
      return { ok: true, data: { status: "ok", summary: "Fresh done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["fresh-1"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
      // No whole-amend discard: the next report sees no discarded-amendment note.
      expect(run.prompt).not.toContain("Discarded amendments");
      return {
        ok: true,
        data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
      };
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    // Invalid removal rejected with reason; valid parts applied.
    expect(journal).toContain("pm_amend_removals_dropped");
    // JSON-escaped in the ndjson line.
    expect(journal).toContain('removeItemSlugs cannot remove \\"base-1\\" with status \\"merged\\"');
    expect(journal).not.toContain("pm_amend_discarded");
    // fresh-1 scheduled and merged; stale-1 superseded (never ran).
    expect(fs.existsSync(path.join(deployedTaskDir, "items", "fresh-1", "assignment.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "fresh.txt"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "stale.txt"))).toBe(false);
  });

  it("removeItemSlugs with pending-only slugs applies: item superseded and skipped", async () => {
    const task = "amend-remove-ok-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [
        { slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" },
        { slug: "stale-1", kind: "dev", title: "Stale", milestoneId: "m1" },
      ],
      [
        { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
        { slug: "stale-1", outlineRef: "stale-1", kind: "dev", title: "Stale", assignment: "Stale work", milestone: "m1", wave: 2 },
      ]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "Replace stale with fresh",
        outlines: [{ slug: "fresh-1", kind: "dev", title: "Fresh", milestoneId: "m1" }],
        removeItemSlugs: ["stale-1"],
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "fresh-1", outlineRef: "fresh-1", kind: "dev", title: "Fresh", assignment: "F", milestone: "m1", wave: 2 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/fresh-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "fresh.txt"), "fresh\n");
      return { ok: true, data: { status: "ok", summary: "Fresh done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["fresh-1"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    // Supersede decision committed; stale-1 never ran (no step records)
    const decisions = fs.readdirSync(path.join(deployedTaskDir, "decisions"));
    expect(decisions.some((d) => d.includes("amend-remove-stale-1"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "fresh.txt"))).toBe(true);
    expect(harness.calls.some((c) => c.type === "run" && (c as any).run.label.startsWith(`${task}/items/stale-1/`))).toBe(false);
  });

  it("invalid pm-edits gets ONE resumed repair turn in the same session; corrected output accepted", async () => {
    const task = "pm-repair-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "real-1", kind: "dev", title: "Real", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    // Initial PM output references an unknown outline
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      sessionId: "pm-sess-repair",
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.1 },
      data: {
        iteration: 1,
        items: [
          { slug: "real-1", outlineRef: "invented-outline", kind: "dev", title: "Real", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    });
    // Resumed repair turn: same session, errors-only prompt, corrected output
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a2`, (run) => {
      expect(run.session.resume).toBe("pm-sess-repair");
      expect(run.prompt).toContain("unknown outlineRef");
      expect(run.prompt).not.toContain("Deconstruct the approved architectural plan");
      return {
        ok: true,
        sessionId: "pm-sess-repair",
        usage: { inputTokens: 50, outputTokens: 25, costUsd: 0.05 },
        data: {
          iteration: 1,
          items: [
            { slug: "real-1", outlineRef: "real-1", kind: "dev", title: "Real", assignment: "Work", milestone: "m1", wave: 1 },
          ],
        },
      };
    });
    harness.scriptOutcome(`${task}/items/real-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Real done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["real-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_edits_repaired");
    // Repair recorded as attempt 2 with its own committed record
    const runs = fs.readdirSync(path.join(deployedTaskDir, "runs")).filter((r) => r.includes("pm-edits-1"));
    expect(runs.some((r) => r.endsWith("-a1"))).toBe(true);
    expect(runs.some((r) => r.endsWith("-a2"))).toBe(true);
  });

  it("unfixable pm-edits bounces to architect once, then fails with bounce noted", async () => {
    const task = "pm-unfixable-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "real-1", kind: "dev", title: "Real", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    const badEdits = {
      ok: true,
      sessionId: "pm-sess-bad",
      data: {
        iteration: 1,
        items: [
          { slug: "real-1", outlineRef: "real-1", kind: "nope-kind", title: "Real", assignment: "Work", milestone: "m1", wave: 1 },
        ],
      },
    } as const;
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, badEdits);
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a2`, badEdits);
    // Bounce: architect revises (plan itself is fine; the kind error persists),
    // PM re-runs once against the revised plan and still fails.
    harness.scriptOutcome(`${task}/runs/architect-pmfix-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: "real-1", kind: "dev", title: "Real", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a3`, badEdits);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("failed");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_edits_bounced_to_architect");
    expect(journal).toContain("pm_edits_validation_failed");
    // Failure notes the bounce already taken (exactly-once bound).
    expect(journal).toContain('"bounced":true');
    // Bounce ran exactly once: no second pmfix record.
    const runs = fs.readdirSync(path.join(deployedTaskDir, "runs"));
    expect(runs.filter((r) => r.includes("architect-pmfix-1"))).toHaveLength(1);
  });

  it("old-format amend record never applies an amendment without decision outlines", async () => {
    const task = "amend-oldfmt-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    // Single wave: wave 1 merges, then the run "dies" in pm-amend.
    scriptPlan(
      harness,
      task,
      [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
      [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    // Run 1: old-format amend (no outlines) on wave 1, then PM-amend crashes
    // mid-turn (throw from script) — the old-format wave-1 report is committed
    // on disk but the amend path never ran; wave 2 stays pending.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-old",
        context: "wave",
        decision: "amend",
        rationale: "Old format amend",
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, () => {
      throw new Error("simulated crash in pm-amend");
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    ).catch((e) => ({ status: "crashed", error: String(e) }));
    // Run 1 dies in pm-amend — that is the simulated crash.
    expect((res as any).status).not.toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    // The old-format amend record committed before the crash.
    const runs = fs.readdirSync(path.join(deployedTaskDir, "runs"));
    expect(runs.some((r) => r.includes("architect-wave-report-1-1"))).toBe(true);

    // Restart: the old-format amend record must be invalidated + re-run
    // (journal wave_report_old_format_rerun) with a NEW-format decision,
    // then waves complete and the iteration closes.
    const harness2 = new FakeHarness();
    harness2.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-new", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    // Crash-era architect session unknown to the fresh harness → rehydrate.
    harness2.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1#rehydrated`, {
      ok: true,
      data: { id: "dec-new", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    // Single wave: restart re-runs the wave-1 report, then closes up.
    harness2.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All done" },
    });
    harness2.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Delivered" },
    });
    // architect-closeup reuses the architect session; the crash-era session id
    // is unknown to the fresh harness, so it rehydrates once on this label.
    harness2.scriptOutcome(`${task}/runs/architect-closeup-1#a1#rehydrated`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Delivered" },
    });
    const res2 = await runTask(
      { harness: harness2, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res2.status).toBe("done");
    // The old-format record is still on disk un-reused (wave-1 merged state
    // skips the wave, but the amend path never consumed the stale record:
    // no edits-1.1.yaml was written from it).
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.1.yaml"))).toBe(false);
  });

  it("old-format amend record is invalidated and re-run when its wave re-executes", async () => {
    const task = "amend-oldfmt-rerun";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    // Wave 1 item stays PENDING (no develop script runs it to completion in
    // run 1 — crash before the wave-1 merge), so restart re-executes wave 1
    // and hits the loop-top old-format check.
    scriptPlan(
      harness,
      task,
      [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
      [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    // Run 1: crash during wave-1 develop — nothing wave-1 commits.
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, () => {
      throw new Error("simulated crash in wave-1 develop");
    });
    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    ).catch((e) => ({ status: "crashed", error: String(e) }));
    expect((res as any).status).not.toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);

    // Seed an old-format ok amend record + wave artifact "from the old version".
    const runsDir = path.join(deployedTaskDir, "runs");
    const seedDir = path.join(runsDir, "099-architect-wave-report-1-1-a1");
    fs.mkdirSync(seedDir, { recursive: true });
    fs.writeFileSync(path.join(seedDir, "input.md"), "seeded old-format wave report\n");
    fs.writeFileSync(
      path.join(seedDir, "meta.yaml"),
      yaml.stringify({ seq: 99, name: "architect-wave-report-1-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: new Date().toISOString(), endedAt: new Date().toISOString() })
    );
    fs.writeFileSync(
      path.join(seedDir, "output.yaml"),
      yaml.stringify({ id: "dec-old", context: "wave", decision: "amend", rationale: "seeded old format", timestamp: new Date().toISOString() })
    );
    fs.mkdirSync(path.join(deployedTaskDir, "waves"), { recursive: true });
    fs.writeFileSync(
      path.join(deployedTaskDir, "waves", "wave-1.1.yaml"),
      yaml.stringify({ wave: 1, iteration: 1, status: "complete", mergedItems: [], failedItems: [], blockedItems: [], summary: "seeded" })
    );
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["add", "-A"], { cwd: taskWtPath });
    execFileSync("git", ["commit", "-m", "seed old-format wave report", "--allow-empty"], { cwd: taskWtPath });

    // Restart: wave 1 re-executes (base-1 pending), hits the loop-top check,
    // invalidates the seeded record, and re-runs the report fresh.
    const harness2 = new FakeHarness();
    // Crashed wave-1 develop retries on restart.
    harness2.scriptOutcome(`${task}/items/base-1/develop#a2`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness2.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    harness2.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a2`, {
      ok: true,
      data: { id: "dec-new", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness2.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a2#rehydrated`, {
      ok: true,
      data: { id: "dec-new", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness2.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All done" },
    });
    harness2.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Delivered" },
    });
    const res2 = await runTask(
      { harness: harness2, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res2.status).toBe("done");
    const journal2 = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal2).toContain("wave_report_old_format_rerun");
    const rerunCalls = harness2.calls.filter((c) => c.type === "run");
    expect(rerunCalls.some((c) => (c as any).run.label === `${task}/runs/architect-wave-report-1-1#a2`)).toBe(true);
    // Seeded record files were removed (only the dir skeleton may remain).
    expect(fs.existsSync(path.join(seedDir, "output.yaml"))).toBe(false);
  });

  it("prompts contain the injected taskStatus block for architect and PM steps", async () => {
    const task = "status-block-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
      expect(run.prompt).toContain("## Task Status");
      expect(run.prompt).toContain("iteration: 1");
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [{ slug: "a-1", kind: "dev", title: "A", milestoneId: "m1" }],
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, (run) => {
      expect(run.prompt).toContain("## Task Status");
      return {
        ok: true,
        data: {
          iteration: 1,
          items: [
            { slug: "a-1", outlineRef: "a-1", kind: "dev", title: "A", assignment: "Work", milestone: "m1", wave: 1 },
          ],
        },
      };
    });
    harness.scriptOutcome(`${task}/items/a-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "A done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["a-1"], summary: "Wave 1 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
      expect(run.prompt).toContain("## Task Status");
      expect(run.prompt).toContain("a-1");
      expect(run.prompt).toContain("merged: a-1");
      return {
        ok: true,
        data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
      };
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "All done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, (run) => {
      expect(run.prompt).toContain("## Task Status");
      return {
        ok: true,
        data: { iteration: 1, status: "complete", summary: "Delivered" },
      };
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");
  });

  it("resolveAgentTools: config tools override frontmatter; empty = yield-only", () => {
    expect(resolveAgentTools("pm", ["read", "grep"], { agents: { pm: { role: "x", tools: [] } } })).toEqual([]);
    expect(resolveAgentTools("pm", ["read"], { agents: { pm: { role: "x", tools: ["bash"] } } })).toEqual(["bash"]);
    expect(resolveAgentTools("pm", ["read"], { agents: { pm: { role: "x" } } })).toEqual(["read"]);
    expect(resolveAgentTools("pm", ["read"], undefined)).toEqual(["read"]);
  });

  it("step-runner guard rejects a PM step whose resolved tools carry file tools", async () => {
    const task = "pm-guard-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });
    const harness = new FakeHarness();
    const pipeline = makePipeline();
    pipeline.agents!.pm = { role: "alt-workhorse", tools: ["read", "grep"] };

    const res = await runAgentStep({
      task,
      stepId: "pm-edits-1",
      stepFragment: "steps/pm-edits",
      agent: "pm",
      role: "alt-workhorse",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: "{}",
        taskStatus: "s",
        kinds: "k",
        citations: "c",
        limits: "l",
        storyKindsCriteria: "sc",
      },
    });

    expect(res.meta.error).toContain("yield-only");
    expect(harness.calls.length).toBe(0);
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_tools_guard_rejected");
  });

  it("step-runner guard rejects a PM step when structuredOutput carries file tools", async () => {
    const task = "pm-guard-structured-task";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });
    const harness = new FakeHarness();
    const pipeline = makePipeline();
    // structuredOutput ['yield','read'] appends a file tool to the PM turn → reject.
    pipeline.tools = { defaults: ["edit", "bash"], structuredOutput: ["yield", "read"] } as any;

    const res = await runAgentStep({
      task,
      stepId: "pm-edits-1",
      stepFragment: "steps/pm-edits",
      agent: "pm",
      role: "alt-workhorse",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: "{}",
        taskStatus: "s",
        kinds: "k",
        citations: "c",
        limits: "l",
        storyKindsCriteria: "sc",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe("error");
    expect(res.meta.error).toContain("yield-only");
    expect(harness.calls.length).toBe(0);
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_tools_guard_rejected");
  });
  it("removeItemSlugs with superseded + pending slugs applies (pending superseded, superseded no-op journaled)", async () => {
    const task = "amend-remove-mixed-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [
        { slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" },
        { slug: "stale-1", kind: "dev", title: "Stale", milestoneId: "m1" },
      ],
      [
        { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
        { slug: "stale-1", outlineRef: "stale-1", kind: "dev", title: "Stale", assignment: "Stale work", milestone: "m1", wave: 2 },
      ]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    // First amend removes pending stale-1 → superseded, applies alongside a
    // second wave-2 pending item. The wave-2 report then amends AGAIN removing
    // the now-superseded stale-1 plus the still-pending extra-1: stale-1 is a
    // no-op (amend_remove_noop), extra-1 is superseded, and the whole second
    // amend applies with no validation failure.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend-1",
        context: "wave",
        decision: "amend",
        planDelta: "Replace stale with fresh",
        outlines: [
          { slug: "fresh-1", kind: "dev", title: "Fresh", milestoneId: "m1" },
          { slug: "extra-1", kind: "dev", title: "Extra", milestoneId: "m1" },
        ],
        removeItemSlugs: ["stale-1"],
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "fresh-1", outlineRef: "fresh-1", kind: "dev", title: "Fresh", assignment: "F", milestone: "m1", wave: 2 },
          { slug: "extra-1", outlineRef: "extra-1", kind: "dev", title: "Extra", assignment: "X", milestone: "m1", wave: 3 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/fresh-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Fresh done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["fresh-1"], summary: "Wave 2 ok" },
    });
    // Second amend: stale-1 is superseded by now (no-op), extra-1 pending (removed).
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: {
        id: "dec-amend-2",
        context: "wave",
        decision: "amend",
        planDelta: "Replace extra with final",
        outlines: [{ slug: "final-1", kind: "dev", title: "Final", milestoneId: "m1" }],
        removeItemSlugs: ["stale-1", "extra-1"],
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-2#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 2,
        items: [
          { slug: "final-1", outlineRef: "final-1", kind: "dev", title: "Final", assignment: "Fin", milestone: "m1", wave: 3 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/final-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "final.txt"), "final\n");
      return { ok: true, data: { status: "ok", summary: "Final done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-3#a1`, {
      ok: true,
      data: { wave: 3, iteration: 1, status: "complete", mergedItems: ["final-1"], summary: "Wave 3 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-3#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    // No validation failure anywhere; the superseded re-removal journaled a no-op.
    expect(journal).not.toContain("pm_amend_validation_failed");
    expect(journal).toContain("amend_remove_noop");
    expect(journal).toContain("stale-1");
    // Both real removals wrote supersede decisions; the no-op wrote none.
    const decisions = fs.readdirSync(path.join(deployedTaskDir, "decisions"));
    expect(decisions.filter((d) => d.includes("amend-remove-stale-1")).length).toBe(1);
    expect(decisions.some((d) => d.includes("amend-remove-extra-1"))).toBe(true);
    // extra-1 never ran (superseded); final-1 did and merged.
    expect(harness.calls.some((c) => c.type === "run" && (c as any).run.label.startsWith(`${task}/items/extra-1/`))).toBe(false);
    expect(fs.existsSync(path.join(taskWtPath, "final.txt"))).toBe(true);
  });

  it("wave-close-up receives the engine gateDiff table", async () => {
    const task = "gatediff-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [{ slug: "a-1", kind: "dev", title: "A", milestoneId: "m1" }],
      [{ slug: "a-1", outlineRef: "a-1", kind: "dev", title: "A", assignment: "Work", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/a-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "A done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, (run) => {
      expect(run.prompt).toContain("## Gate Diff (baseline vs now)");
      expect(run.prompt).toContain("| gate | baseline | now | verdict |");
      return {
        ok: true,
        data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["a-1"], summary: "Wave 1 ok" },
      };
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");
  });

  it("removeItemSlugs on a running item is rejected but valid additions still apply (D2)", async () => {
    const task = "amend-remove-running-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    scriptPlan(
      harness,
      task,
      [
        { slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" },
        { slug: "slow-1", kind: "dev", title: "Slow", milestoneId: "m1" },
      ],
      [
        { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "Work", milestone: "m1", wave: 1 },
        { slug: "slow-1", outlineRef: "slow-1", kind: "dev", title: "Slow", assignment: "Work", milestone: "m1", wave: 2 },
      ]
    );
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "Base done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "Wave 1 ok" },
    });
    // slow-1 holds a committed `started` record (crashed mid-turn in a prior
    // run): deriveItemState reports it as running, so the wave-1 amend
    // removing it is rejected — but the valid fresh-1 addition still applies.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, () => {
      const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
      const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
      const stepsDir = path.join(deployedTaskDir, "items", "slow-1", "steps", "001-develop-r1-a1");
      fs.mkdirSync(stepsDir, { recursive: true });
      fs.writeFileSync(path.join(stepsDir, "input.md"), "seeded running turn\n");
      fs.writeFileSync(
        path.join(stepsDir, "meta.yaml"),
        yaml.stringify({ seq: 1, name: "develop", attempt: 1, fixRound: 1, agent: "developer", role: "workhorse", models: ["m"], status: "started", startedAt: new Date().toISOString() })
      );
      return {
        ok: true,
        data: {
          id: "dec-amend",
          context: "wave",
          decision: "amend",
          planDelta: "Replace slow",
          outlines: [{ slug: "fresh-1", kind: "dev", title: "Fresh", milestoneId: "m1" }],
          removeItemSlugs: ["slow-1"],
          timestamp: new Date().toISOString(),
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/pm-amend-1-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        amendmentIndex: 1,
        items: [
          { slug: "fresh-1", outlineRef: "fresh-1", kind: "dev", title: "Fresh", assignment: "F", milestone: "m1", wave: 2 },
        ],
      },
    });
    // fresh-1 runs in wave 2 (valid part applied); slow-1 retries its turn
    // (started → attempt 2) and merges.
    harness.scriptOutcome(`${task}/items/fresh-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "fresh.txt"), "fresh\n");
      return { ok: true, data: { status: "ok", summary: "Fresh done" } };
    });
    harness.scriptOutcome(`${task}/items/slow-1/develop#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "slow.txt"), "slow\n");
      return { ok: true, data: { status: "ok", summary: "Slow done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["slow-1", "fresh-1"], summary: "Wave 2 ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-c", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    scriptCloseup(harness, task);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    // Running-item removal rejected with reason; valid addition applied.
    expect(journal).toContain("pm_amend_removals_dropped");
    // JSON-escaped in the ndjson line.
    expect(journal).toContain('removeItemSlugs cannot remove \\"slow-1\\" with status \\"running\\"');
    // fresh-1 scheduled and merged; slow-1 ran and merged normally.
    expect(fs.existsSync(path.join(deployedTaskDir, "items", "fresh-1", "assignment.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "fresh.txt"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "slow.txt"))).toBe(true);
  });

  it("buildSchedulerWaitEvent: below threshold → undefined; above → shaped event", () => {
    expect(
      buildSchedulerWaitEvent({ wave: 3, iteration: 1, gapWallMs: 1000, gapActiveMs: 1000, readyCount: 0, hasGates: false, merges: [] })
    ).toBeUndefined();
    expect(
      buildSchedulerWaitEvent({ wave: 3, iteration: 1, gapWallMs: SCHEDULER_IDLE_THRESHOLD_MS, gapActiveMs: 1000, readyCount: 0, hasGates: false, merges: [] })
    ).toBeUndefined();
    const evt = buildSchedulerWaitEvent({ wave: 3, iteration: 1, gapWallMs: 211_632, gapActiveMs: 211_000, readyCount: 0, hasGates: true, merges: [] });
    expect(evt).toMatchObject({
      type: "scheduler_wait",
      wave: 3,
      iteration: 1,
      reason: "close-up gates + close-up turn",
      gapWallMs: 211_632,
      gapActiveMs: 211_000,
      merges: [],
    });
    const mergeEvt = buildSchedulerWaitEvent({ wave: 2, iteration: 1, gapWallMs: 90_000, gapActiveMs: 1000, readyCount: 2, hasGates: true, merges: ["a-1"] });
    expect((mergeEvt as any).reason).toBe("wave-end merge + close-up gates + close-up turn");
    const turnEvt = buildSchedulerWaitEvent({ wave: 4, iteration: 1, gapWallMs: 61_000, gapActiveMs: 61_000, readyCount: 0, hasGates: false, merges: [] });
    expect((turnEvt as any).reason).toBe("close-up turn (no ready items, no gates)");
  });
});
