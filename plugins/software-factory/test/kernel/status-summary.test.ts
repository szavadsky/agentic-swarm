import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DASHBOARD_REL_PATH } from "../../src/kernel/dashboard.js";
import { derive } from "../../src/kernel/derive.js";
import {
  buildStatus,
  readStatus,
  writeStatus,
} from "../../src/kernel/status.js";
import { mechanicalSummary } from "../../src/kernel/status-summary.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { Outcome, StepRecord } from "../../src/kernel/types.js";
import { task } from "./helpers.js";

type Store = ReturnType<typeof createFolderStore>;

const PM_META = {
  iteration: 1,
  round: 1,
  actor: "agent" as const,
  alias: "pm",
  model: { id: "fake" },
};

/** One task landed and one open, so the mechanical account has both counts. */
async function goalStore(): Promise<{ root: string; store: Store }> {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-status-summary-"),
  );
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  await store.ensureLayout();
  await store.writeTask(task("landed1"));
  await store.writeTask(task("open1"));
  await store.appendRecord(
    { ...PM_META, slug: "landed1", step: "implement" },
    { ok: true, commit: "abc123" },
  );
  await store.appendRecord(
    {
      ...PM_META,
      actor: "script",
      alias: undefined,
      model: undefined,
      slug: "landed1",
      step: "merge",
    },
    { ok: true, commit: "abc123" },
  );
  return { root, store };
}

function pmOutcome(summary: string): Outcome {
  return { status: "done", summary, concerns: [], forward: [] };
}

/** A PM turn at the store's next seq. */
async function writePm(
  store: Store,
  summary: string,
  iteration = 1,
): Promise<void> {
  await store.appendRecord(
    { ...PM_META, iteration, step: "pm" },
    {
      ok: true,
      outcome: pmOutcome(summary),
    },
  );
}

async function rebuilt(store: Store): Promise<ReturnType<typeof buildStatus>> {
  const tasks = await store.listTasks();
  const records: StepRecord[] = await store.listRecords();
  return buildStatus({
    goal: "demo",
    state: derive(tasks, records),
    tasks,
    records,
  });
}

function offlinePrices(root: string) {
  return {
    cachePath: path.join(root, "no-prices.json"),
    fetchModels: async () => {
      throw new Error("prices disabled in test");
    },
  };
}

describe("mechanical status account", () => {
  it("names the goal and its task counts instead of an unknown", () => {
    expect(
      mechanicalSummary("active", 0, {
        landed: 0,
        total: 0,
        open: 0,
        parked: 0,
      }),
    ).toEqual({
      source: "mechanical",
      text: "Goal active, iteration 0; no task recorded yet.",
      iteration: 0,
    });
    expect(
      mechanicalSummary("done", 3, {
        landed: 4,
        total: 6,
        open: 1,
        parked: 1,
      }),
    ).toEqual({
      source: "mechanical",
      text: "Goal done, iteration 3; 4 of 6 tasks landed, 1 open, 1 parked.",
      iteration: 3,
    });
  });
});

describe("status summary", () => {
  it("derives the mechanical account when no PM turn wrote a summary", async () => {
    const { root, store } = await goalStore();
    try {
      const status = await rebuilt(store);
      expect(status.summary).toEqual({
        source: "mechanical",
        text: "Goal active, iteration 1; 1 of 2 tasks landed, 1 open, 0 parked.",
        iteration: 1,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows the latest PM summary in status.json and the dashboard", async () => {
    const { root, store } = await goalStore();
    try {
      await writePm(store, "Derived two task files and landed one.");
      await writeStatus({
        store,
        flows: {},
        priceSource: offlinePrices(root),
      });
      const parsed = JSON.parse((await readStatus(store))!);
      expect(parsed.summary).toEqual({
        source: "pm",
        text: "Derived two task files and landed one.",
        iteration: 1,
        record: "records/00003-i1-pm-r1",
      });
      const dashboard = fs.readFileSync(
        path.join(store.goalDir, DASHBOARD_REL_PATH),
        "utf8",
      );
      expect(dashboard).toContain("Derived two task files and landed one.");
      expect(dashboard).toContain("PM summary, iteration 1");
      expect(dashboard).toContain('href="records/00003-i1-pm-r1/"');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PM summary across turns", () => {
  it("replaces the earlier summary when a later PM turn writes one", async () => {
    const { root, store } = await goalStore();
    try {
      await writePm(store, "first turn");
      await writePm(store, "second iteration finished both tasks", 2);
      await writeStatus({
        store,
        flows: {},
        priceSource: offlinePrices(root),
      });
      const parsed = JSON.parse((await readStatus(store))!);
      expect(parsed.summary).toEqual({
        source: "pm",
        text: "second iteration finished both tasks",
        iteration: 2,
        record: "records/00004-i2-pm-r1",
      });
      const dashboard = fs.readFileSync(
        path.join(store.goalDir, DASHBOARD_REL_PATH),
        "utf8",
      );
      expect(dashboard).toContain("second iteration finished both tasks");
      expect(dashboard).toContain("PM summary, iteration 2");
      expect(dashboard).toContain('href="records/00004-i2-pm-r1/"');
      expect(dashboard).not.toContain("first turn");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the last written PM summary when a later PM turn writes none", async () => {
    const { root, store } = await goalStore();
    try {
      await writePm(store, "first turn");
      await writePm(store, "   ");
      expect((await rebuilt(store)).summary).toEqual({
        source: "pm",
        text: "first turn",
        iteration: 1,
        record: "records/00003-i1-pm-r1",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
