import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
import {
  deriveTaskState,
  countCommittedCloseupIterations,
} from "../../src/core/derive/task.js";
import type { PipelineConfig } from "../../src/core/artifacts.js";

function derived(
  slug: string,
  wave: number,
  deps: string[],
  status: DerivedItemState["status"]
): DerivedItemState {
  return {
    slug,
    kind: "dev",
    title: slug,
    wave,
    deps,
    status,
    branch: `topic/t/${slug}`,
    records: [],
    currentAttempt: 1,
    currentFixRound: 1,
    isEscalated: false,
    freshSeries: false,
    interruptionCount: 0,
    consultCount: 0,
    failingCheckFingerprints: [],
    suggestionFingerprints: [],
    decisionFingerprints: [],
  };
}

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
      maxPlanReviewRounds: 1,
    },
  };
}

function writeRecord(
  stepsDir: string,
  dirName: string,
  opts?: { status?: string; name?: string; seq?: number }
) {
  const rd = path.join(stepsDir, dirName);
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
  const name = opts?.name ?? dirName.split("-")[1] ?? "develop";
  const seq = opts?.seq ?? parseInt(dirName.slice(0, 3), 10);
  fs.writeFileSync(
    path.join(rd, "meta.yaml"),
    `seq: ${seq}\nname: ${name}\nattempt: 1\nagent: developer\nrole: workhorse\nmodels: [m]\nstatus: ${opts?.status ?? "ok"}\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`
  );
  fs.writeFileSync(path.join(rd, "output.yaml"), `status: ok\nsummary: done\n`);
}

function writeDecision(
  decisionsDir: string,
  fileName: string,
  opts: { item: string; decision: string; afterRecord?: string }
) {
  fs.mkdirSync(decisionsDir, { recursive: true });
  const after = opts.afterRecord ? `afterRecord: ${opts.afterRecord}\n` : "";
  fs.writeFileSync(
    path.join(decisionsDir, fileName),
    `id: dec-1\ncontext: item\nitem: ${opts.item}\n${after}decision: ${opts.decision}\ntimestamp: 2026-01-01T00:00:02.000Z\n`
  );
}

describe("derive gaps: blockedByFailure direct contract (scheduler.ts)", () => {
  it("returns pending items with failed or abandoned deps, in PM order", async () => {
    const { blockedByFailure } = await import("../../src/core/plan/scheduler.js");
    const items = [
      { slug: "ok", wave: "1", deps: [] as string[], status: "done" as const },
      { slug: "bad", wave: "1", deps: [] as string[], status: "failed" as const },
      { slug: "gone", wave: "1", deps: [] as string[], status: "abandoned" as const },
      { slug: "first", wave: "2", deps: ["bad"], status: "pending" as const },
      { slug: "fine", wave: "2", deps: ["ok"], status: "pending" as const },
      { slug: "second", wave: "2", deps: ["gone"], status: "pending" as const },
      { slug: "already", wave: "2", deps: ["bad"], status: "running" as const },
    ];
    expect(blockedByFailure(items)).toEqual(["first", "second"]);
  });

  it("returns empty when no dep has failed or been abandoned", async () => {
    const { blockedByFailure } = await import("../../src/core/plan/scheduler.js");
    expect(
      blockedByFailure([
        { slug: "dep", wave: "1", deps: [], status: "done" },
        { slug: "next", wave: "2", deps: ["dep"], status: "pending" },
      ])
    ).toEqual([]);
  });
});

describe("derive gaps: dep-waiting bucket (wave.ts)", () => {
  it("pending item with unmerged non-failed deps lands in waiting, holding both gates", () => {
    const items = [
      derived("dep-a", 1, [], "merged"),
      derived("waiter", 2, ["dep-a", "dep-b"], "pending"),
      derived("dep-b", 1, [], "running"),
    ];
    const wave = deriveWaveState({ wave: 2, items });
    expect(wave.waiting.map((i) => i.slug)).toEqual(["waiter"]);
    expect(wave.runnable.map((i) => i.slug)).toEqual([]);
    expect(wave.canMerge).toBe(false);
    expect(wave.isComplete).toBe(false);
  });

  it("ready + waiting does not merge: the waiter holds canMerge open", () => {
    const items = [
      derived("dep-b", 1, [], "running"),
      derived("done-early", 2, [], "ready"),
      derived("waiter", 2, ["dep-b"], "pending"),
    ];
    const wave = deriveWaveState({ wave: 2, items });
    expect(wave.ready.map((i) => i.slug)).toEqual(["done-early"]);
    expect(wave.waiting.map((i) => i.slug)).toEqual(["waiter"]);
    expect(wave.canMerge).toBe(false);
    expect(wave.isComplete).toBe(false);
  });

  it("waiting exposes the full transitive failure-blocked set", () => {
    const items = [
      derived("root", 1, [], "failed"),
      derived("mid", 1, ["root"], "pending"),
      derived("leaf", 1, ["mid"], "pending"),
      derived("slow", 1, [], "running"),
      derived("side", 1, ["slow"], "pending"),
    ];
    const wave = deriveWaveState({ wave: 1, items });
    // Old transitive fixpoint: root's direct dependent plus the cascaded leaf.
    expect(wave.failureBlocked).toEqual(["mid", "leaf"]);
    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["leaf", "mid"]);
    expect(wave.waiting.map((i) => i.slug)).toEqual(["side"]);
  });

  it("forward-dep items stay out of runnable (branch case: waves 9/10 vs 11)", () => {
    const items = [
      derived("golden-snapshot-wiring", 7, [], "merged"),
      derived("third-party-assumption-tests", 1, [], "merged"),
      derived("consolidate-integration-helpers-v2", 8, ["golden-snapshot-wiring"], "failed"),
      derived("coding-rules-audit-v2", 9, ["golden-snapshot-wiring", "consolidate-integration-helpers-v2"], "pending"),
    ];
    const wave9 = deriveWaveState({ wave: 9, items });
    expect(wave9.runnable.map((i) => i.slug)).toEqual([]);
    expect(wave9.blocked.map((i) => i.slug)).toContain("coding-rules-audit-v2");
  });
});

describe("derive gaps: terminal decisions (item.ts)", () => {
  let tmpRepo: TmpRepo;
  let pipeline: PipelineConfig;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    pipeline = makePipeline();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function itemFixture(task: string, itemSlug: string, kind = "dev") {
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(path.join(itemDir, "steps"), { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      `slug: ${itemSlug}\nkind: ${kind}\ntitle: ${itemSlug}\nassignment: Work\nwave: 1\n`
    );
    return { taskDir, itemDir };
  }

  it("latest abandon beats epic child-closeup done", async () => {
    const { taskDir } = itemFixture("epic-abandon-task", "epic-1", "epic");
    fs.writeFileSync(
      path.join(taskDir, "items", "epic-1", "child-closeup.yaml"),
      `status: done\nsummary: child finished\n`
    );
    writeDecision(path.join(taskDir, "decisions"), "002-item-epic-1-1.yaml", {
      item: "epic-1",
      decision: "abandon",
    });
    const state = await deriveItemState({
      taskDir,
      itemSlug: "epic-1",
      parentBranch: "topic/epic-abandon-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(state.status).toBe("failed");
  });

  it("latest split beats epic child-closeup done", async () => {
    const { taskDir } = itemFixture("epic-split-task", "epic-1", "epic");
    fs.writeFileSync(
      path.join(taskDir, "items", "epic-1", "child-closeup.yaml"),
      `status: done\nsummary: child finished\n`
    );
    writeDecision(path.join(taskDir, "decisions"), "002-item-epic-1-1.yaml", {
      item: "epic-1",
      decision: "split",
    });
    const state = await deriveItemState({
      taskDir,
      itemSlug: "epic-1",
      parentBranch: "topic/epic-split-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(state.status).toBe("superseded");
  });

  it("abandon stays failed across a stray record newer than afterRecord", async () => {
    const { taskDir, itemDir } = itemFixture("stray-abandon-task", "doomed-1");
    writeRecord(path.join(itemDir, "steps"), "001-develop-a1");
    writeDecision(path.join(taskDir, "decisions"), "003-item-doomed-1-1.yaml", {
      item: "doomed-1",
      decision: "abandon",
      afterRecord: "001-develop-a1",
    });
    // Stray post-decision record: must not resurrect the item.
    writeRecord(path.join(itemDir, "steps"), "002-develop-a1");
    const state = await deriveItemState({
      taskDir,
      itemSlug: "doomed-1",
      parentBranch: "topic/stray-abandon-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(state.status).toBe("failed");
  });

  it("split stays superseded across a stray record newer than afterRecord", async () => {
    const { taskDir, itemDir } = itemFixture("stray-split-task", "split-1");
    writeRecord(path.join(itemDir, "steps"), "001-develop-a1");
    writeDecision(path.join(taskDir, "decisions"), "003-item-split-1-1.yaml", {
      item: "split-1",
      decision: "split",
      afterRecord: "001-develop-a1",
    });
    writeRecord(path.join(itemDir, "steps"), "002-develop-a1");
    const state = await deriveItemState({
      taskDir,
      itemSlug: "split-1",
      parentBranch: "topic/stray-split-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(state.status).toBe("superseded");
  });

  it("a newer decision file revokes abandon by becoming latest", async () => {
    const { taskDir, itemDir } = itemFixture("revoke-abandon-task", "rev-1");
    writeRecord(path.join(itemDir, "steps"), "001-develop-a1");
    writeDecision(path.join(taskDir, "decisions"), "003-item-rev-1-1.yaml", {
      item: "rev-1",
      decision: "abandon",
      afterRecord: "001-develop-a1",
    });
    // Newer retry decision replaces the abandon as latest: item runs again.
    writeDecision(path.join(taskDir, "decisions"), "004-item-rev-1-2.yaml", {
      item: "rev-1",
      decision: "retry-with-guidance",
      afterRecord: "001-develop-a1",
    });
    const state = await deriveItemState({
      taskDir,
      itemSlug: "rev-1",
      parentBranch: "topic/revoke-abandon-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(state.status).toBe("running");
  });

  it("accept-with-debt stays fresh-scoped: a newer record revokes readiness", async () => {
    const { taskDir, itemDir } = itemFixture("debt-fresh-task", "debt-1");
    writeRecord(path.join(itemDir, "steps"), "001-develop-r1-a1", { name: "develop", seq: 1 });
    writeRecord(path.join(itemDir, "steps"), "002-review-r1-a1", { name: "review", seq: 2 });
    writeDecision(path.join(taskDir, "decisions"), "003-item-debt-1-1.yaml", {
      item: "debt-1",
      decision: "accept-with-debt",
      afterRecord: "002-review-r1-a1",
    });
    const fresh = await deriveItemState({
      taskDir,
      itemSlug: "debt-1",
      parentBranch: "topic/debt-fresh-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(fresh.status).toBe("ready");
    // A newer record lapses the debt decision: item is mid-flow again.
    writeRecord(path.join(itemDir, "steps"), "003-develop-r2-a1", { name: "develop", seq: 3 });
    const lapsed = await deriveItemState({
      taskDir,
      itemSlug: "debt-1",
      parentBranch: "topic/debt-fresh-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(lapsed.status).toBe("running");
  });

  it("interruption count resets with a fresh retry series", async () => {
    const { taskDir, itemDir } = itemFixture("interrupt-task", "int-1");
    const stepsDir = path.join(itemDir, "steps");
    writeRecord(stepsDir, "001-develop-a1", { status: "interrupted" });
    writeRecord(stepsDir, "002-develop-a1", { status: "interrupted" });
    const before = await deriveItemState({
      taskDir,
      itemSlug: "int-1",
      parentBranch: "topic/interrupt-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(before.interruptionCount).toBe(2);
    // Fresh retry series starts after the interruptions: only new ones count.
    writeDecision(path.join(taskDir, "decisions"), "003-item-int-1-1.yaml", {
      item: "int-1",
      decision: "retry-with-guidance",
      afterRecord: "002-develop-a1",
    });
    writeRecord(stepsDir, "003-develop-a1", { status: "interrupted" });
    const after = await deriveItemState({
      taskDir,
      itemSlug: "int-1",
      parentBranch: "topic/interrupt-task",
      taskWt: tmpRepo.dir,
      pipeline,
    });
    expect(after.interruptionCount).toBe(1);
  });
});

describe("derive gaps: committed close-up iteration (task.ts)", () => {
  let tmpRepo: TmpRepo;
  let pipeline: PipelineConfig;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    pipeline = makePipeline();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function closeupRecord(taskDir: string, n: number) {
    const dirName = `00${n}-architect-closeup-${n}-a1`;
    const rd = path.join(taskDir, "runs", dirName);
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
    fs.writeFileSync(
      path.join(rd, "meta.yaml"),
      `seq: ${n}\nname: architect-closeup-${n}\nattempt: 1\nagent: architect\nrole: architect\nmodels: [m]\nstatus: ok\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`
    );
    fs.writeFileSync(
      path.join(rd, "output.yaml"),
      `iteration: ${n}\nstatus: complete\nsummary: done\n`
    );
    fs.writeFileSync(
      path.join(taskDir, `closeup-${n}.yaml`),
      `iteration: ${n}\nstatus: complete\nsummary: done\n`
    );
  }

  it("iteration counts only ok-committed close-ups", async () => {
    const task = "closeup-count-task";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });

    // closeup-1 fully committed; closeup-2 file exists but its run record
    // is uncommitted (never landed) — it must not advance the iteration.
    closeupRecord(taskDir, 1);
    tmpRepo.commit("closeup 1 landed");
    closeupRecord(taskDir, 2);

    expect(await countCommittedCloseupIterations({ taskDir, taskWt: tmpRepo.dir })).toBe(1);

    const state = await deriveTaskState({ taskDir, task, taskWt: tmpRepo.dir, pipeline });
    expect(state.iteration).toBe(2);

    // Committing the closeup-2 record advances the count.
    tmpRepo.commit("closeup 2 landed");
    expect(await countCommittedCloseupIterations({ taskDir, taskWt: tmpRepo.dir })).toBe(2);
    const state2 = await deriveTaskState({ taskDir, task, taskWt: tmpRepo.dir, pipeline });
    expect(state2.iteration).toBe(3);
  });
});
