/** Shared plumbing for the friction-metrics tests: fixtures and record builders. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type {
  GoalMetrics,
  IterationMetrics,
  SteerLatency,
} from "../../src/kernel/metrics.js";
import { writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  CauseKind,
  StepRecord,
  SteerRoute,
  TaskFile,
} from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

export interface FixturePark {
  seq: number;
  slug: string;
  revision: number;
  cause: CauseKind;
  at: string;
}

export interface FixtureRoute {
  seq: number;
  at: string;
  entries: { steer: string; route: SteerRoute; answer?: string }[];
}

export interface FixtureTurn {
  seq: number;
  step: string;
  slug: string | null;
}

/** One implement turn: its measured edits, outcome and whether its ask resolved. */
export interface FixtureImplement {
  seq: number;
  slug: string;
  revision: number;
  files?: number;
  outcome?: "done" | "blocked" | "failed" | "upscope";
  /** A record that started and never settled. */
  unfinished?: boolean;
  resolved?: boolean;
  unresolved?: boolean;
}

export interface FixtureTask {
  slug: string;
  kind: TaskFile["kind"];
  revision: number;
}

export interface FullFixture {
  iteration: number;
  parks: FixturePark[];
  merges: { seq: number; slug: string; at: string }[];
  routes: FixtureRoute[];
  implement: FixtureImplement[];
  zeroEdit: FixtureTurn[];
  tasks: FixtureTask[];
  inbox: string[];
  processed: string[];
  expected: {
    parkRecords: number;
    distinctParkedSlugs: number;
    mergedTasks: number;
    byCause: Record<string, number>;
    landedUnchanged: number;
    landedAmended: number;
    landedUnknown: number;
    referenceRouteMinutes: number[];
    routeMinutes: number[];
    answerMinutes: number[];
    routeUnknown: number;
    answerUnknown: number;
    unanswered: number;
    zeroEdit: { reply: number; finding: number; noop: number };
    zeroEditParks: {
      parks: number;
      implementTurns: number;
      byCause: {
        failed: number;
        "invalid-outcome": number;
        "empty-diff": number;
      };
    };
    askRecoveries: { unfinished: number; rescue: number };
  };
}

/** The `full` goal's i1 friction facts, captured from its records. */
export function fullFixture(): FullFixture {
  const text = fs.readFileSync(
    path.join(import.meta.dir, "../fixtures/friction/full-i1.yaml"),
    "utf8",
  );
  return yaml.parse(text) as FullFixture;
}

/** A turn that committed nothing. */
export const zero = { files: 0, added: 0, removed: 0 };

/** A fixed stamp `seq` seconds into the fixture's first minute. */
export function stamp(seq: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
}

/** One settled park record; the patch names its cause and revision. */
export function parkRecord(
  seq: number,
  slug: string,
  patch: Partial<StepRecord> = {},
): StepRecord {
  return script(seq, {
    slug,
    step: "park",
    revision: 0,
    ok: true,
    startedAt: stamp(seq),
    endedAt: stamp(seq),
    cause: { kind: "failed", detail: "" },
    ...patch,
  });
}

/** One verified merge record. */
export function mergeRecord(seq: number, slug: string): StepRecord {
  return script(seq, {
    slug,
    step: "merge",
    ok: true,
    startedAt: stamp(seq),
    endedAt: stamp(seq),
  });
}

/** The PM's accepted steer routes, at one stamp. */
export function routeRecord(
  seq: number,
  at: string,
  entries: FixtureRoute["entries"],
): StepRecord {
  return script(seq, {
    step: "steer-routes",
    startedAt: at,
    endedAt: at,
    ok: true,
    outcome: {
      status: "done",
      summary: "steer routes",
      concerns: [],
      forward: [],
      steerRoutes: entries,
    },
  });
}

/** One architect turn that answers the steer it names. */
export function architectAnswer(
  seq: number,
  at: string,
  steer: string,
): StepRecord {
  return rec(seq, {
    step: "architect",
    slug: undefined,
    startedAt: at,
    endedAt: at,
    outcome: {
      status: "done",
      summary: "answered",
      concerns: [],
      forward: [],
      steerAnswers: [{ steer, answer: "done" }],
    },
  });
}

/** Round trip times to the minutes a reader sees. */
export function minutes(samples: readonly number[]): number[] {
  return samples
    .map((ms) => Number((ms / 60_000).toFixed(1)))
    .sort((a, b) => a - b);
}

/** Reads one iteration's metrics after a write. */
function readMetrics(text: string | null): {
  one: IterationMetrics;
  steers: SteerLatency;
} {
  const metrics = yaml.parse(text!) as GoalMetrics;
  return { one: metrics.iterations[0]!, steers: metrics.steers };
}

/**
 * Writes one record set and task files into a goal store, then returns the
 * iteration's metrics and the goal's steer latency.
 */
export async function written(
  records: StepRecord[],
  tasks: readonly TaskFile[],
): Promise<{ one: IterationMetrics; steers: SteerLatency }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-friction-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  try {
    await store.ensureLayout();
    for (const file of tasks) await store.tasks.write(file);
    await writeMetrics(store, {
      iteration: 1,
      status: "in-progress",
      records,
    });
    return readMetrics(await store.readFile("metrics.yaml"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** An inbox or processed steer dropped by `factory steer`. */
export async function steerFiles(
  store: ReturnType<typeof createFolderStore>,
  queue: "inbox" | "processed",
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    await store.mailbox.write(queue, `${id}.md`, `# Steer ${id}\n`);
  }
}

/** One goal store holding only the steers a latency test names. */
export async function steerStore(
  inbox: readonly string[],
  processed: readonly string[],
): Promise<{
  root: string;
  store: ReturnType<typeof createFolderStore>;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-friction-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  await store.ensureLayout();
  await steerFiles(store, "inbox", inbox);
  await steerFiles(store, "processed", processed);
  return { root, store };
}

/** The goal's steer latency after a metrics write. */
export async function steersWritten(
  store: ReturnType<typeof createFolderStore>,
  records: StepRecord[],
): Promise<SteerLatency> {
  await writeMetrics(store, { iteration: 1, status: "in-progress", records });
  return readMetrics(await store.readFile("metrics.yaml")).steers;
}

/** The task files a replay writes so the park landings can read their revision. */
export function fixtureTasks(fixture: FullFixture): TaskFile[] {
  return fixture.tasks.map((entry) =>
    task(entry.slug, { kind: entry.kind, revision: entry.revision }),
  );
}
