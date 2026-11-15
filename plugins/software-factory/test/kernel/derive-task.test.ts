import { describe, expect, it } from "bun:test";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

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

describe("continuation carry", () => {
  it("carries a no-change first turn past checks to review when the branch holds work beyond the head", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const first = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
      ],
      flow,
    );
    expect(first.park).toBeUndefined();
    expect(first.phase).toBe("checks");

    const afterChecks = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
        checks(3),
      ],
      flow,
    );
    expect(afterChecks.park).toBeUndefined();
    expect(afterChecks.phase).toBe("review");
  });

  it("carries a no-change first turn past checks to merge on just-implement", () => {
    const t = task("beta", {
      base: "alpha",
      flow: "just-implement",
    });
    const flow = DEFAULT_FLOWS["just-implement"]!;
    const first = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
      ],
      flow,
    );
    expect(first.park).toBeUndefined();
    expect(first.phase).toBe("checks");

    const afterChecks = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
        checks(3),
      ],
      flow,
    );
    expect(afterChecks.park).toBeUndefined();
    expect(afterChecks.phase).toBe("merge");
  });

  it("parks empty-diff when the kept work is already on the head", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-head", "tree-head"),
        implement(2, 1, { tree: "tree-head", commit: "c1", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park).toStartWith("empty-diff:");
    expect(reduction.park).toContain("already on the head");
  });

  it("parks a no-change fix turn in a later round exactly as today", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-work", commit: "c1", base: "b0" }),
        checks(3),
        review(4, "changes", 1),
        implement(5, 2, { tree: "tree-work", commit: "c2", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park).toBe(
      "empty-diff: implement r2 committed no changes",
    );
  });

  it("parks a no-change turn after a reused-worktree sync exactly as today", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-work", commit: "c1", base: "b0" }),
        checks(3),
        review(4, "changes", 1),
        advance(5, "tree-synced"),
        implement(6, 2, { tree: "tree-synced", commit: "c2", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park).toBe(
      "empty-diff: implement r2 committed no changes",
    );
  });

  it("derives old base-advance records without headTree as today", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park).toBe(
      "empty-diff: implement r1 committed no changes",
    );
  });

  it("does not let a later advance reset the first-turn carry", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-work", commit: "c1", base: "b0" }),
        checks(3),
        advance(4, "tree-recreated", "tree-head2"),
        review(5, "changes", 1),
        implement(6, 2, { tree: "tree-recreated", commit: "c2", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park).toBe(
      "empty-diff: implement r2 committed no changes",
    );
  });
});
