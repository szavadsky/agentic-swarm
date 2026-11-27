/** Per-test runtime snapshots and goal-start versus current comparisons. */

/** Passing per-test runtimes extracted from one recorded CTRF/JUnit gate run. */
export interface TestRuntimeRun {
  seq: number;
  iteration: number;
  step: string;
  /** Sum of recorded passing test durations in milliseconds. */
  totalMs: number;
  /** Number of passing tests with recorded runtimes. */
  testCount: number;
  /** Per-test duration in milliseconds, keyed by normalized test label. */
  tests: Record<string, number>;
}

/** One test row in the current-vs-goal-start comparison. */
export interface TestRuntimeDelta {
  name: string;
  goalStartMs: number | null;
  currentMs: number | null;
  deltaMs: number | null;
}

/** Goal-start versus current CTRF runtime comparison for the architect pack. */
export interface TestRuntimeComparison {
  goalStart: TestRuntimeRun;
  current: TestRuntimeRun | null;
  deltaMs: number | null;
  deltaPct: number | null;
  rows: TestRuntimeDelta[];
}
