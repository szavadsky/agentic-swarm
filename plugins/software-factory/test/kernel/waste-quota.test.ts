/**
 * Quota stops: the pool stopped the turn before it landed work, so it is
 * reported apart from waste; a failed launch that landed work stays waste.
 */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { wasteAccounting } from "../../src/kernel/waste.js";
import { cause, rec, script, task } from "./helpers.js";
import { USAGE, outcome } from "./waste-accounting-fixtures.js";

const ROLE_BY_STEP = {
  implement: "implementer",
  review: "reviewer",
};

function roleOf(step: string): string {
  return ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step;
}

function pathOf(records: readonly StepRecord[], seq: number): string {
  const turn = records.find((record) => record.seq === seq)!;
  return `records/${recordDirName(turn.seq, turn)}`;
}

/**
 * Three quota stops that landed nothing, a quota stop that landed real work,
 * and the park a quota repeat would have named.
 */
function quotaStopRecords(): StepRecord[] {
  return [
    rec(1, {
      slug: "alpha",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      stop: {
        kind: "infra",
        cause: "quota",
        details: "Individual quota reached.",
      },
    }),
    rec(2, {
      slug: "bravo",
      step: "implement",
      alias: "implementer-b",
      usage: USAGE,
      stop: {
        kind: "infra",
        cause: "crash",
        details: "exit 1: You've hit your session limit · resets 2pm",
      },
    }),
    rec(3, {
      slug: "charlie",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      stop: {
        kind: "infra",
        cause: "unavailable",
        details:
          'alias "implementer" has no live tier: its quota pools are exhausted',
      },
    }),
    rec(4, {
      slug: "delta",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      edits: { files: 2, added: 4, removed: 1 },
      stop: {
        kind: "infra",
        cause: "quota",
        details: "quota reached during the outcome repair",
      },
    }),
    script(5, {
      slug: "alpha",
      step: "park",
      ok: true,
      cause: cause("infra-repeat: quota: quota pools are exhausted"),
    }),
  ];
}

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-waste-quota-"));
  return {
    root,
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
  };
}

/** Three no-work quota stops apart, the quota stop that landed work as waste. */
function reportsQuotaStopsApart(): void {
  const records = quotaStopRecords();
  const accounting = wasteAccounting({ records, roleOf });

  expect(accounting.quotaStops).toEqual([
    {
      record: pathOf(records, 1),
      role: "implementer",
      alias: "implementer",
      slug: "alpha",
      step: "implement",
      round: 1,
      detail: "infra: quota (Individual quota reached.)",
    },
    {
      record: pathOf(records, 2),
      role: "implementer",
      alias: "implementer-b",
      slug: "bravo",
      step: "implement",
      round: 1,
      detail:
        "infra: crash (exit 1: You've hit your session limit · resets 2pm)",
    },
    {
      record: pathOf(records, 3),
      role: "implementer",
      alias: "implementer",
      slug: "charlie",
      step: "implement",
      round: 1,
      detail:
        'infra: unavailable (alias "implementer" has no live tier: its quota pools are exhausted)',
    },
  ]);
  // The quota stop that landed work is still waste; the park naming a quota
  // stop does not re-add that turn as infra waste.
  expect(accounting.turns).toBe(1);
  expect(accounting.counts.structureInfra).toBe(1);
  expect(accounting.entries).toEqual([
    expect.objectContaining({
      reason: "structureInfra",
      record: pathOf(records, 4),
      detail: "infra: quota (quota reached during the outcome repair)",
    }),
  ]);
}

/** The same split survives the metrics file and the rendered summary. */
async function reportsQuotaStopsInMetricsAndSummary(): Promise<void> {
  const { root, store } = tempStore();
  try {
    await store.ensureLayout();
    const records = quotaStopRecords();
    await writeMetrics(store, {
      iteration: 1,
      status: "in-progress",
      records,
      roleByStep: ROLE_BY_STEP,
    });
    const metrics = yaml.parse(
      (await store.readFile("metrics.yaml"))!,
    ) as GoalMetrics;
    expect(
      metrics.iterations[0]!.waste.quotaStops.map((stop) => stop.record),
    ).toEqual([pathOf(records, 1), pathOf(records, 2), pathOf(records, 3)]);
    expect(metrics.totals.waste.quotaStops).toHaveLength(3);

    const tasks = [
      task("alpha"),
      task("bravo"),
      task("charlie"),
      task("delta"),
    ];
    await writeIterationSummary(store, {
      iteration: 1,
      state: derive(tasks, records),
      records,
      status: "in-progress",
      roleByStep: ROLE_BY_STEP,
    });
    const text = (await store.readFile("iterations/1/summary.md"))!;
    expect(text).toContain("- wasted turns: 1 of 4 agent turns");
    expect(text).toContain("- quota stops (reported apart, not waste): 3");
    expect(text).toContain(
      `${pathOf(records, 1)}: implementer/implementer (implement r1) — infra: quota (Individual quota reached.)`,
    );
    expect(text).toContain(
      `${pathOf(records, 2)}: implementer/implementer-b (implement r1) — infra: crash`,
    );
    expect(text).toContain(
      `${pathOf(records, 4)}: implementer/implementer (implement r1) — structure: infra`,
    );
    expect(text).not.toContain(
      `${pathOf(records, 1)}: implementer/implementer (implement r1) — structure: infra`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("waste quota split", () => {
  it("reports quota stops apart and keeps a failed launch with real work", () => {
    reportsQuotaStopsApart();
  });

  it("reports quota stops apart in the metrics and the summary", async () => {
    await reportsQuotaStopsInMetricsAndSummary();
  });
});
