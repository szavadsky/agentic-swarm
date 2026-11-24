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
import { rec, script, task } from "./helpers.js";

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
});
