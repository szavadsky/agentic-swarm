import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml } from "../../src/core/records/io.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

function makePipeline(maxAmendments: number): PipelineConfig {
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
      maxAmendmentsPerIteration: maxAmendments,
    },
  };
}

function setupTask(tmpRepo: TmpRepo, task: string, orchFolder: string): void {
  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
  tmpRepo.commit(`Add intent for ${task}`);
}

describe("D2: amend evidence — budget-exhausted drops journal outlines; removal-invalid keeps valid parts", () => {
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

  it("maxAmendments=0: amend decision drops loudly with outlines + removals journaled", async () => {
    const task = "amend-budget-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline(0);
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
        itemOutlines: [{ slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" }],
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
        items: [{ slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "w", milestone: "m1", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "base.txt"), "base\n");
      return { ok: true, data: { status: "ok", summary: "done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "ok" },
    });
    // Architect asks amend, but the budget is 0 -> must drop with evidence.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "add extra",
        outlines: [{ slug: "extra-1", kind: "dev", title: "Extra", milestoneId: "m1" }],
        removeItemSlugs: ["base-1"],
        timestamp: new Date().toISOString(),
      },
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
    expect(res.status).toBe("done");
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    // Loud drop: amendment + cap named, outlines + removals quoted.
    expect(journal).toContain("pm_amend_discarded");
    expect(journal).toContain("budget exhausted");
    expect(journal).toContain("extra-1");
    expect(journal).toContain("base-1");
    // Budget-exhausted amend mutates nothing on disk: no edits-1.1.yaml, and
    // the base plan still lacks the dropped outline (re-decide next wave —
    // the discarded note surfaces in the next wave-report prompt).
    const planFiles = fs.readdirSync(path.join(deployedTaskDir, "plan"));
    expect(planFiles).not.toContain("edits-1.1.yaml");
    const basePlan = await readYaml<any>(path.join(deployedTaskDir, "plan", "plan-1.yaml"));
    expect((basePlan.itemOutlines ?? []).map((o: any) => o.slug)).not.toContain("extra-1");
    // No pm-amend step ran (budget exhausted before the PM turn).
    expect(journal).not.toContain("pm-amend-1-1");
  });

  it("removal-invalid no longer swallows valid PM items: valid parts apply, errors journaled", async () => {
    const task = "amend-partial-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline(3);
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
        itemOutlines: [
          { slug: "base-1", kind: "dev", title: "Base", milestoneId: "m1" },
          { slug: "stale-1", kind: "dev", title: "Stale", milestoneId: "m1" },
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
          { slug: "base-1", outlineRef: "base-1", kind: "dev", title: "Base", assignment: "w", milestone: "m1", wave: 1 },
          { slug: "stale-1", outlineRef: "stale-1", kind: "dev", title: "Stale", assignment: "s", milestone: "m1", wave: 2 },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/base-1/develop#a1`, {
      ok: true,
      data: { status: "ok", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["base-1"], summary: "ok" },
    });
    // Amend: fresh-1 is valid, but removeItemSlugs names merged base-1 (invalid)
    // and unknown ghost (invalid). Valid parts must still apply.
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-amend",
        context: "wave",
        decision: "amend",
        planDelta: "add fresh, drop merged+ghost",
        outlines: [{ slug: "fresh-1", kind: "dev", title: "Fresh", milestoneId: "m1" }],
        removeItemSlugs: ["base-1", "ghost-1"],
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
      return { ok: true, data: { status: "ok", summary: "done" } };
    });
    harness.scriptOutcome(`${task}/items/stale-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "stale.txt"), "stale\n");
      return { ok: true, data: { status: "ok", summary: "done" } };
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", mergedItems: ["fresh-1", "stale-1"], summary: "ok" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "d2", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
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
    expect(res.status).toBe("done");
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    // Dropped removals journaled by name; valid items applied.
    expect(journal).toContain("pm_amend_removals_dropped");
    expect(journal).toContain("ghost-1");
    expect(fs.existsSync(path.join(deployedTaskDir, "items", "fresh-1", "assignment.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(taskWtPath, "fresh.txt"))).toBe(true);
  });
});
