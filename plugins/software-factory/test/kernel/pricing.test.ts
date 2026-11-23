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
    // A harness via acpx that reports no usage; a real turn always consumes input.
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
    // A harness reports a literal 0 for turns it cannot price; the table fills it in.
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

function harnessIdMatchingPart1() {
  const TABLE_ROWS: PriceTable = {
    "vendor/flagship-5": {
      input: 4,
      cachedInput: 0.2,
      output: 20,
      reasoning: 20,
    },
    "vendor/mini-flash": {
      input: 0.0507,
      cachedInput: 0.001,
      output: 0.2028,
      reasoning: 0.2028,
    },
    "vendor/hopper-flash": {
      input: 0.075,
      cachedInput: 0.0075,
      output: 0.3,
      reasoning: 0.3,
    },
    "vendor/tiny-preview:free": {
      input: 0,
      cachedInput: 0,
      output: 0,
      reasoning: 0,
    },
    "vendor/lamp-1": {
      input: 0.3,
      cachedInput: 0.04,
      output: 1,
      reasoning: 1,
    },
  };

  return { TABLE_ROWS };
}

function harnessIdMatchingPart2(
  scope: ReturnType<typeof harnessIdMatchingPart1>,
) {
  const { TABLE_ROWS } = scope;
  it("matches a table id exactly, case-insensitively", () => {
    expect(matchPrice(TABLE_ROWS, "vendor/flagship-5")?.input).toBe(4);
    expect(matchPrice(TABLE_ROWS, "Vendor/Flagship-5")?.input).toBe(4);
    expect(matchPrice(TABLE_ROWS, "mystery/model")).toBeUndefined();
  });

  it("strips no harness prefix: an id from another provider must name its price id or stay unpriced", () => {
    // A bare candidate no longer names the model: matching is exact-only.
    expect(matchPrice(TABLE_ROWS, "other/mini-flash")).toBeUndefined();
    expect(matchPrice(TABLE_ROWS, "other-host/mini-flash")).toBeUndefined();
    // ...unless the run config names the price id.
    expect(
      matchPrice(TABLE_ROWS, "other-host/mini-flash", {
        "other-host/mini-flash": "vendor/mini-flash",
      })?.input,
    ).toBeCloseTo(0.0507, 10);
  });

  it("strips no effort suffix: the recorded id must be exact or mapped", () => {
    // A `-high` suffixed id names nothing exactly, so it needs a priceIds row.
    expect(matchPrice(TABLE_ROWS, "vendor/hopper-flash-high")).toBeUndefined();
    expect(
      matchPrice(TABLE_ROWS, "vendor/hopper-flash-high", {
        "vendor/hopper-flash-high": "vendor/hopper-flash",
      })?.input,
    ).toBeCloseTo(0.075, 10);
  });

  it("lets an explicit priceId win and leaves a stale mapping unpriced", () => {
    expect(
      matchPrice(TABLE_ROWS, "local/lamp-free", {
        "local/lamp-free": "vendor/lamp-1",
      })?.input,
    ).toBeCloseTo(0.3, 10);
    // A mapping that names nothing is unpriced, never a silent mismatch.
    expect(
      matchPrice(TABLE_ROWS, "local/lamp-free", {
        "local/lamp-free": "retired/lamp-0",
      }),
    ).toBeUndefined();
  });
}

function freeTierPart(scope: ReturnType<typeof harnessIdMatchingPart1>) {
  const { TABLE_ROWS } = scope;
  it("detects a free-tier id by its own marker and prices a free turn at $0 with the list equivalent", () => {
    expect(isFreeTierId("local/lamp-free")).toBe(true);
    expect(isFreeTierId("vendor/tiny-preview:free")).toBe(true);
    expect(isFreeTierId("Vendor/Mini-FREE")).toBe(true);
    expect(isFreeTierId("free/zero")).toBe(false);
    expect(isFreeTierId("paid/one")).toBe(false);
    // A free-tier id with a no-cost table row prices to a known $0.
    expect(
      priceUsage(usage({ in: 1 }), "vendor/tiny-preview:free", TABLE_ROWS),
    ).toBe(0);
    expect(
      priceUsage(usage({ in: 1 }), "other-host/nothing-free", TABLE_ROWS),
    ).toBeUndefined();
    expect(
      priceTableOnly(usage({ in: 1 }), "other-host/nothing-free", TABLE_ROWS),
    ).toBeUndefined();
  });
}

describe("price usage at aggregation time", () => {
  priceUsageAtAggregationTimePart1();

  priceUsageAtAggregationTimePart2();
});

describe("harness id matching against the price table", () => {
  const scope1 = harnessIdMatchingPart1();
  harnessIdMatchingPart2(scope1);
  freeTierPart(scope1);
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
