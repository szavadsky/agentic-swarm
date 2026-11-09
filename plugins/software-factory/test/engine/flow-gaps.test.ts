import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { runIteration } from "../../src/core/flows/iteration.js";
import { tickItemMachine } from "../../src/core/flows/item-machine.js";
import { runNonItemConsult } from "../../src/core/flows/consults.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { deriveItemState } from "../../src/core/derive/item.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import { checkConsultsPerItem } from "../../src/core/loops.js";
import { readYaml } from "../../src/core/records/io.js";

const TS = () => new Date().toISOString();

function makePipeline(extraLimits?: Record<string, number>): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "deepseek-chat" },
        "alt-workhorse": { model: "deepseek-chat" },
        architect: { model: "deepseek-reasoner" },
        "alt-architect": { model: "deepseek-reasoner" },
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
      qa: { role: "alt-workhorse" },
      reviewer: { role: "alt-workhorse" },
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
            { id: "review", agent: "reviewer", role: "alt-workhorse" },
          ],
        },
        poc: {
          steps: [
            { id: "develop", agent: "developer", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "alt-workhorse" },
          ],
        },
      },
      spike: {},
    },
    limits: {
      maxStepAttempts: 3,
      maxFixRounds: 3,
      maxConsultsPerItem: 3,
      maxIterations: 3,
      maxEmptyWaves: 3,
      ...(extraLimits ?? {}),
    },
  } as unknown as PipelineConfig;
}

function setupCommon(): {
  tmpRepo: TmpRepo;
  worktreeRoot: string;
  repoObj: Repo;
  project: ProjectConfig;
  prompts: any;
  orchFolder: string;
} {
  const tmpRepo = createTmpRepo();
  const worktreeRoot = path.join(tmpRepo.dir + "-wt");
  fs.mkdirSync(worktreeRoot, { recursive: true });
  const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
  const orchFolder = ".factory";
  const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot };
  const prompts = loadPromptLibrary({
    builtinDir: path.resolve(import.meta.dir, "../../agents"),
    overrideDirs: [],
  });
  return { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder };
}

function scriptIngestPlan(
  harness: FakeHarness,
  task: string,
  outlines: Array<Record<string, unknown>>,
  editsItems: Array<Record<string, unknown>>,
): void {
  harness.scriptOutcome(`${task}/runs/triage#a1`, {
    ok: true,
    data: { kind: "story", rationale: "s", citations: [] },
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

function scriptCloseups(harness: FakeHarness, task: string, finalStatus = "complete"): void {
  harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "done" },
  });
  harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
    ok: true,
    data: { iteration: 1, status: finalStatus, summary: "closeup" },
  });
}

describe("Flow gaps: consult-exhaust abandon, dead detector, human-stop, architect consult", () => {
  let ctx: ReturnType<typeof setupCommon>;
  beforeEach(() => {
    ctx = setupCommon();
  });
  afterEach(() => {
    ctx.tmpRepo.cleanup();
  });

  it("consults-exhausted persists an abandon decision and derive reads failed", async () => {
    const { tmpRepo, repoObj, project, prompts } = ctx;
    const task = "gap-exhaust";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "x-1";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "poc", title: "X", assignment: "Do X", wave: 1, deps: [] }),
    );
    const pipeline = makePipeline({ maxStepAttempts: 1, maxConsultsPerItem: 1 });
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch);

    // Seed one prior consult decision so consultCount=1=maxConsults.
    const decisionsDir = path.join(taskDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });
    const { writeYamlAtomic } = await import("../../src/core/records/io.js");
    await writeYamlAtomic(path.join(decisionsDir, "001-item-x-1-1.yaml"), {
      id: "dec-prior",
      context: "item",
      item: itemSlug,
      decision: "retry-with-guidance",
      afterRecord: "000-boot-a0",
      timestamp: TS(),
    });

    // Seed a rejected develop record (attempt 1 of max 1).
    const relTaskDir = path.relative(tmpRepo.dir, taskDir);
    const stepsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps", "001-develop-a1");
    fs.mkdirSync(stepsDir, { recursive: true });
    await writeYamlAtomic(path.join(stepsDir, "meta.yaml"), {
      seq: 1, name: "develop", attempt: 1, agent: "developer", role: "workhorse",
      models: ["m"], status: "rejected", startedAt: TS(), endedAt: TS(),
    });

    const harness = new FakeHarness();
    const res = await tickItemMachine({
      task,
      itemSlug,
      parentBranch,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });
    expect(res.done).toBe(true);
    expect(res.status).toBe("failed");

    // Abandon decision persisted with consults-exhausted reason, no afterRecord (fresh/sticky).
    const dfiles = (await fs.promises.readdir(decisionsDir)).sort();
    const abandonFile = dfiles[dfiles.length - 1]!;
    const abandon = await readYaml<any>(path.join(decisionsDir, abandonFile));
    expect(abandon.decision).toBe("abandon");
    expect(abandon.item).toBe(itemSlug);
    expect(abandon.reason).toBe("consults-exhausted");
    expect(abandon.afterRecord).toBeUndefined();

    const derived = await deriveItemState({ taskDir, itemSlug, parentBranch, taskWt: tmpRepo.dir, pipeline });
    expect(derived.status).toBe("failed");

    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("item_failed_consults_exhausted");
    // state.yaml refreshed after the decision write (lags journal by design).
    expect(fs.existsSync(path.join(taskDir, "state.yaml"))).toBe(true);
  });

  it("same-decision-twice short-circuits the dead no-progress detector", () => {
    // Without the current fingerprint the loop spins to the cap; with it, it stops.
    const fps = ["retry-with-guidance"];
    const without = checkConsultsPerItem(0, 3, false, fps);
    expect(without.noProgress).toBe(false);
    const withCurrent = checkConsultsPerItem(0, 3, false, fps, fps[fps.length - 1]);
    expect(withCurrent.noProgress).toBe(true);
  });

  it("human-stop suggestions persist as blocking steer questions", async () => {
    const { tmpRepo, repoObj, project, prompts } = ctx;
    const task = "gap-humanstop";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "s-1";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "poc", title: "S", assignment: "Do S", wave: 1, deps: [] }),
    );
    const pipeline = makePipeline();
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch);

    // Seed an ok develop record so the machine advances to review.
    const { writeYamlAtomic } = await import("../../src/core/records/io.js");
    const relTaskDir = path.relative(tmpRepo.dir, taskDir);
    const stepsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps", "001-develop-a1");
    fs.mkdirSync(stepsDir, { recursive: true });
    await writeYamlAtomic(path.join(stepsDir, "meta.yaml"), {
      seq: 1, name: "develop", attempt: 1, agent: "developer", role: "workhorse",
      models: ["m"], status: "ok", startedAt: TS(), endedAt: TS(),
    });
    await writeYamlAtomic(path.join(stepsDir, "output.yaml"), { status: "ok", summary: "dev done" });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "stop",
        suggestions: [{ id: "h1", disposition: "human-stop", summary: "Halt now", detail: "Operator must decide" }],
      },
    });
    const res = await tickItemMachine({
      task, itemSlug, parentBranch, taskWt: tmpRepo.dir, childWt, taskDir,
      repo: repoObj, harness, pipeline, project, prompts,
    });
    expect(res.done).toBe(true);
    expect(res.status).toBe("blocked");

    const qdir = path.join(taskDir, "steer", "tousertoreview");
    const qfiles = (await fs.promises.readdir(qdir)).filter((f) => f.endsWith(".yaml"));
    expect(qfiles.length).toBe(1);
    const q = await readYaml<any>(path.join(qdir, qfiles[0]!));
    expect(q.disposition).toBe("human-stop");
    expect(q.blocks).toContain(itemSlug);

    const derived = await deriveItemState({ taskDir, itemSlug, parentBranch, taskWt: tmpRepo.dir, pipeline });
    expect(derived.status).toBe("blocked");
  });

  it("architect-disposition suggestions route to the consult path", async () => {
    const { tmpRepo, repoObj, project, prompts } = ctx;
    const task = "gap-architect";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "a-1";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "poc", title: "A", assignment: "Do A", wave: 1, deps: [] }),
    );
    const pipeline = makePipeline();
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch);

    const { writeYamlAtomic } = await import("../../src/core/records/io.js");
    const relTaskDir = path.relative(tmpRepo.dir, taskDir);
    const stepsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps", "001-develop-a1");
    fs.mkdirSync(stepsDir, { recursive: true });
    await writeYamlAtomic(path.join(stepsDir, "meta.yaml"), {
      seq: 1, name: "develop", attempt: 1, agent: "developer", role: "workhorse",
      models: ["m"], status: "ok", startedAt: TS(), endedAt: TS(),
    });
    await writeYamlAtomic(path.join(stepsDir, "output.yaml"), { status: "ok", summary: "dev done" });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: {
        status: "approved",
        summary: "looks fine but architect should weigh in",
        suggestions: [{ id: "ar1", disposition: "architect", summary: "Reconsider the API shape", detail: "Maybe paginate" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/consult-${itemSlug}-1#a1`, {
      ok: true,
      data: { id: "dec-ar", context: "item", decision: "retry-with-guidance", text: "paginate it", timestamp: TS() },
    });
    const res = await tickItemMachine({
      task, itemSlug, parentBranch, taskWt: tmpRepo.dir, childWt, taskDir,
      repo: repoObj, harness, pipeline, project, prompts,
    });
    expect(res.consulted).toBe(true);
    expect(res.status).toBe("running");
    const dfiles = await fs.promises.readdir(path.join(taskDir, "decisions"));
    expect(dfiles.length).toBeGreaterThan(0);
  });
});
