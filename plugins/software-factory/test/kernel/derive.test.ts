import { describe, expect, it } from "bun:test";
import { derive, hasOpenDebt, openDebts } from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

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

describe("derive", () => {
  it("orders readiness by dependencies, not by file position", () => {
    const tasks = [task("b", { deps: ["a"] }), task("a")];
    const state = derive(tasks, []);
    expect(state.iteration).toBe(0);
    expect(state.goal).toBe("active");
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.b!.status).toBe("pending");
    expect(state.tasks.a!.phase).toBe("implement");
    expect(state.tasks.a!.round).toBe(1);
  });

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

  it("sends a green implement turn to review and a red one back to implementation", () => {
    const green = derive([task("a")], [implement(1), doneCheck(2)]);
    expect(green.tasks.a!.phase).toBe("review");
    expect(green.tasks.a!.round).toBe(1);

    const red = derive([task("a")], [implement(1), redCheck(2)]);
    expect(red.tasks.a!.phase).toBe("implement");
    expect(red.tasks.a!.round).toBe(1);
  });

  it("advances the round after changes and merges when the last round decides", () => {
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
    expect(afterSecond.tasks.a!.round).toBe(2);
    expect(afterSecond.tasks.a!.phase).toBe("merge");
    expect(afterSecond.tasks.a!.turns).toBe(4);
  });

  it("derives a park request on a reject and keeps the cause", () => {
    const state = derive(
      [task("a")],
      [implement(1), doneCheck(2), review(3, "reject")],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.park).toContain("review rejected");
    expect(state.tasks.a!.phase).toBe("parked");
  });

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
    expect(blocked.tasks.a!.park).toContain("missing API");

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
    expect(failed.tasks.a!.park).toContain("tests red");

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
    expect(upscope.tasks.a!.park).toContain("upscope");

    const parked = derive(
      [task("a")],
      [script(1, { step: "park", ok: true, cause: "setup failed" })],
    );
    expect(parked.tasks.a!.status).toBe("parked");
    expect(parked.tasks.a!.cause).toBe("setup failed");
  });

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
          ...script(3, { step: "park", ok: true, cause: "half written" }),
          endedAt: undefined,
        },
      ],
    );
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("never charges an infra stop to the item budget or the round", () => {
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

  it("merges a review-less flow without a review and parks after repeated red merge gates", () => {
    const tasks = [task("a", { flow: "just-implement" })];
    const merging = derive(tasks, [implement(1), doneCheck(2)]);
    expect(merging.tasks.a!.phase).toBe("merge");
    expect(merging.tasks.a!.round).toBe(1);

    const fixed = derive(tasks, [
      implement(1),
      doneCheck(2),
      script(3, { step: "merge", ok: false, cause: "gates: unit" }),
    ]);
    expect(fixed.tasks.a!.phase).toBe("implement");
    expect(fixed.tasks.a!.round).toBe(1);
    expect(fixed.tasks.a!.gateFix).toBe(true);

    const parked = derive(tasks, [
      implement(1),
      doneCheck(2),
      script(3, { step: "merge", ok: false, cause: "gates: unit" }),
      implement(4),
      doneCheck(5),
      script(6, { step: "merge", ok: false, cause: "gates: unit" }),
    ]);
    expect(parked.tasks.a!.phase).toBe("parked");
    expect(parked.tasks.a!.park).toContain("gates: unit");
    expect(parked.tasks.a!.round).toBe(1);
  });

  it("sends an empty fix round after changes back to review instead of parking", () => {
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
    expect(reviewed.tasks.a!.phase).toBe("review");
    expect(reviewed.tasks.a!.round).toBe(2);
    expect(reviewed.tasks.a!.park).toBeUndefined();
    expect(reviewed.tasks.a!.loop).toBeUndefined();
  });

  it("bounds a deferred empty fix round by review rounds", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        review(4, "changes", 1),
        implement(5, 2, { tree: "tree-1", commit: "c1", base: "c0" }),
        doneCheck(6),
        review(7, "changes", 2),
      ],
    );
    // Last-round `changes` merges with the concerns as debt: the deferred
    // empty round cannot loop forever.
    expect(state.tasks.a!.phase).toBe("merge");
    expect(state.tasks.a!.round).toBe(2);
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("sets gateFix on red task checks and names them when the fix commits nothing", () => {
    const tasks = [task("a")];
    const prefix = [
      implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
      redCheck(2),
    ];
    const looped = derive(tasks, prefix);
    expect(looped.tasks.a!.phase).toBe("implement");
    expect(looped.tasks.a!.round).toBe(1);
    expect(looped.tasks.a!.gateFix).toBe(true);

    const state = derive(tasks, [
      ...prefix,
      implement(3, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    ]);
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toBe(
      "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
    );
  });

  it("routes a task-checks fix turn to review on green, never skipping to merge", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        redCheck(2),
        implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" }),
        doneCheck(4),
      ],
    );
    expect(state.tasks.a!.phase).toBe("review");
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("routes a task-checks reroute after a merged-result failure back to review", () => {
    const mergeFail = (seq: number): StepRecord =>
      script(seq, {
        step: "merge",
        ok: false,
        cause: "gates: unit",
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
    expect(state.tasks.a!.phase).toBe("review");
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("parks an empty fix after last-round changes followed by a merge-gates failure", () => {
    const state = derive(
      [task("a")],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        review(4, "changes", 1),
        implement(5, 2, { tree: "tree-2", commit: "c2", base: "c0" }),
        script(6, { step: "commit", ok: true, commit: "c2", tree: "tree-2" }),
        doneCheck(7),
        review(8, "changes", 2),
        script(9, {
          step: "merge",
          ok: false,
          cause: "gates: unit",
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
      ],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toBe(
      "empty-diff: implement r2 committed no changes after red checks: unit (exit 1)",
    );
  });

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

  it("names the red merge checks when a gate-fix turn commits nothing", () => {
    const state = derive(
      [task("a", { flow: "just-implement" })],
      [
        implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
        script(2, { step: "commit", ok: true, commit: "c1", tree: "tree-1" }),
        doneCheck(3),
        script(4, {
          step: "merge",
          ok: false,
          cause: "gates: unit",
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
      ],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toBe(
      "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
    );
  });

  it("keeps the plain empty-diff cause for a first turn with no commit", () => {
    const state = derive(
      [task("a")],
      [implement(1, 1, { tree: "tree-0", commit: "c0", base: "c0" })],
    );
    expect(state.tasks.a!.phase).toBe("parked");
    expect(state.tasks.a!.park).toBe(
      "empty-diff: implement r1 committed no changes",
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
    expect(state.tasks.a!.phase).toBe("review");
    expect(state.tasks.a!.round).toBe(2);
    expect(state.tasks.a!.park).toBeUndefined();
  });

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
      expect(state.tasks.a!.phase).toBe("review");
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
    expect(state.tasks.a!.park).toContain("failed");
    expect(state.tasks.a!.turns).toBe(1);
  });

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
    expect(state.tasks.a!.park).toContain(
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
    expect(state.tasks.a!.park).toContain(
      "infra: gate could not start: typecheck",
    );
  });

  it("still loops the implementer when a red check is not infra, even beside an unstartable one", () => {
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

    // An empty fix names only the actionable red: the unstartable gate is not
    // a verdict on the task.
    const parked = derive(tasks, [
      ...prefix,
      implement(4, 1, { tree: "tree-1", commit: "c1", base: "c0" }),
    ]);
    expect(parked.tasks.a!.phase).toBe("parked");
    expect(parked.tasks.a!.park).toBe(
      "empty-diff: implement r1 committed no changes after red checks: unit (exit 1)",
    );
  });

  it("charges each outcome repair to the item budget", () => {
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

  it("leaves infra retries outside the item budget", () => {
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
});
