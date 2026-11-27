import { describe, expect, it } from "bun:test";
import { derive, openDebts } from "../../src/kernel/derive.js";
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
  expect(parked.tasks.a!.phase).toBe("decide");
  expect(parked.tasks.a!.park).toBeUndefined();
  expect(parked.tasks.a!.pendingSignal).toEqual({
    kind: "empty-diff",
    evidence:
      "implement r1 committed no changes after red checks: unit (exit 1)",
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
  it("keeps a task on checks (never parking as gate could not start) when every red check on it is infra", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        infraRedCheck(3),
      ],
    );
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("classifies a missing gate runner without details as infra in the derive path without parking", () => {
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
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
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
  it("lands the architect's done with material debt still open", () => {
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
    // The debt stays in the register; the architect's done is not overridden.
    expect(openDebts([debt, done])).toHaveLength(1);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
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

describe("derive", () => {
  registerDerivePart28();

  registerDerivePart29();

  registerDerivePart30();

  registerDerivePart31();

  registerDerivePart32();

  registerDerivePart33();

  registerDerivePart34();

  registerDerivePart35();
});
