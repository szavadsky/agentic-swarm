// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import { addUsage, zeroUsage } from "../../src/harness/usage.js";
import { runConfigSchema } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import {
  isFreeTierId,
  matchPrice,
  type PriceTable,
  priceTableOnly,
  priceUsage,
  pricedRecord,
  pricedUsage,
} from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
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

describe("price usage at aggregation time", () => {
  it("prices every token counter at its table rate per Mtok", () => {
    const cost = priceUsage(
      usage({
        in: 1_000_000,
        cacheRead: 2_000_000,
        cacheWrite5m: 500_000,
        cacheWrite1h: 500_000,
        out: 1_000_000,
        reasoningOut: 1_000_000,
      }),
      "paid/one",
      TABLE,
    );
    // input 4 + cached 0.4 + writes 4 (1M at the input rate) + output 20 + reasoning 20.
    expect(cost).toBeCloseTo(48.4, 10);
  });

  it("keeps known zero distinct from unknown and lets a non-zero harness cost win", () => {
    expect(priceUsage(usage({ costUsd: 0, in: 1 }), "free/zero", TABLE)).toBe(
      0,
    );
    expect(
      priceUsage(usage({ costUsd: 0, in: 1 }), "mystery/model", TABLE),
    ).toBeUndefined();
    expect(
      priceUsage(usage({ costUsd: 0.05, in: 1_000_000 }), "paid/one", TABLE),
    ).toBe(0.05);
    expect(
      priceUsage(usage({ in: 1_000_000 }), "mystery/model", TABLE),
    ).toBeUndefined();
    expect(priceUsage(usage({ in: 1 }), "free/zero", TABLE)).toBe(0);
  });

  it("treats all-zero counters as unreported, even on a table-listed or free model", () => {
    // pi via acpx reports no usage; a real turn always consumes input.
    expect(priceUsage(usage(), "paid/one", TABLE)).toBeUndefined();
    expect(priceUsage(usage(), "free/zero", TABLE)).toBeUndefined();
    expect(
      priceUsage(usage({ costUsd: 0 }), "free/zero", TABLE),
    ).toBeUndefined();
    // A non-zero harness figure is a report even without token counters.
    expect(priceUsage(usage({ costUsd: 0.02 }), "mystery/model", TABLE)).toBe(
      0.02,
    );
  });

  it("reprices a harness zero that contradicts a table entry", () => {
    // opencode reports a literal 0 for turns it cannot price; the table fills it in.
    expect(
      priceUsage(usage({ costUsd: 0, in: 1_000_000 }), "paid/one", TABLE),
    ).toBeCloseTo(4, 10);
    // An explicit free entry still yields a known zero.
    expect(
      priceUsage(usage({ costUsd: 0, in: 1_000_000 }), "free/zero", TABLE),
    ).toBe(0);
  });

  it("sums costs without turning a known zero into unknown", () => {
    expect(addUsage(zeroUsage(), usage({ costUsd: 0 })).costUsd).toBe(0);
    expect(addUsage(zeroUsage(), zeroUsage()).costUsd).toBeUndefined();
    expect(
      addUsage(usage({ costUsd: 0.2 }), usage({ costUsd: 0 })).costUsd,
    ).toBe(0.2);
  });
});

describe("harness id matching against the OpenRouter table", () => {
  const OPENROUTER: PriceTable = {
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
    "minimax/minimax-m3.1-flash": {
      input: 0.075,
      cachedInput: 0.0075,
      output: 0.3,
      reasoning: 0.3,
    },
    "baidu/ernie-5.5-flash-preview:free": {
      input: 0,
      cachedInput: 0,
      output: 0,
      reasoning: 0,
    },
    "reflection/beam-1.0-501b-a23b": {
      input: 0.3,
      cachedInput: 0.04,
      output: 1,
      reasoning: 1,
    },
  };

  it("matches exact, provider-stripped, bare and effort-suffixed ids", () => {
    expect(matchPrice(OPENROUTER, "anthropic/claude-opus-5-5")?.input).toBe(4);
    // A surplus harness provider prefix is stripped before matching.
    expect(
      matchPrice(OPENROUTER, "opencode-go/deepseek-v4.1-flash")?.input,
    ).toBeCloseTo(0.0507, 10);
    // A bare harness id names the model, not its host.
    expect(matchPrice(OPENROUTER, "deepseek-v4.1-flash")?.input).toBeCloseTo(
      0.0507,
      10,
    );
    // The recorded id keeps the effort suffix; only acpx's --model gets the base.
    expect(
      matchPrice(OPENROUTER, "minimax-m3.1-flash-high")?.input,
    ).toBeCloseTo(0.075, 10);
    expect(matchPrice(OPENROUTER, "mystery/model")).toBeUndefined();
    // A qualified id that matches nothing exactly is another provider's
    // model, not this one: the same suffix must not match across providers.
    expect(matchPrice(OPENROUTER, "other/deepseek-v4.1-flash")).toBeUndefined();
  });

  it("lets an explicit priceId win and leaves a stale mapping unpriced", () => {
    expect(
      matchPrice(OPENROUTER, "opencode/beam-free", {
        "opencode/beam-free": "reflection/beam-1.0-501b-a23b",
      })?.input,
    ).toBeCloseTo(0.3, 10);
    // A mapping that names nothing is unpriced, never a silent mismatch.
    expect(
      matchPrice(OPENROUTER, "opencode/beam-free", {
        "opencode/beam-free": "retired/beam-0.9",
      }),
    ).toBeUndefined();
  });

  it("prices a free-tier turn at $0 actual with the paid list equivalent", () => {
    expect(isFreeTierId("opencode/beam-free")).toBe(true);
    expect(isFreeTierId("baidu/ernie-5.5-flash-preview:free")).toBe(true);
    expect(isFreeTierId("MiniMax/M3-FREE")).toBe(true);
    expect(isFreeTierId("free/zero")).toBe(false);
    expect(isFreeTierId("paid/one")).toBe(false);
    const paid = pricedUsage(
      usage({ costUsd: 0, in: 1_000_000 }),
      "opencode/minimax-m3.1-flash-free",
      OPENROUTER,
    );
    expect(paid.costKnown).toBe(true);
    expect(paid.usage.costUsd).toBe(0);
    expect(paid.usage.listCostUsd).toBeCloseTo(0.075, 10);
    expect(paid.usage.harnessCostUsd).toBe(0);
    // A free-tier id with no paid equivalent stays unknown, never $0.
    expect(
      priceUsage(usage({ in: 1 }), "opencode/nothing-free", OPENROUTER),
    ).toBeUndefined();
    expect(
      priceTableOnly(usage({ in: 1 }), "opencode/nothing-free", OPENROUTER),
    ).toBeUndefined();
  });

  it("prices an ernie turn from the :free entry at a known $0", () => {
    const priced = pricedUsage(
      usage({ in: 1_000_000, out: 500_000 }),
      "openrouter/baidu/ernie-5.5-flash-preview:free",
      OPENROUTER,
    );
    expect(priced.costKnown).toBe(true);
    expect(priced.usage.costUsd).toBe(0);
    expect(priced.usage.listCostUsd).toBe(0);
  });
});

describe("served model split", () => {
  it("prices each served model at its own row and never $0 for an unknown one", () => {
    const served = [
      {
        model: { id: "free/zero" },
        usage: usage({ in: 1_000_000, costUsd: 0 }),
      },
      { model: { id: "paid/one" }, usage: usage({ in: 1_000_000 }) },
    ];
    const priced = pricedRecord(
      {
        model: { id: "@free" },
        usage: usage({ in: 2_000_000 }),
        served,
        // The alias maps to the free row; the served split must win over both
        // this mapping and the attempts it also records.
        attempts: [
          {
            model: { id: "@free" },
            stop: { kind: "done" },
            usage: usage({ in: 2_000_000 }),
          },
        ],
      },
      TABLE,
      { "@free": "free/zero" },
    );
    expect(priced.usage.in).toBe(2_000_000);
    expect(priced.usage.costUsd).toBeCloseTo(4, 10);
    expect(priced.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(priced.costKnown).toBe(true);
    expect(priced.served?.map((entry) => entry.usage.costUsd)).toEqual([0, 4]);

    const partial = pricedRecord(
      {
        model: { id: "paid/one" },
        served: [
          ...served,
          { model: { id: "mystery/hop" }, usage: usage({ in: 1_000 }) },
        ],
      },
      TABLE,
    );
    expect(partial.costKnown).toBe(false);
    // The priced share still sums; the unlisted model stays unknown, not $0.
    expect(partial.usage.costUsd).toBeCloseTo(4, 10);
    expect(partial.served?.[2]?.costKnown).toBe(false);
    expect(partial.served?.[2]?.usage.costUsd).toBeUndefined();
  });
});

describe("priced metrics and summary", () => {
  it("prices per-role cost and counts unpriced turns in metrics", async () => {
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
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts a harness zero on an absent model and a usage-less record as unpriced", async () => {
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
      expect(text).toContain("- cost: $4.0500 (partial; 2 unpriced turns)");
      expect(text).toContain(
        "- cost by role: architect $4.0000; digest $0.0500; implementer unknown (1 unpriced turn); pm unknown (1 unpriced turn); reviewer $0.0000",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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

      expect(text).toContain("- cost: $4.0000 (partial; 1 unpriced turn)");
      expect(text).toContain(
        "- cost by role: architect $4.0000; implementer $0.0000; reviewer unknown (1 unpriced turn)",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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
      expect(text).toContain("- cost: unknown (2 unpriced turns)");
      expect(text).toContain(
        "- cost by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
      );
      expect(text).not.toContain("- cost: $0.0000");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prices every reported attempt once and keeps a partially priced turn partial", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
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
          model: { id: "mystery/one" },
          usage: usage({ in: 7 }),
          attempts: [
            {
              model: { id: "mystery/one" },
              stop: { kind: "done" },
              usage: usage({ in: 7 }),
            },
            {
              model: { id: "mystery/one" },
              stop: { kind: "done" },
              usage: usage({ costUsd: 0.25 }),
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
      expect(text).toContain("- cost: $8.2500 (partial; 1 unpriced turn)");
      expect(text).toContain(
        "architect $8.0000; implementer $0.2500 (partial; 1 unpriced turn)",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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

  it("prices all-zero usage as an unpriced turn in metrics and summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pricing-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
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
      const one = metrics.iterations[0]!;
      expect(one.usage.costUsd).toBeUndefined();
      expect(one.unpricedTurns).toBe(2);
      expect(one.costPerMergedTask).toBeNull();
      expect(one.roles.architect!.usage.costUsd).toBeUndefined();
      expect(one.roles.architect!.unpricedTurns).toBe(1);
      expect(one.roles.implementer!.unpricedTurns).toBe(1);
      expect(metrics.totals.unpricedTurns).toBe(2);

      const state = derive([task("a")], records);
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        prices: TABLE,
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain("- cost: unknown (2 unpriced turns)");
      expect(text).toContain(
        "- cost by role: architect unknown (1 unpriced turn); implementer unknown (1 unpriced turn)",
      );
      expect(text).not.toContain("- cost: $0.0000");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pricing in a launch", () => {
  it("wires the price cache into the summary and metrics of a harness-silent turn", async () => {
    const repo = createTmpRepo();
    try {
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
          "  steward: { harness: fake, model: fake-steward }",
          "  plan-checker: { harness: fake, model: fake-check }",
          "  plan-reviewer: { harness: fake, model: fake-plan-review }",
          "limits: { iterations: 1, concurrency: { overall: 1 } }",
          `worktreeRoot: ../${base}-wt`,
          `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
          "",
        ].join("\n"),
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
      fs.writeFileSync(
        path.join(goalDir, "intent.md"),
        "# Goal\n\nPrice the run.\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: bigger\n",
        "utf8",
      );

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
      expect(metrics.iterations[0]!.roles.architect!.usage.costUsd).toBeCloseTo(
        24,
        10,
      );
      expect(metrics.iterations[0]!.unpricedTurns).toBe(0);

      const summary = (await store.readFile("iterations/1/summary.md"))!;
      expect(summary).toContain("- cost: $24.0000");
      expect(summary).toContain("- cost by role: architect $24.0000");
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
