import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { next } from "../../src/kernel/next.js";
import type { Limits, StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause, causeText } from "./helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

const limits: Limits = {
  flows: {
    "implement-review": {
      steps: [
        { id: "implement", prompt: "implementer", alias: "implementer" },
        {
          id: "review",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests: 2,
        },
      ],
    },
    spike: {
      steps: [
        { id: "implement", prompt: "implementer", alias: "implementer" },
        {
          id: "review",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests: 0,
        },
      ],
    },
  },
  iterations: 1,
  concurrency: { overall: 1, perSubscription: {}, perModel: {} },
  planCheckRounds: 2,
};

/** This file tests `next` against its own flow; derive with the same flow. */
function deriveFlow(
  tasks: Parameters<typeof derive>[0],
  records: StepRecord[],
) {
  return derive(tasks, records, limits.flows);
}

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
      summary: "review",
      concerns: [],
      forward: [],
      verdict,
    },
  });
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
const check = (seq: number): StepRecord =>
  script(seq, { step: "checks", ok: true, checks: [] });

describe("next", () => {
  registerNextPart1();
  registerNextPart2();
  registerNextPart3();
  registerNextPart4();
});

function registerNextPart1(): void {
  it("asks for the boundary when there is nothing to do", () => {
    const actions = next(deriveFlow([task("a")], []), limits, new Set());
    expect(actions.map((a) => a.kind)).toEqual(["step"]);
    expect(next(deriveFlow([], []), limits, new Set())).toEqual([
      { kind: "boundary" },
    ]);
  });

  it("exits only on a terminal goal", () => {
    const done = deriveFlow(
      [],
      [
        rec(1, {
          slug: undefined,
          step: "architect",
          outcome: {
            status: "done",
            summary: "done",
            concerns: [],
            forward: [],
            decision: "done",
          },
        }),
      ],
    );
    expect(next(done, limits, new Set())).toEqual([
      { kind: "exit", reason: "goal done" },
    ]);
  });
}

function registerNextPart2(): void {
  it("dispatches implement, then review, then merge for an approving flow", () => {
    expect(next(deriveFlow([task("a")], []), limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "implement", round: 1 },
    ]);
    const reviewing = deriveFlow([task("a")], [implement(1), check(2)]);
    expect(next(reviewing, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "review", round: 1 },
    ]);
    const merging = deriveFlow(
      [task("a")],
      [implement(1), check(2), review(3, "approve")],
    );
    expect(next(merging, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });

  it("finishes a spike instead of merging it", () => {
    const spike = task("s", { kind: "spike", flow: "spike" });
    const state = deriveFlow(
      [spike],
      [
        implement(1, 1, { slug: "s" }),
        { ...check(2), slug: "s" },
        { ...review(3, "approve"), slug: "s" },
      ],
    );
    expect(next(state, limits, new Set())).toEqual([
      { kind: "finish", slug: "s" },
    ]);
  });
}

function registerNextPart3(): void {
  it("parks changes on the last call and merges a last-call approve", () => {
    const lastCallChanges = deriveFlow(
      [task("a")],
      [
        implement(1),
        check(2),
        review(3, "changes", 1),
        implement(4, 2),
        check(5),
        review(6, "changes", 2),
        implement(7, 3),
        check(8),
        review(9, "changes", 3),
      ],
    );
    expect(causeText(lastCallChanges.tasks.a!.park)).toContain(
      "invalid-outcome: changes on the last review call",
    );
    expect(next(lastCallChanges, limits, new Set())).toEqual([
      {
        kind: "park",
        slug: "a",
        cause: {
          kind: "invalid-outcome",
          detail: expect.stringContaining("changes on the last review call"),
        },
      },
    ]);

    const lastCallApprove = deriveFlow(
      [task("a")],
      [
        implement(1),
        check(2),
        review(3, "changes", 1),
        implement(4, 2),
        check(5),
        review(6, "changes", 2),
        implement(7, 3),
        check(8),
        review(9, "approve", 3),
      ],
    );
    expect(lastCallApprove.tasks.a!.round).toBe(3);
    expect(next(lastCallApprove, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
}

function registerNextPart4(): void {
  it("does not redispatch a task that is already running", () => {
    const state = deriveFlow([task("a")], []);
    expect(next(state, limits, new Set(["a"]))).toEqual([]);
  });

  it("does not dispatch a task whose dependency is parked", () => {
    const state = deriveFlow(
      [task("a"), task("b", { deps: ["a"] })],
      [script(1, { step: "park", ok: true, cause: cause("review rejected") })],
    );
    expect(state.tasks.b!.status).toBe("pending");
    expect(next(state, limits, new Set())).toEqual([{ kind: "boundary" }]);
  });

  it("parks a task whose configured flow is missing", () => {
    const action = next(
      deriveFlow([task("a", { flow: "nope" })], []),
      limits,
      new Set(),
    )[0]!;
    expect(action.kind).toBe("park");
  });

  it("starts a `base:` continuation's first turn whatever its chain spent", () => {
    const tasks = [task("a"), task("b", { base: "a" })];
    const state = deriveFlow(tasks, [
      implement(1),
      check(2),
      review(3, "changes", 1),
      implement(4, 2),
    ]);
    expect(state.tasks.a!.turns).toBeGreaterThan(0);
    expect(state.tasks.b!.turns).toBe(0);
    expect(
      next(state, limits, new Set()).filter(
        (action) => action.kind === "step" && action.slug === "b",
      ),
    ).toEqual([{ kind: "step", slug: "b", step: "implement", round: 1 }]);
  });
}
