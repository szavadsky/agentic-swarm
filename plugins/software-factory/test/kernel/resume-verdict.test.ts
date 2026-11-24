import { describe, expect, it } from "bun:test";
import type { Hold } from "../../src/kernel/mailbox.js";
import {
  resumeVerdict,
  hasUnreadableArtifact,
} from "../../src/kernel/resume.js";
import type {
  Limits,
  State,
  StepRecord,
  TaskState,
} from "../../src/kernel/types.js";

const LIMITS = { resumeAttempts: 2 } as Limits;

function state(...ready: string[]): State {
  return {
    goal: "active",
    iteration: 1,
    terminal: false,
    interrupted: true,
    tasks: Object.fromEntries(
      ready.map((slug) => [slug, { status: "ready" } as TaskState]),
    ),
    epics: {},
  };
}

let seq = 0;
function record(patch: Partial<StepRecord>): StepRecord {
  return {
    seq: ++seq,
    iteration: 1,
    step: "implement",
    round: 1,
    actor: "agent",
    endedAt: "2026-01-01T00:00:00Z",
    ...patch,
  } as StepRecord;
}

const resume = () => record({ step: "resume", actor: "script" });
const taskTurn = (slug = "alpha") => record({ slug, step: "implement" });
const planCheck = (verdict?: "progress" | "architect") =>
  record({
    step: "plancheck",
    outcome: verdict
      ? {
          status: "done",
          summary: `plan-check ${verdict}`,
          concerns: [],
          forward: [],
          planCheck: { verdict, evidence: [], followUps: [], concerns: [] },
        }
      : undefined,
  });
const hold = (steer: string, ...slugs: string[]): Hold => ({
  steer,
  slugs,
  goal: false,
});

describe("resumeVerdict", () => {
  resumeVerdictPart1();
  resumeVerdictPart2();
  resumeVerdictPart3();
  resumeVerdictPart4();
});

function resumeVerdictPart1() {
  it("resumes first-time work", () => {
    expect(
      resumeVerdict(state("alpha"), [taskTurn()], [], new Set(), LIMITS),
    ).toEqual({
      resume: true,
    });
  });

  it("resumes a second time after the first resume ran a task turn", () => {
    const records = [resume(), taskTurn()];
    expect(
      resumeVerdict(state("alpha"), records, [], new Set(), LIMITS).resume,
    ).toBe(true);
  });

  it("refuses at the attempts limit, defaulting to two", () => {
    const records = [resume(), taskTurn(), resume(), taskTurn()];
    const verdict = resumeVerdict(
      state("alpha"),
      records,
      [],
      new Set(),
      LIMITS,
    );
    expect(verdict.resume).toBe(false);
    expect(verdict.cause).toContain("limit 2");
    expect(
      resumeVerdict(state("alpha"), records, [], new Set(), {} as Limits)
        .resume,
    ).toBe(false);
    expect(
      resumeVerdict(state("alpha"), records.slice(0, 2), [], new Set(), {
        resumeAttempts: 1,
      } as Limits).cause,
    ).toContain("limit 1");
  });
}

function resumeVerdictPart2() {
  it("ignores resumes of other iterations", () => {
    const records = [
      record({ step: "resume", actor: "script", iteration: 0 }),
      record({ step: "resume", actor: "script", iteration: 0 }),
    ];
    expect(
      resumeVerdict(state("alpha"), records, [], new Set(), LIMITS).resume,
    ).toBe(true);
  });

  it("refuses when the previous resume was followed by no task turn", () => {
    // A turn before the resume, and non-ruling turns after it, do not count.
    const records = [
      taskTurn(),
      resume(),
      record({ step: "pm", slug: "s1" }),
      record({ step: "steward" }),
      record({ step: "checks", actor: "script", slug: "alpha" }),
    ];
    const verdict = resumeVerdict(
      state("alpha"),
      records,
      [],
      new Set(),
      LIMITS,
    );
    expect(verdict.resume).toBe(false);
    expect(verdict.cause).toContain("no task turn");
  });

  it("resumes after a resume that only ruled at the boundary", () => {
    const records = [
      taskTurn(),
      resume(),
      record({ step: "architect", actor: "agent", slug: undefined }),
    ];
    expect(
      resumeVerdict(state("alpha"), records, [], new Set(), LIMITS).resume,
    ).toBe(true);
  });
}

function resumeVerdictPart3() {
  it("refuses when the latest plan-check is architect, resumes when a later one is progress", () => {
    const refused = resumeVerdict(
      state("alpha"),
      [planCheck("progress"), planCheck("architect")],
      [],
      new Set(),
      LIMITS,
    );
    expect(refused.resume).toBe(false);
    expect(refused.cause).toContain("architect");
    expect(
      resumeVerdict(
        state("alpha"),
        [planCheck("architect"), planCheck("progress")],
        [],
        new Set(),
        LIMITS,
      ).resume,
    ).toBe(true);
  });

  it("reads a plan-check turn without a verdict as architect", () => {
    expect(
      resumeVerdict(state("alpha"), [planCheck()], [], new Set(), LIMITS)
        .resume,
    ).toBe(false);
  });

  it("refuses when every ready task is held by a pending steer", () => {
    const holds = [hold("s1", "alpha", "beta")];
    const verdict = resumeVerdict(
      state("alpha", "beta"),
      [],
      holds,
      new Set(["s1"]),
      LIMITS,
    );
    expect(verdict.resume).toBe(false);
    expect(verdict.cause).toContain("held");
  });
}

function resumeVerdictPart4() {
  it("resumes when one ready task is runnable or the holding steer is gone", () => {
    const holds = [hold("s1", "alpha")];
    expect(
      resumeVerdict(state("alpha", "beta"), [], holds, new Set(["s1"]), LIMITS)
        .resume,
    ).toBe(true);
    expect(
      resumeVerdict(state("alpha"), [], holds, new Set(), LIMITS).resume,
    ).toBe(true);
  });
}

describe("hasUnreadableArtifact", () => {
  it("reports a task file the resumed iteration quarantined", () => {
    const records = [
      record({ step: "task-quarantine", actor: "script", slug: "beta" }),
    ];
    expect(hasUnreadableArtifact(records, 1)).toBe(true);
  });

  it("ignores a quarantine from another iteration or another artifact", () => {
    const records = [
      record({
        iteration: 2,
        step: "task-quarantine",
        actor: "script",
        slug: "beta",
      }),
      record({ step: "hold-quarantine", actor: "script" }),
      record({ step: "resume", actor: "script" }),
    ];
    expect(hasUnreadableArtifact(records, 1)).toBe(false);
  });
});
