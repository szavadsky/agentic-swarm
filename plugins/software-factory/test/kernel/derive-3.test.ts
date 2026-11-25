import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause, causeText } from "./helpers.js";

const doneCheck = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: true,
    checks: [],
    startedAt: new Date(seq).toISOString(),
  });

const redCheck = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: false,
    checks: [
      {
        name: "unit",
        ok: false,
        summary: "exit 1",
        output: "boom",
        fingerprint: "x",
      },
    ],
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

function registerDerivePart18(): void {
  it("counts merge-gate failures against the same checks bound", () => {
    const tasks = [task("a")];
    // 2 red checks, then 3rd check passes -> review approves -> merge fails with gates: unit
    const records = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
      implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
      redCheck(4),
      implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
      doneCheck(6),
      review(7, "approve"),
      script(8, { step: "merge", ok: false, cause: cause("gates: unit") }),
    ];
    // Total red gate requests = 2 checks + 1 merge = 3.
    // Since bound is 2 (limit 3), this is the 3rd fix turn -> gateLastCall = true!
    const r = derive(tasks, records);
    expect(r.tasks.a!.phase).toBe("implement");
    expect(r.tasks.a!.gateFix).toBe(true);
    expect(r.tasks.a!.gateLastCall).toBe(true);

    // If 3 red checks occurred previously, merge failure would exceed bound and park immediately!
    const records4 = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
      implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
      redCheck(4),
      implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
      redCheck(6),
      implement(7, 1, { tree: "tree-4", commit: "c4", base: "c0" }),
      doneCheck(8),
      review(9, "approve"),
      script(10, { step: "merge", ok: false, cause: cause("gates: unit") }),
    ];
    const r4 = derive(tasks, records4);
    expect(r4.tasks.a!.phase).toBe("decide");
    expect(r4.tasks.a!.park).toBeUndefined();
    expect(r4.tasks.a!.pendingSignal).toEqual({
      kind: "gates",
      evidence: "merge gates red after the gate fix: unit",
    });
  });
}

function registerDerivePart19(): void {
  it("routes a task-checks fix turn to QA on green, never skipping to merge", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        redCheck(2),
        implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
        doneCheck(4),
      ],
    );
    expect(state.tasks.a!.phase).toBe("qa");
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.park).toBeUndefined();
  });
}

function registerDerivePart20(): void {
  it("routes a task-checks reroute after a merged-result failure back to QA", () => {
    const mergeFail = (seq: number): StepRecord =>
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
            fingerprint: "x",
          },
        ],
      });
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        doneCheck(2),
        review(3, "approve", 1),
        mergeFail(4),
        implement(5, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
        redCheck(6),
        implement(7, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
        doneCheck(8),
      ],
    );
    expect(state.tasks.a!.phase).toBe("qa");
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.park).toBeUndefined();
  });
}

function registerDerivePart21(): void {
  it("parks an empty fix after an approve followed by a merge-gates failure", () => {
    const tasks = [task("a")];
    const prefix = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
      doneCheck(3),
      review(4, "changes", 1),
      implement(5, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
      script(6, { step: "commit", ok: true, commit: "c2", tree: "tree-2" }),
      doneCheck(7),
      review(8, "approve", 2),
      script(9, {
        step: "merge",
        ok: false,
        cause: cause("gates: unit"),
        checks: [
          {
            name: "unit",
            ok: false,
            summary: "exit 1",
            output: "boom",
            fingerprint: "x",
          },
        ],
      }),
      implement(10, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
    ];
    const deferred = derive(tasks, prefix);
    expect(deferred.tasks.a!.phase).toBe("checks");
    expect(deferred.tasks.a!.park).toBeUndefined();

    const state = derive(tasks, [...prefix, redCheck(11)]);
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r2 committed no changes after red checks: unit (exit 1)",
    });
  });
}

function registerDerivePart22(): void {
  it("still sets the no-progress fingerprint for a non-empty repeat", () => {
    const state = derive(
      [task("a", { flow: "just-implement" })],
      [
        implement(1, 1, { tree: "tree-A", commit: "cA", base: "c0" }),
        redCheck(2),
        implement(3, 1, { tree: "tree-B", commit: "cB", base: "c0" }),
        redCheck(4),
        implement(5, 1, { tree: "tree-A", commit: "cA2", base: "c0" }),
      ],
    );
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.loop).toMatchObject({
      step: "implement",
      round: 1,
      firstRound: 1,
    });
  });
}

function registerDerivePart23(): void {
  it("names the red merge checks when the repeated checks still fail after an empty gate fix", () => {
    const tasks = [task("a", { flow: "just-implement" })];
    const prefix = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
      doneCheck(3),
      script(4, {
        step: "merge",
        ok: false,
        cause: cause("gates: unit"),
        checks: [
          {
            name: "unit",
            ok: false,
            summary: "exit 1",
            output: "boom",
            fingerprint: "x",
          },
          // Inherited red: not in the merge cause, so not part of the fix turn.
          {
            name: "docs",
            ok: false,
            summary: "exit 2",
            output: "stale",
            fingerprint: "y",
          },
        ],
      }),
      implement(5, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    ];
    const deferred = derive(tasks, prefix);
    expect(deferred.tasks.a!.phase).toBe("checks");
    expect(deferred.tasks.a!.park).toBeUndefined();
    expect(deferred.tasks.a!.loop).toBeUndefined();

    const state = derive(tasks, [...prefix, redCheck(6)]);
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r1 committed no changes after red checks: unit (exit 1)",
    });
  });
}

function registerDerivePart24(): void {
  it("keeps the plain empty-diff signal for a first turn with no commit", () => {
    const state = derive(
      [task("a")],
      [implement(1, 1, { tree: "tree-0", commit: "c0", base: "c0" })],
    );
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence: "implement r1 committed no changes",
    });
  });

  it("does not park a productive turn that changed the tree", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        review(4, "changes", 1),
        script(5, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        implement(6, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
        doneCheck(7),
      ],
    );
    expect(state.tasks.a!.phase).toBe("qa");
    expect(state.tasks.a!.round).toBe(2);
    expect(state.tasks.a!.park).toBeUndefined();
  });
}

function registerDerivePart25(): void {
  it("does not read a commit from a turn derive ignores as the next turn's empty diff", () => {
    const ignored = [
      { kind: "infra", cause: "quota" },
      { kind: "truncated", cause: "turn-limit" },
    ] as const;
    for (const stop of ignored) {
      const state = derive(
        [task("a")],
        [
          implement(1, 1, { base: "c0", stop, outcome: undefined }),
          script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
          implement(3, 1, { base: "c0", commit: "c1", tree: "tree-1" }),
          doneCheck(4),
        ],
      );
      expect(state.tasks.a!.park).toBeUndefined();
      expect(state.tasks.a!.phase).toBe("qa");
      // Truncated turns consume budget; timeout/crash infra stops always do.
      expect(state.tasks.a!.turns).toBe(stop.kind === "infra" ? 1 : 2);
    }
  });

  it("derives a park request for a failed attempt instead of retrying it", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, {
          outcome: {
            status: "failed",
            summary: "tests red",
            concerns: [],
            forward: [],
          },
        }),
      ],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(causeText(state.tasks.a!.park)).toContain("failed");
    expect(state.tasks.a!.turns).toBe(1);
  });
}

function registerDerivePart26(): void {
  it("derives the goal decision from the last architect record", () => {
    const records = [
      rec(1, {
        slug: undefined,
        step: "architect",
        outcome: {
          status: "done",
          summary: "plan",
          concerns: [],
          forward: [],
          decision: "continue",
        },
      }),
      rec(2, {
        slug: undefined,
        step: "architect",
        iteration: 2,
        outcome: {
          status: "done",
          summary: "finished",
          concerns: [],
          forward: [],
          decision: "done",
        },
      }),
    ];
    const state = derive([task("a")], records);
    expect(state.iteration).toBe(2);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
  });
}

function registerDerivePart27(): void {
  it("derives the goal decision from the front path's stop record", () => {
    const stop = (seq: number, decision: "done" | "blocked"): StepRecord =>
      script(seq, {
        slug: undefined,
        step: "front-stop",
        outcome: {
          status: "done",
          summary: `front ${decision}`,
          concerns: [],
          forward: [],
          decision,
        },
      });

    const landed = derive([task("a")], [stop(1, "done")]);
    expect(landed.goal).toBe("done");
    expect(landed.terminal).toBe(true);

    const parked = derive([task("a")], [stop(1, "blocked")]);
    expect(parked.goal).toBe("blocked");
    expect(parked.terminal).toBe(true);
  });
}

describe("derive", () => {
  registerDerivePart18();

  registerDerivePart19();

  registerDerivePart20();

  registerDerivePart21();

  registerDerivePart22();

  registerDerivePart23();

  registerDerivePart24();

  registerDerivePart25();

  registerDerivePart26();

  registerDerivePart27();
});
