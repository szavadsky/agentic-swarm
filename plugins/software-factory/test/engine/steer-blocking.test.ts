import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, SteerItemArtifact } from "../../src/core/artifacts.js";
import { deriveItemState } from "../../src/core/derive/item.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { readJournal } from "../../src/core/journal.js";

const KIND_CONFIG = {
  steps: [
    { id: "develop", agent: "developer", role: "workhorse" },
    { id: "review", agent: "reviewer", role: "task-reviewer" },
  ],
};

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
}

/** Minimal on-disk item: approved review (optional + awareness only) so status is ready unless a steer question blocks. */
async function seedApprovedItem(taskDir: string, slug: string, opts?: { wave?: number; deps?: string[] }) {
  const itemDir = path.join(taskDir, "items", slug);
  await fs.promises.mkdir(path.join(itemDir, "steps"), { recursive: true });
  await writeYamlAtomic(path.join(itemDir, "assignment.yaml"), {
    slug,
    kind: "dev",
    title: slug,
    assignment: "work",
    wave: opts?.wave ?? 1,
    deps: opts?.deps ?? [],
  });
  for (const [dir, step] of [["001-develop-a1", "develop"], ["002-review-a1", "review"]] as const) {
    const recDir = path.join(itemDir, "steps", dir);
    await fs.promises.mkdir(recDir, { recursive: true });
    await writeYamlAtomic(path.join(recDir, "meta.yaml"), {
      name: step,
      attempt: 1,
      agent: step === "develop" ? "developer" : "reviewer",
      role: step === "develop" ? "workhorse" : "task-reviewer",
      models: ["deepseek-chat"],
      status: "ok",
      startedAt: new Date().toISOString(),
    });
  }
  await writeYamlAtomic(path.join(itemDir, "steps", "002-review-a1", "output.yaml"), {
    status: "approved",
    summary: "Approved",
    suggestions: [
      { id: "s-opt", disposition: "optional", summary: "Polish later" },
      { id: "s-aware", disposition: "human-awareness", summary: "Picked approach X", detail: "FYI" },
    ],
  });
}


async function seedPendingItem(taskDir: string, slug: string, opts?: { wave?: number; deps?: string[] }) {
  const itemDir = path.join(taskDir, "items", slug);
  await fs.promises.mkdir(path.join(itemDir, "steps"), { recursive: true });
  await writeYamlAtomic(path.join(itemDir, "assignment.yaml"), {
    slug,
    kind: "dev",
    title: slug,
    assignment: "work",
    wave: opts?.wave ?? 1,
    deps: opts?.deps ?? [],
  });
}
async function writeQuestion(taskDir: string, file: string, q: Record<string, unknown>) {
  const dir = path.join(taskDir, "steer", "tousertoreview");
  await fs.promises.mkdir(dir, { recursive: true });
  await writeYamlAtomic(path.join(dir, file), q);
}

describe("Steer blocking semantics (§8.7, §8.8)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("approved review + human-awareness question (ref=item, blocks:[]) derives ready, not blocked", async () => {
    const taskDir = path.join(tmpRepo.dir, "t-awareness");
    await seedApprovedItem(taskDir, "item-a");
    await writeQuestion(taskDir, "awareness-item-a-s-aware.yaml", {
      id: "awareness-item-a-s-aware",
      ref: "item-a",
      disposition: "human-awareness",
      question: "FYI: picked approach X",
      blocks: [],
      status: "open",
    });
    const st = await deriveItemState({
      taskDir,
      itemSlug: "item-a",
      parentBranch: "topic/t",
      taskWt: tmpRepo.dir,
      kindConfig: KIND_CONFIG,
    });
    expect(st.status).toBe("ready");
    expect(st.openSteerQuestion).toBeUndefined();
  });

  it("legacy human-awareness question without a blocks field does not block", async () => {
    const taskDir = path.join(tmpRepo.dir, "t-legacy-aware");
    await seedApprovedItem(taskDir, "item-a");
    await writeQuestion(taskDir, "awareness-item-a-s-aware.yaml", {
      id: "awareness-item-a-s-aware",
      ref: "item-a",
      disposition: "human-awareness",
      question: "FYI: picked approach X",
      status: "open",
    });
    const st = await deriveItemState({
      taskDir,
      itemSlug: "item-a",
      parentBranch: "topic/t",
      taskWt: tmpRepo.dir,
      kindConfig: KIND_CONFIG,
    });
    expect(st.status).toBe("ready");
  });

  it("human-async question with blocks:[item] blocks; answering unblocks", async () => {
    const taskDir = path.join(tmpRepo.dir, "t-async");
    await seedApprovedItem(taskDir, "item-a");
    const qFile = "q-item-a-s1.yaml";
    await writeQuestion(taskDir, qFile, {
      id: "q-item-a-s1",
      ref: "item-a",
      disposition: "human-async",
      question: "Option A or B?",
      blocks: ["item-a"],
      status: "open",
    });
    const blocked = await deriveItemState({
      taskDir,
      itemSlug: "item-a",
      parentBranch: "topic/t",
      taskWt: tmpRepo.dir,
      kindConfig: KIND_CONFIG,
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.openSteerQuestion?.id).toBe("q-item-a-s1");

    const q = await readYaml<SteerItemArtifact>(path.join(taskDir, "steer", "tousertoreview", qFile));
    q.status = "answered";
    q.answer = "Option A";
    await writeYamlAtomic(path.join(taskDir, "steer", "tousertoreview", qFile), q);
    const unblocked = await deriveItemState({
      taskDir,
      itemSlug: "item-a",
      parentBranch: "topic/t",
      taskWt: tmpRepo.dir,
      kindConfig: KIND_CONFIG,
    });
    expect(unblocked.status).toBe("ready");
  });

  it("legacy human-async question without a blocks field still blocks by ref", async () => {
    const taskDir = path.join(tmpRepo.dir, "t-legacy-async");
    await seedApprovedItem(taskDir, "item-a");
    await writeQuestion(taskDir, "q-item-a-s1.yaml", {
      id: "q-item-a-s1",
      ref: "item-a",
      disposition: "human-async",
      question: "Option A or B?",
      status: "open",
    });
    const st = await deriveItemState({
      taskDir,
      itemSlug: "item-a",
      parentBranch: "topic/t",
      taskWt: tmpRepo.dir,
      kindConfig: KIND_CONFIG,
    });
    expect(st.status).toBe("blocked");
  });

  it("awareness-blocked item does not stall its dependents in the wave", async () => {
    const taskDir = path.join(tmpRepo.dir, "t-wave");
    await seedApprovedItem(taskDir, "item-a", { wave: 1 });
    await seedPendingItem(taskDir, "item-b", { wave: 2, deps: ["item-a"] });
    await writeQuestion(taskDir, "awareness-item-a-s-aware.yaml", {
      id: "awareness-item-a-s-aware",
      ref: "item-a",
      disposition: "human-awareness",
      question: "FYI",
      blocks: [],
      status: "open",
    });
    const states = await Promise.all(
      ["item-a", "item-b"].map((slug) =>
        deriveItemState({ taskDir, itemSlug: slug, parentBranch: "topic/t", taskWt: tmpRepo.dir, kindConfig: KIND_CONFIG })
      )
    );
    expect(states.map((s) => s.status).sort()).toEqual(["pending", "ready"]);
    const wave = deriveWaveState({ wave: 1, items: states });
    expect(wave.blocked).toEqual([]);
  });
});

describe("Engine: awareness never stalls; async block journals item + question", () => {
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

  function scriptCommon(harness: FakeHarness, task: string, outlines: unknown[], edits: unknown[]) {
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "story", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: { iteration: 1, milestones: [{ id: "m1", title: "M1" }], itemOutlines: outlines },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: { iteration: 1, items: edits },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan satisfied" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Done" },
    });
  }

  it("awareness-only review lets both waves merge and the task finish", async () => {
    const task = "steer-awareness-e2e";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "awareness e2e\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    scriptCommon(
      harness,
      task,
      [
        { slug: "item-a", kind: "dev", title: "A", milestoneId: "m1" },
        { slug: "item-b", kind: "dev", title: "B", milestoneId: "m1" },
      ],
      [
        { slug: "item-a", outlineRef: "item-a", kind: "dev", title: "A", assignment: "Do A", milestone: "m1", wave: 1 },
        { slug: "item-b", outlineRef: "item-b", kind: "dev", title: "B", assignment: "Do B", milestone: "m1", wave: 2, deps: ["item-a"] },
      ]
    );
    harness.scriptOutcome(`${task}/items/item-a/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "a.txt"), "a");
      return { ok: true, data: { status: "ok", summary: "Developed A" } };
    });
    harness.scriptOutcome(`${task}/items/item-a/review#a1`, {
      ok: true,
      data: {
        status: "approved",
        summary: "Approved with notes",
        suggestions: [
          { id: "s-opt", disposition: "optional", summary: "Polish" },
          { id: "s-aware", disposition: "human-awareness", summary: "Picked X", detail: "FYI" },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/item-b/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "b.txt"), "b");
      return { ok: true, data: { status: "ok", summary: "Developed B" } };
    });
    harness.scriptOutcome(`${task}/items/item-b/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
      ok: true,
      data: { wave: 2, iteration: 1, status: "complete", summary: "Wave 2 report" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, {
      ok: true,
      data: { id: "dec-2", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 30 }
    );
    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, ".factory", task);
    const qFiles = fs.readdirSync(path.join(deployedTaskDir, "steer", "tousertoreview"));
    expect(qFiles.length).toBeGreaterThan(0);
    const journal = await readJournal(deployedTaskDir);
    expect(journal.some((e) => e.type === "iteration_blocked")).toBe(false);
  });

  it("async block exits 10 with an iteration_blocked event naming item + question; answer unblocks", async () => {
    const task = "steer-async-journal";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "async journal e2e\n", "utf8");
    tmpRepo.commit("Add intent");

    const harness = new FakeHarness();
    scriptCommon(
      harness,
      task,
      [{ slug: "item-q", kind: "dev", title: "Q", milestoneId: "m1" }],
      [{ slug: "item-q", outlineRef: "item-q", kind: "dev", title: "Q", assignment: "Ask", milestone: "m1", wave: 1 }]
    );
    harness.scriptOutcome(`${task}/items/item-q/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "code");
      return { ok: true, data: { status: "ok", summary: "Developed" } };
    });
    harness.scriptOutcome(`${task}/items/item-q/review#a1`, [
      {
        ok: true,
        data: {
          status: "changes_requested",
          summary: "Need human input",
          suggestions: [{ id: "s1", disposition: "human-async", summary: "A or B?", detail: "Choice" }],
        },
      },
      { ok: true, data: { status: "approved", summary: "Approved with A", suggestions: [] } },
    ]);
    harness.scriptOutcome(`${task}/items/item-q/develop#a2`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "option A code");
      return { ok: true, data: { status: "ok", summary: "Option A implemented" } };
    });

    const res1 = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );
    expect(res1.status).toBe("blocked");
    expect(res1.exitCode).toBe(10);

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, ".factory", task);
    const events = await readJournal(deployedTaskDir);
    const blockedEvt = events.find((e) => e.type === "iteration_blocked");
    expect(blockedEvt).toBeDefined();
    expect(blockedEvt!.items).toEqual(["item-q"]);
    const questions = blockedEvt!.questions as Array<{ id: string; ref: string; item: string }>;
    expect(questions.length).toBe(1);
    expect(questions[0]!.item).toBe("item-q");
    expect(questions[0]!.ref).toBe("item-q");

    const qPath = path.join(deployedTaskDir, "steer", "tousertoreview", `${questions[0]!.id}.yaml`);
    expect(fs.existsSync(qPath)).toBe(true);

    // Answer and finish: review approves on the re-run.
    const pendingDir = path.join(deployedTaskDir, "steer", "fromuserpending");
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, "answer-01.txt"), "Use Option A please.");
    harness.scriptComplete(() => ({ refs: ["item-q"], kind: "answer", urgency: "now", summary: "Use Option A" }));


    const res2 = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 10 }
    );
    expect(res2.status).toBe("done");
    expect(res2.exitCode).toBe(0);
  });
});
