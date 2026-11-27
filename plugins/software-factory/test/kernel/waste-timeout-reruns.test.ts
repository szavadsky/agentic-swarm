import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { CheckResult } from "../../src/core/checks/types.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { cause, rec, script } from "./helpers.js";
import { check, outcome, USAGE } from "./waste-accounting-fixtures.js";

function pathOf(records: readonly StepRecord[], seq: number): string {
  const turn = records.find((record) => record.seq === seq)!;
  return `records/${recordDirName(turn.seq, turn)}`;
}

/** A gate whose only red is a wall timeout: it never judged the tree. */
function timedOutChecks(): CheckResult[] {
  return [
    {
      name: "tests",
      ok: false,
      summary: "timed out after 300s",
      output: "",
      fingerprint: "tests",
      details: { kind: "infra" },
    },
  ];
}

/** A real red beside an infra red: the gate did judge a failure of its own. */
function mixedChecks(): CheckResult[] {
  return [...timedOutChecks(), check("schema-validation", false)];
}

/** A productive implement turn: nothing but the park can charge it as waste. */
function implemented(seq: number, slug: string, iteration = 1): StepRecord {
  return rec(seq, {
    iteration,
    slug,
    step: "implement",
    round: 1,
    alias: "implementer",
    usage: USAGE,
    edits: { files: 2, added: 6, removed: 1 },
    outcome: outcome(),
  });
}

/**
 * Two parks an infra fault caused (a gate timeout and an infra cause reported
 * as a merge failure) and one real gate rejection, then the turns that re-ran
 * all three tasks in the next iteration.
 */
function timeoutParkRecords(): StepRecord[] {
  return [
    // alpha: the task checks timed out and the park blames the gate wall.
    implemented(1, "alpha"),
    script(2, {
      slug: "alpha",
      step: "checks",
      round: 1,
      ok: false,
      checks: timedOutChecks(),
    }),
    script(3, {
      slug: "alpha",
      step: "park",
      round: 1,
      ok: true,
      cause: cause("infra: gate could not start: tests"),
    }),
    // bravo: the merge checks timed out, then the merge's infra cause was
    // reported as a merge failure — an infra-misjudged rejection.
    implemented(4, "bravo"),
    script(5, {
      slug: "bravo",
      step: "merge-checks",
      round: 1,
      ok: false,
      checks: timedOutChecks(),
    }),
    script(6, {
      slug: "bravo",
      step: "merge",
      round: 1,
      ok: false,
      cause: cause("infra: gate could not start: tests"),
      checks: timedOutChecks(),
    }),
    script(7, {
      slug: "bravo",
      step: "park",
      round: 1,
      ok: true,
      cause: {
        kind: "merge-failed",
        detail: "infra: gate could not start: tests",
      },
    }),
    // charlie: a real red gate rejected the turn, so the re-run is no waste.
    implemented(8, "charlie"),
    script(9, {
      slug: "charlie",
      step: "checks",
      round: 1,
      ok: false,
      checks: [check("tests", false)],
    }),
    script(10, {
      slug: "charlie",
      step: "park",
      round: 1,
      ok: true,
      cause: cause("gates: tests"),
    }),
    // delta: the gate timed out and also judged a real red, so its park was a
    // rejection the gate reached.
    implemented(15, "delta"),
    script(16, {
      slug: "delta",
      step: "merge-checks",
      round: 1,
      ok: false,
      checks: mixedChecks(),
    }),
    script(17, {
      slug: "delta",
      step: "park",
      round: 1,
      ok: true,
      cause: cause("gates: schema-validation"),
    }),
    // The next iteration re-runs every parked task.
    implemented(11, "alpha", 2),
    script(12, {
      iteration: 2,
      slug: "alpha",
      step: "checks",
      round: 1,
      ok: true,
      checks: [check("tests", true)],
    }),
    implemented(13, "bravo", 2),
    implemented(14, "charlie", 2),
    // delta's re-run is not infra waste: the gate reached a red of its own.
    implemented(18, "delta", 2),
  ];
}

describe("waste for infra-caused re-runs", () => {
  it("counts a gate-timeout and an infra-misjudged re-run as incorrect rejections", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-waste-rerun-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = timeoutParkRecords();
      await writeMetrics(store, {
        iteration: 2,
        status: "in-progress",
        records,
        roleByStep: { implement: "implementer" },
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      const one = metrics.iterations.find((iteration) => iteration.n === 1)!;
      const two = metrics.iterations.find((iteration) => iteration.n === 2)!;

      // The parked turns stay structure: infra; the fault is not the author's.
      expect(one.waste.counts).toMatchObject({
        structureInfra: 1,
        implementerFailure: 2,
        incorrectRejection: 0,
      });

      expect(two.waste.counts.incorrectRejection).toBe(2);
      expect(two.waste.turns).toBe(2);
      expect(two.waste.entries).toEqual([
        expect.objectContaining({
          reason: "incorrectRejection",
          record: pathOf(records, 11),
          evidence: pathOf(records, 3),
          detail: expect.stringContaining("re-ran after a gate timeout"),
        }),
        expect.objectContaining({
          reason: "incorrectRejection",
          record: pathOf(records, 13),
          evidence: pathOf(records, 7),
          detail: expect.stringContaining(
            "re-ran after an infra-misjudged rejection",
          ),
        }),
      ]);
      // A gate that judged a real red, alone or beside an infra red, rejects on
      // its own red: those re-runs are the author's work, not infra waste.
      expect(
        two.waste.entries.some((entry) =>
          ["charlie", "delta"].includes(entry.slug!),
        ),
      ).toBe(false);
      expect(two.roles.implementer!.waste.incorrectRejection).toBe(2);
      expect(metrics.totals.waste.counts.incorrectRejection).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
