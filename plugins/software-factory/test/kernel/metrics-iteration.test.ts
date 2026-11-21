import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type { Usage } from "../../src/harness/types.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import {
  type PriceTable,
  pricedUsage,
  priceTableOnly,
} from "../../src/kernel/pricing.js";
import { finishChecks, startChecks } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { rec, script, cause } from "./helpers.js";

const PRICES: PriceTable = {
  "paid/one": { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 },
  "baidu/ernie-5.5-flash-preview:free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoning: 0,
  },
};

function priced(light: Partial<Usage> = {}): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
    ...light,
  };
}

async function splitsAliasTurnSSpendByModelsPart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const ernie = "openrouter/baidu/ernie-5.5-flash-preview:free";
  const records = [
    rec(1, {
      alias: "digest",
      model: { id: ernie },
      usage: priced({ in: 2_000_000 }),
      served: [
        {
          model: { id: ernie },
          usage: priced({ in: 1_000_000, costUsd: 0 }),
        },
        { model: { id: "paid/one" }, usage: priced({ in: 1_000_000 }) },
      ],
      edits: { files: 2, added: 5, removed: 1 },
      promptBytes: 50,
    }),
    rec(2, {
      slug: "b",
      alias: "digest",
      model: { id: ernie },
      usage: priced({ in: 2_000 }),
      served: [
        {
          model: { id: ernie },
          usage: priced({ in: 1_000, costUsd: 0 }),
        },
        { model: { id: "mystery/hop" }, usage: priced({ in: 1_000 }) },
      ],
    }),
  ];
  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records,
    prices: PRICES,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;

  return { ernie, one };
}

async function splitsAliasTurnSSpendByModelsPart2(
  scope: Awaited<ReturnType<typeof splitsAliasTurnSSpendByModelsPart1>>,
) {
  const { one, ernie } = scope;
  expect(one.models[ernie]!.turns).toBe(2);
  expect(one.models[ernie]!.usage.in).toBe(1_001_000);
  expect(one.models[ernie]!.usage.costUsd).toBe(0);
  expect(one.models[ernie]!.unpricedTurns).toBe(0);
  expect(one.models["paid/one"]!.turns).toBe(1);
  expect(one.models["paid/one"]!.usage.in).toBe(1_000_000);
  expect(one.models["paid/one"]!.usage.costUsd).toBeCloseTo(4, 10);

  // Committed work belongs to the record's own model row, once.
  expect(one.models[ernie]!.edits).toBe(2);
  expect(one.models["paid/one"]!.edits).toBe(0);

  // A served model with no row is unpriced, never $0.
  expect(one.models["mystery/hop"]!.turns).toBe(1);
  expect(one.models["mystery/hop"]!.unpricedTurns).toBe(1);
  expect(one.models["mystery/hop"]!.usage.costUsd).toBeUndefined();

  // The alias and iteration totals sum the served shares.
  expect(one.aliases.digest!.turns).toBe(2);
  expect(one.aliases.digest!.usage.costUsd).toBeCloseTo(4, 10);
  expect(one.usage.in).toBe(2_002_000);
  expect(one.usage.costUsd).toBeCloseTo(4, 10);
  expect(one.unpricedTurns).toBe(1);
}

function registerRecordCostTruthPart1(): void {
  it("keeps the harness figure and adds the list-price equivalent", () => {
    // A subscription-style zero is repriced for cost but stays visible as the
    // harness figure; the list column always shows the table price.
    const paid = pricedUsage(
      priced({ costUsd: 0, in: 1_000_000 }),
      "paid/one",
      PRICES,
    );
    expect(paid.costKnown).toBe(true);
    expect(paid.usage.costUsd).toBeCloseTo(4, 10);
    expect(paid.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(paid.usage.harnessCostUsd).toBe(0);

    // A non-zero harness figure wins for cost; the list still shows the table.
    const discounted = pricedUsage(
      priced({ costUsd: 0.05, in: 1_000_000 }),
      "paid/one",
      PRICES,
    );
    expect(discounted.usage.costUsd).toBe(0.05);
    expect(discounted.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(discounted.usage.harnessCostUsd).toBe(0.05);

    // Repricing is idempotent: the harness figure is not lost to the priced cost.
    const again = pricedUsage(paid.usage, "paid/one", PRICES);
    expect(again.usage.costUsd).toBeCloseTo(4, 10);
    expect(again.usage.harnessCostUsd).toBe(0);
  });
}

function registerRecordCostTruthPart2(): void {
  it("prices a resumed unsplit prefix at the cached rate", () => {
    const fresh = priceTableOnly(priced({ in: 1_000_000 }), "paid/one", PRICES);
    const resumed = priceTableOnly(
      priced({ in: 1_000_000 }),
      "paid/one",
      PRICES,
      { cachedPrefix: true },
    );
    expect(fresh).toBeCloseTo(4, 10);
    expect(resumed).toBeCloseTo(0.2, 10);
    // A split cache already names its cached prefix; the flag changes nothing.
    const split = priceTableOnly(
      priced({ in: 500_000, cacheRead: 500_000 }),
      "paid/one",
      PRICES,
      { cachedPrefix: true },
    );
    expect(split).toBeCloseTo(2.1, 10);
  });
}

function perModelCostAgentRecords() {
  return [
    rec(1, {
      step: "architect",
      slug: undefined,
      model: { id: "paid/one" },
      usage: priced({ in: 1_000_000 }),
      edits: { files: 2, added: 10, removed: 5 },
      promptBytes: 100,
    }),
    rec(2, {
      slug: "a",
      model: { id: "paid/one" },
      usage: priced({ costUsd: 0, in: 1_000_000 }),
      edits: { files: 1, added: 20, removed: 0 },
    }),
    rec(3, {
      slug: "a",
      step: "review",
      model: { id: "mystery/model" },
      usage: priced({ in: 1_000_000 }),
    }),
    rec(4, {
      slug: "b",
      model: { id: "paid/one" },
      cachedPrefix: true,
      usage: priced({ in: 1_000_000 }),
    }),
  ];
}

function perModelCostScriptRecords() {
  const check = (name: string) => ({
    name,
    ok: true,
    summary: "pass",
    output: "ok",
    fingerprint: name,
  });
  return [
    script(5, {
      slug: "b",
      step: "checks",
      ok: true,
      checks: [check("typecheck"), check("tests")],
      testRuns: 2,
      wallMs: 5000,
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(5000).toISOString(),
    }),
    script(6, {
      slug: "a",
      step: "commit",
      ok: true,
      commit: "abc",
      tree: "def",
      wallMs: 100,
    }),
    script(7, { slug: "a", step: "merge", ok: true }),
    script(8, {
      slug: "wt-a",
      step: "containment",
      ok: true,
      cause: cause("outside-change: files changed in /repo"),
    }),
    script(9, {
      slug: "b",
      step: "merge",
      ok: false,
      cause: cause(
        "integration moved: expected aaa, found bbb; an outside commit is on the integration branch and this merge left it untouched",
      ),
    }),
  ];
}

function perModelCostRecords() {
  return [...perModelCostAgentRecords(), ...perModelCostScriptRecords()];
}

async function aggregatesPerModelCostWorkPart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  await writeMetrics(store, {
    iteration: 1,
    status: "in-progress",
    records: perModelCostRecords(),
    prices: PRICES,
    humanInterventions: 2,
  });
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  const one = metrics.iterations[0]!;
  return { one, metrics };
}

function aggregatesPerModelCostWorkPart2(
  scope: Awaited<ReturnType<typeof aggregatesPerModelCostWorkPart1>>,
) {
  const { one, metrics } = scope;

  // Per-model cost: architect 4 + implement 4 (repriced zero) + resumed 0.2.
  expect(one.models["paid/one"]!.turns).toBe(3);
  expect(one.models["paid/one"]!.usage.costUsd).toBeCloseTo(8.2, 10);
  expect(one.models["paid/one"]!.usage.listCostUsd).toBeCloseTo(8.2, 10);
  expect(one.models["paid/one"]!.usage.harnessCostUsd).toBe(0);
  expect(one.models["paid/one"]!.unpricedTurns).toBe(0);
  expect(one.models["mystery/model"]!.turns).toBe(1);
  expect(one.models["mystery/model"]!.unpricedTurns).toBe(1);

  // Work: edits from agent commits; gate runs are credited to the script
  // role, not the b turn.
  expect(one.models["paid/one"]!.edits).toBe(3);
  expect(one.models["paid/one"]!.testRuns).toBe(0);
  expect(one.roles["script"]!.testRuns).toBe(2);
  expect(one.edits).toBe(3);
  expect(one.testRuns).toBe(2);
  expect(one.gateRuns).toBe(1);

  // Gate/commit wall comes from the script stamps, not zero-length windows.
  expect(one.gateWallMs).toBe(5000);
  expect(one.commitWallMs).toBe(100);

  // Partial per-merged cost: the priced numerator covers priced turns only.
  expect(one.unpricedTurns).toBe(1);
  expect(one.costPerMergedTask).toBeCloseTo(8.2, 10);
  expect(one.listCostPerMergedTask).toBeCloseTo(8.2, 10);

  // Operator acts: steers plus the two outside records.
  expect(one.humanInterventions).toBe(2);
  expect(one.operatorActs).toBe(4);
  expect(metrics.totals.operatorActs).toBe(4);
  expect(metrics.totals.models["paid/one"]!.turns).toBe(3);
}

function registerRecordCostTruthPart3(): void {
  it("aggregates per-model cost, work, gate time and operator acts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-models-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const scope = await aggregatesPerModelCostWorkPart1(store);
      aggregatesPerModelCostWorkPart2(scope);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRecordCostTruthPart4(): void {
  it("splits an alias turn's spend by the models it served", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-served-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const scope1 = await splitsAliasTurnSSpendByModelsPart1(store);
      await splitsAliasTurnSSpendByModelsPart2(scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stamps gate wall time around the run", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gate-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const gate = await startChecks(store, {
        iteration: 1,
        slug: "a",
        round: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      const done = await finishChecks(gate, [
        {
          name: "tests",
          ok: true,
          summary: "pass",
          output: "",
          fingerprint: "t",
        },
      ]);
      expect(done.testRuns).toBe(1);
      expect(done.wallMs).toBeGreaterThanOrEqual(10);
      expect(
        Date.parse(done.endedAt!) - Date.parse(done.startedAt),
      ).toBeGreaterThanOrEqual(10);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerIterationMetricsPart4(): void {
  it("lists quarantined task files per iteration and in totals", async () => {
    const repo = createTmpRepo();
    try {
      const store = createFolderStore(
        path.join(repo.dir, "goals", "demo"),
        undefined,
        {},
      );
      await store.ensureLayout();
      const records = [
        script(1, {
          iteration: 1,
          slug: "broken",
          step: "task-quarantine",
          ok: false,
          cause: cause(
            'task file "broken.md" quarantined at tasks/quarantine/broken.md: no frontmatter',
          ),
        }),
        script(2, {
          iteration: 2,
          slug: "torn",
          step: "task-quarantine",
          ok: false,
          cause: cause(
            'task file "torn.md" is unreadable; left in tasks/ because its slug already has a terminal record (merged): torn',
          ),
        }),
      ];
      await writeMetrics(store, {
        iteration: 2,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations.map((i) => [i.n, i.quarantined])).toEqual([
        [1, ["broken"]],
        [2, ["torn"]],
      ]);
      expect(metrics.totals.quarantined).toEqual(["broken", "torn"]);
    } finally {
      repo.cleanup();
    }
  });
}

describe("iteration metrics", () => {
  registerIterationMetricsPart4();
});

describe("record cost truth", () => {
  registerRecordCostTruthPart1();

  registerRecordCostTruthPart2();

  registerRecordCostTruthPart3();

  registerRecordCostTruthPart4();
});
