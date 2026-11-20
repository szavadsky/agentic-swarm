import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { CheckResult } from "../../src/core/checks/types.js";
import type { Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { RecordedOutcome, StepRecord } from "../../src/kernel/types.js";
import { wasteAccounting } from "../../src/kernel/waste.js";
import { summaryWaste } from "../../src/kernel/waste-summary.js";
import { cause, rec, script, task } from "./helpers.js";
import {
  check,
  deliveredFallbackRecords,
  outcome,
  redThenRealFixRecords,
  redZeroDiffFixRecords,
  USAGE,
} from "./waste-accounting-fixtures.js";

function pathOf(records: readonly StepRecord[], seq: number): string {
  const turn = records.find((record) => record.seq === seq)!;
  return `records/${recordDirName(turn.seq, turn)}`;
}

/** One record per waste reason, both rebuttal kinds and two clean turns. */
function wasteRecords(): StepRecord[] {
  return [
    ...failedImplementationRecords(),
    ...containmentAndInfraRecords(),
    ...checksAndFallbackRecords(),
    ...reviewRecords(),
  ];
}

/** A failed implement turn, a refusal, and the turn that broke containment. */
function failedImplementationRecords(): StepRecord[] {
  return [
    rec(1, {
      slug: "alpha",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      outcome: outcome({ status: "failed", summary: "nothing landed" }),
    }),
    rec(2, {
      slug: "bravo",
      step: "implement",
      alias: "implementer-b",
      usage: USAGE,
      stop: { kind: "refusal", details: "declined" },
    }),
    rec(3, {
      slug: "charlie",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      edits: { files: 2, added: 4, removed: 0 },
      outcome: outcome(),
    }),
  ];
}

/** The containment park that proves the breach, an escalated repair, and an infra stop. */
function containmentAndInfraRecords(): StepRecord[] {
  return [
    script(4, {
      slug: "charlie",
      step: "park",
      ok: true,
      cause: cause(
        "containment: goal artifacts changed outside the worktree: created finish/x/report.md",
      ),
    }),
    rec(5, {
      slug: "delta",
      step: "implement",
      alias: "escalated",
      usage: USAGE,
      repairFindings: ["no outcome written to the outcome path"],
      repairFindingsResolved: true,
      outcome: outcome(),
    }),
    rec(6, {
      slug: "echo",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      stop: { kind: "infra", cause: "network", details: "ECONNRESET" },
    }),
  ];
}

/** Red checks, a zero-diff fix, a green rerun, and a round-2 stall parked as empty-diff. */
function checksAndFallbackRecords(): StepRecord[] {
  return [
    script(7, {
      slug: "foxtrot",
      step: "checks",
      ok: false,
      checks: [check("tests", false)],
    }),
    rec(8, {
      slug: "foxtrot",
      step: "implement",
      alias: "implementer",
      usage: USAGE,
      edits: { files: 0, added: 0, removed: 0 },
      outcome: outcome({ summary: "nothing to fix" }),
    }),
    script(9, {
      slug: "foxtrot",
      step: "checks",
      ok: true,
      checks: [check("tests", true)],
    }),
    rec(10, {
      slug: "golf",
      step: "implement",
      round: 2,
      alias: "implementer",
      usage: USAGE,
      edits: { files: 0, added: 0, removed: 0 },
      outcome: outcome({ summary: "still nothing" }),
    }),
    script(11, {
      slug: "golf",
      step: "park",
      round: 2,
      ok: true,
      cause: cause("empty-diff: implement r2 committed no changes"),
    }),
  ];
}

/** The rebutted review and a clean approval on the next round. */
function reviewRecords(): StepRecord[] {
  return [
    rec(12, {
      slug: "alpha",
      step: "review",
      alias: "reviewer",
      usage: USAGE,
      outcome: outcome({ verdict: "changes", summary: "needs a test" }),
    }),
    rec(13, {
      slug: "bravo",
      step: "review",
      round: 2,
      alias: "reviewer",
      usage: USAGE,
      outcome: outcome({ verdict: "approve", summary: "fine" }),
    }),
  ];
}

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-waste-"));
  return {
    root,
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
  };
}

const ROLE_BY_STEP = {
  implement: "implementer",
  review: "reviewer",
};

describe("waste accounting", () => {
  registerWasteAccountingPart1();
  registerWasteAccountingPart2();
  registerWasteAccountingPart3();
  registerWasteAccountingPart4();
});

async function countsEachReasonPerRoleAliasNamesPart1(
  store: ReturnType<typeof tempStore>["store"],
) {
  await store.ensureLayout();
  const records = wasteRecords();
  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    roleByStep: ROLE_BY_STEP,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;

  expect(one.waste.turns).toBe(7);
  expect(one.waste.counts).toEqual({
    implementerFailure: 2,
    structureProtocol: 1,
    structureContainment: 1,
    structureOutcomeChannel: 1,
    structureInfra: 1,
    flakyTestRejection: 1,
  });
  expect(
    one.waste.entries.map((entry) => [entry.reason, entry.record]),
  ).toEqual([
    ["implementerFailure", pathOf(records, 1)],
    ["structureProtocol", pathOf(records, 2)],
    ["structureContainment", pathOf(records, 3)],
    ["structureOutcomeChannel", pathOf(records, 5)],
    ["structureInfra", pathOf(records, 6)],
    ["flakyTestRejection", pathOf(records, 8)],
    ["implementerFailure", pathOf(records, 10)],
  ]);
  // The park is the proof for the turn it ended, not a wasted turn itself.
  expect(one.waste.entries[2]!.evidence).toBe(pathOf(records, 4));

  return { records, metrics, one };
}

async function countsEachReasonPerRoleAliasNamesPart2(
  store: ReturnType<typeof tempStore>["store"],
  scope: Awaited<ReturnType<typeof countsEachReasonPerRoleAliasNamesPart1>>,
) {
  const { one, records, metrics } = scope;
  expect(one.waste.rebuttedReviews).toEqual([
    {
      record: pathOf(records, 12),
      role: "reviewer",
      alias: "reviewer",
      slug: "alpha",
      step: "review",
      round: 1,
      summary: "needs a test",
    },
  ]);

  expect(one.roles.implementer!.waste).toEqual({
    implementerFailure: 2,
    structureProtocol: 1,
    structureContainment: 1,
    structureOutcomeChannel: 1,
    structureInfra: 1,
    flakyTestRejection: 1,
  });
  expect(one.roles.implementer!.rebuttedReviews).toBe(0);
  expect(one.roles.reviewer!.waste.implementerFailure).toBe(0);
  expect(one.roles.reviewer!.rebuttedReviews).toBe(1);
  expect(one.aliases["implementer-b"]!.waste.structureProtocol).toBe(1);
  expect(one.aliases.escalated!.waste.structureOutcomeChannel).toBe(1);
  expect(one.aliases.reviewer!.rebuttedReviews).toBe(1);
  expect(metrics.totals.waste).toEqual(one.waste);

  const tasks = [
    task("alpha"),
    task("bravo"),
    task("charlie"),
    task("delta"),
    task("echo"),
    task("foxtrot"),
    task("golf"),
  ];
  await writeIterationSummary(store, {
    iteration: 1,
    state: derive(tasks, records),
    records,
    status: "in-progress",
    roleByStep: ROLE_BY_STEP,
  });
}

async function countsEachReasonPerRoleAliasNamesPart3(
  store: ReturnType<typeof tempStore>["store"],
  scope: Awaited<ReturnType<typeof countsEachReasonPerRoleAliasNamesPart1>>,
) {
  const { records } = scope;
  const text = (await store.readFile("iterations/1/summary.md"))!;
  expect(text).toContain("## Waste");
  expect(text).toContain("- wasted turns: 7 of 9 agent turns");
  expect(text).toContain("- by reason:");
  expect(text).toContain("  - complete implementer failure: 2");
  expect(text).toContain("  - structure: protocol: 1");
  expect(text).toContain("  - structure: containment: 1");
  expect(text).toContain("  - structure: outcome channel: 1");
  expect(text).toContain("  - structure: infra: 1");
  expect(text).toContain("  - flaky-test rejection: 1");
  expect(text).toContain(
    `${pathOf(records, 1)}: implementer/implementer (implement r1) — complete implementer failure — outcome failed: nothing landed`,
  );
  expect(text).toContain(
    `${pathOf(records, 3)}: implementer/implementer (implement r1) — structure: containment — containment: goal artifacts changed`,
  );
  expect(text).toContain(
    `${pathOf(records, 3)}: implementer/implementer (implement r1) — structure: containment — containment: goal artifacts changed outside the worktree: created finish/x/report.md; evidence ${pathOf(records, 4)}`,
  );
  expect(text).toContain(
    `${pathOf(records, 6)}: implementer/implementer (implement r1) — structure: infra — infra: network (ECONNRESET)`,
  );
  expect(text).toContain(
    `${pathOf(records, 8)}: implementer/implementer (implement r1) — flaky-test rejection — fixed nothing after red checks; the same tree passed checks`,
  );
  expect(text).toContain(
    `${pathOf(records, 10)}: implementer/implementer (implement r2) — complete implementer failure — empty-diff: implement r2 committed no changes`,
  );
  expect(text).toContain("- rebutted reviews (accepted tax, not waste): 1");
  expect(text).toContain(
    `${pathOf(records, 12)}: reviewer/reviewer (review r1) — changes: needs a test`,
  );
  expect(text).toContain("| implementer | 7 | 0 |");
  expect(text).toContain("| reviewer | 0 | 1 | none |");
  expect(summaryWaste(text)).toContain(pathOf(records, 1));
}

function registerWasteAccountingPart1(): void {
  it("counts each reason per role and alias and names every record", async () => {
    const { root, store } = tempStore();
    try {
      const scope1 = await countsEachReasonPerRoleAliasNamesPart1(store);
      await countsEachReasonPerRoleAliasNamesPart2(store, scope1);
      await countsEachReasonPerRoleAliasNamesPart3(store, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerWasteAccountingPart2(): void {
  it("separates a complete fix failure from a flaky red and a delivered fallback", () => {
    const records = [
      ...redZeroDiffFixRecords(),
      ...redThenRealFixRecords(),
      ...deliveredFallbackRecords(),
    ];
    const accounting = wasteAccounting({
      records,
      roleOf: (step) => ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step,
    });
    expect(accounting.turns).toBe(1);
    expect(accounting.counts.implementerFailure).toBe(1);
    expect(accounting.counts.flakyTestRejection).toBe(0);
    expect(accounting.entries[0]).toMatchObject({
      reason: "implementerFailure",
      record: pathOf(records, 2),
      detail: expect.stringContaining("next checks stayed red"),
    });
    expect(accounting.rebuttedReviews).toEqual([]);
  });
}

function registerWasteAccountingPart3(): void {
  it("treats a zero-diff merge-gate fix as flaky when merge checks later pass", () => {
    const records = [
      script(1, {
        slug: "a",
        step: "merge-checks",
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
        ok: true,
        checks: [check("tests", true)],
      }),
      script(4, {
        slug: "a",
        step: "merge-checks",
        round: 1,
        ok: true,
        checks: [check("tests", true)],
      }),
    ];
    const accounting = wasteAccounting({
      records,
      roleOf: (step) => ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step,
    });
    expect(accounting.counts.flakyTestRejection).toBe(1);
    expect(accounting.entries[0]).toMatchObject({
      reason: "flakyTestRejection",
      record: pathOf(records, 2),
      evidence: pathOf(records, 4),
      detail: expect.stringContaining("red merge-checks"),
    });
  });
}

function registerWasteAccountingPart4(): void {
  it("never counts a review's accepted change request as waste", () => {
    const review = rec(2, {
      slug: "a",
      step: "review",
      round: 1,
      alias: "reviewer",
      outcome: outcome({
        verdict: "changes",
        summary: "add a regression test",
      }),
    });
    const records = [
      rec(1, {
        slug: "a",
        step: "implement",
        round: 1,
        alias: "implementer",
        edits: { files: 2, added: 10, removed: 1 },
        outcome: outcome(),
      }),
      review,
    ];
    const accounting = wasteAccounting({
      records,
      roleOf: (step) => ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step,
    });
    expect(accounting.turns).toBe(0);
    expect(accounting.rebuttedReviews).toHaveLength(1);
    expect(accounting.rebuttedReviews[0]!.record).toBe(pathOf(records, 2));

    // A contract breach (changes on the last call) is not an accepted rebuttal:
    // the park names the review record and the protocol failure wins.
    const breach = script(3, {
      slug: "a",
      step: "park",
      round: 1,
      ok: true,
      cause: {
        kind: "invalid-outcome",
        detail: "changes on the last review call: too late",
      },
    });
    const breached = wasteAccounting({
      records: [...records, breach],
      roleOf: (step) => ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step,
    });
    expect(breached.rebuttedReviews).toEqual([]);
    expect(breached.entries).toEqual([
      expect.objectContaining({
        reason: "structureProtocol",
        record: pathOf(records, 2),
        evidence: pathOf([...records, breach], 3),
      }),
    ]);
  });
}
