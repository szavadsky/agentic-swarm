/** The `full` i1 replay: parks, steer latency, zero-edit turn split, park rate and ask recovery. */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type {
  GoalMetrics,
  ParkMetrics,
  SteerLatency,
} from "../../src/kernel/metrics.js";
import { writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type {
  State,
  StepRecord,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import {
  type FullFixture,
  fixtureTasks,
  fullFixture,
  minutes,
  routeRecord,
} from "./friction-metrics-helpers.js";
import { rec, script } from "./helpers.js";

/** The fixture's implement turns as records, with the facts the park rate reads. */
function fixtureImplementRecords(fixture: FullFixture): StepRecord[] {
  return fixture.implement.map((turn) =>
    rec(turn.seq, {
      step: "implement",
      slug: turn.slug,
      revision: turn.revision,
      ...(turn.unfinished ? { endedAt: undefined } : {}),
      ...(turn.files === undefined
        ? {}
        : { edits: { files: turn.files, added: 0, removed: 0 } }),
      ...(turn.outcome === undefined
        ? {}
        : {
            outcome: {
              status: turn.outcome,
              summary: "",
              concerns: [],
              forward: [],
            },
          }),
      ...(turn.resolved ? { repairFindingsResolved: true } : {}),
      ...(turn.unresolved
        ? { repairFindings: ["no outcome after repair"] }
        : {}),
    }),
  );
}

/** One fixture park, merge, route, implement or zero-edit turn as the record it was. */
function fixtureRecords(fixture: FullFixture): StepRecord[] {
  return [
    ...fixture.parks.map((park) =>
      script(park.seq, {
        slug: park.slug,
        step: "park",
        revision: park.revision,
        startedAt: park.at,
        endedAt: park.at,
        ok: true,
        cause: { kind: park.cause, detail: "" },
      }),
    ),
    ...fixture.merges.map((merge) =>
      script(merge.seq, {
        slug: merge.slug,
        step: "merge",
        startedAt: merge.at,
        endedAt: merge.at,
        ok: true,
      }),
    ),
    ...fixture.routes.map((route) =>
      routeRecord(route.seq, route.at, route.entries),
    ),
    ...fixtureImplementRecords(fixture),
    ...fixture.zeroEdit.map((turn) =>
      rec(turn.seq, {
        step: turn.step,
        slug: turn.slug ?? undefined,
        edits: { files: 0, added: 0, removed: 0 },
      }),
    ),
  ];
}

/** The derived state the summary reads: parked at the park, merged when landed. */
function fixtureState(fixture: FullFixture, tasks: readonly TaskFile[]): State {
  const parked = new Set(fixture.parks.map((park) => park.slug));
  const merged = new Set(fixture.merges.map((merge) => merge.slug));
  const entries: Record<string, TaskState> = {};
  for (const file of tasks) {
    if (!parked.has(file.slug)) continue;
    entries[file.slug] = {
      status: merged.has(file.slug) ? "merged" : "parked",
      turns: 1,
      round: 1,
      kind: file.kind,
      flow: file.flow,
      phase: "merge",
    };
  }
  return {
    goal: "active",
    iteration: 1,
    terminal: false,
    interrupted: false,
    tasks: entries,
    epics: {},
  };
}

/** Asserts the replay's park figures against the reference. */
function expectParkFigures(
  parks: ParkMetrics,
  expected: FullFixture["expected"],
): void {
  expect(parks.records).toBe(expected.parkRecords);
  expect(parks.distinctSlugs).toBe(expected.distinctParkedSlugs);
  expect(parks.mergedSlugs).toBe(expected.mergedTasks);
  expect(parks.byCause).toEqual(expected.byCause);
  expect(parks.perMergedTask).toBeCloseTo(
    expected.parkRecords / expected.mergedTasks,
    10,
  );
  expect(parks.landedUnchanged).toBe(expected.landedUnchanged);
  expect(parks.landedAmended).toBe(expected.landedAmended);
  expect(parks.landedUnknown).toBe(expected.landedUnknown);
}

/** Asserts the replay's steer legs; the plan's three route figures are inside. */
function expectSteerFigures(
  steers: SteerLatency,
  expected: FullFixture["expected"],
): void {
  // The plan's reference names the three inbox routes; the mailbox also holds
  // a processed steer the same PM record routed.
  const routed = minutes(steers.route.samplesMs);
  expect(routed).toEqual(expected.routeMinutes);
  for (const value of expected.referenceRouteMinutes) {
    expect(routed).toContain(value);
  }
  expect(minutes(steers.answer.samplesMs)).toEqual(expected.answerMinutes);
  expect(steers.route.unknown).toBe(expected.routeUnknown);
  expect(steers.answer.unknown).toBe(expected.answerUnknown);
  expect(steers.unanswered).toBe(expected.unanswered);
}

/** Asserts the replay summary renders the figures a reader can check. */
function expectSummaryText(summary: string): void {
  expect(summary).toContain(
    "- park records: 43 over 37 slugs; 27 merged tasks; 1.59 park records per merged task",
  );
  expect(summary).toContain("empty-diff 23 (0.85/merged)");
  expect(summary).toContain(
    "- landed unchanged: 0; amended first: 9; unknown: 0",
  );
  expect(summary).toContain(
    "- zero-edit turns: 170 (reply 103, finding 7, no-op 60)",
  );
  expect(summary).toContain(
    "- zero-edit parks: 33 of 154 implement turns (21.4%); failed 8, invalid outcome 2, empty-diff 23",
  );
  expect(summary).toContain("- ask recoveries: unfinished 0, rescue 0");
  expect(summary).toContain("- steers: 7; unanswered: 4");
  expect(summary).toContain(
    "- drop to PM route: median 11.4 min, worst 12.9 min over 4 steers; unknown 2",
  );
  expect(summary).toContain(
    "- drop to final answer: median 12.9 min, worst 12.9 min over 1 steer; unknown 2",
  );
}

/** Writes the fixture's mailbox and task files so both writes can read them. */
async function seedFixture(
  store: ReturnType<typeof createFolderStore>,
  fixture: FullFixture,
): Promise<TaskFile[]> {
  const tasks = fixtureTasks(fixture);
  for (const file of tasks) await store.tasks.write(file);
  for (const id of fixture.inbox) {
    await store.mailbox.write("inbox", `${id}.md`, `# Steer ${id}\n`);
  }
  for (const id of fixture.processed) {
    await store.mailbox.write("processed", `${id}.md`, `# Steer ${id}\n`);
  }
  return tasks;
}

describe("friction metrics replay", () => {
  it("reproduces the `full` i1 park, steer and zero-edit figures", async () => {
    const fixture = fullFixture();
    const records = fixtureRecords(fixture);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-friction-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = await seedFixture(store, fixture);
      await writeMetrics(store, {
        iteration: fixture.iteration,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations[0]!;
      expectParkFigures(one.parks, fixture.expected);
      expect(one.zeroEdit).toEqual(fixture.expected.zeroEdit);
      const zeroEditParks = fixture.expected.zeroEditParks;
      expect(one.zeroEditParks.parks).toBe(zeroEditParks.parks);
      expect(one.zeroEditParks.implementTurns).toBe(
        zeroEditParks.implementTurns,
      );
      expect(one.zeroEditParks.rate).toBeCloseTo(
        zeroEditParks.parks / zeroEditParks.implementTurns,
        10,
      );
      expect(one.zeroEditParks.byCause).toEqual(zeroEditParks.byCause);
      expect(one.askRecoveries).toEqual(fixture.expected.askRecoveries);
      expectSteerFigures(metrics.steers, fixture.expected);

      await writeIterationSummary(store, {
        iteration: fixture.iteration,
        state: fixtureState(fixture, tasks),
        records,
      });
      expectSummaryText((await store.readFile("iterations/1/summary.md"))!);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
