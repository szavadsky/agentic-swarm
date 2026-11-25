import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { Usage } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { type PriceTable } from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task } from "./helpers.js";

const TABLE: PriceTable = {
  "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
  "free/zero": { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
};

function usage(patch: Partial<Usage> = {}): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
    ...patch,
  };
}

async function pricesPerRoleCostCountsUnpricedPart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const records = [
    rec(1, {
      step: "architect",
      slug: undefined,
      model: { id: "paid/one" },
      usage: usage({ in: 1_000_000 }),
    }),
    rec(2, {
      slug: "a",
      model: { id: "free/zero" },
      usage: usage({ in: 1_000_000 }),
    }),
    rec(3, {
      slug: "a",
      step: "review",
      model: { id: "mystery/model" },
      usage: usage({ in: 1_000_000 }),
    }),
    // A harness zero on a paid model is repriced from its tokens.
    rec(4, {
      step: "pm",
      slug: undefined,
      model: { id: "paid/one" },
      usage: usage({ costUsd: 0, in: 1_000_000 }),
    }),
    // A harness figure for a model outside the table is still known.
    rec(5, {
      step: "digest",
      slug: undefined,
      model: { id: "mystery/model" },
      usage: usage({ costUsd: 0.05 }),
    }),
    script(6, { slug: "a", step: "merge", ok: true }),
  ];

  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    prices: TABLE,
  });

  return { records };
}

async function pricesPerRoleCostCountsUnpricedPart2(
  store: ReturnType<typeof createFolderStore>,
  scope: Awaited<ReturnType<typeof pricesPerRoleCostCountsUnpricedPart1>>,
) {
  const { records } = scope;
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;

  expect(one.roles.architect!.usage.costUsd).toBeCloseTo(4, 10);
  expect(one.roles.implementer!.usage.costUsd).toBe(0);
  expect(one.roles.reviewer!.usage.costUsd).toBeUndefined();
  expect(one.roles.reviewer!.unpricedTurns).toBe(1);
  expect(one.roles.pm!.usage.costUsd).toBeCloseTo(4, 10);
  expect(one.roles.digest!.usage.costUsd).toBeCloseTo(0.05, 10);
  expect(one.unpricedTurns).toBe(1);
  expect(one.usage.costUsd).toBeCloseTo(8.05, 10);
  // Partial: one unpriced turn does not null the per-merged cost.
  expect(one.costPerMergedTask).toBeCloseTo(8.05, 10);
  expect(one.listCostPerMergedTask).toBeCloseTo(8, 10);
  expect(one.architect.costShare).toBeCloseTo(4 / 8.05, 10);
  expect(metrics.totals.unpricedTurns).toBe(1);
  expect(metrics.totals.usage.costUsd).toBeCloseTo(8.05, 10);

  // Aggregation prices copies; the records themselves stay raw.
  expect(records[0]!.usage?.costUsd).toBeUndefined();
  expect(records[1]!.usage?.costUsd).toBeUndefined();
}

async function pricesEveryReportedAttemptOncePart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const records = [
    // retry: both calls reported input; the record's own usage repeats the last one.
    rec(1, {
      step: "architect",
      slug: undefined,
      model: { id: "paid/one" },
      usage: usage({ in: 1_000_000 }),
      attempts: [
        {
          model: { id: "paid/one" },
          stop: { kind: "infra", cause: "quota" },
          usage: usage({ in: 1_000_000 }),
        },
        {
          model: { id: "paid/one" },
          stop: { kind: "done" },
          usage: usage({ in: 1_000_000 }),
        },
      ],
    }),
    // fallback: one attempt priced by the table, one unpriced; the harness cost wins.
    rec(2, {
      slug: "a",
      model: { id: "mystery/absent" },
      usage: usage({ in: 7 }),
      attempts: [
        {
          model: { id: "mystery/absent" },
          stop: { kind: "done" },
          usage: usage({ in: 7 }),
        },
        {
          model: { id: "mystery/absent" },
          stop: { kind: "done" },
          usage: usage({ costUsd: 0.25 }),
        },
      ],
    }),
  ];

  return { records };
}

async function pricesEveryReportedAttemptOncePart2(
  store: ReturnType<typeof createFolderStore>,
  scope: Awaited<ReturnType<typeof pricesEveryReportedAttemptOncePart1>>,
) {
  const { records } = scope;
  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    prices: TABLE,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;

  // Two paid attempts, each $4, not $4 plus the record total again.
  expect(one.roles.architect!.usage.costUsd).toBeCloseTo(8, 10);
  expect(one.roles.architect!.tokens).toBe(2_000_000);
  expect(one.roles.architect!.unpricedTurns).toBe(0);
  expect(one.roles.implementer!.usage.costUsd).toBeCloseTo(0.25, 10);
  expect(one.roles.implementer!.unpricedTurns).toBe(1);
  expect(one.unpricedTurns).toBe(1);
  expect(one.usage.costUsd).toBeCloseTo(8.25, 10);

  const state = derive([task("a")], records);
  const rel = await writeIterationSummary(store, {
    iteration: 1,
    state,
    records,
    status: "in-progress",
    prices: TABLE,
  });
  const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
  expect(text).toContain(
    "- harness-reported cost: $0.2500 (partial; 1 unpriced turn)",
  );
  expect(text).toContain(
    "- list-price estimate: $8.0000 (partial; 1 unpriced turn)",
  );
  expect(text).toContain(
    "- harness-reported cost by role: architect n/a; implementer $0.2500 (partial; 1 unpriced turn)",
  );
  expect(text).toContain(
    "- list-price estimate by role: architect $8.0000; implementer unknown (1 unpriced turn)",
  );
}

async function countsHarnessZeroAbsentModelUsagePart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const records = [
    rec(1, {
      step: "architect",
      slug: undefined,
      model: { id: "paid/one" },
      usage: usage({ in: 1_000_000 }),
    }),
    // A harness zero is not a price when no table entry exists.
    rec(2, {
      slug: "a",
      model: { id: "mystery/model" },
      usage: usage({ costUsd: 0, in: 1_000_000 }),
    }),
    // A known zero comes only from an explicit table entry.
    rec(3, {
      slug: "a",
      step: "review",
      model: { id: "free/zero" },
      usage: usage({ costUsd: 0, in: 1_000 }),
    }),
    // A crash-sealed record has no usage; its model's table entry cannot price it.
    rec(4, { slug: undefined, step: "pm", model: { id: "paid/one" } }),
    // A non-zero harness figure still wins for a model outside the table.
    rec(5, {
      slug: undefined,
      step: "digest",
      model: { id: "mystery/model" },
      usage: usage({ costUsd: 0.05 }),
    }),
    script(6, { slug: "a", step: "merge", ok: true }),
  ];

  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    prices: TABLE,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;

  return { records, metrics, one };
}

async function countsHarnessZeroAbsentModelUsagePart2(
  store: ReturnType<typeof createFolderStore>,
  scope: Awaited<ReturnType<typeof countsHarnessZeroAbsentModelUsagePart1>>,
) {
  const { one, metrics, records } = scope;
  expect(one.roles.architect!.usage.costUsd).toBeCloseTo(4, 10);
  expect(one.roles.implementer!.usage.costUsd).toBeUndefined();
  expect(one.roles.implementer!.unpricedTurns).toBe(1);
  expect(one.roles.reviewer!.usage.costUsd).toBe(0);
  expect(one.roles.reviewer!.unpricedTurns).toBe(0);
  expect(one.roles.pm!.usage.costUsd).toBeUndefined();
  expect(one.roles.pm!.unpricedTurns).toBe(1);
  expect(one.roles.digest!.usage.costUsd).toBeCloseTo(0.05, 10);
  expect(one.unpricedTurns).toBe(2);
  expect(one.usage.costUsd).toBeCloseTo(4.05, 10);
  expect(one.costPerMergedTask).toBeCloseTo(4.05, 10);
  expect(one.listCostPerMergedTask).toBeCloseTo(4, 10);
  expect(metrics.totals.unpricedTurns).toBe(2);

  // Aggregation prices copies; the records themselves stay raw.
  expect(records[1]!.usage?.costUsd).toBe(0);
  expect(records[3]!.usage).toBeUndefined();

  const state = derive([task("a")], records);
  const rel = await writeIterationSummary(store, {
    iteration: 1,
    state,
    records,
    status: "in-progress",
    prices: TABLE,
  });
  const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
  expect(text).toContain(
    "- harness-reported cost: $0.0500 (partial; 2 unpriced turns)",
  );
  expect(text).toContain(
    "- list-price estimate: $4.0000 (partial; 2 unpriced turns)",
  );
  expect(text).toContain(
    "- harness-reported cost by role: architect n/a; digest $0.0500; implementer $0.0000 (partial; 1 unpriced turn); pm unknown (1 unpriced turn); reviewer $0.0000",
  );
  expect(text).toContain(
    "- list-price estimate by role: architect $4.0000; digest n/a; implementer unknown (1 unpriced turn); pm unknown (1 unpriced turn); reviewer $0.0000",
  );
}

function registerPricedMetricsAndSummaryPart1(): void {
  it("prices per-role cost and counts unpriced turns in metrics", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const scope1 = await pricesPerRoleCostCountsUnpricedPart1(store);
      await pricesPerRoleCostCountsUnpricedPart2(store, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts a harness zero on an absent model and a usage-less record as unpriced", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const scope1 = await countsHarnessZeroAbsentModelUsagePart1(store);
      await countsHarnessZeroAbsentModelUsagePart2(store, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPricedMetricsAndSummaryPart2(): void {
  it("shows per-role priced cost and unknown with an unpriced count in the summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "architect",
          slug: undefined,
          model: { id: "paid/one" },
          usage: usage({ in: 1_000_000 }),
        }),
        rec(2, {
          slug: "a",
          model: { id: "free/zero" },
          usage: usage({ in: 1_000_000 }),
        }),
        rec(3, {
          slug: "a",
          step: "review",
          model: { id: "mystery/model" },
          usage: usage({ in: 1_000_000 }),
        }),
        script(4, { slug: "a", step: "merge", ok: true }),
      ];
      const state = derive([task("a")], records);

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        prices: TABLE,
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");

      expect(text).toContain(
        "- harness-reported cost: unknown (1 unpriced turn)",
      );
      expect(text).toContain(
        "- list-price estimate: $4.0000 (partial; 1 unpriced turn)",
      );
      expect(text).toContain(
        "- harness-reported cost by role: architect n/a; implementer n/a; reviewer unknown (1 unpriced turn)",
      );
      expect(text).toContain(
        "- list-price estimate by role: architect $4.0000; implementer $0.0000; reviewer unknown (1 unpriced turn)",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPricedMetricsAndSummaryPart3(): void {
  it("says unknown rather than $0 when every turn is unpriced", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "architect",
          slug: undefined,
          model: { id: "mystery/one" },
          usage: usage({ in: 10 }),
        }),
        rec(2, {
          slug: "a",
          model: { id: "mystery/two" },
          usage: usage({ in: 20 }),
        }),
      ];
      const state = derive([task("a")], records);

      await writeMetrics(store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations[0]!.usage.costUsd).toBeUndefined();
      expect(metrics.iterations[0]!.unpricedTurns).toBe(2);
      expect(metrics.iterations[0]!.costPerMergedTask).toBeNull();

      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain(
        "- harness-reported cost: unknown (2 unpriced turns)",
      );
      expect(text).toContain(
        "- list-price estimate: unknown (2 unpriced turns)",
      );
      expect(text).toContain(
        "- harness-reported cost by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
      );
      expect(text).toContain(
        "- list-price estimate by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
      );
      expect(text).not.toContain("- harness-reported cost: $0.0000");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPricedMetricsAndSummaryPart4(): void {
  it("prices every reported attempt once and keeps a partially priced turn partial", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const scope1 = await pricesEveryReportedAttemptOncePart1(store);
      await pricesEveryReportedAttemptOncePart2(store, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("priced metrics and summary", () => {
  registerPricedMetricsAndSummaryPart1();

  registerPricedMetricsAndSummaryPart2();

  registerPricedMetricsAndSummaryPart3();

  registerPricedMetricsAndSummaryPart4();
});
