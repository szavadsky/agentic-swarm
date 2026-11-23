import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import { runConfigSchema } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import { matchPrice, type PriceTable } from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { rec, task } from "./helpers.js";

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

async function wiresPriceCacheIntoSummaryMetricsPart1(
  repo: ReturnType<typeof createTmpRepo>,
) {
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: paid/one }",
      "  pm: { harness: fake, model: paid/one }",
      "  digest: { harness: fake, model: paid/one }",
      "  implementer: { harness: fake, model: paid/one }",
      "  implementer-b: { harness: fake, model: paid/two }",
      "  researcher: { harness: fake, model: paid/one }",
      "  reviewer: { harness: fake, model: paid/one }",
      "  qa: { harness: fake, model: paid/one }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 2, retention: short }`,
      "",
    ].join("\n"),
  );
  // This fixture isolates the architect's harness-silent turn; the shipped
  // scout would add a zero-usage turn that is unpriced by design.
  repo.writeFile(
    ".factory/process.yaml",
    "ingestion: [{ id: branch }, { id: front }]\n",
  );
  repo.commit("factory config");
  // The model is absent from config; only the seeded cache prices it.
  const cachePath = path.join(repo.dir, ".factory", "price-cache.json");
  writePriceCache(cachePath, {
    "paid/one": {
      input: 4,
      cachedInput: 0.2,
      output: 20,
      reasoning: 20,
    },
  });
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });

  return { cachePath, goalDir };
}

async function wiresPriceCacheIntoSummaryMetricsPart2(
  repo: ReturnType<typeof createTmpRepo>,
  scope: Awaited<ReturnType<typeof wiresPriceCacheIntoSummaryMetricsPart1>>,
) {
  const { goalDir, cachePath } = scope;
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nPrice the run.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");

  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome({
      status: "done",
      summary: "nothing to do",
      concerns: [],
      forward: [],
      decision: "done",
    });
    // Mirror opencode: the harness reports a literal 0 it cannot price.
    return fakeTurnResult(req, {
      usage: usage({ in: 1_000_000, out: 1_000_000, costUsd: 0 }),
    });
  });

  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    {
      harnesses: { fake: harness },
      priceSource: {
        cachePath,
        fetchModels: async () => {
          throw new Error("price fetch disabled in tests");
        },
      },
    },
  );

  const store = createFolderStore(goalDir, undefined, {});
  const metrics = yaml.parse(
    (await store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  expect(metrics.iterations[0]!.usage.costUsd).toBeCloseTo(24, 10);

  return { ...scope, store, metrics };
}

async function wiresPriceCacheIntoSummaryMetricsPart3(
  scope: Awaited<ReturnType<typeof wiresPriceCacheIntoSummaryMetricsPart2>>,
) {
  const { metrics, store } = scope;
  expect(metrics.iterations[0]!.roles.architect!.usage.costUsd).toBeCloseTo(
    24,
    10,
  );
  expect(metrics.iterations[0]!.unpricedTurns).toBe(0);

  const summary = (await store.readFile("iterations/1/summary.md"))!;
  expect(summary).toContain("- harness-reported cost: $0.0000");
  expect(summary).toContain("- list-price estimate: $24.0000");
  expect(summary).toContain(
    "- harness-reported cost by role: architect $0.0000",
  );
  expect(summary).toContain(
    "- list-price estimate by role: architect $24.0000",
  );
}

function registerPricedMetricsAndSummaryPart5(): void {
  it("falls back to the record's own usage when its attempts report nothing", async () => {
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
          // A harness that lists calls but reports no per-call counters.
          attempts: [
            {
              model: { id: "paid/one" },
              stop: { kind: "done" },
              usage: usage(),
            },
          ],
        }),
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
      expect(metrics.iterations[0]!.usage.costUsd).toBeCloseTo(4, 10);
      expect(metrics.iterations[0]!.usage.in).toBe(1_000_000);
      expect(metrics.iterations[0]!.unpricedTurns).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

async function pricesAllZeroUsagePart1(
  store: ReturnType<typeof createFolderStore>,
) {
  await store.ensureLayout();
  const records = [
    rec(1, {
      step: "architect",
      slug: undefined,
      model: { id: "paid/one" },
      usage: usage(),
    }),
    rec(2, { slug: "a", model: { id: "paid/one" }, usage: usage() }),
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
  return { records, metrics };
}

async function pricesAllZeroUsagePart2(
  store: ReturnType<typeof createFolderStore>,
  records: ReturnType<typeof rec>[],
) {
  const state = derive([task("a")], records);
  const rel = await writeIterationSummary(store, {
    iteration: 1,
    state,
    records,
    status: "in-progress",
    prices: TABLE,
  });
  const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
  expect(text).toContain("- harness-reported cost: unknown (2 unpriced turns)");
  expect(text).toContain("- list-price estimate: unknown (2 unpriced turns)");
  expect(text).toContain(
    "- harness-reported cost by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
  );
  expect(text).toContain(
    "- list-price estimate by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
  );
  expect(text).not.toContain("- harness-reported cost: $0.0000");
}

function registerPricedMetricsAndSummaryPart6(): void {
  it("prices all-zero usage as an unpriced turn in metrics and summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      const { records, metrics } = await pricesAllZeroUsagePart1(store);
      const one = metrics.iterations[0]!;
      expect(one.usage.costUsd).toBeUndefined();
      expect(one.unpricedTurns).toBe(2);
      expect(one.costPerMergedTask).toBeNull();
      expect(one.harnessCostPerMergedTask).toBeNull();
      expect(one.roles.architect!.usage.costUsd).toBeUndefined();
      expect(one.roles.architect!.unpricedTurns).toBe(1);
      expect(one.roles.implementer!.unpricedTurns).toBe(1);
      expect(metrics.totals.unpricedTurns).toBe(2);
      await pricesAllZeroUsagePart2(store, records);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("priced metrics and summary", () => {
  registerPricedMetricsAndSummaryPart5();

  registerPricedMetricsAndSummaryPart6();
});

describe("pricing in a launch", () => {
  it("wires the price cache into the summary and metrics of a harness-silent turn", async () => {
    const repo = createTmpRepo();
    try {
      const scope1 = await wiresPriceCacheIntoSummaryMetricsPart1(repo);
      const scope2 = await wiresPriceCacheIntoSummaryMetricsPart2(repo, scope1);
      await wiresPriceCacheIntoSummaryMetricsPart3(scope2);
    } finally {
      repo.cleanup();
    }
  }, 60_000);
});

describe("run-config price ids", () => {
  it("defaults to no mappings and resolves every configured model id", () => {
    expect(runConfigSchema.parse({}).priceIds).toEqual({});
    expect(() => runConfigSchema.parse({ priceIds: { "a/b": "" } })).toThrow();

    // The package suite must not reach outside the package: an equivalent
    // run-config shape, inline. (Validating the real run files' coverage is
    // a live-config test, not a unit test.)
    const run = runConfigSchema.parse(
      yaml.parse(`
aliases:
  architect: { harness: omp, model: anthropic/claude-opus-5-5, fallbacks: [{ model: opencode-go/deepseek-v4.1-flash }] }
  implementer: { harness: opencode, model: opencode/deepseek-v4.1-flash-free }
priceIds:
  opencode/beam-free: reflection/beam-1.0-501b-a23b
`),
    );
    const catalog: PriceTable = {
      "anthropic/claude-opus-5-5": {
        input: 4,
        cachedInput: 0.2,
        output: 20,
        reasoning: 20,
      },
      "deepseek/deepseek-v4.1-flash": {
        input: 0.0507,
        cachedInput: 0.001,
        output: 0.2028,
        reasoning: 0.2028,
      },
      "reflection/beam-1.0-501b-a23b": {
        input: 0.3,
        cachedInput: 0.04,
        output: 1,
        reasoning: 1,
      },
    };
    expect(run.aliases.architect!.model).toBe("anthropic/claude-opus-5-5");
    for (const alias of Object.values(run.aliases)) {
      expect(matchPrice(catalog, alias.model, run.priceIds)).toBeDefined();
      for (const fb of alias.fallbacks) {
        if ("model" in fb)
          expect(matchPrice(catalog, fb.model, run.priceIds)).toBeDefined();
      }
    }
    expect(
      matchPrice(catalog, "opencode/beam-free", run.priceIds),
    ).toBeDefined();
  });
});
