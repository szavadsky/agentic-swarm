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

/** One task's records through a landing merge: implement, green checks, approve, merge. */
const mergedTask = (slug: string, seq: number): StepRecord[] => [
  implement(seq, 1, { slug }),
  { ...doneCheck(seq + 1), slug },
  { ...review(seq + 2, "approve"), slug },
  script(seq + 3, { slug, step: "merge", ok: true, commit: `commit-${slug}` }),
];

const parkTask = (slug: string, seq: number): StepRecord =>
  script(seq, {
    slug,
    step: "park",
    ok: true,
    cause: cause("empty-diff: no changes"),
  });

const cancelTask = (slug: string, seq: number): StepRecord =>
  script(seq, {
    slug,
    step: "cancel",
    ok: true,
    cause: cause("cancelled"),
  });

function registerDerivePart43(): void {
  it("unblocks a dependency on a parked slug through its merged base continuation", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a" }),
      task("c", { deps: ["a"] }),
    ];
    const state = derive(tasks, [parkTask("a", 1), ...mergedTask("b", 2)]);
    expect(state.tasks.a!.status).toBe("parked");
    expect(state.tasks.b!.status).toBe("merged");
    expect(state.tasks.c!.status).toBe("ready");
  });

  it("unblocks a dependency on a cancelled slug through its merged base continuation", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a" }),
      task("c", { deps: ["a"] }),
    ];
    const state = derive(tasks, [cancelTask("a", 1), ...mergedTask("b", 2)]);
    expect(state.tasks.a!.status).toBe("cancelled");
    expect(state.tasks.c!.status).toBe("ready");
  });

  it("unblocks a dependency through a finished base continuation", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a", kind: "spike", flow: "spike" }),
      task("c", { deps: ["a"] }),
    ];
    const state = derive(tasks, [
      parkTask("a", 1),
      implement(2, 1, { slug: "b" }),
      { ...doneCheck(3), slug: "b" },
      { ...review(4, "approve"), slug: "b" },
      script(5, { slug: "b", step: "finish", ok: true }),
    ]);
    expect(state.tasks.a!.status).toBe("parked");
    expect(state.tasks.b!.status).toBe("finished");
    expect(state.tasks.c!.status).toBe("ready");
  });

  it("resolves a dependency transitively along the base chain", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a" }),
      task("d", { base: "b" }),
      task("c", { deps: ["a"] }),
    ];
    const parked = [parkTask("a", 1), parkTask("b", 2)];
    expect(derive(tasks, parked).tasks.c!.status).toBe("pending");
    const state = derive(tasks, [...parked, ...mergedTask("d", 3)]);
    expect(state.tasks.c!.status).toBe("ready");
  });
}

function registerDerivePart44(): void {
  it("keeps a dependency blocked when its parked or cancelled slug has no continuation", () => {
    const tasks = [task("a"), task("c", { deps: ["a"] })];
    expect(derive(tasks, [parkTask("a", 1)]).tasks.c!.status).toBe("pending");
    expect(derive(tasks, [cancelTask("a", 1)]).tasks.c!.status).toBe("pending");
  });

  it("keeps a dependency blocked by an unlanded base continuation", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a" }),
      task("c", { deps: ["a"] }),
    ];
    const state = derive(tasks, [parkTask("a", 1), parkTask("b", 2)]);
    expect(state.tasks.a!.status).toBe("parked");
    expect(state.tasks.b!.status).toBe("parked");
    expect(state.tasks.c!.status).toBe("pending");
  });
}

describe("derive", () => {
  registerDerivePart43();

  registerDerivePart44();
});
