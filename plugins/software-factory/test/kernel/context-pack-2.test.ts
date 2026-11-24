import { describe, expect, it } from "bun:test";
import { recordedConcernId } from "../../src/core/concerns.js";
import {
  forwardedConcerns,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { rec, task } from "./helpers.js";

/** A scoped concern for the pack scoping test. */
function scopedConcern(
  text: string,
  calibration: "architect" | "owner",
): { kind: "risk"; calibration: "architect" | "owner"; text: string } {
  return { kind: "risk", calibration, text };
}

/** The three shipped turns whose concerns must stay in their own packs. */
function contextPackTaskRecords(): ReturnType<typeof rec>[] {
  return [
    rec(1, {
      slug: "alpha.build",
      step: "implement",
      outcome: {
        status: "done",
        summary: "alpha shipped",
        concerns: [scopedConcern("alpha task risk", "architect")],
        forward: [],
      },
    }),
    rec(2, {
      slug: "beta.build",
      step: "implement",
      outcome: {
        status: "done",
        summary: "beta shipped",
        concerns: [scopedConcern("beta task risk", "architect")],
        forward: [],
      },
    }),
    rec(3, {
      slug: "goal.close",
      step: "review",
      outcome: {
        status: "done",
        summary: "goal work reviewed",
        concerns: [scopedConcern("goal risk", "owner")],
        forward: [],
        verdict: "approve",
      },
    }),
  ];
}

/** The alpha subarchitect turn that filters its epic's risk into the brief. */
function contextPackBriefRecord(): ReturnType<typeof rec> {
  return rec(4, {
    slug: undefined,
    step: "subarchitect",
    architect: "alpha",
    outcome: {
      status: "done",
      summary: "alpha risk escalated",
      concerns: [scopedConcern("alpha brief risk", "architect")],
      forward: ["alpha carry"],
      decision: "done",
    },
  });
}

/** Renders one goal or epic pack over the chained tasks and records. */
function contextPackFor(
  chained: ReturnType<typeof task>[],
  state: ReturnType<typeof derive>,
  records: ReturnType<typeof rec>[],
  epic?: string,
  holds: { steer: string; slugs: string[]; goal: boolean }[] = [],
): string {
  return renderContextPack({
    goal: "demo",
    iteration: 2,
    ...(epic ? { epic } : {}),
    intentPath: "/goal/intent.md",
    planPath: epic ? `/goal/epics/${epic}.md` : "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks: epic ? chained.filter((task) => task.epic === epic) : chained,
    state,
    steers: [],
    setup: [],
    gates: [],
    forwarded: forwardedConcerns(records, {
      tasks: chained,
      audience: epic ? { kind: "epic", epic } : { kind: "goal" },
    }),
    debts: [],
    holds,
  });
}

/** Asserts each concern stays in its own pack until the brief carries it up. */
function expectConcernScoping(top: string, alpha: string, beta: string): void {
  expect(alpha).toContain("# Context pack — goal demo, epic `alpha`");
  expect(alpha).toContain("alpha task risk");
  expect(alpha).not.toContain("beta task risk");
  expect(beta).toContain("beta task risk");
  expect(beta).not.toContain("alpha task risk");
  expect(top).not.toContain("alpha task risk");
  expect(top).not.toContain("beta task risk");
  expect(top).toContain("goal risk");
  // Carried by the brief: the subarchitect's concern and forward reach the top.
  expect(top).toContain("alpha brief risk");
  expect(top).toContain("alpha carry");
  expect(alpha).not.toContain("alpha carry");
}

/** The pack line one forwarded concern rendered, or undefined. */
function forwardedLine(pack: string, text: string): string | undefined {
  return pack.split("\n").find((line) => line.includes(text));
}

function registerContextPackPart7(): void {
  it("marks the tasks a blocking concern holds on its line and leaves the rest unchanged", () => {
    const chained = [
      task("alpha.build", { epic: "alpha" }),
      task("beta.build", { epic: "beta" }),
    ];
    const records = contextPackTaskRecords();
    const state = derive(chained, records);
    const goalRisk = recordedConcernId({ kind: "risk", text: "goal risk" });
    const withHold = contextPackFor(chained, state, records, undefined, [
      { steer: goalRisk, slugs: ["alpha.build"], goal: false },
    ]);
    expect(forwardedLine(withHold, "goal risk")).toBe(
      `- [owner/risk] goal risk · holds alpha.build — goal.close review r1`,
    );
    // A concern the PM passed on renders exactly as it did before the mark.
    expect(forwardedLine(withHold, "alpha task risk")).toBeUndefined();
  });

  it("renders a passed-on concern unchanged beside a held one", () => {
    const chained = [task("alpha.build", { epic: "alpha" })];
    const records = [...contextPackTaskRecords(), contextPackBriefRecord()];
    const state = derive(chained, records);
    const goalRisk = recordedConcernId({ kind: "risk", text: "goal risk" });
    const pack = contextPackFor(chained, state, records, undefined, [
      { steer: goalRisk, slugs: [], goal: false },
    ]);
    expect(forwardedLine(pack, "goal risk")).toBe(
      `- [owner/risk] goal risk — goal.close review r1`,
    );
  });
}

function registerContextPackPart6(): void {
  it("keeps a task concern inside its epic's pack until the brief carries it up", () => {
    const chained = [
      task("alpha.build", { epic: "alpha" }),
      task("beta.build", { epic: "beta" }),
      task("goal.close"),
    ];
    const records = [...contextPackTaskRecords(), contextPackBriefRecord()];
    const state = derive(chained, records);
    const top = contextPackFor(chained, state, records);
    const alpha = contextPackFor(chained, state, records, "alpha");
    const beta = contextPackFor(chained, state, records, "beta");
    expectConcernScoping(top, alpha, beta);
  });
}

describe("context pack", () => {
  registerContextPackPart6();
  registerContextPackPart7();
});
