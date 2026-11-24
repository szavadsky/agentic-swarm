import { describe, expect, it } from "bun:test";
import { derive, openDebts } from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task, cause, causeText } from "./helpers.js";
import type { Cause } from "../../src/kernel/types.js";

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
  it("settles the architect's done with open debt but still refuses an open epic", () => {
    const debt = rec(1, {
      slug: "auth.login",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "retry window drops head names",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "goal met with the debt listed",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    const state = derive([task("auth.login")], [debt, done]);
    // The debt stays open; the architect's done is not overridden.
    expect(openDebts([debt, done])).toHaveLength(1);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);

    // An epic with a non-terminal task refuses the same done.
    const epicState = derive(
      [task("auth.login", { epic: "auth" })],
      [debt, done],
    );
    expect(epicState.epics.auth?.done).toBe(false);
    expect(epicState.goal).toBe("active");
    expect(epicState.terminal).toBe(false);
  });
}

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
});
