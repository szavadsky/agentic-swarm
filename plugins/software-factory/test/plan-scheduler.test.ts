import { describe, expect, it } from "bun:test";
import * as schedulerModule from "../src/core/plan/scheduler.js";
import { blockedByFailure, nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";

const blockedByConcernImpl = (
  schedulerModule as unknown as {
    blockedByConcern?: (items: SchedItem[], concernBlocked: Iterable<string>) => string[];
  }
).blockedByConcern;

/**
 * Test-first seam: while the scheduler does not yet export `blockedByConcern`,
 * the inert fallback keeps module collection alive so the behavioural
 * assertions fail as assertion failures (target-red), not import errors.
 */
function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
  return blockedByConcernImpl ? blockedByConcernImpl(items, concernBlocked) : [];
}

describe("plan/scheduler: nextWave", () => {
  it("returns current active wave while items are pending or running", () => {
    const items: SchedItem[] = [
      { slug: "item-1", wave: "1", deps: [], status: "running" },
      { slug: "item-2", wave: "1", deps: [], status: "pending" },
      { slug: "item-3", wave: "2", deps: ["item-1"], status: "pending" },
    ];

    expect(nextWave(items, ["1", "2"])).toBe("1");
  });

  it("advances to next wave when all items in current wave are terminal", () => {
    const items: SchedItem[] = [
      { slug: "item-1", wave: "1", deps: [], status: "done" },
      { slug: "item-2", wave: "1", deps: [], status: "failed" },
      { slug: "item-3", wave: "2", deps: ["item-1"], status: "pending" },
      { slug: "item-4", wave: "3", deps: ["item-3"], status: "pending" },
    ];

    expect(nextWave(items, ["1", "2", "3"])).toBe("2");
  });

  it("returns null when all items across all waves are terminal", () => {
    const items: SchedItem[] = [
      { slug: "item-1", wave: "1", deps: [], status: "done" },
      { slug: "item-2", wave: "1", deps: [], status: "blocked" },
      { slug: "item-3", wave: "2", deps: ["item-1"], status: "done" },
      { slug: "item-4", wave: "2", deps: ["item-1"], status: "abandoned" },
    ];

    expect(nextWave(items, ["1", "2"])).toBeNull();
  });

  it("automatically sorts numeric waves when order is omitted", () => {
    const items: SchedItem[] = [
      { slug: "item-10", wave: "10", deps: [], status: "pending" },
      { slug: "item-2", wave: "2", deps: [], status: "pending" },
    ];

    // Numeric sort ensures "2" runs before "10" (not alphabetical "10" before "2")
    expect(nextWave(items, [])).toBe("2");
  });

  it("treats pending items with failed/abandoned deps as blocked for wave advancement", () => {
    const items: SchedItem[] = [
      { slug: "dep-ok", wave: "1", deps: [], status: "done" },
      { slug: "dep-fail", wave: "1", deps: [], status: "failed" },
      { slug: "doomed", wave: "2", deps: ["dep-fail"], status: "pending" },
      { slug: "viable", wave: "2", deps: ["dep-ok"], status: "pending" },
    ];

    // Wave 2 still has runnable work (viable), so it stays active.
    expect(nextWave(items, ["1", "2"])).toBe("2");

    const finished: SchedItem[] = [
      { slug: "dep-ok", wave: "1", deps: [], status: "done" },
      { slug: "dep-fail", wave: "1", deps: [], status: "failed" },
      { slug: "doomed", wave: "2", deps: ["dep-fail"], status: "pending" },
      { slug: "viable", wave: "2", deps: ["dep-ok"], status: "done" },
    ];

    // Only the never-runnable dependent is left pending: the wave must not stall.
    expect(nextWave(finished, ["1", "2"])).toBeNull();
  });

  it("reports directly blocked items; transitive cascade is the engine's job", () => {
    const items: SchedItem[] = [
      { slug: "dep-gone", wave: "1", deps: [], status: "abandoned" },
      { slug: "orphan-a", wave: "2", deps: ["dep-gone"], status: "pending" },
      { slug: "orphan-b", wave: "3", deps: ["orphan-a"], status: "pending" },
    ];

    // orphan-a is directly blocked; the engine marks it, then orphan-b transitively.
    expect(blockedByFailure(items)).toEqual(["orphan-a"]);
    // Wave 3's pending item has no failed DIRECT dep yet, so wave 3 stays active
    // until the engine cascades the blocked marking.
    expect(nextWave(items, ["1", "2", "3"])).toBe("3");
  });
});

describe("plan/scheduler: runnable", () => {
  it("respects dependencies: pending item only runs when all deps are done", () => {
    const items: SchedItem[] = [
      { slug: "dep-a", wave: "1", deps: [], status: "done" },
      { slug: "dep-b", wave: "1", deps: [], status: "running" }, // not done yet
      { slug: "item-ready", wave: "2", deps: ["dep-a"], status: "pending" },
      { slug: "item-blocked", wave: "2", deps: ["dep-a", "dep-b"], status: "pending" },
    ];

    const result = runnable(items, "2", 4, 0);
    expect(result).toEqual(["item-ready"]);
  });

  it("respects active wave filter", () => {
    const items: SchedItem[] = [
      { slug: "w1-item", wave: "1", deps: [], status: "pending" },
      { slug: "w2-item", wave: "2", deps: [], status: "pending" },
    ];

    expect(runnable(items, "1", 4, 0)).toEqual(["w1-item"]);
    expect(runnable(items, "2", 4, 0)).toEqual(["w2-item"]);
  });

  it("respects maxParallel concurrency limit and current running count", () => {
    const items: SchedItem[] = [
      { slug: "item-1", wave: "1", deps: [], status: "pending" },
      { slug: "item-2", wave: "1", deps: [], status: "pending" },
      { slug: "item-3", wave: "1", deps: [], status: "pending" },
      { slug: "item-4", wave: "1", deps: [], status: "pending" },
    ];

    // maxParallel = 3, running = 1 => 2 slots available
    const twoSlots = runnable(items, "1", 3, 1);
    expect(twoSlots).toEqual(["item-1", "item-2"]);

    // maxParallel = 2, running = 2 => 0 slots available
    const zeroSlots = runnable(items, "1", 2, 2);
    expect(zeroSlots).toEqual([]);

    // running exceeds maxParallel => 0 slots available
    const negativeSlots = runnable(items, "1", 2, 3);
    expect(negativeSlots).toEqual([]);
  });

  it("preserves PM order", () => {
    const items: SchedItem[] = [
      { slug: "first-pm-priority", wave: "1", deps: [], status: "pending" },
      { slug: "second-pm-priority", wave: "1", deps: [], status: "pending" },
      { slug: "third-pm-priority", wave: "1", deps: [], status: "pending" },
    ];

    const result = runnable(items, "1", 2, 0);
    expect(result).toEqual(["first-pm-priority", "second-pm-priority"]);
  });

  it("never returns items whose deps failed", () => {
    const items: SchedItem[] = [
      { slug: "dep-ok", wave: "1", deps: [], status: "done" },
      { slug: "dep-fail", wave: "1", deps: [], status: "failed" },
      { slug: "ready", wave: "2", deps: ["dep-ok"], status: "pending" },
      { slug: "doomed", wave: "2", deps: ["dep-fail"], status: "pending" },
    ];

    expect(runnable(items, "2", 4, 0)).toEqual(["ready"]);
  });
});

describe("plan/scheduler: blockedByFailure", () => {
  it("returns pending items with failed or abandoned deps, in PM order", () => {
    const items: SchedItem[] = [
      { slug: "ok", wave: "1", deps: [], status: "done" },
      { slug: "bad", wave: "1", deps: [], status: "failed" },
      { slug: "gone", wave: "1", deps: [], status: "abandoned" },
      { slug: "first", wave: "2", deps: ["bad"], status: "pending" },
      { slug: "fine", wave: "2", deps: ["ok"], status: "pending" },
      { slug: "second", wave: "2", deps: ["gone"], status: "pending" },
      { slug: "already", wave: "2", deps: ["bad"], status: "running" },
    ];

    expect(blockedByFailure(items)).toEqual(["first", "second"]);
  });

  it("returns empty when no dep has failed or been abandoned", () => {
    const items: SchedItem[] = [
      { slug: "dep", wave: "1", deps: [], status: "done" },
      { slug: "next", wave: "2", deps: ["dep"], status: "pending" },
    ];

    expect(blockedByFailure(items)).toEqual([]);
  });
});

describe("plan/scheduler: blockedByConcern", () => {
  it("blocks concern-affected items and their declared dependents in PM order", () => {
    const items: SchedItem[] = [
      { slug: "seed", wave: "8", deps: [], status: "pending" },
      { slug: "dependent", wave: "8", deps: ["seed"], status: "pending" },
      { slug: "independent", wave: "8", deps: [], status: "pending" },
    ];

    expect(blockedByConcern(items, ["seed"])).toEqual(["seed", "dependent"]);
  });

  it("unions concern blocking with the failure-blocked fixpoint over declared deps", () => {
    const items: SchedItem[] = [
      { slug: "failed", wave: "8", deps: [], status: "failed" },
      { slug: "failure-dependent", wave: "8", deps: ["failed"], status: "pending" },
      { slug: "failure-transitive", wave: "8", deps: ["failure-dependent"], status: "pending" },
      { slug: "seed", wave: "8", deps: [], status: "pending" },
      { slug: "concern-dependent", wave: "8", deps: ["seed"], status: "pending" },
      { slug: "independent", wave: "8", deps: [], status: "pending" },
    ];

    expect(blockedByConcern(items, ["seed"])).toEqual([
      "failure-dependent",
      "failure-transitive",
      "seed",
      "concern-dependent",
    ]);
  });

  it("ignores refs naming no item and never blocks a done item", () => {
    const items: SchedItem[] = [
      { slug: "already-done", wave: "8", deps: [], status: "done" },
      { slug: "seed", wave: "8", deps: [], status: "pending" },
      { slug: "other", wave: "8", deps: [], status: "pending" },
    ];

    expect(blockedByConcern(items, ["plan", "already-done", "seed"])).toEqual(["seed"]);
  });
});
