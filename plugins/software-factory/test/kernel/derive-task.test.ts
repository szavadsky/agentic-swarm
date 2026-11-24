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

function continuationCarryPart1() {
  it("carries a no-change first turn past checks to QA when the branch holds work beyond the head", () => {
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
    expect(afterChecks.phase).toBe("qa");
  });
}

function continuationCarryPart2() {
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
}

function continuationCarryPart3() {
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
    expect(causeText(reduction.park)).toStartWith("empty-diff:");
    expect(causeText(reduction.park)).toContain("already on the head");
  });
}

function continuationCarryPart4() {
  it("defers a reply-only fix turn in a later round to review instead of parking", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-work", commit: "c1", base: "b0" }),
        checks(3),
        review(4, "changes", 1),
        implement(5, 2, {
          tree: "tree-work",
          commit: "c2",
          base: "b0",
          outcome: {
            status: "done",
            summary: "replied without a change",
            concerns: [],
            forward: [],
            replies: [{ finding: 1, reply: "already answered in r1" }],
          },
        }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.park).toBeUndefined();
    expect(reduction.verdict).toBe("changes");
  });
}

function continuationCarryPart5() {
  it("defers a reply-only turn after a reused-worktree sync to review instead of parking", () => {
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
        implement(6, 2, {
          tree: "tree-synced",
          commit: "c2",
          base: "b0",
          outcome: {
            status: "done",
            summary: "replied without a change",
            concerns: [],
            forward: [],
            replies: [{ finding: 1, reply: "already answered in r1" }],
          },
        }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.park).toBeUndefined();
    expect(reduction.verdict).toBe("changes");
  });
}

function continuationCarryPart6() {
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
    expect(reduction.park).toEqual(
      cause("empty-diff: implement r1 committed no changes"),
    );
  });
}

function continuationCarryPart7() {
  it("defers a reply-only fix after a later advance without resetting the first-turn carry", () => {
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
        implement(6, 2, {
          tree: "tree-recreated",
          commit: "c2",
          base: "b0",
          outcome: {
            status: "done",
            summary: "replied without a change",
            concerns: [],
            forward: [],
            replies: [{ finding: 1, reply: "already answered in r1" }],
          },
        }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.park).toBeUndefined();
    expect(reduction.verdict).toBe("changes");
  });
}

function revisionAdvanceCarryPart1() {
  it("takes the latest first-turn advance when an infra stop repeats the turn", () => {
    const t = task("beta", { revision: 1 });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        script(1, {
          step: "park",
          revision: 0,
          cause: cause("failed: the earlier revision stopped short"),
          startedAt: new Date(1).toISOString(),
        }),
        // The first attempt advanced and stopped on infra; the head then moved.
        advance(2, "tree-kept", "tree-head-1"),
        advance(3, "tree-head-2", "tree-head-2"),
        implement(4, 1, {
          tree: "tree-head-2",
          commit: "c1",
          base: "b0",
          revision: 1,
        }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(causeText(reduction.park)).toContain("already on the head");
  });
}

function revisionAdvanceCarryPart2() {
  it("still parks a later empty turn after the first turn carried kept work", () => {
    const t = task("beta", { base: "alpha" });
    const flow = DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(
      t,
      [
        advance(1, "tree-kept", "tree-head"),
        implement(2, 1, { tree: "tree-kept", commit: "c1", base: "b0" }),
        checks(3),
        review(4, "changes", 1),
        implement(5, 2, { tree: "tree-kept", commit: "c2", base: "b0" }),
      ],
      flow,
    );
    expect(reduction.phase).toBe("parked");
    expect(causeText(reduction.park)).toContain("committed no changes");
  });
}

describe("continuation carry", () => {
  continuationCarryPart1();

  continuationCarryPart2();

  continuationCarryPart3();

  continuationCarryPart4();

  continuationCarryPart5();

  continuationCarryPart6();

  continuationCarryPart7();

  revisionAdvanceCarryPart1();

  revisionAdvanceCarryPart2();
});
