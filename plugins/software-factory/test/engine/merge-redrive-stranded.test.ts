import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runIteration, partitionTickStragglers, readOpenIterationWaves, reassignItemWave, recoverStrandedItems } from "../../src/core/flows/iteration.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";

const TS = () => new Date().toISOString();

function makePipeline(): PipelineConfig {
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
      pm: { role: "alt-workhorse", tools: [] },
      developer: { role: "workhorse" },
      reviewer: { role: "task-reviewer" },
      qa: { role: "alt-workhorse" },
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
      maxStepAttempts: 3,
      maxFixRounds: 3,
      maxConsultsPerItem: 3,
      maxIterations: 3,
      maxEmptyWaves: 10,
    },
  } as unknown as PipelineConfig;
}

function setupCommon() {
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

/** Seeds a committed step record dir. */
async function seedRecord(
  wt: string,
  relDir: string,
  dirName: string,
  meta: Record<string, unknown>,
  output?: unknown,
): Promise<void> {
  const dir = path.join(wt, relDir, dirName);
  await fs.promises.mkdir(dir, { recursive: true });
  await writeYamlAtomic(path.join(dir, "meta.yaml"), meta);
  await fs.promises.writeFile(path.join(dir, "input.md"), "seeded\n");
  if (output !== undefined) await writeYamlAtomic(path.join(dir, "output.yaml"), output);
}

function fakeItem(slug: string, status: DerivedItemState["status"], wave = 1): DerivedItemState {
  return {
    slug, kind: "dev", title: slug, wave, deps: [], status, branch: `topic/t--${slug}`,
    records: [], currentAttempt: 1, currentFixRound: 1, isEscalated: false,
    freshSeries: false, interruptionCount: 0, suggestionFingerprints: [],
    decisionFingerprints: [], failingCheckFingerprints: [], consultCount: 0,
  };
}

describe("Defect 2: consult-retry re-drives merge (bounded); reconciler owns merge-stuck", () => {
  let ctx: ReturnType<typeof setupCommon>;
  beforeEach(() => {
    ctx = setupCommon();
  });
  afterEach(() => {
    ctx.tmpRepo.cleanup();
  });

  it("partitionTickStragglers excludes merge-attempted items (merge-owned, not tick stragglers)", async () => {
    const { tmpRepo } = ctx;
    const taskDir = path.join(tmpRepo.dir, ".factory", "t-part");
    await fs.promises.mkdir(path.join(taskDir, "items", "merge-stuck"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "merge-stuck", "merge-attempts.yaml"), {
      attempts: { "2": 1 },
    });
    const items = [
      fakeItem("merge-stuck", "running", 2),
      fakeItem("plain-stuck", "running", 2),
      fakeItem("dep-waiter", "pending", 2),
    ];
    const waveState = deriveWaveState({ wave: 2, items });
    const { stragglers, mergeOwned } = await partitionTickStragglers(taskDir, 2, waveState);
    expect(mergeOwned).toEqual(["merge-stuck"]);
    expect(stragglers).toContain("plain-stuck");
    expect(stragglers).not.toContain("merge-stuck");
  });

  it("merge failure with retry consult re-drives the merge; exhaustion is terminal and bounded", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-mergeredrive";
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch);
    const taskWt = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createWorktree(parentBranch, taskWt);
    const taskDir = path.join(taskWt, orchFolder, task);
    const relTask = path.join(orchFolder, task);

    await fs.promises.mkdir(path.join(taskDir, "plan"), { recursive: true });
    const plan = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "e1", kind: "dev", title: "E1", milestoneId: "m1" }],
    };
    await writeYamlAtomic(path.join(taskDir, "plan", "plan-1.yaml"), plan);
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-1.0.yaml"), {
      iteration: 1, amendmentIndex: 0,
      items: [{ slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w", wave: 1 }],
    });
    await fs.promises.mkdir(path.join(taskDir, "items", "e1"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "e1", "assignment.yaml"), {
      slug: "e1", kind: "dev", title: "E1", assignment: "w", wave: 1, deps: [],
    });
    await fs.promises.writeFile(path.join(taskDir, "INTENT.md"), "merge redrive\n");
    // Infra: a gate that always fails + testRunner; target-green consults
    // the architect instead of re-running blindly.
    await writeYamlAtomic(path.join(taskDir, "infra.yaml"), {
      setup: [],
      gates: [{ id: "badgate", command: "false" }],
      testRunner: { command: "true" },
    });
    await fs.promises.writeFile(path.join(taskWt, "shared.txt"), "parent v1\n");
    await seedRecord(taskWt, path.join(relTask, "runs"), "001-architect-plan-1-a1",
      { seq: 1, name: "architect-plan-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, plan);
    await seedRecord(taskWt, path.join(relTask, "runs"), "002-pm-edits-1-a1",
      { seq: 2, name: "pm-edits-1", attempt: 1, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, { iteration: 1, items: [] });
    // e1 is ready: develop+review ok records with no target (gates fail the merge).
    const stepsRel = path.join(relTask, "items", "e1", "steps");
    await seedRecord(taskWt, stepsRel, "001-develop-r1-a1",
      { seq: 1, name: "develop", attempt: 1, fixRound: 1, agent: "developer", role: "workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() },
      { status: "ok", summary: "E1 done" });
    // Fork the child BRANCH (not worktree) at the pre-advance tip: the merge
    // path's ensureChildWorktree checks it out, the parent moves on, and the
    // merge sees a tree diff so the verify gates run.
    tmpRepo.createBranch(`topic/${task}--e1`);
    // Parent-side change so the merge changes the child tree and gates run
    // (committed via the task worktree, which has the parent branch checked out).
    await fs.promises.writeFile(path.join(taskWt, "parent-only.txt"), "parent side\n");
    tmpRepo.git(["add", "-A"], { cwd: taskWt });
    tmpRepo.git(["commit", "-m", "parent advances"], { cwd: taskWt });
    await seedRecord(taskWt, stepsRel, "002-review-r1-a1",
      { seq: 2, name: "review", attempt: 1, fixRound: 1, agent: "reviewer", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() },
      { status: "approved", summary: "ok", suggestions: [] });
    tmpRepo.git(["add", "-A"], { cwd: taskWt });
    tmpRepo.git(["commit", "-m", "seed merge redrive test"], { cwd: taskWt });

    const pipeline = makePipeline();
    const harness = new FakeHarness();
    // Every merge consult retries with guidance (zero content change).
    harness.scriptOutcome(`${task}/runs/consult-e1-1#a1`, {
      ok: true,
      data: { id: "dec-m", context: "item", decision: "retry-with-guidance", text: "retry merge", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "has_failures", mergedItems: [], failedItems: [], summary: "w" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true, data: { id: "dec-w", context: "wave", decision: "continue", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "next-iteration", summary: "stalled" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "next-iteration", summary: "stalled" },
    });

    // The iteration cannot merge e1 (gates never pass): after the bounded
    // redrive the item fails terminally with the evidence (abandon decision)
    // and the wave gate absorbs it as failed.
    const res = await runIteration({
      task, taskDir, taskWt, parentBranch, repo: repoObj, harness, pipeline, project, prompts,
    });
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    // Merge ran twice (initial + consult-retry redrive), then terminal.
    const startedCount = (journal.match(/"type":"item_merge_started","item":"e1"/g) ?? []).length;
    expect(startedCount).toBe(2);
    expect(journal).toContain("merge_failed_terminal");
    // Bounded: never a third attempt, even through the iteration redrive.
    expect(journal).not.toContain('"mergeAttempt":3');
    // Exhaustion persisted a terminal abandon: the item derives failed with
    // the recorded evidence, so the wave/iteration gates absorb it.
    const { deriveItemState: deriveSt } = await import("../../src/core/derive/item.js");
    const e1 = await deriveSt({ taskDir, itemSlug: "e1", parentBranch, taskWt, pipeline });
    expect(e1.status).toBe("failed");
  });
});

describe("Defect 3: stranded re-queue lands in a live wave and ticks", () => {
  let ctx: ReturnType<typeof setupCommon>;
  beforeEach(() => {
    ctx = setupCommon();
  });
  afterEach(() => {
    ctx.tmpRepo.cleanup();
  });

  it("reassigns a stale wave into the open wave set", async () => {
    const { tmpRepo } = ctx;
    const taskDir = path.join(tmpRepo.dir, ".factory", "t-recover");
    await fs.promises.mkdir(path.join(taskDir, "items", "s1"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "s1", "assignment.yaml"), {
      slug: "s1", kind: "fact-finder", title: "S1", assignment: "work", wave: 99, deps: [],
    });
    await fs.promises.mkdir(path.join(taskDir, "plan"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-2.0.yaml"), {
      iteration: 2, amendmentIndex: 0,
      items: [
        { slug: "a", outlineRef: "a", kind: "dev", title: "A", assignment: "w", wave: 1 },
        { slug: "s1", outlineRef: "s1", kind: "fact-finder", title: "S1", assignment: "work", wave: 1 },
      ],
    });
    await writeYamlAtomic(path.join(taskDir, "closeup-1.yaml"), { iteration: 1, status: "complete" });

    expect(await readOpenIterationWaves(taskDir, 2)).toEqual([1]);
    const requeued = await recoverStrandedItems({
      taskDir, task: "t-recover", taskWt: tmpRepo.dir, parentBranch: "topic/t-recover",
      pipeline: makePipeline(), iteration: 2, currentIterationItems: ["a"],
    });
    expect(requeued).toContain("s1");
    // Wave stamped into the live set — the wave loop will actually tick it.
    const { readYaml } = await import("../../src/core/records/io.js");
    const assignment = await readYaml<{ wave: number }>(path.join(taskDir, "items", "s1", "assignment.yaml"));
    expect(assignment.wave).toBe(1);
  });

  it("leaves an already-live wave untouched", async () => {
    const { tmpRepo } = ctx;
    const taskDir = path.join(tmpRepo.dir, ".factory", "t-recover2");
    await fs.promises.mkdir(path.join(taskDir, "items", "s1"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "s1", "assignment.yaml"), {
      slug: "s1", kind: "dev", title: "S1", assignment: "work", wave: 2, deps: [],
    });
    await fs.promises.mkdir(path.join(taskDir, "plan"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-2.0.yaml"), {
      iteration: 2, amendmentIndex: 0,
      items: [{ slug: "s1", outlineRef: "s1", kind: "dev", title: "S1", assignment: "work", wave: 2 }],
    });
    await writeYamlAtomic(path.join(taskDir, "closeup-1.yaml"), { iteration: 1, status: "complete" });

    const requeued = await recoverStrandedItems({
      taskDir, task: "t-recover2", taskWt: tmpRepo.dir, parentBranch: "topic/t-recover2",
      pipeline: makePipeline(), iteration: 2, currentIterationItems: [],
    });
    expect(requeued).toContain("s1");
    const { readYaml } = await import("../../src/core/records/io.js");
    const assignment = await readYaml<{ wave: number }>(path.join(taskDir, "items", "s1", "assignment.yaml"));
    expect(assignment.wave).toBe(2);
  });

  it("reassignItemWave persists the wave", async () => {
    const { tmpRepo } = ctx;
    const taskDir = path.join(tmpRepo.dir, ".factory", "t-reassign");
    await fs.promises.mkdir(path.join(taskDir, "items", "s1"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "s1", "assignment.yaml"), {
      slug: "s1", kind: "dev", title: "S1", assignment: "work", wave: 7, deps: [],
    });
    await reassignItemWave(taskDir, "s1", 1);
    const { readYaml } = await import("../../src/core/records/io.js");
    const assignment = await readYaml<{ wave: number }>(path.join(taskDir, "items", "s1", "assignment.yaml"));
    expect(assignment.wave).toBe(1);
  });

  it("strand → restart → re-queued item lands in the live tick set and completes a step", async () => {
    const { tmpRepo, repoObj, project, prompts } = ctx;
    const task = "t-retick";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const parentBranch = `topic/${task}`;
    // Stranded mid-flow: develop ok, review ok-with-fix (fix round pending).
    await fs.promises.mkdir(path.join(taskDir, "items", "s1", "steps"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "s1", "assignment.yaml"), {
      slug: "s1", kind: "dev", title: "S1", assignment: "work", wave: 99, deps: [],
    });
    const TS = () => new Date().toISOString();
    const stepsDir = path.join(taskDir, "items", "s1", "steps");
    for (const [dir, name, output] of [
      ["001-develop-r1-a1", "develop", { status: "ok", summary: "done" }],
      ["002-review-r1-a1", "review", { status: "ok", summary: "fix please", suggestions: [{ id: "f1", disposition: "fix", summary: "cover it" }] }],
    ] as const) {
      await fs.promises.mkdir(path.join(stepsDir, dir), { recursive: true });
      await writeYamlAtomic(path.join(stepsDir, dir, "meta.yaml"), {
        seq: dir.startsWith("001") ? 1 : 2, name, attempt: 1, fixRound: 1,
        agent: "developer", role: "workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS(),
      });
      await writeYamlAtomic(path.join(stepsDir, dir, "output.yaml"), output);
    }
    await fs.promises.mkdir(path.join(taskDir, "plan"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-2.0.yaml"), {
      iteration: 2, amendmentIndex: 0,
      items: [{ slug: "s1", outlineRef: "s1", kind: "dev", title: "S1", assignment: "work", wave: 1 }],
    });
    await writeYamlAtomic(path.join(taskDir, "closeup-1.yaml"), { iteration: 1, status: "complete" });
    tmpRepo.commit("scaffold stranded item");
    tmpRepo.createBranch(parentBranch);
    const childWt = tmpRepo.createWorktree(`${parentBranch}--s1`);

    // Restart recovery re-queues the stranded item into the live wave ...
    const requeued = await recoverStrandedItems({
      taskDir, task, taskWt: tmpRepo.dir, parentBranch,
      pipeline: makePipeline(), iteration: 2, currentIterationItems: [],
    });
    expect(requeued).toContain("s1");
    // ... and the re-queued item is tickable: the fix round runs develop.
    const { tickItemMachine } = await import("../../src/core/flows/item-machine.js");
    const { deriveItemState: derive } = await import("../../src/core/derive/item.js");
    const { deriveWaveState: waveOf } = await import("../../src/core/derive/wave.js");
    const st = await derive({ taskDir, itemSlug: "s1", parentBranch, taskWt: tmpRepo.dir, pipeline: makePipeline() });
    expect(st.wave).toBe(1);
    const ws = waveOf({ wave: 1, items: [st] });
    expect(ws.running.map((i) => i.slug)).toContain("s1");
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/items/s1/develop#a1`, {
      ok: true, data: { status: "ok", summary: "fixed" },
    });
    const tickRes = await tickItemMachine({
      task, itemSlug: "s1", parentBranch, taskWt: tmpRepo.dir, childWt, taskDir,
      repo: repoObj, harness, pipeline: makePipeline(), project, prompts,
    });
    expect(tickRes.stepRan).toBe("develop");
  });
});
