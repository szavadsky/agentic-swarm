import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { next } from "../../src/kernel/next.js";
import { DECIDE_STEP } from "../../src/kernel/pending-signal.js";
import type {
  FlowDefinition,
  FlowStep,
  Limits,
  StepRecord,
} from "../../src/kernel/types.js";
import { cause, causeText, rec, script, task } from "./helpers.js";

const FLOW = DEFAULT_FLOWS["implement-review"]!;
const JUST = DEFAULT_FLOWS["just-implement"]!;

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

/** A step fixture for the custom flows below; the prompt names its role. */
const IMPLEMENT: FlowStep = {
  id: "implement",
  prompt: "implementer",
  alias: "implementer",
};

const qaRecord = (
  seq: number,
  verdict: "accept" | "changes",
  round = 1,
  findings: string[] = [],
): StepRecord =>
  rec(seq, {
    step: "qa",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: `qa r${round}`,
      concerns: [],
      forward: [],
      qa: { verdict, findings },
    } as StepRecord["outcome"],
  });

const redMergeGate = (seq: number): StepRecord =>
  script(seq, {
    step: "merge",
    ok: false,
    cause: cause("gates: unit"),
    checks: [
      {
        name: "unit",
        ok: false,
        summary: "exit 1",
        output: "boom",
        fingerprint: "unit",
      },
    ],
    startedAt: new Date(seq).toISOString(),
  });

/**
 * The reviewer spends its own bound; QA has not launched, so QA's first call
 * is still inside its own budget. The task-wide round is past QA's bound, which
 * must not spend QA's rounds.
 */
const SPENT_REVIEW_FLOW: FlowDefinition = {
  steps: [
    IMPLEMENT,
    {
      id: "review",
      prompt: "reviewer",
      alias: "reviewer",
      review: true,
      changeRequests: 1,
    },
    { id: "qa", prompt: "qa", alias: "qa", qa: true, changeRequests: 0 },
  ],
};

const spentReviewRecords = (): StepRecord[] => [
  implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
  checks(2),
  review(3, "changes", 1),
  implement(4, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
  checks(5),
  review(6, "approve", 2),
];

/**
 * QA's one call is spent (it accepted), so the reviewer's later change request
 * reaches a step that has no call left in its own budget.
 */
const SPENT_QA_FLOW: FlowDefinition = {
  steps: [
    IMPLEMENT,
    { id: "qa", prompt: "qa", alias: "qa", qa: true, changeRequests: 0 },
    {
      id: "review",
      prompt: "reviewer",
      alias: "reviewer",
      review: true,
      changeRequests: 2,
    },
  ],
};

const spentQaRecords = (): StepRecord[] => [
  implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
  checks(2),
  qaRecord(3, "accept"),
  checks(4),
  review(5, "changes", 1),
  implement(6, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
  checks(7),
];

function registerPerAgentBudget(): void {
  it("does not raise a round signal for an agent that spent its own bound", () => {
    const reduction = reduceTask(
      task("a"),
      spentReviewRecords(),
      SPENT_REVIEW_FLOW,
    );
    expect(reduction.phase).toBe("qa");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toBeUndefined();
  });

  it("dispatches QA's own first call instead of a decide turn", () => {
    const state = derive([task("a")], spentReviewRecords(), {
      "implement-review": SPENT_REVIEW_FLOW,
    });
    const limits: Limits = {
      flows: { "implement-review": SPENT_REVIEW_FLOW },
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    };
    expect(next(state, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "qa", round: 2 },
    ]);
  });

  it("does not charge the reviewer's change request to QA", () => {
    // QA owns no change request, so its bound is the last call alone; a
    // change request pays for the call it sends back, so the reviewer's spend
    // never spends QA's.
    const reduction = reduceTask(task("a"), spentQaRecords(), SPENT_QA_FLOW);
    expect(reduction.phase).toBe("qa");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toBeUndefined();
  });
}

function registerRedBaseSignal(): void {
  const records = [
    implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    failedChecks(2),
    implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
    failedChecks(4),
    implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
    failedChecks(6),
    implement(7, 1, { tree: "tree-4", commit: "c4", base: "c0" }),
    failedChecks(8),
  ];

  it("raises the red-base signal when the fix rounds are spent", () => {
    const reduction = reduceTask(task("a"), records, FLOW);
    expect(reduction.phase).toBe(DECIDE_STEP);
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "gates",
      evidence: "task checks red after 3 fix turns: unit",
    });
  });

  it("accepts the red and continues to acceptance on approve", () => {
    const reduction = reduceTask(
      task("a"),
      [...records, decide(9, "approve")],
      FLOW,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.park).toBeUndefined();
    expect(reduction.phase).toBe("qa");
  });

  it("grants a fresh gate-fix budget on changes", () => {
    const reduction = reduceTask(
      task("a"),
      [...records, decide(9, "changes")],
      FLOW,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.park).toBeUndefined();
    expect(reduction.phase).toBe("implement");
    expect(reduction.gateFix).toBe(true);
  });
}

function registerGateFixNoProgressSignal(): void {
  const records = [
    implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    checks(2),
    redMergeGate(3),
    implement(4, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
    checks(5),
    redMergeGate(6),
  ];

  it("raises the gate-fix no-progress signal instead of parking", () => {
    const reduction = reduceTask(
      task("a", { flow: "just-implement" }),
      records,
      JUST,
    );
    expect(reduction.phase).toBe(DECIDE_STEP);
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "gates",
      evidence: "merge gates red after the gate fix: unit (exit 1)",
    });
  });

  it("retries the landing on approve", () => {
    const reduction = reduceTask(
      task("a", { flow: "just-implement" }),
      [...records, decide(7, "approve")],
      JUST,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.park).toBeUndefined();
    expect(reduction.phase).toBe("merge");
  });

  it("grants one more merge-gate fix on changes", () => {
    const reduction = reduceTask(
      task("a", { flow: "just-implement" }),
      [...records, decide(7, "changes")],
      JUST,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.park).toBeUndefined();
    expect(reduction.phase).toBe("implement");
    expect(reduction.gateFix).toBe(true);
  });
}

describe("signal decider limits", () => {
  registerPerAgentBudget();
  registerRedBaseSignal();
  registerGateFixNoProgressSignal();
});
