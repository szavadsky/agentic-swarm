import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { Action } from "../../src/kernel/types.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function scriptFix(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/** The packaged implement-review flow with per-step follow-up overrides. */
function followUpFlow(
  implement?: Record<string, unknown>,
  review?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    flows: {
      "implement-review": {
        steps: [
          {
            id: "implement",
            prompt: "implementer",
            alias: "implementer",
            ...(implement ? { followUp: implement } : {}),
          },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 2,
            deliverable: "verdict",
            ...(review ? { followUp: review } : {}),
          },
        ],
      },
    },
  };
}

const strongAliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
  "implementer-strong": { harness: "fake", model: "fake-strong" },
  "reviewer-strong": { harness: "fake", model: "fake-review-strong" },
};

async function mergesAfterGatesZeroReviewerTurnsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
    ctx.writeOutcome(
      outcome({
        summary: "implemented directly",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "retry policy is untested",
          },
        ],
      }),
    );
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("task", { flow: "just-implement", scope: ["task.txt"] }),
  );
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
  expect(state.tasks.task!.phase).toBe("done");
  expect(harness.calls.length).toBe(1);
  expect(
    records.filter((r) => r.slug === "task" && r.step === "review"),
  ).toEqual([]);
  expect(records.some((r) => r.slug === "task" && r.step === "debt")).toBe(
    false,
  );
  expect(
    records.filter((r) => r.slug === "task" && r.step === "checks").length,
  ).toBe(1);

  return { runtime, records, state };
}

async function mergesAfterGatesZeroReviewerTurnsPart2(
  scope: Awaited<ReturnType<typeof mergesAfterGatesZeroReviewerTurnsPart1>>,
) {
  const { records, runtime, state } = scope;
  expect(
    records.filter((r) => r.slug === "task" && r.step === "merge-checks")
      .length,
  ).toBe(0);
  const merges = records.filter(
    (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
  );
  expect(merges.length).toBe(1);
  expect(causeText(merges[0]!.cause)).toContain("skipped merge-checks");

  await writeIterationSummary(runtime.store, {
    iteration: 1,
    state,
    records,
    status: "in-progress",
  });
  const summary = fs.readFileSync(
    path.join(runtime.store.goalDir, "iterations/1/summary.md"),
    "utf8",
  );
  expect(summary).toMatch(/## Debt opened\n- task: retry policy is untested/);
}

async function parksAfterRedMergedGateLetsOneGatePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", {
    flow: "just-implement",
    scope: ["task.txt"],
  });
  await writeTask(runtime, file);
  const drive = async (action: Action): Promise<void> => {
    const before = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    await executeTaskAction(runtime, file, action, 1, before.tasks[file.slug]!);
  };
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  // A concurrent landing poisons the head before the merge queue runs.
  fs.writeFileSync(path.join(checkout, "poison.txt"), "poison\n", "utf8");
  repo.git(["add", "poison.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent poison"], { cwd: checkout });
  await drive({ kind: "merge", slug: "task" });
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  await drive({ kind: "merge", slug: "task" });
  scriptStallLeave(harness, ["task"]);
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();

  return { harness, runtime, records };
}

async function parksAfterRedMergedGateLetsOneGatePart2(
  scope: Awaited<ReturnType<typeof parksAfterRedMergedGateLetsOneGatePart1>>,
) {
  const { runtime, records, harness } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");
  expect(causeText(state.tasks.task!.cause)).toContain("gates: poison-gate");
  expect(state.tasks.task!.round).toBe(1);
  expect(harness.calls.length).toBe(3);
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "merge" && r.ok === false,
    ).length,
  ).toBe(2);
  expect(
    records.filter((r) => r.slug === "task" && r.step === "merge-checks")
      .length,
  ).toBe(2);
  expect(
    records.filter((r) => r.slug === "task" && r.step === "review"),
  ).toEqual([]);
}

function registerFixRoundFollowUpModesPart1(): void {
  it("same-session resumes the session compacted at the end of its turn", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      const qa = records
        .filter((r) => r.slug === "task" && r.step === "qa")
        .sort((a, b) => a.seq - b.seq);
      // Each turn compacts its own session at its end; the fix turn resumes
      // the compacted implement session, and the second QA and review resume
      // theirs. A resume adds no compaction because the ref it resumes is
      // already compacted.
      expect(harness.compactions.map((c) => c.id)).toEqual([
        implement[0]!.session!.id,
        qa[0]!.session!.id,
        review[0]!.session!.id,
        implement[1]!.session!.id,
        qa[1]!.session!.id,
        review[1]!.session!.id,
      ]);
      expect(implement.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(qa.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(review.map((r) => r.session?.compacted)).toEqual([true, true]);

      const fix = harness.calls[3]!;
      expect(fix.session?.id).toBe(implement[0]?.session?.id);
      expect(fix.session?.compacted).toBe(true);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerFixRoundFollowUpModesPart2(): void {
  it("de-novo starts the fix turn without the previous session", async () => {
    const { repo, goal } = setupFlowRepo({
      process: followUpFlow({ mode: "de-novo" }),
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      expect(harness.calls[2]!.session).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerFixRoundFollowUpModesPart3(): void {
  it("different-model runs the fix turn on another alias without a session", async () => {
    const { repo, goal } = setupFlowRepo({
      process: followUpFlow({
        mode: "different-model",
        alias: "implementer-strong",
      }),
      aliases: strongAliases,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.calls[2]!.model.id).toBe("fake-strong");
      expect(harness.calls[2]!.session).toBeUndefined();
      const records = await runtime.store.listRecords();
      const implementRecords = records.filter(
        (r) => r.slug === "task" && r.step === "implement",
      );
      expect(implementRecords.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("flow data drives the steps", () => {
  it("runs configured step ids in order and gates only before the review", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: {
          "draft-polish": {
            steps: [
              { id: "draft", prompt: "implementer", alias: "implementer" },
              { id: "polish", prompt: "implementer", alias: "implementer" },
              {
                id: "critique",
                prompt: "reviewer",
                alias: "reviewer",
                review: true,
                changeRequests: 0,
              },
            ],
          },
        },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "draft\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "drafted" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(fs.existsSync(path.join(req.cwd!, "task.txt"))).toBe(true);
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "polished\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "polished" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { flow: "draft-polish", scope: ["task.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const steps = records
        .filter((r) => r.slug === "task" && r.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      expect(steps.map((r) => r.step)).toEqual(["draft", "polish", "critique"]);
      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks.length).toBe(1);
      expect(checks[0]!.seq).toBeGreaterThan(steps[1]!.seq);
      expect(checks[0]!.seq).toBeLessThan(steps[2]!.seq);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "polished",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("just-implement", () => {
  it("merges after gates with zero reviewer turns and keeps the implementer's debt", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await mergesAfterGatesZeroReviewerTurnsPart1(repo, goal);
      await mergesAfterGatesZeroReviewerTurnsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks after a red merged gate and lets one gate-fix turn run first", async () => {
    const { repo, goal } = setupFlowRepo({
      // Green on the task worktree, red once a concurrent landing poisons the
      // head: the merged tree differs, so the merge gates still run.
      gates: [{ id: "poison-gate", command: "test ! -f poison.txt" }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await parksAfterRedMergedGateLetsOneGatePart1(
        repo,
        goal,
        checkout,
      );
      await parksAfterRedMergedGateLetsOneGatePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("fix-round follow-up modes", () => {
  registerFixRoundFollowUpModesPart1();

  registerFixRoundFollowUpModesPart2();

  registerFixRoundFollowUpModesPart3();
});
