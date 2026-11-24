import { describe, expect, it } from "bun:test";
import { recordDirName } from "../../src/kernel/store.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { wasteAccounting } from "../../src/kernel/waste.js";
import { rec, script } from "./helpers.js";
import { outcome } from "./waste-accounting-fixtures.js";

const ROLE_BY_STEP: Record<"implement" | "review", string> = {
  implement: "implementer",
  review: "reviewer",
};

function pathOf(records: readonly StepRecord[], seq: number): string {
  const turn = records.find((record) => record.seq === seq)!;
  return `records/${recordDirName(turn.seq, turn)}`;
}

type Answer = "replies" | "silent" | "code" | "none";

/** One turn of task `a`: the role from its step, the rest from the patch. */
function taskTurn(
  seq: number,
  step: keyof typeof ROLE_BY_STEP,
  round: number,
  patch: Partial<StepRecord>,
): StepRecord {
  return rec(seq, {
    slug: "a",
    step,
    round,
    alias: ROLE_BY_STEP[step],
    ...patch,
  });
}

/**
 * A task whose review asked for changes (seq 2), the answer it got (seq 3) and
 * the verdict that judged that answer (seq 4). An infra stop may sit between
 * the request and its answer.
 */
function changeRequestRecords(
  answer: Answer,
  verdict: "approve" | "changes" | "none",
  interrupted = false,
): StepRecord[] {
  const records = [
    taskTurn(1, "implement", 1, {
      edits: { files: 2, added: 10, removed: 1 },
      outcome: outcome(),
    }),
    taskTurn(2, "review", 1, {
      outcome: outcome({
        verdict: "changes",
        summary: "add a regression test",
      }),
    }),
  ];
  let seq = 3;
  if (interrupted) {
    records.push(
      taskTurn(seq++, "implement", 2, {
        stop: { kind: "infra", cause: "quota", details: "no capacity" },
      }),
    );
  }
  if (answer !== "none") {
    records.push(
      taskTurn(seq++, "implement", 2, {
        edits:
          answer === "code"
            ? { files: 1, added: 4, removed: 1 }
            : { files: 0, added: 0, removed: 0 },
        // A code answer usually replies too: the guard must reject it on edits.
        outcome: outcome(
          answer === "silent"
            ? {}
            : {
                replies: [
                  { finding: 1, reply: "the test already covers this" },
                ],
              },
        ),
      }),
    );
  }
  if (verdict !== "none") {
    records.push(
      taskTurn(seq, "review", 2, {
        outcome: outcome({
          verdict,
          summary: verdict === "approve" ? "the reply holds" : "still missing",
        }),
      }),
    );
  }
  return records;
}

function accountingOf(records: readonly StepRecord[]) {
  return wasteAccounting({
    records,
    roleOf: (step) => ROLE_BY_STEP[step as keyof typeof ROLE_BY_STEP] ?? step,
  });
}

function registerChangeRequestCases(): void {
  it("counts a change request answered by replies alone and then accepted", () => {
    const records = changeRequestRecords("replies", "approve");
    const accounting = accountingOf(records);
    expect(accounting.turns).toBe(0);
    expect(accounting.rebuttedReviews).toEqual([
      {
        record: pathOf(records, 2),
        role: "reviewer",
        alias: "reviewer",
        slug: "a",
        step: "review",
        round: 1,
        summary: "add a regression test",
      },
    ]);
  });

  it("does not count a change request answered with code and replies", () => {
    expect(
      accountingOf(changeRequestRecords("code", "approve")).rebuttedReviews,
    ).toEqual([]);
  });

  it("counts the rebuttal across an infra turn that delivered no outcome", () => {
    const accounting = accountingOf(
      changeRequestRecords("replies", "approve", true),
    );
    expect(accounting.rebuttedReviews).toHaveLength(1);
  });

  it("does not count a zero-diff answer that never replied", () => {
    expect(
      accountingOf(changeRequestRecords("silent", "approve")).rebuttedReviews,
    ).toEqual([]);
  });

  it("does not count a replies-only answer the next review still rejected", () => {
    expect(
      accountingOf(changeRequestRecords("replies", "changes")).rebuttedReviews,
    ).toEqual([]);
  });
}

function registerUnansweredAndBreachCases(): void {
  it("does not count a change request nothing answered", () => {
    expect(
      accountingOf(changeRequestRecords("none", "none")).rebuttedReviews,
    ).toEqual([]);
  });

  it("keeps a contract-breach park out of the rebutted count", () => {
    // A contract breach (changes on the last call) is not an accepted rebuttal:
    // the park names the review record and the protocol failure wins.
    const breach = script(5, {
      slug: "a",
      step: "park",
      round: 1,
      ok: true,
      cause: {
        kind: "invalid-outcome",
        detail: "review r1 changes on the last review call: too late",
      },
    });
    const records = [...changeRequestRecords("replies", "approve"), breach];
    const accounting = accountingOf(records);
    expect(accounting.rebuttedReviews).toEqual([]);
    expect(accounting.entries).toEqual([
      expect.objectContaining({
        reason: "structureProtocol",
        record: pathOf(records, 2),
        evidence: pathOf(records, 5),
      }),
    ]);
  });
}

describe("rebutted review accounting", () => {
  registerChangeRequestCases();
  registerUnansweredAndBreachCases();
});
