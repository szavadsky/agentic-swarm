import { describe, expect, it } from "bun:test";
import type { Usage } from "../../src/harness/types.js";
import { addUsage, zeroUsage } from "../../src/harness/usage.js";
import {
  isFreeTierId,
  matchPrice,
  type PriceTable,
  priceTableOnly,
  priceUsage,
  pricedRecord,
  pricedUsage,
} from "../../src/kernel/pricing.js";

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

function priceUsageAtAggregationTimePart1() {
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
}

function priceUsageAtAggregationTimePart2() {
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

  it("keeps a repriced table figure out of the harness column", () => {
    // A harness that reported nothing takes its cost from the table; repricing
    // for metrics must not turn that estimate into a harness report.
    const once = pricedUsage(usage({ in: 1_000_000 }), "paid/one", TABLE);
    expect(once.usage.harnessCostUsd).toBeUndefined();

    const again = pricedUsage(once.usage, "paid/one", TABLE);
    expect(again.usage.costUsd).toBeCloseTo(4, 10);
    expect(again.usage.listCostUsd).toBeCloseTo(4, 10);
    expect(again.usage.harnessCostUsd).toBeUndefined();
  });
}

function harnessIdMatchingAgainstOpenRouterPart1() {
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

  return { OPENROUTER };
}

function harnessIdMatchingAgainstOpenRouterPart2(
  scope: ReturnType<typeof harnessIdMatchingAgainstOpenRouterPart1>,
) {
  const { OPENROUTER } = scope;
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
}

function harnessIdMatchingAgainstOpenRouterPart3(
  scope: ReturnType<typeof harnessIdMatchingAgainstOpenRouterPart1>,
) {
  const { OPENROUTER } = scope;
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
}

describe("price usage at aggregation time", () => {
  priceUsageAtAggregationTimePart1();

  priceUsageAtAggregationTimePart2();
});

describe("harness id matching against the OpenRouter table", () => {
  const scope1 = harnessIdMatchingAgainstOpenRouterPart1();
  harnessIdMatchingAgainstOpenRouterPart2(scope1);
  harnessIdMatchingAgainstOpenRouterPart3(scope1);
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
