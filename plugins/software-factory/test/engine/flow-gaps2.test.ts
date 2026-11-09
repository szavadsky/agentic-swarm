import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { runIteration } from "../../src/core/flows/iteration.js";
import { runNonItemConsult } from "../../src/core/flows/consults.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import { deriveItemState } from "../../src/core/derive/item.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import { writeYamlAtomic, readYaml } from "../../src/core/records/io.js";
import { git } from "../../src/core/git/exec.js";

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
        "plan-close-up": { model: "plan-close-up" },
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
  await writeYamlAtomic(path.join(dir, "input.md" as string).replace(/\.md$/, ".tmp"), "x").catch(() => {});
  await fs.promises.writeFile(path.join(dir, "input.md"), "seeded\n");
  if (output !== undefined) await writeYamlAtomic(path.join(dir, "output.yaml"), output);
}

describe("Flow gaps: resume, merge requeue, phantom, answered, trust, batch, reconciler", () => {
  let ctx: ReturnType<typeof setupCommon>;
  beforeEach(() => {
    ctx = setupCommon();
  });
  afterEach(() => {
    ctx.tmpRepo.cleanup();
  });

  it("wave resume re-ticks unblocked stragglers instead of skipping (wave_resume_reopened + epic_closeup_cleared)", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-resume";
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch);
    const taskWt = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createWorktree(parentBranch, taskWt);
    const taskDir = path.join(taskWt, orchFolder, task);
    const relTask = path.join(orchFolder, task);

    // Seed plan + edits + assignments: e1 (abandoned=failed), e2 (pending straggler).
    await fs.promises.mkdir(path.join(taskDir, "plan"), { recursive: true });
    const plan = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [
        { slug: "e1", kind: "dev", title: "E1", milestoneId: "m1" },
        { slug: "e2", kind: "dev", title: "E2", milestoneId: "m1" },
      ],
    };
    await writeYamlAtomic(path.join(taskDir, "plan", "plan-1.yaml"), plan);
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-1.0.yaml"), {
      iteration: 1,
      amendmentIndex: 0,
      items: [
        { slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w1", milestone: "m1", wave: 1 },
        { slug: "e2", outlineRef: "e2", kind: "dev", title: "E2", assignment: "w2", milestone: "m1", wave: 1 },
      ],
    });
    for (const [slug, asg] of [["e1", "w1"], ["e2", "w2"]] as const) {
      await fs.promises.mkdir(path.join(taskDir, "items", slug), { recursive: true });
      await writeYamlAtomic(path.join(taskDir, "items", slug, "assignment.yaml"), {
        slug, kind: "dev", title: slug.toUpperCase(), assignment: asg, wave: 1, deps: [],
      });
    }
    await fs.promises.writeFile(path.join(taskDir, "INTENT.md"), "resume\n");
    // e1 abandoned -> failed (terminal).
    await fs.promises.mkdir(path.join(taskDir, "decisions"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "decisions", "001-item-e1-1.yaml"), {
      id: "dec-e1", context: "item", item: "e1", decision: "abandon", reason: "seed", timestamp: TS(),
    });
    // Stale epic child-closeup on e2 (epic-gated resume clears it).
    await writeYamlAtomic(path.join(taskDir, "items", "e2", "child-closeup.yaml"), {
      epic: "e2", status: "blocked", iteration: 1, summary: "stale",
    });
    // Wave artifact + ok committed wave-report record => resume path.
    await fs.promises.mkdir(path.join(taskDir, "waves"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "waves", "wave-1.1.yaml"), {
      wave: 1, iteration: 1, status: "complete", mergedItems: [], failedItems: ["e1"], blockedItems: [], summary: "seed",
    });
    await seedRecord(taskWt, path.join(relTask, "runs"), "001-architect-plan-1-a1",
      { seq: 1, name: "architect-plan-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() },
      plan);
    await seedRecord(taskWt, path.join(relTask, "runs"), "002-pm-edits-1-a1",
      { seq: 2, name: "pm-edits-1", attempt: 1, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() },
      { iteration: 1, items: [] });
    await seedRecord(taskWt, path.join(relTask, "runs"), "003-architect-wave-report-1-1-a1",
      { seq: 3, name: "architect-wave-report-1-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() },
      { id: "dec-seed", context: "wave", decision: "continue", timestamp: TS() });
    tmpRepo.git(["add", "-A"], { cwd: taskWt });
    tmpRepo.git(["commit", "-m", "seed resume state"], { cwd: taskWt });

    const pipeline = makePipeline();
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/items/e2/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "e2.txt"), "e2 work\n");
      return { ok: true, data: { status: "ok", summary: "E2 done" } };
    });
    harness.scriptOutcome(`${task}/items/e2/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    // Ceremony reuses the committed wave-1 report; the close-up step reruns
    // (no seeded close-up record) so it needs a script.
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "w" },
    });
    // Post-loop closeup:
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });

    const res = await runIteration({
      task, taskDir, taskWt, parentBranch, repo: repoObj, harness, pipeline, project, prompts,
    });
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("wave_resume_reopened");
    expect(journal).toContain("epic_closeup_cleared");
    expect(fs.existsSync(path.join(taskDir, "items", "e2", "child-closeup.yaml"))).toBe(false);
    expect(res.status).toBe("done");
    const e2 = await deriveItemState({ taskDir, itemSlug: "e2", parentBranch, taskWt, pipeline });
    expect(e2.status).toBe("merged");
  });

  it("merge failure consults then requeues (merge_failed_requeued) and finishes merged", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-mergerequeue";
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
      items: [{ slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w", milestone: "m1", wave: 1 }],
    });
    await fs.promises.mkdir(path.join(taskDir, "items", "e1"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "e1", "assignment.yaml"), {
      slug: "e1", kind: "dev", title: "E1", assignment: "w", wave: 1, deps: [],
    });
    await fs.promises.writeFile(path.join(taskDir, "INTENT.md"), "merge requeue\n");
    await fs.promises.writeFile(path.join(taskWt, "shared.txt"), "parent v1\n");
    await seedRecord(taskWt, path.join(relTask, "runs"), "001-architect-plan-1-a1",
      { seq: 1, name: "architect-plan-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, plan);
    await seedRecord(taskWt, path.join(relTask, "runs"), "002-pm-edits-1-a1",
      { seq: 2, name: "pm-edits-1", attempt: 1, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, { iteration: 1, items: [] });
    tmpRepo.git(["add", "-A"], { cwd: taskWt });
    tmpRepo.git(["commit", "-m", "seed merge test"], { cwd: taskWt });

    const pipeline = makePipeline();
    const harness = new FakeHarness();
    // Develop writes a conflicting version; callback also advances the parent
    // branch so the merge conflicts.
    harness.scriptOutcome(`${task}/items/e1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "shared.txt"), "child v2\n");
      fs.writeFileSync(path.join(taskWt, "shared.txt"), "parent v3\n");
      tmpRepo.git(["add", "-A"], { cwd: taskWt });
      tmpRepo.git(["commit", "-m", "parent advances shared.txt"], { cwd: taskWt });
      return { ok: true, data: { status: "ok", summary: "E1 done" } };
    });
    harness.scriptOutcome(`${task}/items/e1/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    // First integrate fails => merge fails => consult fires; later merges
    // resolve cleanly (redrive must reach a merged item to close up).
    // First merge's integrate fails (rejected => next attempt is a2);
    // the redrive merge's integrate resolves cleanly.
    harness.scriptOutcome(`${task}/items/e1/integrate#a1`, {
      ok: false, error: "integrate exploded",
    });
    harness.scriptOutcome(`${task}/items/e1/integrate#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "shared.txt"), "resolved\n");
      return { ok: true, data: { status: "ok", summary: "resolved" } };
    });
    // Post-consult requeue tick re-runs develop (integrate error record last).
    harness.scriptOutcome(`${task}/items/e1/develop#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "shared.txt"), "child v2\n");
      return { ok: true, data: { status: "ok", summary: "E1 again" } };
    });
    harness.scriptOutcome(`${task}/runs/consult-e1-1#a1`, {
      ok: true,
      data: { id: "dec-m", context: "item", decision: "retry-with-guidance", text: "resolve it", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "has_failures", mergedItems: [], failedItems: [], summary: "w" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true, data: { id: "dec-w", context: "wave", decision: "continue", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });

    const res = await runIteration({
      task, taskDir, taskWt, parentBranch, repo: repoObj, harness, pipeline, project, prompts,
    });
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("item_merge_failed");
    expect(journal).toContain("merge_failed_requeued");
    expect(res.status).toBe("done");
    const e1 = await deriveItemState({ taskDir, itemSlug: "e1", parentBranch, taskWt, pipeline });
    expect(e1.status).toBe("merged");
  });

  it("wave report uses the transitive failureBlocked set", () => {
    const items = [
      { slug: "a", wave: "1", deps: [], status: "failed" },
      { slug: "b", wave: "1", deps: ["a"], status: "pending" },
      { slug: "c", wave: "1", deps: ["b"], status: "pending" },
    ];
    const ws = deriveWaveState({
      wave: 1,
      items: items.map((it) => ({
        slug: it.slug, kind: "dev", title: it.slug, wave: 1, deps: it.deps,
        status: it.status, branch: "b", records: [], currentAttempt: 1,
        currentFixRound: 1, isEscalated: false, freshSeries: false,
        interruptionCount: 0, consultCount: 0, failingCheckFingerprints: [],
        suggestionFingerprints: [], decisionFingerprints: [],
      })) as any,
    });
    // Transitive: b blocked by failed a, c blocked by blocked b.
    expect(ws.failureBlocked).toContain("b");
    expect(ws.failureBlocked).toContain("c");
    expect(ws.blocked.map((b) => b.slug)).toEqual(expect.arrayContaining(["b", "c"]));
  });

  it("one item's throw does not reject its siblings (allSettled + wave_tick_error)", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-batch";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`);
    tmpRepo.commit(`Add intent for ${task}`);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true, data: { kind: "story", rationale: "s", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true, data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [
          { slug: "boom-1", kind: "dev", title: "Boom", milestoneId: "m1" },
          { slug: "fine-1", kind: "dev", title: "Fine", milestoneId: "m1" },
        ],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          { slug: "boom-1", outlineRef: "boom-1", kind: "dev", title: "Boom", assignment: "x", milestone: "m1", wave: 1 },
          { slug: "fine-1", outlineRef: "fine-1", kind: "dev", title: "Fine", assignment: "y", milestone: "m1", wave: 1 },
        ],
      },
    });
    let boomCalls = 0;
    harness.scriptOutcome(`${task}/items/boom-1/develop#a1`, () => {
      boomCalls++;
      // First call throws mid-launch (dangling [started] record shifts the
      // retry to a2); the wave batch must still tick the sibling.
      if (boomCalls === 1) throw new Error("transient provider blowup");
      return { ok: true, data: { status: "ok", summary: "recovered" } };
    });
    harness.scriptOutcome(`${task}/items/boom-1/develop#a2`, {
      ok: true, data: { status: "ok", summary: "recovered" },
    });
    harness.scriptOutcome(`${task}/items/fine-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "fine.txt"), "fine\n");
      return { ok: true, data: { status: "ok", summary: "fine done" } };
    });
    harness.scriptOutcome(`${task}/items/fine-1/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/items/boom-1/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["boom-1", "fine-1"], summary: "w" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true, data: { id: "dec-w", context: "wave", decision: "continue", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
    );
    expect(res.status).toBe("done");
    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("wave_tick_error");
    expect(journal).toContain("boom-1");
  });

  it("empty-wave fix-item outline becomes a validated assignment (phantom_outline_applied)", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-phantom";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`);
    tmpRepo.commit(`Add intent for ${task}`);
    const pipeline = makePipeline({ maxEmptyWaves: 1 });
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true, data: { kind: "story", rationale: "s", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true, data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
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
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [{ slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w", milestone: "m1", wave: 1 }],
      },
    });
    harness.scriptOutcome(`${task}/items/e1/develop#a1`, {
      ok: true, data: { status: "ok", summary: "done" },
    });
    harness.scriptOutcome(`${task}/items/e1/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested", summary: "need operator",
        suggestions: [{ id: "s1", disposition: "human-async", summary: "Which API?", detail: "pick one" }],
      },
    });
    harness.scriptOutcome(`${task}/runs/consult-empty-waves-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-fix", context: "non-item", decision: "fix-item",
        outline: { slug: "e2", kind: "dev", title: "E2", assignment: "Do E2 now" },
        timestamp: TS(),
      },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true, data: { wave: 1, iteration: 1, status: "complete", summary: "empty wave with ceremony" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true, data: { id: "dec-w", context: "wave", decision: "continue", timestamp: TS() },
    });
    // Phantom e2 lands in wave 2 and ticks normally.
    harness.scriptOutcome(`${task}/items/e2/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "e2.txt"), "e2\n");
      return { ok: true, data: { status: "ok", summary: "e2 done" } };
    });
    harness.scriptOutcome(`${task}/items/e2/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true, data: { wave: 2, iteration: 1, status: "complete", summary: "w2" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true, data: { id: "dec-w2", context: "wave", decision: "end-iteration", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
    );
    const deployedTaskDir = path.join(worktreeRoot, `topic_${task}`, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("phantom_outline_applied");
    expect(journal).toContain("empty_wave_exit");
    const asg = await readYaml<any>(path.join(deployedTaskDir, "items", "e2", "assignment.yaml"));
    expect(asg.slug).toBe("e2");
    expect(asg.title).toBe("E2");
    expect(asg.assignment).toBe("Do E2 now");
    expect(asg.wave).toBe(2);
    expect(journal).not.toContain("phantom_outline_dropped");
    expect(res.status).toBe("blocked");
  });

  it("blocked-then-answered items re-enter their wave (wave_reopened_answered)", async () => {
    const { tmpRepo, worktreeRoot, repoObj, project, prompts, orchFolder } = ctx;
    const task = "gap-answered";
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
      itemOutlines: [
        { slug: "e1", kind: "dev", title: "E1", milestoneId: "m1" },
        { slug: "e2", kind: "dev", title: "E2", milestoneId: "m1" },
      ],
    };
    await writeYamlAtomic(path.join(taskDir, "plan", "plan-1.yaml"), plan);
    await writeYamlAtomic(path.join(taskDir, "plan", "edits-1.0.yaml"), {
      iteration: 1, amendmentIndex: 0,
      items: [
        { slug: "e1", outlineRef: "e1", kind: "dev", title: "E1", assignment: "w1", milestone: "m1", wave: 1, deps: [] },
        { slug: "e2", outlineRef: "e2", kind: "dev", title: "E2", assignment: "w2", milestone: "m1", wave: 2, deps: [] },
      ],
    });
    for (const [slug, asg] of [["e1", "w1"], ["e2", "w2"]] as const) {
      await fs.promises.mkdir(path.join(taskDir, "items", slug), { recursive: true });
      await writeYamlAtomic(path.join(taskDir, "items", slug, "assignment.yaml"), {
        slug, kind: "dev", title: slug.toUpperCase(), assignment: asg, wave: slug === "e1" ? 1 : 2, deps: [],
      });
    }
    await fs.promises.writeFile(path.join(taskDir, "INTENT.md"), "answered\n");
    // Open blocking question on e1.
    const qpath = path.join(taskDir, "steer", "tousertoreview", "q-e1.yaml");
    await fs.promises.mkdir(path.dirname(qpath), { recursive: true });
    await writeYamlAtomic(qpath, {
      id: "q-e1", ref: "e1", disposition: "human-async",
      question: "Which API?", blocks: ["e1"], status: "open", createdAt: TS(),
    });
    await seedRecord(taskWt, path.join(relTask, "runs"), "001-architect-plan-1-a1",
      { seq: 1, name: "architect-plan-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, plan);
    await seedRecord(taskWt, path.join(relTask, "runs"), "002-pm-edits-1-a1",
      { seq: 2, name: "pm-edits-1", attempt: 1, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: TS(), endedAt: TS() }, { iteration: 1, items: [] });
    tmpRepo.git(["add", "-A"], { cwd: taskWt });
    tmpRepo.git(["commit", "-m", "seed answered test"], { cwd: taskWt });

    const pipeline = makePipeline();
    const harness = new FakeHarness();
    // Wave 2 ticks e2; its callback answers e1's question mid-run.
    harness.scriptOutcome(`${task}/items/e2/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "e2.txt"), "e2\n");
      return { ok: true, data: { status: "ok", summary: "e2 done" } };
    });
    harness.scriptOutcome(`${task}/items/e2/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    // Answer e1 after wave 2 starts ticking: do it lazily on the wave-2
    // close-up instead (still before the post-loop blocked check).
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, async (run) => {
      const cur: any = await readYaml(qpath);
      cur.status = "answered";
      cur.answer = "Use API v2";
      cur.answeredAt = TS();
      await writeYamlAtomic(qpath, cur);
      return { ok: true, data: { wave: 2, iteration: 1, status: "complete", summary: "w2" } };
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true, data: { id: "dec-w2", context: "wave", decision: "continue", timestamp: TS() },
    });
    harness.scriptOutcome(`${task}/items/e1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "e1.txt"), "e1\n");
      return { ok: true, data: { status: "ok", summary: "e1 done" } };
    });
    harness.scriptOutcome(`${task}/items/e1/review#a1`, {
      ok: true, data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true, data: { iteration: 1, status: "complete", summary: "done" },
    });

    const res = await runIteration({
      task, taskDir, taskWt, parentBranch, repo: repoObj, harness, pipeline, project, prompts,
    });
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("wave_blocked");
    expect(journal).toContain("wave_reopened_answered");
    expect(res.status).toBe("done");
  });

  it("architect closeup complete is refused over non-terminal items (closeup_complete_refused)", async () => {
    // Unit-level: the redrive loop normally completes everything, so the
    // trust gate is defense-in-depth; exercise it directly with a seeded
    // pending item (offender) and a merged item (clean).
    const { tmpRepo, repoObj, project, prompts } = ctx;
    const task = "gap-trust";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(path.join(taskDir, "items", "e1"), { recursive: true });
    fs.mkdirSync(path.join(taskDir, "items", "e2"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "items", "e1", "assignment.yaml"), {
      slug: "e1", kind: "dev", title: "E1", assignment: "pending work", wave: 1, deps: [],
    });
    await writeYamlAtomic(path.join(taskDir, "items", "e2", "assignment.yaml"), {
      slug: "e2", kind: "dev", title: "E2", assignment: "done work", wave: 1, deps: [],
    });
    // e2 merged: abandon decision would fail it; instead mark merged via a
    // merge commit is heavy — use split (superseded, iteration-terminal).
    await fs.promises.mkdir(path.join(taskDir, "decisions"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir, "decisions", "001-item-e2-1.yaml"), {
      id: "dec-e2", context: "item", item: "e2", decision: "split", timestamp: TS(),
    });
    const pipeline = makePipeline();
    const { enforceCloseupTrustGate } = await import("../../src/core/flows/iteration.js");
    const refused = await enforceCloseupTrustGate({
      taskDir, taskWt: tmpRepo.dir, parentBranch: `topic/${task}`, pipeline,
      iteration: 1, itemSlugs: ["e1", "e2"],
      closeup: { iteration: 1, status: "complete", summary: "all done" },
    });
    expect(refused.status).toBe("next-iteration");
    expect(refused.summary).toContain("e1");
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("closeup_complete_refused");
    expect(journal).toContain("e1");
    expect(fs.existsSync(path.join(taskDir, "closeup-1.yaml"))).toBe(true);
    const written = await readYaml<any>(path.join(taskDir, "closeup-1.yaml"));
    expect(written.status).toBe("next-iteration");

    // Clean case: all terminal => complete passes through untouched.
    const taskDir2 = path.join(tmpRepo.dir, ".factory", "gap-trust-clean");
    fs.mkdirSync(path.join(taskDir2, "items", "e9"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir2, "items", "e9", "assignment.yaml"), {
      slug: "e9", kind: "dev", title: "E9", assignment: "w", wave: 1, deps: [],
    });
    await fs.promises.mkdir(path.join(taskDir2, "decisions"), { recursive: true });
    await writeYamlAtomic(path.join(taskDir2, "decisions", "001-item-e9-1.yaml"), {
      id: "dec-e9", context: "item", item: "e9", decision: "split", timestamp: TS(),
    });
    const clean = await enforceCloseupTrustGate({
      taskDir: taskDir2, taskWt: tmpRepo.dir, parentBranch: "topic/gap-trust-clean", pipeline,
      iteration: 1, itemSlugs: ["e9"],
      closeup: { iteration: 1, status: "complete", summary: "all done" },
    });
    expect(clean.status).toBe("complete");
    expect(fs.existsSync(path.join(taskDir2, "closeup-1.yaml"))).toBe(false);
  });

  it("sequenced non-item consults never reuse decisions", async () => {
    const { tmpRepo } = ctx;
    // Run inside a real task worktree branch (step-runner commits records).
    const parentBranch = "topic/gap-nonitem";
    tmpRepo.createBranch(parentBranch);
    const taskWt = path.join(ctx.worktreeRoot, "topic_gap-nonitem");
    tmpRepo.createWorktree(parentBranch, taskWt);
    const taskDir = path.join(taskWt, ".factory", "gap-nonitem");
    fs.mkdirSync(taskDir, { recursive: true });
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    harness.scriptOutcome(`gap-nonitem/runs/consult-seamA-1#a1`, {
      ok: true, data: { id: "d1", context: "non-item", decision: "accept-with-debt", debt: "x", timestamp: TS() },
    });
    harness.scriptOutcome(`gap-nonitem/runs/consult-seamA-2#a1`, {
      ok: true, data: { id: "d2", context: "non-item", decision: "accept-with-debt", debt: "y", timestamp: TS() },
    });
    const repoObj = ctx.repoObj;
    const prompts = ctx.prompts;
    const project = ctx.project;
    const paramsBase = {
      task: "gap-nonitem", seam: "seamA", contextText: "c", feedbackText: "f",
      taskDir, taskWt, repo: repoObj, harness, pipeline, project, prompts,
    };
    const r1 = await runNonItemConsult(paramsBase);
    const r2 = await runNonItemConsult(paramsBase);
    expect(r1.decision.debt).toBe("x");
    expect(r2.decision.debt).toBe("y");
    const dfiles = (await fs.promises.readdir(path.join(taskDir, "decisions"))).sort();
    expect(dfiles.length).toBe(2);
    expect(dfiles[0]).toMatch(/nonitem-seamA-1\.yaml$/);
    expect(dfiles[1]).toMatch(/nonitem-seamA-2\.yaml$/);
  });
});
