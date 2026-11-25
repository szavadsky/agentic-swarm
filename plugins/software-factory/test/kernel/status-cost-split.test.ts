import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { buildStatus } from "../../src/kernel/status.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
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

/** Tokens with no harness price: the table, or nothing, supplies the figure. */
const SILENT: Usage = {
  in: 1_000_000,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  out: 0,
  reasoningOut: 0,
};

/**
 * Five agent turns covering the legs: silent turns the table estimates, one the
 * harness priced, and turns neither source can price, including a role whose
 * group mixes an estimate with an unpriced turn.
 */
async function writeSplitCostGoal(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.ensureLayout();
  await store.writeTask(task("a"));
  await store.appendRecord(
    { ...AGENT, step: "architect", alias: "architect" },
    {
      usage: SILENT,
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
  // The model's provider segment is the harness's, not the price row's: only
  // the normalized match can price this turn.
  await store.appendRecord(
    { ...AGENT, slug: "a", step: "review", model: { id: "other-host/fake" } },
    {
      usage: SILENT,
      outcome: {
        status: "done",
        verdict: "approve",
        summary: "reviewed",
        concerns: [],
        forward: [],
      },
    },
  );
  // The same role's second turn is unpriced, so its group figure is partial.
  await store.appendRecord(
    { ...AGENT, slug: "a", step: "review", model: { id: "mystery/model" } },
    {
      usage: SILENT,
      outcome: {
        status: "done",
        verdict: "approve",
        summary: "reviewed again",
        concerns: [],
        forward: [],
      },
    },
  );
  await store.appendRecord(
    { ...AGENT, slug: "a", step: "qa", model: { id: "mystery/model" } },
    {
      usage: SILENT,
      outcome: {
        status: "done",
        summary: "checked",
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

/** The snapshot keeps the reported, estimated and unpriced legs apart. */
function expectStatusLegs(status: ReturnType<typeof buildStatus>): void {
  // The harness total covers only the turn that reported one; the list
  // estimate prices the silent turns from the table, including the turn whose
  // harness id carries a provider segment the table does not.
  expect(status.cost.harnessCostUsd).toBeCloseTo(0.25, 10);
  expect(status.cost.listCostUsd).toBeCloseTo(8, 10);
  expect(status.cost.unpricedTurns).toBe(2);
  expect(status.cost.harnessCostPerMergedTask).toBeCloseTo(0.25, 10);
  expect(status.cost.listCostPerMergedTask).toBeCloseTo(8, 10);
  expect(status.cost.byRole.architect!.harnessCostUsd).toBeNull();
  expect(status.cost.byRole.architect!.listCostUsd).toBeCloseTo(4, 10);
  expect(status.cost.byRole.architect!.unpricedTurns).toBe(0);
  expect(status.cost.byRole.implementer!.harnessCostUsd).toBeCloseTo(0.25, 10);
  expect(status.cost.byRole.implementer!.listCostUsd).toBeNull();
  expect(status.cost.byRole.implementer!.unpricedTurns).toBe(0);
  expect(status.cost.byRole.reviewer!.harnessCostUsd).toBeNull();
  expect(status.cost.byRole.reviewer!.listCostUsd).toBeCloseTo(4, 10);
  expect(status.cost.byRole.reviewer!.unpricedTurns).toBe(1);
  expect(status.cost.byRole.qa!.harnessCostUsd).toBeNull();
  expect(status.cost.byRole.qa!.listCostUsd).toBeNull();
  expect(status.cost.byRole.qa!.unpricedTurns).toBe(1);
  expect(status.cost.byModel.fake!.harnessCostUsd).toBeCloseTo(0.25, 10);
  expect(status.cost.byModel.fake!.listCostUsd).toBeCloseTo(4, 10);
  expect(status.cost.byModel["other-host/fake"]!.harnessCostUsd).toBeNull();
  expect(status.cost.byModel["other-host/fake"]!.listCostUsd).toBeCloseTo(
    4,
    10,
  );
  expect(status.cost.byModel["mystery/model"]!.listCostUsd).toBeNull();
  expect(status.cost.byModel["mystery/model"]!.unpricedTurns).toBe(2);
}

/** The summary shows both priced columns and the count neither can price. */
function expectSummaryLegs(summary: string): void {
  expect(summary).toContain(
    "- harness-reported cost: $0.2500 (partial; 2 unpriced turns)",
  );
  expect(summary).toContain(
    "- list-price estimate: $8.0000 (partial; 2 unpriced turns)",
  );
  expect(summary).toContain("- unpriced turns: 2");
  expect(summary).toContain(
    "| role | turns | tokens | harness-reported | list-price estimate | unpriced | prompt bytes |",
  );
  // The reviewer group mixes an estimate with an unpriced turn: the figure is
  // marked partial beside the count, never rendered as a complete cost.
  expect(summary).toContain(
    "| reviewer | 2 | 2000000 | unknown | $4.0000 (partial) | 1 | 0 |",
  );
  // The alias group carries a reported figure and an estimate, both partial.
  expect(summary).toContain(
    "| implementer | 4 | 3000000 | $0.2500 (partial) | $4.0000 (partial) | 2 | 0 |",
  );
  expect(summary).toContain("| qa | 1 | 1000000 | unknown | unknown | 1 | 0 |");
}

describe("status cost split", () => {
  it("separates reported, estimated and unpriced legs, totals included", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-status-cost-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await writeSplitCostGoal(store);
      const tasks = await store.listTasks();
      const records = await store.listRecords();
      const prices = {
        fake: { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
      };
      const status = buildStatus({
        goal: "demo",
        state: derive(tasks, records),
        tasks,
        records,
        updatedAt: "2026-01-02T03:04:05.000Z",
        prices,
      });
      expectStatusLegs(status);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state: derive(tasks, records),
        records,
        status: "in-progress",
        prices,
      });
      expectSummaryLegs(fs.readFileSync(path.join(store.goalDir, rel), "utf8"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
