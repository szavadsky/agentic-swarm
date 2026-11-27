/**
 * The five mechanical park signals GAPS listed: a second crash, a second
 * conflict, a repeated tree, a last-call `changes` and a persistent overflow.
 * Each raises a signal the decide turn reads; its structured output retries,
 * fixes or parks, and the kernel never parks on the signal itself.
 */
import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { reduceTask } from "../../src/kernel/derive-task.js";
import { next } from "../../src/kernel/next.js";
import { DECIDE_STEP } from "../../src/kernel/pending-signal.js";
import type {
  FlowDefinition,
  Limits,
  StepRecord,
} from "../../src/kernel/types.js";
import { cause, rec, script, task } from "./helpers.js";

const IMPLEMENT = {
  id: "implement",
  prompt: "implementer",
  alias: "implementer",
} as const;

const REVIEW = {
  id: "review",
  prompt: "reviewer",
  alias: "reviewer",
  review: true,
  changeRequests: 3,
} as const;

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

const checks = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: true,
    checks: [],
    startedAt: new Date(seq).toISOString(),
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

const mergeConflict = (seq: number): StepRecord =>
  script(seq, {
    step: "merge",
    ok: false,
    cause: cause("conflict: task.txt"),
    startedAt: new Date(seq).toISOString(),
  });

const resolve = (seq: number): StepRecord =>
  rec(seq, {
    step: "resolve",
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "resolved the conflict",
      concerns: [],
      forward: [],
    },
  });

const crash = (seq: number): StepRecord =>
  rec(seq, {
    step: "implement",
    startedAt: new Date(seq).toISOString(),
    stop: { kind: "infra", cause: "crash", details: "runner lost" },
  });

const overflow = (seq: number): StepRecord =>
  rec(seq, {
    step: "implement",
    startedAt: new Date(seq).toISOString(),
    stop: { kind: "infra", cause: "overflow", details: "context window" },
  });

const decide = (
  seq: number,
  verdict: "approve" | "changes" | "reject",
  round = 1,
): StepRecord =>
  rec(seq, {
    step: DECIDE_STEP,
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: `decided ${verdict}`,
      concerns: [],
      forward: [],
      verdict,
    },
  });

function limitsFor(flow: FlowDefinition): Limits {
  return {
    flows: { "implement-review": flow },
    iterations: 1,
    concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    planCheckRounds: 2,
  };
}

function decideAction(state: ReturnType<typeof derive>, flow: FlowDefinition) {
  return next(state, limitsFor(flow), new Set());
}

const FLOW: FlowDefinition = { steps: [IMPLEMENT, REVIEW] };
const CONFLICT_FLOW: FlowDefinition = {
  steps: [
    IMPLEMENT,
    { ...REVIEW, changeRequests: 1 },
    { id: "resolve", prompt: "steward", alias: "steward" },
  ],
};

describe("kernel parks route to an agent", () => {
  it("raises the repeated-tree signal and the decider's changes opens a fix round", () => {
    const records = [
      implement(1, 1, { tree: "tree-A", commit: "cA", base: "c0" }),
      checks(2),
      review(3, "changes", 1),
      implement(4, 2, { tree: "tree-B", commit: "cB", base: "c0" }),
      checks(5),
      review(6, "changes", 2),
      implement(7, 3, { tree: "tree-A", commit: "cA2", base: "c0" }),
    ];
    const signalled = reduceTask(task("a"), records, FLOW);
    expect(signalled.phase).toBe(DECIDE_STEP);
    expect(signalled.park).toBeUndefined();
    expect(signalled.pendingSignal).toEqual({
      kind: "no-progress",
      evidence: expect.stringContaining("implement r3 repeats r1"),
    });

    const derived = derive([task("a")], records, {
      "implement-review": FLOW,
    });
    expect(decideAction(derived, FLOW)).toEqual([
      { kind: "step", slug: "a", step: DECIDE_STEP, round: 3 },
    ]);

    const fixed = reduceTask(
      task("a"),
      [...records, decide(8, "changes", 3)],
      FLOW,
    );
    expect(fixed.pendingSignal).toBeUndefined();
    expect(fixed.park).toBeUndefined();
    expect(fixed.phase).toBe("implement");
    expect(fixed.round).toBe(4);
  });

  it("raises the second-crash signal and the decider's approve retries the step", () => {
    const records = [crash(1), crash(2)];
    const signalled = reduceTask(task("a"), records, FLOW);
    expect(signalled.phase).toBe(DECIDE_STEP);
    expect(signalled.park).toBeUndefined();
    expect(signalled.pendingSignal).toEqual({
      kind: "infra-repeat",
      evidence: "implement reported crash: runner lost twice",
    });

    const retried = reduceTask(
      task("a"),
      [...records, decide(3, "approve")],
      FLOW,
    );
    expect(retried.pendingSignal).toBeUndefined();
    expect(retried.park).toBeUndefined();
    expect(retried.phase).toBe("implement");
  });

  it("raises the second-conflict signal and the decider's approve retries the landing", () => {
    const records = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      checks(2),
      review(3, "approve"),
      mergeConflict(4),
      resolve(5),
      checks(6),
      mergeConflict(7),
    ];
    const flow = CONFLICT_FLOW;
    const signalled = reduceTask(task("a"), records, flow);
    expect(signalled.phase).toBe(DECIDE_STEP);
    expect(signalled.park).toBeUndefined();
    expect(signalled.pendingSignal).toEqual({
      kind: "conflict",
      evidence: "the merge conflicted again after its resolve turn: task.txt",
    });

    const derived = derive([task("a")], records, {
      "implement-review": flow,
    });
    expect(decideAction(derived, flow)).toEqual([
      { kind: "step", slug: "a", step: DECIDE_STEP, round: 1 },
    ]);

    const retried = reduceTask(
      task("a"),
      [...records, decide(8, "approve")],
      flow,
    );
    expect(retried.pendingSignal).toBeUndefined();
    expect(retried.park).toBeUndefined();
    expect(retried.phase).toBe("merge");
  });

  it("raises the last-call changes signal and the decider's reject parks its kind", () => {
    const flow: FlowDefinition = {
      steps: [IMPLEMENT, { ...REVIEW, changeRequests: 1 }],
    };
    const records = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      checks(2),
      review(3, "changes", 1),
      implement(4, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
      checks(5),
      review(6, "changes", 2),
    ];
    const signalled = reduceTask(task("a"), records, flow);
    expect(signalled.phase).toBe(DECIDE_STEP);
    expect(signalled.park).toBeUndefined();
    expect(signalled.pendingSignal).toEqual({
      kind: "invalid-outcome",
      evidence: "changes on the last review call: review r2",
    });

    const derived = derive([task("a")], records, {
      "implement-review": flow,
    });
    expect(decideAction(derived, flow)).toEqual([
      { kind: "step", slug: "a", step: DECIDE_STEP, round: 2 },
    ]);

    const parked = reduceTask(
      task("a"),
      [...records, decide(7, "reject", 2)],
      flow,
    );
    expect(parked.pendingSignal).toBeUndefined();
    expect(parked.phase).toBe("parked");
    expect(parked.park).toEqual({
      kind: "invalid-outcome",
      detail: expect.stringContaining("the decider rejected: decided reject"),
    });
  });

  it("raises the persistent-overflow signal and the decider's changes opens a fix round", () => {
    const records = [overflow(1)];
    const signalled = reduceTask(task("a"), records, FLOW);
    expect(signalled.phase).toBe(DECIDE_STEP);
    expect(signalled.park).toBeUndefined();
    expect(signalled.pendingSignal).toEqual({
      kind: "overflow",
      evidence: "overflow in implement: context window",
    });

    const fixed = reduceTask(
      task("a"),
      [...records, decide(2, "changes")],
      FLOW,
    );
    expect(fixed.pendingSignal).toBeUndefined();
    expect(fixed.park).toBeUndefined();
    expect(fixed.phase).toBe("implement");
    expect(fixed.round).toBe(2);
  });
});
