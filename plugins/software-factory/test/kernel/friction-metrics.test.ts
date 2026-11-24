/** Friction-metrics edges: the park unit, park landings, steer legs, zero-edit. */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import {
  architectAnswer,
  mergeRecord,
  minutes,
  parkRecord,
  routeRecord,
  steerStore,
  steersWritten,
  written,
  zero,
} from "./friction-metrics-helpers.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const EDITED = { files: 1, added: 1, removed: 0 };

/** One implement turn; a zero-edit diff unless the patch overrides it. */
function implement(
  seq: number,
  slug: string,
  patch: Partial<StepRecord> = {},
): StepRecord {
  return rec(seq, { step: "implement", slug, edits: zero, ...patch });
}

function doneOutcome() {
  return {
    status: "done" as const,
    summary: "done",
    concerns: [],
    forward: [],
  };
}

function failedOutcome() {
  return {
    status: "failed" as const,
    summary: "no work",
    concerns: [],
    forward: [],
  };
}

function registerParkUnits(): void {
  it("counts every park record and every distinct slug, landing tasks included", async () => {
    const { one } = await written(
      [
        parkRecord(1, "a", { cause: { kind: "empty-diff", detail: "" } }),
        parkRecord(2, "a", { revision: 1 }),
        parkRecord(3, "b-land"),
        mergeRecord(4, "a"),
      ],
      [task("a", { revision: 1 })],
    );
    expect(one.parks.records).toBe(3);
    expect(one.parks.distinctSlugs).toBe(2);
    expect(one.parks.mergedSlugs).toBe(1);
    expect(one.parks.perMergedTask).toBe(3);
    expect(one.parks.byCause).toEqual({ "empty-diff": 1, failed: 2 });
    // The last park was revision 1 and the task file still carries it.
    expect(one.parks.landedUnchanged).toBe(1);
    expect(one.parks.landedAmended).toBe(0);
    expect(one.parks.landedUnknown).toBe(0);
  });

  it("reports no rate when nothing merged", async () => {
    const { one } = await written([parkRecord(1, "a")], [task("a")]);
    expect(one.parks.perMergedTask).toBeNull();
    expect(one.parks.mergedSlugs).toBe(0);
  });
}

function registerParkLandings(): void {
  it("counts a landing after an amendment apart, and a missing task file unknown", async () => {
    const { one } = await written(
      [
        parkRecord(1, "amended"),
        mergeRecord(2, "amended"),
        parkRecord(3, "unreadable", { revision: 1 }),
        mergeRecord(4, "unreadable"),
      ],
      [task("amended", { revision: 1 })],
    );
    expect(one.parks.landedUnchanged).toBe(0);
    expect(one.parks.landedAmended).toBe(1);
    expect(one.parks.landedUnknown).toBe(1);
  });

  it("does not land a slug whose only merge came before its park", async () => {
    const { one } = await written(
      [mergeRecord(1, "a"), parkRecord(2, "a")],
      [task("a")],
    );
    expect(one.parks.landedUnchanged).toBe(0);
    expect(one.parks.landedAmended).toBe(0);
    expect(one.parks.landedUnknown).toBe(0);
  });
}

function registerSteerLatency(): void {
  it("times both legs, counts unanswered steers and never times a missing stamp", async () => {
    const routed = "20260101T000000000Z-aaaa1111";
    const answered = "20260101T000000000Z-bbbb2222";
    const records = [
      routeRecord(1, "2026-01-01T00:10:00.000Z", [
        { steer: routed, route: "task", answer: "planned" },
      ]),
      architectAnswer(2, "2026-01-01T00:20:00.000Z", answered),
    ];
    const { root, store } = await steerStore(
      // No drop stamp: its route cannot be timed and it still waits.
      ["20260101T000000000Z-cccc3333", "operator-note"],
      [
        routed,
        answered,
        // Answered before the run: its answer has no record, so it is unknown.
        "20260101T000000000Z-dddd4444",
      ],
    );
    try {
      const steers = await steersWritten(store, records);
      expect(steers.steers).toBe(5);
      // aaaa was routed and answered 10 minutes after the drop.
      expect(minutes(steers.route.samplesMs)).toEqual([10]);
      // aaaa answered at its route; bbbb answered after 20 minutes.
      expect(minutes(steers.answer.samplesMs)).toEqual([10, 20]);
      // cccc and operator-note wait in the inbox for a route and an answer.
      expect(steers.unanswered).toBe(2);
      // bbbb and dddd left the inbox with no recorded route.
      expect(steers.route.unknown).toBe(2);
      // dddd was answered with no stamp on record.
      expect(steers.answer.unknown).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not time a route that landed before the steer's drop stamp", async () => {
    const records = [
      routeRecord(1, "2026-01-01T00:05:00.000Z", [
        { steer: "20260101T001000000Z-eeee5555", route: "task" },
      ]),
    ];
    const { root, store } = await steerStore(
      ["20260101T001000000Z-eeee5555"],
      [],
    );
    try {
      const steers = await steersWritten(store, records);
      expect(steers.route.samplesMs).toEqual([]);
      expect(steers.route.unknown).toBe(1);
      expect(steers.unanswered).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function zeroEditParkRateRecords(): StepRecord[] {
  return [
    // A failed park whose turn sent an ask and never resolved it.
    implement(1, "unresolved", {
      asks: ["outcome"],
      repairFindings: ["no outcome after repair"],
    }),
    parkRecord(2, "unresolved"),
    // A park already typed invalid-outcome.
    implement(3, "invalid-kind"),
    parkRecord(4, "invalid-kind", {
      cause: { kind: "invalid-outcome", detail: "" },
    }),
    // An honest failed answer with no ask.
    implement(5, "reported", { outcome: failedOutcome() }),
    parkRecord(6, "reported"),
    // A failed park whose turn made edits is not in the numerator.
    implement(7, "edited", {
      edits: { files: 2, added: 4, removed: 1 },
      outcome: failedOutcome(),
    }),
    parkRecord(8, "edited"),
    // An empty-diff park after a zero-edit done turn.
    implement(9, "empty", { outcome: doneOutcome() }),
    parkRecord(10, "empty", { cause: { kind: "empty-diff", detail: "" } }),
    // No implement turn before the park: it counts nowhere.
    parkRecord(11, "orphan"),
    // An implement turn after the park is not the park's last turn.
    parkRecord(12, "after"),
    implement(13, "after"),
    // A turn measured with no diff is not a zero-edit fact.
    implement(14, "unmeasured", { edits: undefined }),
    parkRecord(15, "unmeasured"),
    // A cause the rate leaves out.
    implement(16, "upscoped", {
      outcome: {
        status: "upscope",
        summary: "different seam",
        concerns: [],
        forward: [],
      },
    }),
    parkRecord(17, "upscoped", { cause: { kind: "upscope", detail: "" } }),
  ];
}

function registerZeroEditParkRate(): void {
  it("counts failed, invalid-outcome and empty-diff parks after a zero-edit implement turn", async () => {
    const { one } = await written(zeroEditParkRateRecords(), []);
    expect(one.zeroEditParks).toEqual({
      parks: 4,
      implementTurns: 8,
      rate: 0.5,
      byCause: { failed: 1, "invalid-outcome": 2, "empty-diff": 1 },
    });
  });

  it("reports no rate when no implement turn ran, and a lone park counts nowhere", async () => {
    const { one } = await written([parkRecord(1, "orphan")], []);
    expect(one.zeroEditParks).toEqual({
      parks: 0,
      implementTurns: 0,
      rate: null,
      byCause: { failed: 0, "invalid-outcome": 0, "empty-diff": 0 },
    });
  });

  it("does not credit a park to an implement turn from an earlier revision", async () => {
    const { one } = await written(
      [
        implement(1, "revised", { revision: 0 }),
        parkRecord(2, "revised", { revision: 1 }),
      ],
      [],
    );
    expect(one.zeroEditParks.parks).toBe(0);
    expect(one.zeroEditParks.implementTurns).toBe(1);
  });
}

/** Turns the two asks recovered, and the unfinished ask that delivered nothing. */
function recoveredAskRecords(): StepRecord[] {
  const resolved = { repairFindingsResolved: true };
  return [
    // The unfinished ask recovered a turn that delivered edits.
    rec(1, {
      ...resolved,
      asks: ["unfinished"],
      outcome: doneOutcome(),
      edits: { files: 1, added: 2, removed: 0 },
    }),
    // The same ask with no edits is not a recovery.
    rec(2, {
      ...resolved,
      asks: ["unfinished"],
      outcome: doneOutcome(),
      edits: zero,
    }),
    // The rescue is the last ask, so the unfinished ask before it is not double-counted.
    rec(3, {
      ...resolved,
      asks: ["unfinished", "rescue"],
      outcome: doneOutcome(),
      edits: zero,
    }),
    // A rescue counts with edits too.
    rec(4, {
      ...resolved,
      asks: ["rescue"],
      outcome: doneOutcome(),
      edits: { files: 3, added: 1, removed: 2 },
    }),
  ];
}

/** Turns an ask cannot credit: wrong answer, wrong ask or unresolved findings. */
function unrecoveredAskRecords(): StepRecord[] {
  const resolved = { repairFindingsResolved: true };
  return [
    // An honest failed answer is not a recovery.
    rec(5, {
      ...resolved,
      asks: ["unfinished"],
      outcome: failedOutcome(),
      edits: EDITED,
    }),
    // Blocked and upscope said why; they count neither.
    rec(6, {
      ...resolved,
      asks: ["rescue"],
      outcome: {
        status: "blocked",
        summary: "needs the owner",
        concerns: [],
        forward: [],
      },
      edits: EDITED,
    }),
    rec(7, {
      ...resolved,
      asks: ["rescue"],
      outcome: {
        status: "upscope",
        summary: "different seam",
        concerns: [],
        forward: [],
      },
      edits: EDITED,
    }),
    // A record without asks counts neither.
    rec(8, { ...resolved, outcome: doneOutcome(), edits: EDITED }),
    // An unresolved ask and the outcome-only ask are not the two reported.
    rec(9, {
      asks: ["unfinished"],
      repairFindings: ["no outcome after repair"],
      outcome: doneOutcome(),
      edits: EDITED,
    }),
    rec(10, {
      ...resolved,
      asks: ["outcome"],
      outcome: doneOutcome(),
      edits: EDITED,
    }),
  ];
}

function askRecoveryRecords(): StepRecord[] {
  return [...recoveredAskRecords(), ...unrecoveredAskRecords()];
}

function registerAskRecoveries(): void {
  it("credits a turn to its last ask only when its findings resolved and it reported done", async () => {
    const { one } = await written(askRecoveryRecords(), []);
    expect(one.askRecoveries).toEqual({ unfinished: 1, rescue: 2 });
  });
}

function registerZeroEditSplit(): void {
  it("splits replies, findings and no-ops by what the turn owed", async () => {
    const { one } = await written(
      [
        rec(1, { step: "implement", slug: "a", edits: zero }),
        rec(2, {
          step: "implement",
          slug: "a",
          edits: { files: 2, added: 4, removed: 0 },
        }),
        rec(3, { step: "review", slug: "a", edits: zero }),
        rec(4, { step: "qa", slug: "a", edits: zero }),
        rec(5, { step: "implement", slug: "probe", edits: zero }),
        rec(6, { step: "review", slug: "probe", edits: zero }),
        rec(7, { step: "resolve", slug: "a", edits: zero }),
        // A turn with no measured diff is not a zero-edit turn.
        rec(8, { step: "implement", slug: "a" }),
      ],
      [task("a"), task("probe", { kind: "spike" })],
    );
    expect(one.zeroEdit).toEqual({ reply: 3, finding: 1, noop: 2 });
  });

  it("reads a spike kind from a finish record when the task file is gone", async () => {
    const { one } = await written(
      [
        rec(1, { step: "implement", slug: "probe", edits: zero }),
        script(2, {
          slug: "probe",
          step: "finish",
          startedAt: "2026-01-01T00:00:02.000Z",
          endedAt: "2026-01-01T00:00:02.000Z",
          ok: true,
          report: "abc123:.factory/spikes/probe.md",
        }),
      ],
      [],
    );
    expect(one.zeroEdit).toEqual({ reply: 0, finding: 1, noop: 0 });
  });
}

describe("friction metrics edges", () => {
  registerParkUnits();
  registerParkLandings();
  registerSteerLatency();
  registerZeroEditSplit();
  registerZeroEditParkRate();
  registerAskRecoveries();
});
