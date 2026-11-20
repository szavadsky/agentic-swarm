import { describe, expect, it } from "bun:test";
import { derive, hasOpenDebt, openDebts } from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause, causeText } from "./helpers.js";
import type { Cause } from "../../src/kernel/types.js";
import { formatCause } from "../../src/kernel/cause.js";

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

const infraRedCheck = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: false,
    checks: [
      {
        name: "typecheck",
        ok: false,
        summary: "exit 127",
        output: "bash: factory-missing-command-xyz: command not found",
        fingerprint: "infra1",
        details: { kind: "infra", cause: "exit 127" },
      },
    ],
  });

describe("derive", () => {
  registerDerivePart1();
  registerDerivePart2();
  registerDerivePart3();
  registerDerivePart4();
  registerDerivePart5();
  registerDerivePart6();
  registerDerivePart7();
  registerDerivePart8();
  registerDerivePart9();
  registerDerivePart10();
  registerDerivePart11();
  registerDerivePart12();
  registerDerivePart13();
  registerDerivePart14();
  registerDerivePart15();
  registerDerivePart16();
  registerDerivePart17();
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
  registerDerivePart28();
  registerDerivePart29();
  registerDerivePart30();
  registerDerivePart31();
  registerDerivePart32();
  registerDerivePart33();
  registerDerivePart34();
  registerDerivePart35();
  registerDerivePart36();
  registerDerivePart37();
  registerDerivePart38();
  registerDerivePart39();
  registerDerivePart40();
  registerDerivePart41();
  registerDerivePart42();
});

function stillLoopsImplementerWhenRedCheckPart1() {
  const tasks = [task("a")];
  const prefix = [
    implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
    script(3, {
      step: "checks",
      ok: false,
      checks: [
        {
          name: "typecheck",
          ok: false,
          summary: "exit 127",
          output: "bash: factory-missing-command-xyz: command not found",
          fingerprint: "infra1",
          details: { kind: "infra", cause: "exit 127" },
        },
        {
          name: "unit",
          ok: false,
          summary: "exit 1",
          output: "boom",
          fingerprint: "real1",
        },
      ],
    }),
  ];
  const state = derive(tasks, prefix);
  expect(state.tasks.a!.phase).toBe("implement");
  expect(state.tasks.a!.park).toBeUndefined();
  expect(state.tasks.a!.gateFix).toBe(true);

  // An empty fix waits for the following checks; an identical red then names
  // only the actionable red: the unstartable gate is not a verdict on the task.
  const deferred = derive(tasks, [
    ...prefix,
    implement(4, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
  ]);
  expect(deferred.tasks.a!.phase).toBe("checks");
  expect(deferred.tasks.a!.park).toBeUndefined();

  return { tasks, prefix };
}

function stillLoopsImplementerWhenRedCheckPart2(
  scope: ReturnType<typeof stillLoopsImplementerWhenRedCheckPart1>,
) {
  const { tasks, prefix } = scope;
  const parked = derive(tasks, [
    ...prefix,
    implement(4, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    script(5, {
      step: "checks",
      ok: false,
      checks: [
        {
          name: "typecheck",
          ok: false,
          summary: "exit 127",
          output: "bash: factory-missing-command-xyz: command not found",
          fingerprint: "infra2",
          details: { kind: "infra", cause: "exit 127" },
        },
        {
          name: "unit",
          ok: false,
          summary: "exit 1",
          output: "boom",
          fingerprint: "real2",
        },
      ],
    }),
  ]);
  expect(parked.tasks.a!.phase).toBe("parked");
  expect(parked.tasks.a!.park).toEqual(
    cause(
      "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
    ),
  );
}

function registerDerivePart1(): void {
  it("orders readiness by dependencies, not by file position", () => {
    const tasks = [task("b", { deps: ["a"] }), task("a")];
    const state = derive(tasks, []);
    expect(state.iteration).toBe(0);
    expect(state.goal).toBe("active");
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.b!.status).toBe("pending");
    expect(state.tasks.a!.phase).toBe("implement");
    expect(state.tasks.a!.round).toBe(1);
    expect(state.epics).toEqual({});
  });

  it("groups one task in each of two epics and keeps goal work ungrouped", () => {
    const tasks = [
      task("auth.login", { epic: "auth" }),
      task("billing.invoice", { epic: "billing" }),
      task("goal-close"),
    ];
    const state = derive(tasks, []);
    expect(state.tasks["auth.login"]).toMatchObject({
      status: "ready",
      epic: "auth",
    });
    expect(state.tasks["billing.invoice"]).toMatchObject({
      status: "ready",
      epic: "billing",
    });
    expect(state.tasks["goal-close"]!.epic).toBeUndefined();
    expect(state.epics).toEqual({
      auth: { tasks: ["auth.login"], done: false },
      billing: { tasks: ["billing.invoice"], done: false },
    });
  });
}

function registerDerivePart2(): void {
  it("closes an epic only when its subarchitect decides done and its tasks land", () => {
    const tasks = [task("auth.login", { epic: "auth" })];
    const cancel = script(1, {
      slug: "auth.login",
      step: "cancel",
      ok: true,
      cause: cause("cancelled"),
    });
    const subarchitect = (
      seq: number,
      decision: "continue" | "done" | "blocked",
    ): StepRecord =>
      rec(seq, {
        slug: undefined,
        step: "subarchitect",
        architect: "auth",
        outcome: {
          status: "done",
          summary: `epic ${decision}`,
          concerns: [],
          forward: [],
          decision,
        },
      });
    const topDone = (seq: number): StepRecord =>
      rec(seq, {
        slug: undefined,
        step: "architect",
        outcome: {
          status: "done",
          summary: "goal met",
          concerns: [],
          forward: [],
          decision: "done",
        },
      });

    // A ready task keeps the epic open even after the subarchitect says done.
    expect(derive(tasks, [subarchitect(1, "done")]).epics.auth).toEqual({
      tasks: ["auth.login"],
      decision: "done",
      done: false,
    });
    const landed = derive(tasks, [cancel, subarchitect(2, "done")]);
    expect(landed.epics.auth?.done).toBe(true);
    // The subarchitect's done is the epic's, never the goal's.
    expect(landed.goal).toBe("active");
    expect(
      derive(tasks, [cancel, subarchitect(2, "done"), topDone(3)]).goal,
    ).toBe("done");
  });
}

function registerDerivePart3(): void {
  it("refuses the top architect's done while an epic is open", () => {
    const tasks = [task("auth.login", { epic: "auth" })];
    const subarchitect = (
      seq: number,
      decision: "continue" | "done",
    ): StepRecord =>
      rec(seq, {
        slug: undefined,
        step: "subarchitect",
        architect: "auth",
        outcome: {
          status: "done",
          summary: `epic ${decision}`,
          concerns: [],
          forward: [],
          decision,
        },
      });
    const topDone = rec(2, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });

    // Task still ready: the epic is open and the goal stays active.
    expect(derive(tasks, [subarchitect(1, "done"), topDone]).goal).toBe(
      "active",
    );
    // All tasks landed but the subarchitect still wants the epic: same refusal.
    const cancel = script(1, {
      slug: "auth.login",
      step: "cancel",
      ok: true,
      cause: cause("cancelled"),
    });
    expect(
      derive(tasks, [cancel, subarchitect(2, "continue"), topDone]).goal,
    ).toBe("active");
    // An epic the top architect owns has no subarchitect turn; its landed
    // tasks close it, so the top's done lands.
    const owned = [task("billing.invoice", { epic: "billing" })];
    const billingCancel = script(1, {
      slug: "billing.invoice",
      step: "cancel",
      ok: true,
      cause: cause("cancelled"),
    });
    expect(derive(owned, [billingCancel, topDone]).goal).toBe("done");
  });
}

function registerDerivePart4(): void {
  it("makes a dependent ready only after its dependency merged", () => {
    const tasks = [task("a"), task("b", { deps: ["a"] })];
    const records = [
      implement(1),
      doneCheck(2),
      review(3, "approve"),
      script(4, { step: "merge", ok: true, commit: "deadbeef" }),
    ];
    const state = derive(tasks, records);
    expect(state.tasks.a!.status).toBe("merged");
    expect(state.tasks.a!.commit).toBe("deadbeef");
    expect(state.tasks.b!.status).toBe("ready");
  });

  it("treats a finished spike as satisfying a dependency", () => {
    const tasks = [
      task("probe", { kind: "spike", flow: "spike" }),
      task("work", { deps: ["probe"] }),
    ];
    const state = derive(
      tasks,
      [
        implement(1, 1, { slug: "probe" }),
        { ...doneCheck(2), slug: "probe" },
        review(3, "approve"),
        script(4, { slug: "probe", step: "finish", ok: true }),
      ].map((r, i) => (i === 2 ? { ...r, slug: "probe" } : r)),
    );
    expect(state.tasks.probe!.status).toBe("finished");
    expect(state.tasks.work!.status).toBe("ready");
  });

  it("sends a green implement turn to QA and a red one back to implementation", () => {
    const green = derive([task("a")], [implement(1), doneCheck(2)]);
    expect(green.tasks.a!.phase).toBe("qa");
    expect(green.tasks.a!.round).toBe(1);

    const red = derive([task("a")], [implement(1), redCheck(2)]);
    expect(red.tasks.a!.phase).toBe("implement");
    expect(red.tasks.a!.round).toBe(1);
  });
}

function registerDerivePart5(): void {
  it("advances the round after changes and parks changes on the last call", () => {
    const tasks = [task("a")];
    const afterFirst = derive(tasks, [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
    ]);
    expect(afterFirst.tasks.a!.phase).toBe("implement");
    expect(afterFirst.tasks.a!.round).toBe(2);
    expect(afterFirst.tasks.a!.verdict).toBe("changes");

    const afterSecond = derive(tasks, [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
      implement(4, 2),
      doneCheck(5),
      review(6, "changes", 2),
    ]);
    expect(afterSecond.tasks.a!.round).toBe(3);
    expect(afterSecond.tasks.a!.phase).toBe("implement");
    expect(afterSecond.tasks.a!.turns).toBe(4);

    const afterThird = derive(tasks, [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
      implement(4, 2),
      doneCheck(5),
      review(6, "changes", 2),
      implement(7, 3),
      doneCheck(8),
      review(9, "changes", 3),
    ]);
    expect(afterThird.tasks.a!.round).toBe(3);
    expect(afterThird.tasks.a!.phase).toBe("parked");
    expect(afterThird.tasks.a!.park).toEqual(
      cause("invalid outcome: changes on the last review call: review r3"),
    );
    expect(afterThird.tasks.a!.turns).toBe(6);
  });
}

function registerDerivePart6(): void {
  it("derives a park request on a reject and keeps the cause", () => {
    const state = derive(
      [task("a")],
      [implement(1), doneCheck(2), review(3, "reject")],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(causeText(state.tasks.a!.park)).toContain("review-rejected");
    expect(state.tasks.a!.phase).toBe("parked");
  });
}

function registerDerivePart7(): void {
  it("restarts an amended task after the park its earlier revision ended", () => {
    const parkRecord = (seq: number, revision: number, cause: Cause) =>
      script(seq, {
        step: "park",
        ok: true,
        cause,
        revision,
        startedAt: new Date(seq).toISOString(),
      });
    const firstRevision = [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
      implement(4, 2),
      doneCheck(5),
      review(6, "reject", 2),
      parkRecord(7, 0, cause("review rejected: not salvageable")),
    ];
    const parked = derive([task("a")], firstRevision);
    expect(parked.tasks.a!.status).toBe("parked");
    expect(parked.tasks.a!.turns).toBe(4);

    // The amendment resets phase, counts and the terminal fact; the records
    // stay for the prompts' review history.
    const amended = derive(
      [task("a", { revision: 1, body: "Retry.\nDone when: it works." })],
      firstRevision,
    );
    expect(amended.tasks.a!.status).toBe("ready");
    expect(amended.tasks.a!.phase).toBe("implement");
    expect(amended.tasks.a!.round).toBe(1);
    expect(amended.tasks.a!.turns).toBe(0);
    expect(amended.tasks.a!.park).toBeUndefined();
    expect(amended.tasks.a!.verdict).toBeUndefined();

    // A park of the current revision still ends it.
    const reparked = derive(
      [task("a", { revision: 1 })],
      [
        ...firstRevision,
        implement(8, 1, { base: undefined }),
        parkRecord(9, 1, cause("blocked: still stuck")),
      ],
    );
    expect(reparked.tasks.a!.status).toBe("parked");
    expect(reparked.tasks.a!.cause).toEqual(cause("blocked: still stuck"));
    expect(reparked.tasks.a!.turns).toBe(1);
  });
}

function registerDerivePart8(): void {
  it("derives park requests on blocked, failed and upscope outcomes, and parks on a park record", () => {
    const blocked = derive(
      [task("a")],
      [
        implement(1, 1, {
          outcome: {
            status: "blocked",
            summary: "missing API",
            concerns: [],
            forward: [],
          },
        }),
      ],
    );
    expect(blocked.tasks.a!.status).toBe("ready");
    expect(causeText(blocked.tasks.a!.park)).toContain("missing API");

    const failed = derive(
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
    expect(failed.tasks.a!.status).toBe("ready");
    expect(causeText(failed.tasks.a!.park)).toContain("tests red");

    const upscope = derive(
      [task("a")],
      [
        implement(1, 1, {
          outcome: {
            status: "upscope",
            summary: "needs a second seam",
            concerns: [],
            forward: [],
          },
        }),
      ],
    );
    expect(causeText(upscope.tasks.a!.park)).toContain("upscope");

    const parked = derive(
      [task("a")],
      [script(1, { step: "park", ok: true, cause: cause("setup failed") })],
    );
    expect(parked.tasks.a!.status).toBe("parked");
    expect(parked.tasks.a!.cause).toEqual(cause("setup failed"));
  });
}

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
  it("merges a review-less flow without a review and parks after repeated red merge gates", () => {
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

    const parked = derive(tasks, [
      implement(1),
      doneCheck(2),
      script(3, { step: "merge", ok: false, cause: cause("gates: unit") }),
      implement(4),
      doneCheck(5),
      script(6, { step: "merge", ok: false, cause: cause("gates: unit") }),
    ]);
    expect(parked.tasks.a!.phase).toBe("parked");
    expect(causeText(parked.tasks.a!.park)).toContain("gates: unit");
    expect(parked.tasks.a!.round).toBe(1);
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
    expect(state.tasks.a!.loop).toBeUndefined();
    expect(state.tasks.a!.verdict).toBe("changes");
    expect(state.tasks.a!.gateFix).toBeUndefined();

    const reviewed = derive([task("a")], [...answered, doneCheck(7)]);
    expect(reviewed.tasks.a!.phase).toBe("qa");
    expect(reviewed.tasks.a!.round).toBe(2);
    expect(reviewed.tasks.a!.park).toBeUndefined();
    expect(reviewed.tasks.a!.loop).toBeUndefined();
  });
}

function registerDerivePart13(): void {
  it("parks an empty fix after changes when it carries no replies", () => {
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
    expect(state.tasks.a!.phase).toBe("parked");
    expect(causeText(state.tasks.a!.park)).toStartWith(
      "empty-diff: implement r2",
    );
  });
}

function registerDerivePart14(): void {
  it("parks last-call changes after a reply-only fix", () => {
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
    // request, so the next changes is refused instead of looping.
    expect(state.tasks.a!.phase).toBe("parked");
    expect(causeText(state.tasks.a!.park)).toContain(
      "invalid-outcome: changes on the last review call",
    );
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
    expect(deferred.tasks.a!.loop).toBeUndefined();

    const state = derive(tasks, [
      ...prefix,
      implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(4),
    ]);
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toEqual(
      cause(
        "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
      ),
    );
  });
}

function registerDerivePart16(): void {
  it("bounds task red-gate fixes and marks gateLastCall on the third fix turn before parking on the fourth failure", () => {
    const tasks = [task("a")];
    // Failure 1 -> Fix 1
    const r1 = derive(tasks, [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
    ]);
    expect(r1.tasks.a!.phase).toBe("implement");
    expect(r1.tasks.a!.gateFix).toBe(true);
    expect(r1.tasks.a!.gateLastCall).toBeUndefined();

    // Failure 2 -> Fix 2
    const r2 = derive(tasks, [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
      implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
      redCheck(4),
    ]);
    expect(r2.tasks.a!.phase).toBe("implement");
    expect(r2.tasks.a!.gateFix).toBe(true);
    expect(r2.tasks.a!.gateLastCall).toBeUndefined();

    // Failure 3 -> Fix 3 (last call!)
    const r3 = derive(tasks, [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
      implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
      redCheck(4),
      implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
      redCheck(6),
    ]);
    expect(r3.tasks.a!.phase).toBe("implement");
    expect(r3.tasks.a!.gateFix).toBe(true);
    expect(r3.tasks.a!.gateLastCall).toBe(true);

    // Failure 4 -> parks!
    const r4 = derive(tasks, [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
      implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
      redCheck(4),
      implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
      redCheck(6),
      implement(7, 1, { tree: "tree-4", commit: "c4", base: "c0" }),
      redCheck(8),
    ]);
    expect(r4.tasks.a!.phase).toBe("parked");
    expect(r4.tasks.a!.park).toEqual(cause("gates: unit"));
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
    // Failure 1 -> Fix 1
    const r1 = derive(
      tasks,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        redCheck(2),
      ],
      flows,
    );
    expect(r1.tasks.a!.phase).toBe("implement");
    expect(r1.tasks.a!.gateFix).toBe(true);
    expect(r1.tasks.a!.gateLastCall).toBeUndefined();

    // Failure 2 -> Fix 2 (last call because bound is 1, so fix 2 is last call!)
    const r2 = derive(
      tasks,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        redCheck(2),
        implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
        redCheck(4),
      ],
      flows,
    );
    expect(r2.tasks.a!.phase).toBe("implement");
    expect(r2.tasks.a!.gateFix).toBe(true);
    expect(r2.tasks.a!.gateLastCall).toBe(true);

    // Failure 3 -> parks!
    const r3 = derive(
      tasks,
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        redCheck(2),
        implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
        redCheck(4),
        implement(5, 1, { tree: "tree-3", commit: "c3", base: "c0" }),
        redCheck(6),
      ],
      flows,
    );
    expect(r3.tasks.a!.phase).toBe("parked");
    expect(r3.tasks.a!.park).toEqual(cause("gates: unit"));
  });
}

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
    expect(r4.tasks.a!.phase).toBe("parked");
    expect(r4.tasks.a!.park).toEqual(cause("gates: unit"));
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
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toEqual(
      cause(
        "empty-diff: implement r2 committed no changes after red checks: unit (exit 1)",
      ),
    );
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
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toEqual(
      cause(
        "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
      ),
    );
  });
}

function registerDerivePart24(): void {
  it("keeps the plain empty-diff cause for a first turn with no commit", () => {
    const state = derive(
      [task("a")],
      [implement(1, 1, { tree: "tree-0", commit: "c0", base: "c0" })],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toEqual(
      cause("empty-diff: implement r1 committed no changes"),
    );
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

function registerDerivePart28(): void {
  it("lets a later architect decision override the front path's stop", () => {
    // The ordering a steered relaunch produces: the front path's blocked stop,
    // then the architect turn that a pending steer made the next launch run.
    const frontBlocked = script(1, {
      slug: undefined,
      step: "front-stop",
      outcome: {
        status: "done",
        summary: "front blocked",
        concerns: [],
        forward: [],
        decision: "blocked" as const,
      },
    });
    const architect = (
      seq: number,
      decision: "continue" | "done" | "blocked",
    ): StepRecord =>
      rec(seq, {
        slug: undefined,
        step: "architect",
        iteration: 2,
        outcome: {
          status: "done",
          summary: `architect ${decision}`,
          concerns: [],
          forward: [],
          decision,
        },
      });

    expect(
      derive([task("a")], [frontBlocked, architect(2, "continue")]).goal,
    ).toBe("active");
    expect(derive([task("a")], [frontBlocked, architect(2, "done")]).goal).toBe(
      "done",
    );
    expect(
      derive([task("a")], [frontBlocked, architect(2, "blocked")]).goal,
    ).toBe("blocked");
  });
}

function registerDerivePart29(): void {
  it("ignores a front-stop record without an end, like any orphan", () => {
    const state = derive(
      [task("a")],
      [
        {
          ...script(1, {
            slug: undefined,
            step: "front-stop",
            outcome: {
              status: "done",
              summary: "front done",
              concerns: [],
              forward: [],
              decision: "done",
            },
          }),
          endedAt: undefined,
        },
      ],
    );
    expect(state.goal).toBe("active");
  });
}

function registerDerivePart30(): void {
  it("parks a task as infra when every red check on it could not start, instead of looping into an empty-diff park", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        infraRedCheck(3),
      ],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(causeText(state.tasks.a!.park)).toContain(
      "infra: gate could not start: typecheck",
    );
  });

  it("classifies a missing gate runner without details as infra in the derive path", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        script(3, {
          step: "checks",
          ok: false,
          checks: [
            {
              name: "typecheck",
              ok: false,
              summary: "exit 127",
              output: "bash: line 1: gates.sh: No such file or directory",
              fingerprint: "infra1",
            },
          ],
        }),
      ],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(causeText(state.tasks.a!.park)).toContain(
      "infra: gate could not start: typecheck",
    );
  });
}

function registerDerivePart31(): void {
  it("still loops the implementer when a red check is not infra, even beside an unstartable one", () => {
    const scope1 = stillLoopsImplementerWhenRedCheckPart1();
    stillLoopsImplementerWhenRedCheckPart2(scope1);
  });

  it("counts each outcome repair as a turn", () => {
    const done = { kind: "done" } as const;
    const usage = {
      in: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 0,
      reasoningOut: 0,
    };
    const attempt = { model: { id: "fake" }, stop: done, usage };
    const state = derive(
      [task("a")],
      [implement(1, 1, { attempts: [attempt, attempt, attempt] })],
    );
    expect(state.tasks.a!.turns).toBe(3);
  });
}

function registerDerivePart32(): void {
  it("leaves infra retries out of the turn count", () => {
    const usage = {
      in: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 0,
      reasoningOut: 0,
    };
    const state = derive(
      [task("a")],
      [
        implement(1, 1, {
          attempts: [
            {
              model: { id: "fake" },
              stop: { kind: "infra", cause: "quota" },
              usage,
            },
            {
              model: { id: "fake" },
              stop: { kind: "done" },
              usage,
            },
          ],
        }),
      ],
    );
    expect(state.tasks.a!.turns).toBe(1);
  });
}

function registerDerivePart33(): void {
  it("refuses done while material debt is open", () => {
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "cache invalidation needs a follow-up task",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    const state = derive([task("a")], [debt, done]);
    expect(hasOpenDebt([debt, done])).toBe(true);
    expect(state.goal).toBe("active");
    expect(state.terminal).toBe(false);
  });
}

function registerDerivePart34(): void {
  it("lands done when the open debt is closed by quoting", () => {
    const debtText = "cache invalidation needs a follow-up task";
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [`debt closed: ${debtText}`],
        decision: "done",
      },
    });
    expect(openDebts([debt, done])).toEqual([]);
    const state = derive([task("a")], [debt, done]);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
  });
}

function registerDerivePart35(): void {
  it("closes a debt by the id ingest assigned, and lands done", () => {
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "cache invalidation needs a follow-up task",
            id: "00001-i1-a-review-r1#1",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        debtClosed: [
          {
            id: "00001-i1-a-review-r1#1",
            reason: "moved the invalidation into the writer",
          },
        ],
        decision: "done",
      },
    });
    expect(openDebts([debt, done])).toEqual([]);
    const state = derive([task("a")], [debt, done]);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
  });
}

function registerDerivePart36(): void {
  it("closes every round that raised the debt from one id", () => {
    const text = "retry window drops head names";
    const first = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          { kind: "debt", calibration: "architect", text, id: "00001#1" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const again = rec(2, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          { kind: "debt", calibration: "architect", text, id: "00002#1" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const close = rec(3, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "head names reconciled" }],
        decision: "continue",
      },
    });
    expect(openDebts([first, again, close])).toEqual([]);
  });
}

function registerDerivePart37(): void {
  it("closes only the debt the id names, not a longer one that quotes it", () => {
    const short = "rename the writer helper";
    const long = "rename the writer helper and the reader helper too";
    const first = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: short,
            id: "00001#1",
          },
          { kind: "debt", calibration: "architect", text: long, id: "00001#2" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const close = rec(2, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed the short one",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "writer helper renamed" }],
        decision: "continue",
      },
    });
    expect(openDebts([first, close])).toEqual([
      {
        id: "00001#2",
        text: long,
        calibration: "architect",
        source: "a review r1",
        iteration: 1,
        seq: 1,
      },
    ]);
  });
}

function registerDerivePart38(): void {
  it("lists an open fyi debt with its id and closes it without blocking done", () => {
    const fyi = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "note",
        concerns: [
          {
            kind: "debt",
            calibration: "fyi",
            text: "nit: rename the helper",
            id: "00001#1",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    expect(hasOpenDebt([fyi])).toBe(false);
    expect(openDebts([fyi])).toEqual([
      {
        id: "00001#1",
        text: "nit: rename the helper",
        calibration: "fyi",
        source: "a review r1",
        iteration: 1,
        seq: 1,
      },
    ]);

    const closed = rec(2, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "renamed",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "helper renamed" }],
        verdict: "approve",
      },
    });
    expect(openDebts([fyi, closed])).toEqual([]);
  });
}

function registerDerivePart39(): void {
  it("ignores fyi debt and short close fragments for done", () => {
    const fyi = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "note",
        concerns: [{ kind: "debt", calibration: "fyi", text: "nit: rename" }],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [fyi, done]).goal).toBe("done");

    const material = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "cache invalidation needs a follow-up task",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const shortClose = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: ["debt closed: tests"],
        decision: "done",
      },
    });
    expect(hasOpenDebt([material, shortClose])).toBe(true);
    expect(derive([task("a")], [material, shortClose]).goal).toBe("active");
  });
}

function registerDerivePart40(): void {
  it("refuses a front-stop done while debt is open", () => {
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "owner",
            text: "public API needs a compatibility shim removal",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const stop = script(2, {
      slug: undefined,
      step: "front-stop",
      outcome: {
        status: "done",
        summary: "front done",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [debt, stop]).goal).toBe("active");
  });
}

function registerDerivePart41(): void {
  it("needs a later done after the debt closes", () => {
    const debtText = "cache invalidation needs a follow-up task";
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
        forward: [],
        verdict: "approve",
      },
    });
    const refused = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "premature done",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [debt, refused]).goal).toBe("active");
    const close = rec(3, {
      slug: undefined,
      step: "architect",
      iteration: 2,
      outcome: {
        status: "done",
        summary: "closed the debt",
        concerns: [],
        forward: [`debt closed: ${debtText}`],
        decision: "continue",
      },
    });
    const landed = rec(4, {
      slug: undefined,
      step: "architect",
      iteration: 2,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [debt, refused, close, landed]).goal).toBe(
      "done",
    );
  });
}

function registerDerivePart42(): void {
  it("counts only a continuation's own turns, not its base's", () => {
    const tasks = [task("a"), task("b", { base: "a" })];
    const records = [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
      implement(4, 2),
      implement(5, 1, { slug: "b" }),
    ];
    const state = derive(tasks, records);
    expect(state.tasks.a!.turns).toBe(3);
    expect(state.tasks.b!.turns).toBe(1);
  });
}
