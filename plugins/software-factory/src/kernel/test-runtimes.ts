/**
 * Per-test runtime tracking from CTRF gate reports: extracts stored per-test
 * runtimes from gate records, resolves the goal-start and current runs, and
 * computes the comparison the architect's pack and `suite-compact` read.
 */

import type { CheckResult } from "../core/checks/types.js";
import type {
  TestRuntimeComparison,
  TestRuntimeDelta,
  TestRuntimeRun,
} from "./test-runtimes-types.js";
import type { StepRecord } from "./types.js";

export type {
  TestRuntimeComparison,
  TestRuntimeRun,
} from "./test-runtimes-types.js";

/** Gate-producing steps; flake and infra placeholders never represent a run. */
const GATE_STEPS = new Set([
  "baseline",
  "checks",
  "merge-checks",
  "goal-head",
  "merge",
]);

/** Integration-tree gate steps preferred for the current-run comparison. */
const HEAD_GATE_STEPS = new Set([
  "baseline",
  "merge-checks",
  "goal-head",
  "merge",
]);

/** Reads validated per-test runtimes stored on one check's details, if present. */
export function checkTestRuntimes(
  check: CheckResult,
): Record<string, number> | undefined {
  const details = check.details;
  if (typeof details !== "object" || details === null) return undefined;
  const raw = (details as { testRuntimes?: unknown }).testRuntimes;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Merges per-test runtimes across one gate record's checks. */
export function recordTestRuntimes(
  rec: StepRecord,
): TestRuntimeRun | undefined {
  if (
    rec.actor !== "script" ||
    rec.endedAt === undefined ||
    !GATE_STEPS.has(rec.step) ||
    !rec.checks ||
    rec.checks.length === 0
  ) {
    return undefined;
  }
  const merged = new Map<string, number>();
  let found = false;
  for (const check of rec.checks) {
    const runtimes = checkTestRuntimes(check);
    if (!runtimes) continue;
    found = true;
    for (const [name, durationMs] of Object.entries(runtimes)) {
      const key = merged.has(name) ? `${check.name}: ${name}` : name;
      merged.set(key, durationMs);
    }
  }
  if (!found || merged.size === 0) return undefined;
  const tests = Object.fromEntries(
    [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  let totalMs = 0;
  for (const durationMs of merged.values()) totalMs += durationMs;
  return {
    seq: rec.seq,
    iteration: rec.iteration,
    step: rec.step,
    totalMs,
    testCount: merged.size,
    tests,
  };
}

/** All ended script gate records carrying CTRF test runtimes, in seq order. */
function recordedRuntimeRuns(records: readonly StepRecord[]): TestRuntimeRun[] {
  const runs: TestRuntimeRun[] = [];
  for (const rec of [...records].sort((a, b) => a.seq - b.seq)) {
    const run = recordTestRuntimes(rec);
    if (run) runs.push(run);
  }
  return runs;
}

/**
 * The goal-start per-test runtimes: the earliest recorded baseline CTRF run,
 * falling back to the earliest recorded CTRF gate run when pre-flight had none.
 */
export function goalStartTestRuntimes(
  records: readonly StepRecord[],
): TestRuntimeRun | undefined {
  const runs = recordedRuntimeRuns(records);
  if (runs.length === 0) return undefined;
  return runs.find((run) => run.step === "baseline") ?? runs[0];
}

/**
 * The current per-test runtimes strictly after `goalStartSeq`: prefers the
 * latest integration-tree gate run, falling back to the latest gate run.
 */
function currentTestRuntimes(
  records: readonly StepRecord[],
  goalStartSeq: number,
): TestRuntimeRun | undefined {
  const after = recordedRuntimeRuns(records).filter(
    (run) => run.seq > goalStartSeq,
  );
  if (after.length === 0) return undefined;
  const headRun = [...after]
    .reverse()
    .find((run) => HEAD_GATE_STEPS.has(run.step));
  return headRun ?? after.at(-1);
}

function buildComparisonRows(
  goalStart: TestRuntimeRun,
  current: TestRuntimeRun,
): TestRuntimeDelta[] {
  const names = new Set([
    ...Object.keys(goalStart.tests),
    ...Object.keys(current.tests),
  ]);
  const rows: TestRuntimeDelta[] = [];
  for (const name of names) {
    const goalStartMs =
      name in goalStart.tests ? (goalStart.tests[name] ?? null) : null;
    const currentMs =
      name in current.tests ? (current.tests[name] ?? null) : null;
    const deltaMs =
      goalStartMs !== null && currentMs !== null
        ? currentMs - goalStartMs
        : null;
    rows.push({ name, goalStartMs, currentMs, deltaMs });
  }
  return rows.sort(
    (a, b) =>
      (b.currentMs ?? -1) - (a.currentMs ?? -1) ||
      (b.goalStartMs ?? -1) - (a.goalStartMs ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Builds the goal-start versus current per-test runtime comparison from
 * recorded CTRF runs. Returns undefined when no CTRF runtimes were recorded.
 */
export function testRuntimeComparison(
  records: readonly StepRecord[],
): TestRuntimeComparison | undefined {
  const goalStart = goalStartTestRuntimes(records);
  if (!goalStart) return undefined;
  const current = currentTestRuntimes(records, goalStart.seq) ?? null;
  if (!current) {
    return {
      goalStart,
      current: null,
      deltaMs: null,
      deltaPct: null,
      rows: [],
    };
  }
  const deltaMs = current.totalMs - goalStart.totalMs;
  const deltaPct =
    goalStart.totalMs > 0 ? (deltaMs / goalStart.totalMs) * 100 : null;
  return {
    goalStart,
    current,
    deltaMs,
    deltaPct,
    rows: buildComparisonRows(goalStart, current),
  };
}
