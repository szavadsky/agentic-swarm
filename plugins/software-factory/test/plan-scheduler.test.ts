import { describe, expect, it } from "bun:test";
import { nextWave, runnable, type SchedItem } from "../src/core/plan/scheduler.js";

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
});
