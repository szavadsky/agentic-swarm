import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { workCalls } from "./fake-defaults.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  freshCounter,
  rmCounter,
  mergeOnlyGate,
  flakeRedTwice,
  writePlan,
  scriptContinueBoundary,
  stateOf,
  scriptImplementApprove,
  implementThenLand,
} from "./continuation-helpers.js";

describe("parked continuation", () => {
  it("continues a task with base from the parked task's kept branch", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await continuesTaskBaseFromParkedTaskSPart1(repo, goal);
      await continuesTaskBaseFromParkedTaskSPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("kept-land", () => {
  registerKeptLandPart1();
  registerKeptLandRedHandover();
  registerKeptLandPart3();
});

async function landsFlakeParkedKeptBranchNoNewPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplementApprove(harness, "feature.txt", "feature\n");
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
    return fakeTurnResult(req);
  });
  scriptDecider(harness, {
    summary: "the merged gate is red and the fix changed nothing",
    verdict: "reject",
  });
  scriptStallLeave(harness, ["kept-flake"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-flake", { scope: ["feature.txt"] });
  await writeTask(runtime, file);
  writePlan(runtime, ["kept-flake"]);
  await implementThenLand(runtime, file, ["implement", "review"], repo);

  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  // The wave end lands the kept branch: no boundary, no new task, no agent turn.
  expect((await stateOf(runtime)).tasks["kept-flake"]!.status).toBe("merged");
  expect(workCalls(harness)).toHaveLength(5);

  scriptContinueBoundary(harness, runtime);
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect((await stateOf(runtime)).tasks["kept-flake"]!.status).toBe("merged");

  const records = await runtime.store.listRecords();
  const kept = records.filter(
    (r) => r.slug === "kept-flake" && r.step === "kept-land",
  );
  expect(kept).toHaveLength(1);
  expect(kept[0]!.iteration).toBe(1);
  expect(kept[0]!.ok).toBe(true);
  expect(await runtime.store.listTasks()).toHaveLength(1);
  expect(
    records.filter((r) => r.slug === "kept-flake" && r.actor === "agent"),
  ).toHaveLength(4);
  expect(workCalls(harness)).toHaveLength(7);
  expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
    "feature",
  );

  return { runtime };
}

async function landsFlakeParkedKeptBranchNoNewPart2(
  scope: Awaited<ReturnType<typeof landsFlakeParkedKeptBranchNoNewPart1>>,
) {
  const { runtime } = scope;
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain("| kept-flake | merged |");
}

async function leavesConflictedKeptBranchParkedPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplementApprove(harness, "feature.txt", "task side\n");
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-conflict", { scope: ["feature.txt"] });
  await writeTask(runtime, file);
  writePlan(runtime, ["kept-conflict"]);
  await implementThenLand(runtime, file, ["implement", "review"], repo);

  // Parks the approved branch the way dispatch does, then moves the head under
  // it: the boundary is the later landing point and owns this conflict.
  const tip = repo
    .git(["rev-parse", "factory-task/demo/kept-conflict"])
    .stdout.trim();
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "kept-conflict",
      round: 1,
      step: "park",
      actor: "script",
      commit: tip,
    },
    { ok: true, cause: cause("gates: unit (exit 1)") },
  );

  const checkout = goalCheckout(repo, goal);
  fs.writeFileSync(
    path.join(checkout, "feature.txt"),
    "integration side\n",
    "utf8",
  );
  repo.git(["add", "feature.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent integration change"], {
    cwd: checkout,
  });

  scriptContinueBoundary(harness, runtime);
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect((await stateOf(runtime)).tasks["kept-conflict"]!.status).toBe(
    "parked",
  );

  const records = await runtime.store.listRecords();

  return { harness, runtime, records };
}

async function leavesConflictedKeptBranchParkedPart2(
  scope: Awaited<ReturnType<typeof leavesConflictedKeptBranchParkedPart1>>,
) {
  const { records, harness, runtime } = scope;
  const merge = records.find(
    (r) =>
      r.slug === "kept-conflict" && r.step === "merge" && r.iteration === 2,
  );
  expect(merge?.ok).toBe(false);
  expect(merge?.cause?.kind).toBe("conflict");
  const kept = records.filter(
    (r) =>
      r.slug === "kept-conflict" && r.step === "kept-land" && r.iteration === 2,
  );
  expect(kept).toHaveLength(1);
  expect(kept[0]!.ok).toBe(false);
  expect(kept[0]!.cause?.kind).toBe("conflict");
  expect(
    records.filter((r) => r.slug === "kept-conflict" && r.actor === "agent"),
  ).toHaveLength(2);
  expect(workCalls(harness)).toHaveLength(4);
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain("| kept-conflict | parked |");
  expect(pack).toContain("- kept-conflict:");
}

async function continuesTaskBaseFromParkedTaskSPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  // beta continues the parked alpha and merges, so the park retires: the
  // wave end offers it no stall turn even though the iteration merged.
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is not acceptable", verdict: "reject" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(fs.existsSync(path.join(req.cwd!, "alpha.txt"))).toBe(true);
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta on top of alpha" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const integrationHead = repo.git(["rev-parse", "factory/demo"]).stdout.trim();
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["beta.txt"] }),
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.supersededBy).toBe("beta");
  expect(records.filter((record) => record.step === "stall-routes")).toEqual(
    [],
  );

  return { integrationHead, records, state };
}

async function continuesTaskBaseFromParkedTaskSPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof continuesTaskBaseFromParkedTaskSPart1>>,
) {
  const { state, records, integrationHead } = scope;
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks.beta!.status).toBe("merged");

  // The continuation carries alpha's commits but reviews from the
  // integration head it synced to, so the parked commits are in the diff.
  const betaFirst = records
    .filter((r) => r.slug === "beta" && r.step === "implement")
    .sort((a, b) => a.seq - b.seq)[0];
  expect(betaFirst?.base).toBe(integrationHead);

  expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
    "alpha",
  );
  expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
    "beta",
  );
  expect(
    repo.git(["rev-parse", "--verify", "refs/heads/factory-task/demo/alpha"])
      .code,
  ).toBe(0);
}

/**
 * A steward turn that repairs nothing: it leaves the merged result as red as it
 * found it, so the attempt holds with a pointer instead of landing.
 */
function scriptStewardNoRepair(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "steward found no repair" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "steward" }) },
  );
}

async function handsRedKeptBranchToStewardPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplementApprove(harness, "feature.txt", "feature\n");
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
    return fakeTurnResult(req);
  });
  scriptDecider(harness, {
    summary: "the red repeats on this tip; the steward owns the repair",
    verdict: "reject",
  });
  scriptStallLeave(harness, ["kept-red"]);
  scriptStewardNoRepair(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-red", { scope: ["feature.txt"] });
  await writeTask(runtime, file);
  writePlan(runtime, ["kept-red"]);
  await implementThenLand(runtime, file, ["implement", "review"], repo);

  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");

  const records = await runtime.store.listRecords();
  return { harness, records, runtime };
}

async function handsRedKeptBranchToStewardPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof handsRedKeptBranchToStewardPart1>>,
) {
  const { harness, records } = scope;
  // The wave-end kept-land attempt re-ran the merge gates on the same tip and
  // red again: its failure carries the merge cause as evidence.
  const kept = records.filter(
    (r) => r.slug === "kept-red" && r.step === "kept-land" && r.iteration === 1,
  );
  expect(kept).toHaveLength(1);
  expect(kept[0]!.ok).toBe(false);
  expect(kept[0]!.cause?.kind).toBe("gates");
  expect(kept[0]!.cause).toBeDefined();
  // The red goes to the steward: its turn ran on this branch and held it.
  const stewardTurn = records.filter(
    (r) => r.slug === "kept-red" && r.step === "steward" && r.actor === "agent",
  );
  expect(stewardTurn).toHaveLength(1);
  expect(stewardTurn[0]!.iteration).toBe(1);
  const held = records.filter(
    (r) =>
      r.slug === "kept-red" && r.step === "steward" && r.actor === "script",
  );
  expect(held).toHaveLength(1);
  expect(causeText(held[0]!.cause)).toContain("held");
  expect(
    records.filter((r) => r.slug === "kept-red" && r.actor === "agent"),
  ).toHaveLength(5);
  expect(workCalls(harness)).toHaveLength(6);
  // Nothing merged: the red is never waived.
  expect(
    repo.git(["show", "factory/demo:feature.txt"], { allowFail: true }).code,
  ).not.toBe(0);
  const merges = records.filter(
    (r) => r.slug === "kept-red" && r.step === "merge",
  );
  expect(merges.length).toBeGreaterThanOrEqual(2);
  expect(merges.every((r) => r.ok === false)).toBe(true);
}

function registerKeptLandRedHandover(): void {
  it("hands a red kept branch to the steward at wave end", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-red", "echo still-red; exit 1"),
        },
      ],
    });
    try {
      const scope1 = await handsRedKeptBranchToStewardPart1(repo, goal);
      await handsRedKeptBranchToStewardPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerKeptLandPart1(): void {
  it("lands a flake-parked kept branch with no new task", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-flake", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const scope1 = await landsFlakeParkedKeptBranchNoNewPart1(repo, goal);
      await landsFlakeParkedKeptBranchNoNewPart2(scope1);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("leaves a conflicted kept branch parked and named in the pack", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-conflict", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const scope1 = await leavesConflictedKeptBranchParkedPart1(repo, goal);
      await leavesConflictedKeptBranchParkedPart2(scope1);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerKeptLandPart3(): void {
  it("never lands a branch parked for a review rejection", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "not acceptable", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-reject"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-reject", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-reject"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-reject"]!.status).toBe(
        "parked",
      );

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-reject"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter((r) => r.slug === "kept-reject" && r.step === "merge"),
      ).toHaveLength(0);
      expect(workCalls(harness)).toHaveLength(6);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}
