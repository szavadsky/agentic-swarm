import { describe, expect, it } from "bun:test";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause, causeText } from "./helpers.js";

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
  verdict: "approve" | "changes" | "reject",
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

function emptyGateFixDeferralPart1() {
  const gate = (name: string, ok: boolean) => ({
    name,
    ok,
    summary: ok ? "pass" : "exit 1",
    output: ok ? "" : "boom",
    fingerprint: `fp-${name}`,
  });

  const failedChecks = (
    seq: number,
    failing: string[],
    passing: string[] = [],
  ): StepRecord =>
    script(seq, {
      step: "checks",
      ok: false,
      checks: [
        ...failing.map((name) => gate(name, false)),
        ...passing.map((name) => gate(name, true)),
      ],
      startedAt: new Date(seq).toISOString(),
    });

  const passedChecks = (seq: number, passing: string[] = []): StepRecord =>
    script(seq, {
      step: "checks",
      ok: true,
      checks: passing.map((name) => gate(name, true)),
      startedAt: new Date(seq).toISOString(),
    });

  const infraChecks = (seq: number): StepRecord =>
    script(seq, {
      step: "checks",
      ok: false,
      checks: [
        {
          ...gate("typecheck", false),
          summary: "exit 127",
          details: { kind: "infra", cause: "exit 127" },
        },
      ],
      startedAt: new Date(seq).toISOString(),
    });

  return { gate, failedChecks, passedChecks, infraChecks };
}

function emptyGateFixDeferralPart2(
  scope: ReturnType<typeof emptyGateFixDeferralPart1>,
) {
  const { gate, failedChecks } = scope;
  const mergeGatesRed = (seq: number): StepRecord =>
    script(seq, {
      step: "merge",
      ok: false,
      cause: cause("gates: unit"),
      checks: [gate("unit", false)],
      startedAt: new Date(seq).toISOString(),
    });

  it("waits for the following checks instead of parking an empty gate fix at once", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.round).toBe(1);
    expect(reduction.park).toBeUndefined();
    expect(reduction.gateFix).toBe(true);
  });

  return { ...scope, mergeGatesRed };
}

function emptyGateFixDeferralPart3(
  scope: ReturnType<typeof emptyGateFixDeferralPart2>,
) {
  const { failedChecks, passedChecks } = scope;
  it("green checks after an empty gate fix proceed to QA with no extra round", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(4, ["unit"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("qa");
    expect(reduction.round).toBe(1);
    expect(reduction.park).toBeUndefined();
  });

  it("green checks after an empty gate fix proceed to merge under just-implement", () => {
    const t = task("a", { flow: "just-implement" });
    const flow = DEFAULT_FLOWS["just-implement"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(4, ["unit"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("merge");
    expect(reduction.round).toBe(1);
    expect(reduction.park).toBeUndefined();
  });
}

function emptyGateFixDeferralPart4(
  scope: ReturnType<typeof emptyGateFixDeferralPart2>,
) {
  const { failedChecks } = scope;
  it("an identical red after an empty gate fix raises the empty-diff signal", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"], ["lint"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(4, ["unit"], ["lint"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("decide");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r1 committed no changes after red checks: unit (exit 1)",
    });
  });

  it("a changed red set after an empty gate fix loops the fix", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(4, ["lint"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("implement");
    expect(reduction.round).toBe(1);
    expect(reduction.park).toBeUndefined();
    expect(reduction.gateFix).toBe(true);
  });
}

function emptyGateFixDeferralPart5(
  scope: ReturnType<typeof emptyGateFixDeferralPart2>,
) {
  const { failedChecks, infraChecks, passedChecks } = scope;
  it("infra-only reds after an empty gate fix never park as empty-diff or gate could not start", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(2, ["unit"]),
        implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        infraChecks(4),
      ],
      flow,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toBeUndefined();
  });

  it("defers an empty gate fix in a later round after a changes verdict", () => {
    const t = task("a");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(2, ["unit"]),
        review(3, "changes", 1),
        implement(4, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
        failedChecks(5, ["unit"]),
        implement(6, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
        passedChecks(7, ["unit"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("qa");
    expect(reduction.round).toBe(2);
    expect(reduction.verdict).toBe("changes");
    expect(reduction.park).toBeUndefined();
  });
}

function emptyGateFixDeferralPart6(
  scope: ReturnType<typeof emptyGateFixDeferralPart2>,
) {
  const { passedChecks, mergeGatesRed, failedChecks } = scope;
  it("an empty fix after merge-gates red defers: green task checks merge", () => {
    const t = task("a", { flow: "just-implement" });
    const flow = DEFAULT_FLOWS["just-implement"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(2, ["unit"]),
        mergeGatesRed(3),
        implement(4, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(5, ["unit"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("merge");
    expect(reduction.park).toBeUndefined();
  });

  it("an identical red after an empty merge-gates fix raises the empty-diff signal", () => {
    const t = task("a", { flow: "just-implement" });
    const flow = DEFAULT_FLOWS["just-implement"]!;
    const reduction = reduceTask(
      t,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        passedChecks(2, ["unit"]),
        mergeGatesRed(3),
        implement(4, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        failedChecks(5, ["unit"]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("decide");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r1 committed no changes after red checks: unit (exit 1)",
    });
  });
}

function emptyGateFixDeferralPart7(
  scope: ReturnType<typeof emptyGateFixDeferralPart2>,
) {
  const { failedChecks, passedChecks } = scope;
  it("replays m5-kept-land 01140-01146 to QA", () => {
    // i30: implement r1 left tree 31d8285c, checks 01140 went red on tests, the
    // fix turn verified the work and committed nothing, checks 01146 came back
    // green on the same tree — and derive parked empty-diff without reading
    // them. The replay reaches QA with the red and the fix on record.
    const t = task("m5-kept-land");
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const tree = "31d8285c153e37894c67f932b0a26681dde05da9";
    const commit = "27afdbf43da644f5a5da55481a6a726ff213c756";
    const base = "4c1b8cce8f06aa2fa316e971d47b448b81e6c754";
    const reduction = reduceTask(
      t,
      [
        implement(1136, 1, { tree, commit, base }),
        script(1139, { step: "commit", ok: true, commit, tree }),
        failedChecks(
          1140,
          ["tests"],
          ["typecheck", "format", "lint", "schema-validation"],
        ),
        implement(1141, 1, { tree, commit, base }),
        script(1145, { step: "commit", ok: true, commit, tree }),
        passedChecks(1146, [
          "typecheck",
          "tests",
          "format",
          "lint",
          "schema-validation",
        ]),
      ],
      flow,
    );
    expect(reduction.phase).toBe("qa");
    expect(reduction.round).toBe(1);
    expect(reduction.park).toBeUndefined();
  });
}

describe("empty gate fix deferral", () => {
  const scope1 = emptyGateFixDeferralPart1();
  const scope2 = emptyGateFixDeferralPart2(scope1);
  emptyGateFixDeferralPart3(scope2);
  emptyGateFixDeferralPart4(scope2);
  emptyGateFixDeferralPart5(scope2);
  emptyGateFixDeferralPart6(scope2);
  emptyGateFixDeferralPart7(scope2);
});
