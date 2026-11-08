import { describe, it, expect } from "bun:test";
import { runnable, type SchedItem } from "../src/core/plan/scheduler.js";
import { deriveWaveState } from "../src/core/derive/wave.js";
import type { DerivedItemState } from "../src/core/derive/item.js";

function item(slug: string, wave: string, deps: string[], status: SchedItem["status"] = "pending"): SchedItem {
  return { slug, wave, deps, status };
}

function derived(slug: string, wave: number, deps: string[], status: DerivedItemState["status"]): DerivedItemState {
  return {
    slug,
    kind: "dev",
    title: slug,
    wave,
    deps,
    status,
    branch: `topic/t/${slug}`,
    records: [],
    currentAttempt: 1,
    currentFixRound: 1,
    isEscalated: false,
    freshSeries: false,
    interruptionCount: 0,
    consultCount: 0,
    failingCheckFingerprints: [],
    suggestionFingerprints: [],
    decisionFingerprints: [],
  };
}

describe("D5: dep-wave gating — never schedule before deps' waves", () => {
  it("runnable() withholds an item whose dep sits in the same wave", () => {
    const items = [item("a", "9", []), item("b", "9", ["a"])];
    // Wave 9 active: only 'a' may run; 'b' waits even though 'a' is pending (its wave is not done).
    expect(runnable(items, "9", 4, 0)).toEqual(["a"]);
  });

  it("runnable() withholds an item whose dep sits in a later wave (forward-dep fault)", () => {
    const items = [
      item("audit-v2", "9", ["consolidate-v2"]),
      item("consolidate-v2", "11", []),
    ];
    // Wave 9 must not run audit-v2: its dep lives in wave 11.
    expect(runnable(items, "9", 4, 0)).toEqual([]);
    // Wave 11 runs the dep itself.
    expect(runnable(items, "11", 4, 0)).toEqual(["consolidate-v2"]);
  });

  it("runnable() runs a wave-10 item blocked only on a merged earlier-wave dep", () => {
    const items = [
      item("wiring", "7", [], "done"),
      item("assumptions", "1", [], "done"),
      item("audit-v2", "10", ["wiring", "assumptions"]),
    ];
    expect(runnable(items, "10", 4, 0)).toEqual(["audit-v2"]);
  });

  it("deriveWaveState keeps a forward-dep item out of runnable (branch case: waves 9/10 vs 11)", () => {
    const items = [
      derived("golden-snapshot-wiring", 7, [], "merged"),
      derived("third-party-assumption-tests", 1, [], "merged"),
      derived("consolidate-integration-helpers-v2", 8, ["golden-snapshot-wiring"], "failed"),
      derived("coding-rules-audit-v2", 9, ["golden-snapshot-wiring", "consolidate-integration-helpers-v2"], "pending"),
    ];
    const wave9 = deriveWaveState({ wave: 9, items });
    expect(wave9.runnable.map((i) => i.slug)).toEqual([]);
    expect(wave9.blocked.map((i) => i.slug)).toContain("coding-rules-audit-v2");
  });
});
