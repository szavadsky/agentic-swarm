import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause } from "./helpers.js";

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

function registerDerivePart9(): void {
  it("ignores unfinished records as orphans so the step is redispatched", () => {
    const state = derive(
      [task("a")],
      [
        {
          ...rec(1),
          endedAt: undefined,
          outcome: undefined,
          usage: undefined,
          stop: undefined,
        },
      ],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("implement");
    expect(state.tasks.a!.turns).toBe(0);
  });

  it("ignores unfinished script records instead of advancing or parking", () => {
    const state = derive(
      [task("a")],
      [
        implement(1),
        { ...doneCheck(2), endedAt: undefined },
        {
          ...script(3, {
            step: "park",
            ok: true,
            cause: cause("half written"),
          }),
          endedAt: undefined,
        },
      ],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
  });
}

function registerDerivePart10(): void {
  it("never counts an infra stop as a turn or a round", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, {
          stop: { kind: "infra", cause: "quota" },
          outcome: undefined,
        }),
      ],
    );
    expect(state.tasks.a!.turns).toBe(0);
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.phase).toBe("implement");
  });
}

function registerDerivePart11(): void {
  it("merges a review-less flow without a review and signals after repeated red merge gates", () => {
    const tasks = [task("a", { flow: "just-implement" })];
    const merging = derive(tasks, [implement(1), doneCheck(2)]);
    expect(merging.tasks.a!.phase).toBe("merge");
    expect(merging.tasks.a!.round).toBe(1);

    const fixed = derive(tasks, [
      implement(1),
      doneCheck(2),
      script(3, { step: "merge", ok: false, cause: cause("gates: unit") }),
    ]);
    expect(fixed.tasks.a!.phase).toBe("implement");
    expect(fixed.tasks.a!.round).toBe(1);
    expect(fixed.tasks.a!.gateFix).toBe(true);

    const signalled = derive(tasks, [
      implement(1),
      doneCheck(2),
      script(3, { step: "merge", ok: false, cause: cause("gates: unit") }),
      implement(4),
      doneCheck(5),
      script(6, { step: "merge", ok: false, cause: cause("gates: unit") }),
    ]);
    expect(signalled.tasks.a!.phase).toBe("decide");
    expect(signalled.tasks.a!.park).toBeUndefined();
    expect(signalled.tasks.a!.pendingSignal).toEqual({
      kind: "gates",
      evidence: "merge gates red after the gate fix: unit",
    });
    expect(signalled.tasks.a!.round).toBe(1);
  });
}

function registerDerivePart12(): void {
  it("sends a reply-only fix round after changes back to QA instead of parking", () => {
    const answered = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
      doneCheck(3),
      review(4, "changes", 1),
      script(5, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
      implement(6, 2, {
        tree: "tree-1",
        commit: "c1",
        base: "c0",
        outcome: {
          status: "done",
          summary: "declined F1: out of scope per done-when; F2 already fixed",
          concerns: [],
          forward: [],
          replies: [
            { finding: 1, reply: "out of scope per the done-when" },
            { finding: 2, reply: "already fixed in the previous round" },
          ],
        },
      }),
    ];
    const state = derive([task("a")], answered);
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.verdict).toBe("changes");
    expect(state.tasks.a!.gateFix).toBeUndefined();

    const reviewed = derive([task("a")], [...answered, doneCheck(7)]);
    expect(reviewed.tasks.a!.phase).toBe("qa");
    expect(reviewed.tasks.a!.round).toBe(2);
    expect(reviewed.tasks.a!.park).toBeUndefined();
  });
}

function registerDerivePart13(): void {
  it("raises the empty-diff signal for an empty fix after changes with no replies", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        review(4, "changes", 1),
        implement(5, 2, { tree: "tree-1", commit: "c1", base: "c0" }),
      ],
    );
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.pendingSignal?.evidence).toStartWith(
      "implement r2 committed no changes",
    );
  });
}

function registerDerivePart14(): void {
  it("raises the last-call changes signal after a reply-only fix", () => {
    const flows = {
      "implement-review": {
        steps: [
          { id: "implement", prompt: "implementer", alias: "implementer" },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 1,
          },
        ],
      },
    };
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        review(4, "changes", 1),
        implement(5, 2, {
          tree: "tree-1",
          commit: "c1",
          base: "c0",
          outcome: {
            status: "done",
            summary: "replied without a change",
            concerns: [],
            forward: [],
            replies: [{ finding: 1, reply: "already answered" }],
          },
        }),
        doneCheck(6),
        review(7, "changes", 2),
      ],
      flows,
    );
    // The reply-only fix returns to review and consumes the single change
    // request, so the next changes is a last-call breach the decider answers.
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "invalid-outcome",
      evidence: "changes on the last review call: review r2",
    });
    expect(state.tasks.a!.round).toBe(2);
  });
}

function registerDerivePart15(): void {
  it("sets gateFix on red task checks and names them when the repeated checks still fail", () => {
    const tasks = [task("a")];
    const prefix = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
    ];
    const looped = derive(tasks, prefix);
    expect(looped.tasks.a!.phase).toBe("implement");
    expect(looped.tasks.a!.round).toBe(1);
    expect(looped.tasks.a!.gateFix).toBe(true);

    // The empty fix waits for the checks that run next instead of parking.
    const deferred = derive(tasks, [
      ...prefix,
      implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    ]);
    expect(deferred.tasks.a!.phase).toBe("checks");
    expect(deferred.tasks.a!.park).toBeUndefined();

    const state = derive(tasks, [
      ...prefix,
      implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(4),
    ]);
    expect(state.tasks.a!.phase).toBe("decide");
    expect(state.tasks.a!.park).toBeUndefined();
    expect(state.tasks.a!.pendingSignal).toEqual({
      kind: "empty-diff",
      evidence:
        "implement r1 committed no changes after red checks: unit (exit 1)",
    });
  });
}

/** `failures` alternating implement/red-check turns on a fresh tree each fix. */
function redFixCycles(failures: number): StepRecord[] {
  const records: StepRecord[] = [];
  for (let turn = 1; turn <= failures; turn += 1) {
    records.push(
      implement(2 * turn - 1, 1, {
        tree: `tree-${turn}`,
        commit: `c${turn}`,
        base: "c0",
      }),
    );
    records.push(redCheck(2 * turn));
  }
  return records;
}

function registerDerivePart16(): void {
  it("bounds task red-gate fixes and marks gateLastCall on the third fix turn before signalling on the fourth failure", () => {
    const tasks = [task("a")];
    const r3 = derive(tasks, redFixCycles(3));
    expect(r3.tasks.a!.phase).toBe("implement");
    expect(r3.tasks.a!.gateFix).toBe(true);
    expect(r3.tasks.a!.gateLastCall).toBe(true);

    // Failure 4 -> the red base signal
    const r4 = derive(tasks, redFixCycles(4));
    expect(r4.tasks.a!.phase).toBe("decide");
    expect(r4.tasks.a!.park).toBeUndefined();
    expect(r4.tasks.a!.pendingSignal).toEqual({
      kind: "gates",
      evidence: "task checks red after 3 fix turns: unit",
    });
    expect(r4.tasks.a!.gateFix).toBeUndefined();
    expect(r4.tasks.a!.gateLastCall).toBeUndefined();
  });
}

function registerDerivePart17(): void {
  it("bounds task red-gate fixes by checks step changeRequests in flow", () => {
    const tasks = [task("a")];
    const flows = {
      "implement-review": {
        steps: [
          { id: "implement", prompt: "implementer", alias: "implementer" },
          { id: "checks", changeRequests: 1 },
          { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
        ],
      },
    };
    const r2 = derive(tasks, redFixCycles(2), flows);
    expect(r2.tasks.a!.phase).toBe("implement");
    expect(r2.tasks.a!.gateFix).toBe(true);
    expect(r2.tasks.a!.gateLastCall).toBe(true);

    // Failure 3 -> the red base signal
    const r3 = derive(tasks, redFixCycles(3), flows);
    expect(r3.tasks.a!.phase).toBe("decide");
    expect(r3.tasks.a!.park).toBeUndefined();
    expect(r3.tasks.a!.pendingSignal).toEqual({
      kind: "gates",
      evidence: "task checks red after 2 fix turns: unit",
    });
  });
}

describe("derive", () => {
  registerDerivePart9();

  registerDerivePart10();

  registerDerivePart11();

  registerDerivePart12();

  registerDerivePart13();

  registerDerivePart14();

  registerDerivePart15();

  registerDerivePart16();

  registerDerivePart17();
});
