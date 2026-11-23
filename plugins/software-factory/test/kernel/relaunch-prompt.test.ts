import { describe, expect, it } from "bun:test";
import { isRelaunchStep } from "../../src/kernel/flow-context.js";
import type { StepRecord } from "../../src/kernel/types.js";

function record(patch: Partial<StepRecord>): StepRecord {
  return {
    seq: 1,
    iteration: 1,
    slug: "beta",
    step: "implement",
    round: 1,
    actor: "agent",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function bareCrash(patch: Partial<StepRecord> = {}): StepRecord {
  return record({
    stop: { kind: "infra", cause: "crash" },
    ok: false,
    ...patch,
  });
}

describe("isRelaunchStep", () => {
  it("relaunches a turn recovery sealed bare for the current revision", () => {
    expect(isRelaunchStep([bareCrash()], "beta", "implement", 0)).toBe(true);
  });

  it("ignores a crash the turn itself reported", () => {
    const reported = bareCrash({
      cause: { kind: "error", detail: "harness died" },
      usage: {
        in: 1,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 1,
        reasoningOut: 0,
      },
    });
    expect(isRelaunchStep([reported], "beta", "implement", 0)).toBe(false);
  });

  it("ignores a crash-sealed script step", () => {
    expect(
      isRelaunchStep([bareCrash({ actor: "script" })], "beta", "implement", 0),
    ).toBe(false);
  });

  it("ignores a crash of a revision the task has amended past", () => {
    expect(isRelaunchStep([bareCrash()], "beta", "implement", 1)).toBe(false);
  });

  it("ignores an older crash once a later turn completed the step", () => {
    const completed = record({ seq: 2, endedAt: "2026-01-01T00:01:00.000Z" });
    expect(
      isRelaunchStep([bareCrash(), completed], "beta", "implement", 0),
    ).toBe(false);
  });
});
