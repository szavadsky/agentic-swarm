import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { forwardedConcerns } from "../../src/kernel/context-pack.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { DECIDE_STEP } from "../../src/kernel/pending-signal.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { causeText, rec, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const WORKTREE_FILE = "task.txt";
const APPROVED_CONCERN = "the branch ships on the prior turn's evidence";

const implement = (
  seq: number,
  round = 1,
  patch: Partial<StepRecord> = {},
): StepRecord =>
  rec(seq, {
    step: "implement",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
    ...patch,
  });

const decide = (
  seq: number,
  verdict: "approve" | "changes" | "reject",
  round = 1,
  summary = `decided ${verdict}`,
): StepRecord =>
  rec(seq, {
    step: DECIDE_STEP,
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary,
      concerns: [],
      forward: [],
      verdict,
    },
  });

const review = (
  seq: number,
  verdict: "approve" | "changes",
  round = 1,
): StepRecord =>
  rec(seq, {
    step: "review",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: `review r${round}`,
      concerns: [],
      forward: [],
      verdict,
    },
  });

const checks = (seq: number, ok = true): StepRecord =>
  script(seq, {
    step: "checks",
    ok,
    checks: [],
    startedAt: new Date(seq).toISOString(),
  });

const advance = (seq: number, tree: string, headTree?: string): StepRecord =>
  script(seq, {
    step: "base-advance",
    ok: true,
    tree,
    ...(headTree !== undefined ? { headTree } : {}),
    startedAt: new Date(seq).toISOString(),
  });

/** Writes the worktree file through the cwd the turn reports. */
function writeWorktreeFile(dir: string | undefined): void {
  fs.writeFileSync(path.join(dir!, WORKTREE_FILE), "done\n", "utf8");
}

function scriptImplementFirstWrites(harness: FakeHarness): void {
  let calls = 0;
  harness.script(
    (req, ctx) => {
      calls += 1;
      if (calls === 1) writeWorktreeFile(req.cwd);
      ctx.writeOutcome(
        outcome({
          summary: calls === 1 ? "wrote the file" : "nothing to change",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
}

function scriptImplementSecondWrites(harness: FakeHarness): void {
  let calls = 0;
  harness.script(
    (req, ctx) => {
      calls += 1;
      if (calls === 2) writeWorktreeFile(req.cwd);
      ctx.writeOutcome(
        outcome({
          summary: calls === 1 ? "nothing to change" : "wrote the file",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
}

function scriptImplementNothing(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "nothing to change" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
}

function scriptReviewChangesThenApprove(harness: FakeHarness): void {
  let calls = 0;
  harness.script(
    (req, ctx) => {
      calls += 1;
      ctx.writeOutcome(
        outcome({
          summary: calls === 1 ? "1. confirm the fix" : "the work ships",
          verdict: calls === 1 ? "changes" : "approve",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }), fallback: true },
  );
}

function scriptDecider(
  harness: FakeHarness,
  summary: string,
  verdict: "approve" | "changes" | "reject",
  concern?: string,
): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary,
          verdict,
          ...(concern === undefined
            ? {}
            : {
                concerns: [
                  { kind: "risk", calibration: "architect", text: concern },
                ],
              }),
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: DECIDE_STEP }), fallback: true },
  );
}

function deciderCalls(harness: FakeHarness) {
  return harness.calls.filter(
    (call) => fakeTurnIdentity(call).step === DECIDE_STEP,
  );
}

async function stateOf(runtime: Awaited<ReturnType<typeof makeRuntime>>) {
  return derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
}

async function dispatchJustImplement(
  scripts: (harness: FakeHarness) => void,
): Promise<{
  harness: FakeHarness;
  runtime: Awaited<ReturnType<typeof makeRuntime>>;
}> {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  scripts(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("task", { flow: "just-implement", scope: [WORKTREE_FILE] }),
  );
  await runDispatch(runtime, { iteration: 1 });
  return { harness, runtime };
}

function registerApproveShips(): void {
  it("follows an empty implement turn with a decider turn that approves and ships", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementFirstWrites(harness);
      scriptReviewChangesThenApprove(harness);
      scriptDecider(
        harness,
        "kept work is sufficient",
        "approve",
        APPROVED_CONCERN,
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: [WORKTREE_FILE] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      expect(
        records.filter((record) => record.step === "implement"),
      ).toHaveLength(2);
      expect(deciderCalls(harness)).toHaveLength(1);
      // The decider borrows the reviewer's prompt role and its live session.
      expect(deciderCalls(harness)[0]!.prompt).toContain(
        "You decide one task's mechanical signal",
      );
      expect(deciderCalls(harness)[0]!.session).toBeDefined();
      expect((await stateOf(runtime)).tasks.task!.status).toBe("merged");
      // The decider's concern reaches the pack that reads these records.
      expect(
        forwardedConcerns(records).some(
          (concern) => concern.text === APPROVED_CONCERN,
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerChangesContinues(): void {
  it("opens the next fix round when the decider answers changes", async () => {
    const { harness, runtime } = await dispatchJustImplement((fake) => {
      scriptImplementSecondWrites(fake);
      scriptDecider(
        fake,
        "1. write task.txt with the done-when evidence",
        "changes",
      );
    });

    const records = (await runtime.store.listRecords()).filter(
      (record) => record.step === "implement",
    );
    expect(records.map((record) => record.round)).toEqual([1, 2]);
    const second = harness.calls.filter(
      (call) => fakeTurnIdentity(call).step === "implement",
    )[1]!;
    expect(second.prompt).toContain(
      "write task.txt with the done-when evidence",
    );
    // No reviewer session exists on this flow: a fresh reviewer-alias turn.
    expect(deciderCalls(harness)[0]!.model.id).toBe("fake-review");
    expect((await stateOf(runtime)).tasks.task!.status).toBe("merged");
  }, 60_000);
}

function registerRejectParks(): void {
  it("parks the signal for the PM when the decider rejects the work", async () => {
    const { runtime } = await dispatchJustImplement((fake) => {
      scriptImplementNothing(fake);
      scriptDecider(fake, "the branch contradicts the done-when", "reject");
      scriptStallLeave(fake, ["task"]);
    });
    const state = await stateOf(runtime);
    expect(state.tasks.task!.status).toBe("parked");
    expect(causeText(state.tasks.task!.cause)).toContain(
      "the branch contradicts the done-when",
    );
  }, 60_000);
}

function registerNoOutcomeStops(): void {
  it("parks after one reminder when the decider settles no outcome, never looping", async () => {
    const { harness, runtime } = await dispatchJustImplement((fake) => {
      scriptImplementNothing(fake);
      // No outcome at all, on the turn and on its reminder.
      fake.script(
        (req) => fakeTurnResult(req, { text: "I looked and said nothing" }),
        { when: whenTurn({ step: DECIDE_STEP }), fallback: true },
      );
      scriptStallLeave(fake, ["task"]);
    });

    const decides = (await runtime.store.listRecords()).filter(
      (record) => record.step === DECIDE_STEP && record.endedAt,
    );
    expect(decides).toHaveLength(1);
    expect(decides[0]!.outcome?.status).toBe("failed");
    // One decide turn and its one outcome reminder; the signal never loops.
    expect(deciderCalls(harness)).toHaveLength(2);
    expect((await stateOf(runtime)).tasks.task!.status).toBe("parked");
  }, 60_000);
}

const FLOW = DEFAULT_FLOWS["implement-review"]!;

function registerVerdictExemption(): void {
  it("raises no signal for an empty verdict step", () => {
    const reduction = reduceTask(
      task("a"),
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        checks(2),
        review(3, "approve"),
      ],
      FLOW,
    );
    expect(reduction.phase).toBe("merge");
    expect(reduction.pendingSignal).toBeUndefined();
  });
}

function registerReplyExemption(): void {
  it("raises no signal for a reply-only answer to requested changes", () => {
    const reduction = reduceTask(
      task("a"),
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        checks(2),
        review(3, "changes"),
        implement(4, 2, {
          tree: "tree-1",
          commit: "c2",
          base: "c0",
          outcome: {
            status: "done",
            summary: "answered",
            concerns: [],
            forward: [],
            replies: [{ finding: 1, reply: "answered in r1" }],
          },
        }),
      ],
      FLOW,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.pendingSignal).toBeUndefined();
  });
}

function registerCarryExemption(): void {
  it("raises no signal for carried continuation work on its first turn", () => {
    const reduction = reduceTask(
      task("beta", { base: "alpha" }),
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
      ],
      FLOW,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.pendingSignal).toBeUndefined();
  });
}

function failedChecks(seq: number): StepRecord {
  return script(seq, {
    step: "checks",
    ok: false,
    checks: [
      {
        name: "unit",
        ok: false,
        summary: "exit 1",
        output: "",
        fingerprint: "unit",
      },
    ],
    startedAt: new Date(seq).toISOString(),
  });
}

function registerGateDeferralExemption(): void {
  it("raises no signal for an empty gate fix deferred to its next checks", () => {
    const reduction = reduceTask(
      task("a"),
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      ],
      FLOW,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.pendingSignal).toBeUndefined();
  });
}

function registerDeferredSignalResolves(): void {
  it("raises the signal only when the deferred red repeats, and its decider resolves it", () => {
    const records = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      failedChecks(2),
      implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      failedChecks(4),
    ];
    const signal = reduceTask(task("a"), records, FLOW);
    expect(signal.phase).toBe(DECIDE_STEP);
    expect(signal.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r1 committed no changes after red checks: unit (exit 1)",
    });
    expect(signal.park).toBeUndefined();

    const approved = reduceTask(
      task("a"),
      [...records, decide(5, "approve")],
      FLOW,
    );
    expect(approved.pendingSignal).toBeUndefined();
    expect(approved.park).toBeUndefined();
    expect(approved.phase).toBe("checks");
  });
}

function registerChangesFixRound(): void {
  it("answers a decide turn's changes with the next fix round", () => {
    const reduction = reduceTask(
      task("a"),
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        checks(2),
        review(3, "changes"),
        implement(4, 2, { tree: "tree-1", commit: "c2", base: "c0" }),
        decide(5, "changes", 2),
      ],
      FLOW,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.phase).toBe("implement");
    expect(reduction.round).toBe(3);
    expect(reduction.verdict).toBe("changes");
  });
}

describe("signal decider", () => {
  registerApproveShips();
  registerChangesContinues();
  registerRejectParks();
  registerNoOutcomeStops();
});

describe("signal exemptions", () => {
  registerVerdictExemption();
  registerReplyExemption();
  registerCarryExemption();
  registerGateDeferralExemption();
  registerDeferredSignalResolves();
  registerChangesFixRound();
});
