import { describe, expect, it } from "bun:test";
import { renderDashboard } from "../../src/kernel/dashboard.js";
import { derive } from "../../src/kernel/derive.js";
import { undecidedParked } from "../../src/kernel/dispatch-holds.js";
import { reportView } from "../../src/kernel/report-view.js";
import { buildStatus } from "../../src/kernel/status.js";
import { stewardParks } from "../../src/kernel/steward/candidates.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { cause, rec, script, task } from "./helpers.js";

const park = (slug: string, seq: number): StepRecord =>
  script(seq, { slug, step: "park", ok: true, cause: cause("gates: unit") });

const merge = (slug: string, seq: number): StepRecord =>
  script(seq, { slug, step: "merge", ok: true, commit: `commit-${slug}` });

const failedMerge = (slug: string, seq: number): StepRecord =>
  script(seq, {
    slug,
    step: "merge",
    ok: false,
    cause: cause("gates: unit"),
  });

const implement = (slug: string, seq: number): StepRecord =>
  rec(seq, {
    slug,
    step: "implement",
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
  });

describe("park retirement", () => {
  it("retires a park when a task naming it as base merges after the park", () => {
    const tasks = [
      task("base"),
      task("base-next", { base: "base", deps: ["base"] }),
      task("after", { deps: ["base"] }),
    ];
    const state = derive(tasks, [park("base", 1), merge("base-next", 2)]);

    expect(state.tasks.base!.status).toBe("parked");
    expect(state.tasks.base!.supersededBy).toBe("base-next");
    expect(state.tasks.after!.status).toBe("ready");
  });

  it("does not retire a park from a merge recorded before it", () => {
    const tasks = [task("base"), task("base-next", { base: "base" })];
    const state = derive(tasks, [merge("base-next", 1), park("base", 2)]);

    expect(state.tasks["base-next"]!.status).toBe("merged");
    expect(state.tasks.base!.supersededBy).toBeUndefined();
  });

  it("leaves a park with no base continuation alone", () => {
    const state = derive([task("solo")], [park("solo", 1)]);

    expect(state.tasks.solo!.status).toBe("parked");
    expect(state.tasks.solo!.supersededBy).toBeUndefined();
  });
});

describe("park retirement merge evidence", () => {
  it("leaves the park live when the continuation's merge is not sealed", () => {
    const tasks = [task("base"), task("base-next", { base: "base" })];
    const open = script(2, {
      slug: "base-next",
      step: "merge",
      ok: true,
      endedAt: undefined,
    });
    const state = derive(tasks, [park("base", 1), open]);

    expect(state.tasks["base-next"]!.status).toBe("ready");
    expect(state.tasks.base!.supersededBy).toBeUndefined();
  });

  it("leaves the park live when the continuation's merge did not verify", () => {
    const tasks = [task("base"), task("base-next", { base: "base" })];
    const state = derive(tasks, [park("base", 1), failedMerge("base-next", 2)]);

    expect(state.tasks["base-next"]!.status).not.toBe("merged");
    expect(state.tasks.base!.supersededBy).toBeUndefined();
  });
});

describe("park retirement along a base chain", () => {
  it("retires every park whose transitive continuation merges", () => {
    const tasks = [
      task("first"),
      task("second", { base: "first" }),
      task("third", { base: "second" }),
    ];
    const state = derive(tasks, [
      park("first", 1),
      park("second", 2),
      merge("third", 3),
    ]);

    expect(state.tasks.first!.supersededBy).toBe("third");
    expect(state.tasks.second!.supersededBy).toBe("third");
  });

  it("leaves the park live while the continuation's branch has not merged", () => {
    const tasks = [task("base"), task("base-next", { base: "base" })];
    const state = derive(tasks, [park("base", 1), implement("base-next", 2)]);

    expect(state.tasks["base-next"]!.status).toBe("ready");
    expect(state.tasks.base!.supersededBy).toBeUndefined();
  });

  it("keeps a retired slug parked and derives the same state twice", () => {
    const tasks = [task("base"), task("base-next", { base: "base" })];
    const records = [park("base", 1), merge("base-next", 2)];
    const first = derive(tasks, records);
    const second = derive(tasks, records);

    expect(first.tasks.base).toEqual(second.tasks.base);
    expect(first.tasks.base!.status).toBe("parked");
  });
});

describe("status distance and dashboard", () => {
  it("moves a retired park out of parked counts while a live park stays", () => {
    const tasks = [
      task("base"),
      task("base-next", { base: "base" }),
      task("live"),
      task("open"),
    ];
    const records = [park("base", 1), merge("base-next", 2), park("live", 3)];
    const state = derive(tasks, records);
    const status = buildStatus({
      goal: "demo",
      state,
      tasks,
      records,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });

    expect(status.tasks.parked.map((entry) => entry.slug)).toEqual(["live"]);
    expect(status.tasks.superseded.map((entry) => entry.slug)).toEqual([
      "base",
    ]);
    expect(status.tasks.superseded[0]!.supersededBy).toBe("base-next");
    expect(status.distance.parks).toEqual(["live"]);
    expect(reportView({ state }).distance.parks).toEqual(["live"]);

    const html = renderDashboard(status);
    expect(html).toContain("1 merged");
    expect(html).toContain("1 parked");
    expect(html).not.toContain('task-base"');
  });
});

describe("retired park consumers", () => {
  it("settles an epic holding a retired park and offers it no PM or steward turn", () => {
    const tasks = [
      task("base", { epic: "auth" }),
      task("base-next", { base: "base", epic: "auth" }),
    ];
    const records = [park("base", 1), merge("base-next", 2)];
    const state = derive(tasks, records);

    expect(state.tasks.base!.supersededBy).toBe("base-next");
    expect(state.epics.auth).toEqual({
      tasks: ["base", "base-next"],
      done: true,
    });
    expect(undecidedParked(records, state, 1)).toEqual([]);
    expect(stewardParks(tasks, state, new Set(), undefined)).toEqual([]);
  });

  it("keeps the epic open and offers both turns for a live park beside a retired one", () => {
    const tasks = [
      task("base", { epic: "auth" }),
      task("base-next", { base: "base", epic: "auth" }),
      task("live", { epic: "auth" }),
    ];
    const records = [park("base", 1), merge("base-next", 2), park("live", 3)];
    const state = derive(tasks, records);

    expect(state.epics.auth!.done).toBe(false);
    expect(undecidedParked(records, state, 1)).toEqual(["live"]);
    expect(stewardParks(tasks, state, new Set(), undefined)).toEqual([
      { slug: "live", kind: "gates" },
    ]);
  });
});
