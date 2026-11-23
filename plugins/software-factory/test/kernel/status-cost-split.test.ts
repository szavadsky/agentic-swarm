import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { buildStatus } from "../../src/kernel/status.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { RecordStart } from "../../src/kernel/types.js";
import { task } from "./helpers.js";

function usage(costUsd: number, input: number, output: number): Usage {
  return {
    in: input,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: output,
    reasoningOut: 0,
    costUsd,
  };
}

const AGENT: RecordStart = {
  iteration: 1,
  step: "implement",
  round: 1,
  actor: "agent",
  alias: "implementer",
  model: { id: "fake" },
};

const SCRIPT: RecordStart = {
  ...AGENT,
  actor: "script",
  alias: undefined,
  model: undefined,
};

/** One silent turn the table must price and one turn the harness priced. */
async function writeSplitCostGoal(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.ensureLayout();
  await store.writeTask(task("a"));
  const silent: Usage = {
    in: 1_000_000,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
  };
  await store.appendRecord(
    { ...AGENT, step: "architect", alias: "architect" },
    {
      usage: silent,
      outcome: {
        status: "done",
        summary: "planned",
        concerns: [],
        forward: [],
      },
    },
  );
  await store.appendRecord(
    { ...AGENT, slug: "a", step: "implement" },
    {
      usage: usage(0.25, 0, 0),
      outcome: {
        status: "done",
        summary: "implemented",
        concerns: [],
        forward: [],
      },
    },
  );
  await store.appendRecord(
    { ...SCRIPT, step: "merge", slug: "a" },
    { ok: true, commit: "abc123" },
  );
}

describe("status cost split", () => {
  it("keeps the harness figure and the list estimate apart, totals included", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-status-cost-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await writeSplitCostGoal(store);
      const tasks = await store.listTasks();
      const records = await store.listRecords();
      const status = buildStatus({
        goal: "demo",
        state: derive(tasks, records),
        tasks,
        records,
        updatedAt: "2026-01-02T03:04:05.000Z",
        prices: {
          fake: { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
        },
      });

      // The harness total covers only the turn that reported one; the list
      // estimate prices the silent turn from the table.
      expect(status.cost.harnessCostUsd).toBeCloseTo(0.25, 10);
      expect(status.cost.listCostUsd).toBeCloseTo(4, 10);
      expect(status.cost.harnessCostPerMergedTask).toBeCloseTo(0.25, 10);
      expect(status.cost.listCostPerMergedTask).toBeCloseTo(4, 10);
      expect(status.cost.byRole.architect!.harnessCostUsd).toBeNull();
      expect(status.cost.byRole.architect!.listCostUsd).toBeCloseTo(4, 10);
      expect(status.cost.byRole.implementer!.harnessCostUsd).toBeCloseTo(
        0.25,
        10,
      );
      expect(status.cost.byRole.implementer!.listCostUsd).toBeNull();
      expect(status.cost.byModel.fake!.harnessCostUsd).toBeCloseTo(0.25, 10);
      expect(status.cost.byModel.fake!.listCostUsd).toBeCloseTo(4, 10);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
