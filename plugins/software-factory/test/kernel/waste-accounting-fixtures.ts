import type { CheckResult } from "../../src/core/checks/types.js";
import type { Usage } from "../../src/harness/types.js";
import type { RecordedOutcome, StepRecord } from "../../src/kernel/types.js";
import { rec, script } from "./helpers.js";

export const USAGE: Usage = {
  in: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  out: 0,
  reasoningOut: 0,
  costUsd: undefined,
};

export function outcome(value: Partial<RecordedOutcome> = {}): RecordedOutcome {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

export function check(name: string, ok: boolean): CheckResult {
  return {
    name,
    ok,
    summary: ok ? "pass" : "exit 1",
    output: "",
    fingerprint: name,
  };
}

/** Red, zero-diff fix, red again: the implementer failed, nothing was flaky. */
export function redZeroDiffFixRecords(): StepRecord[] {
  return [
    script(1, {
      slug: "a",
      step: "checks",
      round: 1,
      ok: false,
      checks: [check("tests", false)],
    }),
    rec(2, {
      slug: "a",
      step: "implement",
      round: 1,
      alias: "implementer",
      edits: { files: 0, added: 0, removed: 0 },
      outcome: outcome(),
    }),
    script(3, {
      slug: "a",
      step: "checks",
      round: 1,
      ok: false,
      checks: [check("tests", false)],
    }),
  ];
}

/** Red, a real fix, green: work landed, so the turn is not waste. */
export function redThenRealFixRecords(): StepRecord[] {
  return [
    script(4, {
      slug: "b",
      step: "checks",
      round: 1,
      ok: false,
      checks: [check("tests", false)],
    }),
    rec(5, {
      slug: "b",
      step: "implement",
      round: 1,
      alias: "implementer",
      edits: { files: 1, added: 4, removed: 1 },
      outcome: outcome(),
    }),
    script(6, {
      slug: "b",
      step: "checks",
      round: 1,
      ok: true,
      checks: [check("tests", true)],
    }),
  ];
}

/** A fallback hop delivered; only the failed attempt, already an incident. */
export function deliveredFallbackRecords(): StepRecord[] {
  return [
    rec(7, {
      slug: "c",
      step: "implement",
      round: 1,
      alias: "implementer",
      outcome: outcome(),
      attempts: [
        {
          model: { id: "model-a" },
          stop: { kind: "infra", cause: "network" },
          usage: USAGE,
        },
        {
          model: { id: "model-b" },
          stop: { kind: "done" },
          usage: USAGE,
        },
      ],
    }),
  ];
}
