import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { next } from "../../src/kernel/next.js";
import type { Limits, StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const limits: Limits = {
  itemTurns: 4,
  flows: {
    "implement-review": {
      reviewRounds: 2,
      steps: [
        { id: "implement", role: "implementer" },
        { id: "review", role: "reviewer", review: true },
      ],
    },
    spike: {
      reviewRounds: 1,
      steps: [
        { id: "implement", role: "implementer" },
        { id: "review", role: "reviewer", review: true },
      ],
    },
  },
  iterations: 1,
  concurrency: 1,
  perHarness: {},
};

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
  it("asks for the boundary when there is nothing to do", () => {
    const actions = next(derive([task("a")], []), limits, new Set());
    expect(actions.map((a) => a.kind)).toEqual(["step"]);
    expect(next(derive([], []), limits, new Set())).toEqual([
      { kind: "boundary" },
    ]);
  });

  it("exits only on a terminal goal", () => {
    const done = derive(
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

  it("dispatches implement, then review, then merge for an approving flow", () => {
    expect(next(derive([task("a")], []), limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "implement", round: 1 },
    ]);
    const reviewing = derive([task("a")], [implement(1), check(2)]);
    expect(next(reviewing, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "review", round: 1 },
    ]);
    const merging = derive(
      [task("a")],
      [implement(1), check(2), review(3, "approve")],
    );
    expect(next(merging, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });

  it("finishes a spike instead of merging it", () => {
    const spike = task("s", { kind: "spike", flow: "spike" });
    const state = derive(
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

  it("merges last-round changes instead of parking, and parks on an exhausted item budget", () => {
    const lastRound = derive(
      [task("a")],
      [
        implement(1),
        check(2),
        review(3, "changes", 1),
        implement(4, 2),
        check(5),
        review(6, "changes", 2),
      ],
    );
    expect(next(lastRound, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
    expect(lastRound.tasks.a!.round).toBe(2);

    const spent = derive(
      [task("a")],
      [
        implement(1),
        check(2),
        review(3, "changes", 1),
        implement(4, 2),
        check(5),
      ],
    );
    const budget = next(spent, { ...limits, itemTurns: 3 }, new Set())[0]!;
    expect(budget.kind).toBe("park");
    if (budget.kind === "park") expect(budget.cause).toContain("budget");
  });

  it("merges approved work even when the item budget is already spent", () => {
    const approved = derive(
      [task("a")],
      [implement(1), check(2), review(3, "approve")],
    );
    expect(next(approved, { ...limits, itemTurns: 2 }, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });

  it("does not redispatch a task that is already running", () => {
    const state = derive([task("a")], []);
    expect(next(state, limits, new Set(["a"]))).toEqual([]);
  });

  it("does not dispatch a task whose dependency is parked", () => {
    const state = derive(
      [task("a"), task("b", { deps: ["a"] })],
      [script(1, { step: "park", ok: true, cause: "review rejected" })],
    );
    expect(state.tasks.b!.status).toBe("pending");
    expect(next(state, limits, new Set())).toEqual([{ kind: "boundary" }]);
  });

  it("parks a task whose configured flow is missing", () => {
    const action = next(
      derive([task("a", { flow: "nope" })], []),
      limits,
      new Set(),
    )[0]!;
    expect(action.kind).toBe("park");
  });

  it("parks a continuation whose whole-item budget the base already spent", () => {
    const tasks = [task("a"), task("b", { base: "a" })];
    const state = derive(
      tasks,
      [
        implement(1),
        check(2),
        review(3, "changes", 1),
        implement(4, 2),
        implement(5, 1, { slug: "b" }),
        { ...check(6), slug: "b" },
      ],
      limits.flows,
    );
    expect(state.tasks.b!.turns).toBe(4);
    const parks = next(state, limits, new Set()).filter(
      (action) => action.kind === "park" && action.slug === "b",
    );
    expect(parks).toHaveLength(1);
    expect(parks[0]).toMatchObject({ kind: "park", slug: "b" });
  });
});
