import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";

type Repo = ReturnType<typeof setupFlowRepo>["repo"];
import { task } from "./helpers.js";
import { bumpRevision } from "./park-recover-moved-head.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** The task worktree demo-tasks/task beside the goal checkout. */
function taskWorktree(runtime: KernelRuntime): string {
  return path.join(
    path.dirname(runtime.paths.goalCheckout),
    "demo-tasks",
    "task",
  );
}

async function setupFlow() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  return { repo, goal, harness, runtime };
}

/** The review that approves the accepted work, after the QA fallback accepts. */
function approveReview(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
}

/** Implement, the finish ask and the rescue, then the accepting QA and review. */
function scriptRescueFlow(
  harness: FakeHarness,
  onRescue: (req: Parameters<FakeHarness["turn"]>[0]) => void,
): void {
  harness.script((req) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task.txt\n", "utf8");
    return fakeTurnResult(req, { text: "wrote the file", usage: { out: 2 } });
  });
  harness.script((req) => {
    expect(req.prompt).toContain("did not finish the task");
    return fakeTurnResult(req, { text: "still no outcome", usage: { out: 2 } });
  });
  harness.script((req, ctx) => {
    onRescue(req);
    ctx.writeOutcome(outcome({ summary: "the diff meets the done-when" }));
    return fakeTurnResult(req, { usage: { out: 2 } });
  });
  approveReview(harness);
}

/** The harness calls the task's implement step made, reminders included. */
function implementCalls(harness: FakeHarness) {
  return harness.calls.filter(whenTurn({ step: "implement" }));
}

async function recordsOf(runtime: KernelRuntime) {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  return { records, state };
}

function rescuesTheWorkAfterTheReminder(): void {
  it("rescues the work in one fresh session, then checks, QA and review deliver", async () => {
    const { repo, harness, runtime } = await setupFlow();
    try {
      let rescuePrompt = "";
      scriptRescueFlow(harness, (req) => {
        rescuePrompt = req.prompt;
        expect(req.session).toBeUndefined();
        expect(req.cwd).toBe(taskWorktree(runtime));
        expect(fs.readFileSync(path.join(req.cwd!, "task.txt"), "utf8")).toBe(
          "task.txt\n",
        );
      });

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(5);
      expect(implementCalls(harness)).toHaveLength(3);
      expect(implementCalls(harness)[2]!.session).toBeUndefined();

      expect(rescuePrompt).toContain(runtime.store.tasks.path("task"));
      expect(rescuePrompt).toContain(taskWorktree(runtime));
      expect(rescuePrompt).toMatch(/[0-9a-f]{7,}\.\.[0-9a-f]{7,}/);
      expect(rescuePrompt).toContain("no outcome after repair");

      const { records, state } = await recordsOf(runtime);
      const agents = records
        .filter((rec) => rec.slug === "task" && rec.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      expect(agents.map((rec) => rec.step)).toEqual([
        "implement",
        "qa",
        "review",
      ]);

      const implement = agents[0]!;
      expect(implement.asks).toEqual(["unfinished", "rescue"]);
      expect(implement.repairFindings).toEqual([
        "no outcome written to the outcome path and no fenced YAML block in the final message",
        "no outcome after repair",
      ]);
      expect(implement.repairFindingsResolved).toBe(true);
      // The first attempt, the reminder and the rescue each reported tokens.
      expect(implement.attempts).toHaveLength(3);
      expect(implement.usage?.out).toBe(6);

      expect(state.tasks.task!.status).toBe("merged");
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "task.txt",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function leavesAnEmptyBranchAsToday(): void {
  it("sends no rescue when the branch holds nothing", async () => {
    const { repo, harness, runtime } = await setupFlow();
    try {
      harness.script((req) => fakeTurnResult(req, { text: "planned" }));
      harness.script((req) => fakeTurnResult(req, { text: "still planned" }));
      scriptStallLeave(harness, ["task"]);

      await runDispatch(runtime, { iteration: 1 });

      expect(implementCalls(harness)).toHaveLength(2);
      const { records } = await recordsOf(runtime);
      const implement = records.find(
        (rec) => rec.slug === "task" && rec.step === "implement",
      )!;
      expect(implement.asks).toEqual(["unfinished"]);
      expect(implement.outcome?.status).toBe("failed");
      expect(
        records.filter((rec) => rec.slug === "task" && rec.step === "park"),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function leavesAHaltedStopAsToday(): void {
  it("sends no rescue after a halted stop", async () => {
    const { repo, harness, runtime } = await setupFlow();
    try {
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "no" } }),
      );
      scriptStallLeave(harness, ["task"]);

      await runDispatch(runtime, { iteration: 1 });

      expect(implementCalls(harness)).toHaveLength(1);
      const { records } = await recordsOf(runtime);
      const implement = records.find(
        (rec) => rec.slug === "task" && rec.step === "implement",
      )!;
      expect(implement.asks).toBeUndefined();
      expect(implement.outcome).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function leavesASecondInvalidOutcomeAsToday(): void {
  it("fails the turn when the rescue outcome is invalid", async () => {
    const { repo, harness, runtime } = await setupFlow();
    try {
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task.txt\n", "utf8");
        return fakeTurnResult(req, { text: "wrote the file" });
      });
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req) => {
        fs.writeFileSync(req.outcomePath!, "status: [unclosed\n");
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      await runDispatch(runtime, { iteration: 1 });

      expect(implementCalls(harness)).toHaveLength(3);
      const { records } = await recordsOf(runtime);
      const implement = records.find(
        (rec) => rec.slug === "task" && rec.step === "implement",
      )!;
      expect(implement.asks).toEqual(["unfinished", "rescue"]);
      expect(implement.outcome?.status).toBe("failed");
      expect(
        records.filter((rec) => rec.slug === "task" && rec.step === "park"),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

/** Round 1 lands v1 and QA sends it back with one finding. */
function scriptFixRoundStart(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "v1" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "needs another pass",
          qa: { verdict: "changes", findings: ["task.txt:1 needs v2"] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
}

/** The fix round edits nothing and delivers nothing, then the rescue does. */
function scriptFixRoundRescue(
  harness: FakeHarness,
  onRescue: (prompt: string) => void,
): void {
  harness.script((req) => fakeTurnResult(req, { text: "reviewed the fix" }));
  harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
  harness.script((req, ctx) => {
    onRescue(req.prompt);
    ctx.writeOutcome(
      outcome({
        summary: "the earlier work answers the finding",
        replies: [{ finding: 1, reply: "the branch already holds v2" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "accepted", qa: { verdict: "accept" } }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  approveReview(harness);
}

function countsAnUnchangedFixRound(): void {
  it("rescues a fix round whose earlier work is the branch's only diff", async () => {
    const { repo, harness, runtime } = await setupFlow();
    try {
      let rescuePrompt = "";
      scriptFixRoundStart(harness);
      scriptFixRoundRescue(harness, (prompt) => {
        rescuePrompt = prompt;
      });

      await runDispatch(runtime, { iteration: 1 });

      // Neither the fix nor its reminder touched the tree: the rescue call
      // proves the earlier round's committed work is the diff it read.
      expect(rescuePrompt).toContain("no outcome after repair");
      expect(rescuePrompt).toContain("1. task.txt:1 needs v2");
      const { records, state } = await recordsOf(runtime);
      const fix = records.find(
        (rec) =>
          rec.slug === "task" && rec.step === "implement" && rec.round === 2,
      )!;
      expect(fix.asks).toEqual(["unfinished", "rescue"]);
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

/** Parks the task with task.txt kept on its branch, then bumps its revision. */
async function parkKeptTask(repo: Repo, goal: string) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task.txt\n", "utf8");
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "kept work, then stopped" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  scriptStallLeave(harness, ["task"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  expect(
    repo.git(["show", "factory-task/demo/task:task.txt"]).stdout.trim(),
  ).toBe("task.txt");
  bumpRevision(runtime, "task");
  scriptStallLeave(harness, ["task"]);
  return { harness, runtime };
}

/** The revision's turn, its reminder and the rescue all edit nothing. */
function scriptRevisionRescue(
  harness: FakeHarness,
  onRescue: (prompt: string) => void,
): void {
  harness.script((req) => fakeTurnResult(req, { text: "read the kept work" }));
  harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
  harness.script((req, ctx) => {
    onRescue(req.prompt);
    ctx.writeOutcome(outcome({ summary: "the kept work is complete" }));
    return fakeTurnResult(req);
  });
  approveReview(harness);
}

function countsARevisionsKeptWork(): void {
  it("rescues a revision whose kept branch already carries the work", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const { harness, runtime } = await parkKeptTask(repo, goal);
      let rescuePrompt = "";
      scriptRevisionRescue(harness, (prompt) => {
        rescuePrompt = prompt;
        expect(
          fs.readFileSync(path.join(taskWorktree(runtime), "task.txt"), "utf8"),
        ).toBe("task.txt\n");
      });

      const result = await runDispatch(runtime, { iteration: 2 });

      expect(result.reason).toBe("boundary");
      expect(rescuePrompt).toContain("no outcome after repair");
      const { records, state } = await recordsOf(runtime);
      const revised = records.find(
        (rec) =>
          rec.slug === "task" && rec.step === "implement" && rec.revision === 1,
      )!;
      expect(revised.asks).toEqual(["unfinished", "rescue"]);
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

describe("outcome rescue turn in the shipped flow", () => {
  rescuesTheWorkAfterTheReminder();
  leavesAnEmptyBranchAsToday();
  leavesAHaltedStopAsToday();
  leavesASecondInvalidOutcomeAsToday();
  countsAnUnchangedFixRound();
  countsARevisionsKeptWork();
});
