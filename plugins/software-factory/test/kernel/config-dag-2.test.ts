import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { next } from "../../src/kernel/next.js";
import type {
  FlowDefinition,
  Limits,
  StepRecord,
} from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

function reversedRecords(): {
  flowDef: FlowDefinition;
  limits: Limits;
  implement: (seq: number, round?: number) => StepRecord;
  polish: (seq: number, round?: number) => StepRecord;
  check: (seq: number) => StepRecord;
  review: (
    seq: number,
    verdict: "approve" | "changes" | "reject",
    round?: number,
  ) => StepRecord;
} {
  // The reviewer listed first: its ready order contradicts the list order, so
  // a plain list-order walk cannot pass these cases.
  const flowDef: FlowDefinition = {
    dag: true,
    steps: [
      {
        id: "critique",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 2,
        after: ["draft", "polish"],
      },
      { id: "draft", prompt: "implementer", alias: "implementer", after: [] },
      { id: "polish", prompt: "implementer", alias: "implementer", after: [] },
    ],
  };
  const limits: Limits = {
    flows: { reversed: flowDef },
    iterations: 1,
    concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    planCheckRounds: 2,
  };
  return {
    flowDef,
    limits,
    implement: (seq, round = 1) =>
      rec(seq, {
        step: "draft",
        round,
        outcome: {
          status: "done",
          summary: "drafted",
          concerns: [],
          forward: [],
        },
      }),
    polish: (seq, round = 1) =>
      rec(seq, {
        step: "polish",
        round,
        outcome: {
          status: "done",
          summary: "polished",
          concerns: [],
          forward: [],
        },
      }),
    check: (seq) => script(seq, { step: "checks", ok: true, checks: [] }),
    review: (seq, verdict, round = 1) =>
      rec(seq, {
        step: "critique",
        round,
        outcome: {
          status: "done",
          summary: "review",
          concerns: [],
          forward: [],
          verdict,
        },
      }),
  };
}

function reorderedRecords(): {
  rounds: (
    seq: number,
    round: number,
    verdict?: "approve" | "changes",
  ) => StepRecord[];
  flows: Record<string, FlowDefinition>;
  limits: Limits;
} {
  const { flowDef, limits, implement, polish, check, review } =
    reversedRecords();
  return {
    // One reviewer-first round: draft, polish gated inline, then the verdict.
    rounds: (seq, round, verdict) => [
      implement(seq, round),
      check(seq + 1),
      polish(seq + 2, round),
      check(seq + 3),
      ...(verdict ? [review(seq + 4, verdict, round)] : []),
    ],
    flows: { reversed: flowDef },
    limits,
  };
}

function reorderedUnreviewedTest(): void {
  it("walks the ready reviewer instead of merging unreviewed", () => {
    const { rounds, flows, limits } = reorderedRecords();
    const state = derive([task("a", { flow: "reversed" })], [], flows);
    // The ready walk starts at draft (topological order), not at the first
    // list step, which is the reviewer.
    expect(next(state, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "draft", round: 1 },
    ]);
    const ready = derive(
      [task("a", { flow: "reversed" })],
      rounds(1, 1),
      flows,
    );
    // Polish's green checks land on the end phase by list order; the walk must
    // continue to the ready reviewer, and no merge may be emitted before it.
    expect(ready.tasks.a!.phase).toBe("critique");
    expect(next(ready, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "critique", round: 1 },
    ]);
    expect(next(ready, limits, new Set())).not.toContainEqual(
      expect.objectContaining({ kind: "merge" }),
    );
    const afterReview = derive(
      [task("a", { flow: "reversed" })],
      rounds(1, 1, "approve"),
      flows,
    );
    expect(afterReview.tasks.a!.phase).toBe("merge");
    expect(next(afterReview, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
}

function reorderedChangesTest(): void {
  it("routes a changes verdict to the first ready step of the fix round", () => {
    const { rounds, flows, limits } = reorderedRecords();
    const changed = derive(
      [task("a", { flow: "reversed" })],
      rounds(1, 1, "changes"),
      flows,
    );
    // The changes branch pre-sets the phase to the first list step (the
    // reviewer); the DAG walk re-roots the fix round at draft, its first
    // ready step. Without the changes branch the phase stays critique.
    expect(changed.tasks.a!.phase).toBe("draft");
    expect(next(changed, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "draft", round: 2 },
    ]);
    const fixRound = derive(
      [task("a", { flow: "reversed" })],
      [...rounds(1, 1, "changes"), ...rounds(6, 2)],
      flows,
    );
    expect(fixRound.tasks.a!.phase).toBe("critique");
    expect(next(fixRound, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "critique", round: 2 },
    ]);
    const settled = derive(
      [task("a", { flow: "reversed" })],
      [...rounds(1, 1, "changes"), ...rounds(6, 2, "approve")],
      flows,
    );
    expect(settled.tasks.a!.phase).toBe("merge");
    expect(next(settled, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
}

describe("DAG with reviewer listed first", () => {
  reorderedUnreviewedTest();
  reorderedChangesTest();
});

function stepAfterAcceptanceRecords(): {
  flows: Record<string, FlowDefinition>;
  limits: Limits;
  draft: (seq: number) => StepRecord;
  final: (seq: number) => StepRecord;
  check: (seq: number) => StepRecord;
  review: (seq: number, verdict: "approve" | "changes") => StepRecord;
} {
  // `final` is listed first and depends on the review: an approve cannot end
  // the walk before it runs.
  const flowDef: FlowDefinition = {
    dag: true,
    steps: [
      {
        id: "final",
        prompt: "implementer",
        alias: "implementer",
        after: ["critique"],
      },
      { id: "draft", prompt: "implementer", alias: "implementer", after: [] },
      {
        id: "critique",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 2,
        after: ["draft"],
      },
    ],
  };
  const limits: Limits = {
    flows: { step: flowDef },
    iterations: 1,
    concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    planCheckRounds: 2,
  };
  const done = (seq: number, step: string) =>
    rec(seq, {
      step,
      outcome: { status: "done", summary: "s", concerns: [], forward: [] },
    });
  return {
    flows: { step: flowDef },
    limits,
    draft: (seq) => done(seq, "draft"),
    final: (seq) => done(seq, "final"),
    check: (seq) => script(seq, { step: "checks", ok: true, checks: [] }),
    review: (seq, verdict) =>
      rec(seq, {
        step: "critique",
        outcome: {
          status: "done",
          summary: "review",
          concerns: [],
          forward: [],
          verdict,
        },
      }),
  };
}

function workAfterAcceptanceRecords(): {
  flows: Record<string, FlowDefinition>;
  limits: Limits;
  gate: (seq: number) => StepRecord;
  work: (seq: number) => StepRecord;
  check: (seq: number) => StepRecord;
} {
  // The productive `work` step runs after the accepting review: its own gate
  // is owed, and the verdict's checks judged an earlier tree.
  const flowDef: FlowDefinition = {
    dag: true,
    steps: [
      {
        id: "gate",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 2,
        after: [],
      },
      { id: "work", prompt: "implementer", alias: "implementer", after: [] },
    ],
  };
  const limits: Limits = {
    flows: { gate: flowDef },
    iterations: 1,
    concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    planCheckRounds: 2,
  };
  return {
    flows: { gate: flowDef },
    limits,
    gate: (seq) =>
      rec(seq, {
        step: "gate",
        outcome: {
          status: "done",
          summary: "review",
          concerns: [],
          forward: [],
          verdict: "approve",
        },
      }),
    work: (seq) =>
      rec(seq, {
        step: "work",
        outcome: { status: "done", summary: "w", concerns: [], forward: [] },
      }),
    check: (seq) => script(seq, { step: "checks", ok: true, checks: [] }),
  };
}

function readyAfterAcceptanceTest(): void {
  it("walks a step that depends on the accepting review", () => {
    const { flows, limits, draft, final, check, review } =
      stepAfterAcceptanceRecords();
    const accepted = derive(
      [task("a", { flow: "step" })],
      [draft(1), check(2), review(3, "approve")],
      flows,
    );
    expect(accepted.tasks.a!.phase).toBe("final");
    expect(next(accepted, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "final", round: 1 },
    ]);
    expect(next(accepted, limits, new Set())).not.toContainEqual(
      expect.objectContaining({ kind: "merge" }),
    );
    const settled = derive(
      [task("a", { flow: "step" })],
      [draft(1), check(2), review(3, "approve"), final(4)],
      flows,
    );
    expect(settled.tasks.a!.phase).toBe("merge");
    expect(next(settled, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
}

function pendingChecksAfterAcceptanceTest(): void {
  it("keeps the owed checks of a productive step after a verdict", () => {
    const { flows, limits, gate, work, check } = workAfterAcceptanceRecords();
    const owed = derive(
      [task("a", { flow: "gate" })],
      [gate(1), work(2)],
      flows,
    );
    expect(owed.tasks.a!.phase).toBe("checks");
    expect(next(owed, limits, new Set())).toEqual([
      { kind: "checks", slug: "a" },
    ]);
    const settled = derive(
      [task("a", { flow: "gate" })],
      [gate(1), work(2), check(3)],
      flows,
    );
    expect(settled.tasks.a!.phase).toBe("merge");
    expect(next(settled, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
}

describe("DAG steps around acceptance", () => {
  readyAfterAcceptanceTest();
  pendingChecksAfterAcceptanceTest();
});
