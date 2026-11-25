import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { reduceTask } from "../../src/kernel/derive-task.js";
import { next } from "../../src/kernel/next.js";
import { DECIDE_STEP } from "../../src/kernel/pending-signal.js";
import type {
  FlowDefinition,
  FlowStep,
  Limits,
  StepRecord,
} from "../../src/kernel/types.js";
import { causeText, rec, script, task } from "./helpers.js";

/** A step fixture for the custom flows below; the prompt names its role. */
const IMPLEMENT: FlowStep = {
  id: "implement",
  prompt: "implementer",
  alias: "implementer",
};

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

const RESOLVE: FlowStep = {
  id: "resolve",
  prompt: "steward",
  alias: "steward",
};

/**
 * QA spends its one call and accepts; the reviewer approves; a conflict's
 * resolve changes files outside the conflict set, so the flow settles on QA
 * again with its own budget spent and an approve as the last verdict.
 */
const RESOLVED_ONTO_SPENT_QA_FLOW: FlowDefinition = {
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
    RESOLVE,
  ],
};

const resolvedOntoSpentQaRecords = (): StepRecord[] => [
  implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
  checks(2),
  qaRecord(3, "accept"),
  checks(4),
  review(5, "approve", 1),
  script(6, {
    step: "merge",
    ok: false,
    cause: { kind: "conflict", detail: "plan.md" },
  }),
  rec(7, {
    step: "resolve",
    round: 2,
    outside: ["src/new.ts"],
    outcome: {
      status: "done",
      summary: "resolved the conflict and moved a neighbour",
      concerns: [],
      forward: [],
    },
  }),
];

/**
 * QA spends one of its two requests and accepts twice; two resolves carry the
 * flow back to it, so its calls are spent while one change request remains.
 */
const RESOLVED_ONTO_SPENT_CALLS_FLOW: FlowDefinition = {
  steps: [
    IMPLEMENT,
    { id: "qa", prompt: "qa", alias: "qa", qa: true, changeRequests: 2 },
    {
      id: "review",
      prompt: "reviewer",
      alias: "reviewer",
      review: true,
      changeRequests: 2,
    },
    RESOLVE,
  ],
};

const conflict = (seq: number, round: number): StepRecord =>
  script(seq, {
    step: "merge",
    round,
    ok: false,
    cause: { kind: "conflict", detail: "plan.md" },
  });

const resolveOutside = (seq: number, round: number): StepRecord =>
  rec(seq, {
    step: "resolve",
    round,
    outside: ["src/new.ts"],
    outcome: {
      status: "done",
      summary: "resolved the conflict and moved a neighbour",
      concerns: [],
      forward: [],
    },
  });

const resolvedOntoSpentCallsRecords = (): StepRecord[] => [
  implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
  checks(2),
  qaRecord(3, "changes", 1, ["task.txt:1 needs v2"]),
  implement(4, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
  checks(5),
  qaRecord(6, "accept", 2),
  checks(7),
  review(8, "approve", 2),
  conflict(9, 2),
  resolveOutside(10, 3),
  qaRecord(11, "accept", 4),
  checks(12),
  review(13, "approve", 4),
  conflict(14, 4),
  resolveOutside(15, 5),
];

function registerBudgetSignals(): void {
  it("raises the change-requests-exhausted signal for a step whose own calls are spent", () => {
    const reduction = reduceTask(
      task("a"),
      resolvedOntoSpentQaRecords(),
      RESOLVED_ONTO_SPENT_QA_FLOW,
    );
    expect(reduction.phase).toBe(DECIDE_STEP);
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "change-requests-exhausted",
      evidence: 'after verdict "approve" (1 call)',
    });
  });

  it("raises the round-limit signal where an approve settled onto spent calls", () => {
    const reduction = reduceTask(
      task("a"),
      resolvedOntoSpentCallsRecords(),
      RESOLVED_ONTO_SPENT_CALLS_FLOW,
    );
    expect(reduction.phase).toBe(DECIDE_STEP);
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "round-limit",
      evidence: 'after verdict "approve" (3 calls)',
    });
  });
}

function registerGrantPath(): void {
  it("grants the spent step one more call when the decider asks for changes", () => {
    const reduction = reduceTask(
      task("a"),
      [
        ...resolvedOntoSpentQaRecords(),
        decide(8, "changes", 3),
        implement(9, 4, { tree: "tree-2", commit: "c2", base: "c0" }),
        checks(10),
        qaRecord(11, "accept", 4),
        checks(12),
        review(13, "approve", 4),
        conflict(14, 4),
        resolveOutside(15, 5),
      ],
      RESOLVED_ONTO_SPENT_QA_FLOW,
    );
    // The grant raised QA's call allowance: the next settle past it names two
    // calls, not the one call it bought before the decider spoke.
    expect(reduction.pendingSignal).toEqual({
      kind: "round-limit",
      evidence: 'after verdict "approve" (2 calls)',
    });
    expect(reduction.park).toBeUndefined();
  });
}

function registerDecideAnswers(): void {
  it("ships the branch when the decider approves the spent step", () => {
    const reduction = reduceTask(
      task("a"),
      [...resolvedOntoSpentQaRecords(), decide(8, "approve", 3)],
      RESOLVED_ONTO_SPENT_QA_FLOW,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(reduction.park).toBeUndefined();
    expect(reduction.phase).toBe("checks");
  });

  it("parks only through the decider's reject", () => {
    const reduction = reduceTask(
      task("a"),
      [...resolvedOntoSpentQaRecords(), decide(8, "reject", 3)],
      RESOLVED_ONTO_SPENT_QA_FLOW,
    );
    expect(reduction.pendingSignal).toBeUndefined();
    expect(causeText(reduction.park)).toContain("decided reject");
    expect(reduction.phase).toBe("parked");
  });

  it("dispatches the decide turn for the derived budget signal", () => {
    const state = derive([task("a")], resolvedOntoSpentQaRecords(), {
      "implement-review": RESOLVED_ONTO_SPENT_QA_FLOW,
    });
    const limits: Limits = {
      flows: { "implement-review": RESOLVED_ONTO_SPENT_QA_FLOW },
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    };
    expect(next(state, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: DECIDE_STEP, round: 3 },
    ]);
  });
}

describe("per-agent budget signals", () => {
  registerBudgetSignals();
  registerGrantPath();
  registerDecideAnswers();
});
