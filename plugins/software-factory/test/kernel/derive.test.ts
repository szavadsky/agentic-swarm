import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import type { StepRecord, TaskFile } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const doneCheck = (seq: number): StepRecord => script(seq, {
  step: "checks",
  ok: true,
  checks: [],
  startedAt: new Date(seq).toISOString(),
});

const redCheck = (seq: number): StepRecord => script(seq, {
  step: "checks",
  ok: false,
  checks: [{ name: "unit", ok: false, summary: "exit 1", output: "boom", fingerprint: "x" }],
});

const review = (seq: number, verdict: "approve" | "changes" | "reject", round = 1): StepRecord =>
  rec(seq, {
    step: "review",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: { status: "done", summary: `review r${round}`, concerns: [], forward: [], verdict },
  });

const implement = (seq: number, round = 1, patch: Partial<StepRecord> = {}): StepRecord =>
  rec(seq, {
    step: "implement",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: { status: "done", summary: "implemented", concerns: [], forward: [] },
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
    const tasks = [task("probe", { kind: "spike", flow: "spike" }), task("work", { deps: ["probe"] })];
    const state = derive(tasks, [
      implement(1, 1, { slug: "probe" }),
      { ...doneCheck(2), slug: "probe" },
      review(3, "approve"),
      script(4, { slug: "probe", step: "finish", ok: true }),
    ].map((r, i) => (i === 2 ? { ...r, slug: "probe" } : r)));
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
    const state = derive([task("a")], [implement(1), doneCheck(2), review(3, "reject")]);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.park).toContain("review rejected");
    expect(state.tasks.a!.phase).toBe("parked");
  });

  it("derives park requests on blocked, failed and upscope outcomes, and parks on a park record", () => {
    const blocked = derive([task("a")], [
      implement(1, 1, { outcome: { status: "blocked", summary: "missing API", concerns: [], forward: [] } }),
    ]);
    expect(blocked.tasks.a!.status).toBe("ready");
    expect(blocked.tasks.a!.park).toContain("missing API");

    const failed = derive([task("a")], [
      implement(1, 1, { outcome: { status: "failed", summary: "tests red", concerns: [], forward: [] } }),
    ]);
    expect(failed.tasks.a!.status).toBe("ready");
    expect(failed.tasks.a!.park).toContain("tests red");

    const upscope = derive([task("a")], [
      implement(1, 1, { outcome: { status: "upscope", summary: "needs a second seam", concerns: [], forward: [] } }),
    ]);
    expect(upscope.tasks.a!.park).toContain("upscope");

    const parked = derive([task("a")], [script(1, { step: "park", ok: true, cause: "setup failed" })]);
    expect(parked.tasks.a!.status).toBe("parked");
    expect(parked.tasks.a!.cause).toBe("setup failed");
  });

  it("ignores unfinished records as orphans so the step is redispatched", () => {
    const state = derive([task("a")], [
      { ...rec(1), endedAt: undefined, outcome: undefined, usage: undefined, stop: undefined },
    ]);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("implement");
    expect(state.tasks.a!.turns).toBe(0);
  });

  it("ignores unfinished script records instead of advancing or parking", () => {
    const state = derive([task("a")], [
      implement(1),
      { ...doneCheck(2), endedAt: undefined },
      { ...script(3, { step: "park", ok: true, cause: "half written" }), endedAt: undefined },
    ]);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.phase).toBe("checks");
    expect(state.tasks.a!.park).toBeUndefined();
  });

  it("never charges an infra stop to the item budget or the round", () => {
    const state = derive([task("a")], [
      implement(1, 1, { stop: { kind: "infra", cause: "quota" }, outcome: undefined }),
    ]);
    expect(state.tasks.a!.turns).toBe(0);
    expect(state.tasks.a!.round).toBe(1);
    expect(state.tasks.a!.phase).toBe("implement");
  });

  it("derives a park request for a failed attempt instead of retrying it", () => {
    const state = derive([task("a")], [
      implement(1, 1, { outcome: { status: "failed", summary: "tests red", concerns: [], forward: [] } }),
    ]);
    expect(state.tasks.a!.status).toBe("ready");
    expect(state.tasks.a!.park).toContain("failed");
    expect(state.tasks.a!.turns).toBe(1);
  });

  it("derives the goal decision from the last architect record", () => {
    const records = [
      rec(1, {
        slug: undefined,
        step: "architect",
        outcome: { status: "done", summary: "plan", concerns: [], forward: [], decision: "continue" },
      }),
      rec(2, {
        slug: undefined,
        step: "architect",
        iteration: 2,
        outcome: { status: "done", summary: "finished", concerns: [], forward: [], decision: "done" },
      }),
    ];
    const state = derive([task("a")], records);
    expect(state.iteration).toBe(2);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
  });
});
