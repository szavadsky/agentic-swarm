/** The delta usage replay: config alias legs price, silent harness tokens are marked. */

import { describe, expect, it } from "bun:test";
import type { Usage } from "../../src/harness/types.js";
import {
  type PriceTable,
  pricedRecord,
  pricedUsage,
} from "../../src/kernel/pricing.js";
import { stepRecordSchema } from "../../src/kernel/record-schema.js";

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

describe("config-alias replay", () => {
  const ALIAS_TABLE: PriceTable = {
    "vendor-a/flash-model": {
      input: 2,
      cachedInput: 0.1,
      output: 8,
      reasoning: 8,
    },
    "vendor-b/model-y-flash": {
      input: 0.5,
      cachedInput: 0.05,
      output: 2,
      reasoning: 2,
    },
    "vendor-a/model-z": {
      input: 3,
      cachedInput: 0.3,
      output: 12,
      reasoning: 12,
    },
  };

  // Run-config aliases are keyed by the harness spelling of each leg; the
  // bare id is not a table name and is priced through `priceIds` instead.
  const ALIASES: Record<string, { model: { id: string } }> = {
    "flash-leg": { model: { id: "host-a/flash-model" } },
    "flash-high-leg": { model: { id: "model-y-flash-high" } },
    "z-free-leg": { model: { id: "host-a/model-z-free" } },
    "short-leg": { model: { id: "short-model" } },
  };

  const PRICE_IDS: Record<string, string> = {
    "short-model": "vendor-a/model-z",
  };

  it("prices every alias leg at its own table row", () => {
    const priced = new Map(
      Object.entries(ALIASES).map(([alias, leg]) => [
        alias,
        pricedRecord(
          { model: leg.model, usage: usage({ in: 1_000_000 }) },
          ALIAS_TABLE,
          PRICE_IDS,
        ),
      ]),
    );
    for (const alias of Object.keys(ALIASES)) {
      expect(priced.get(alias)?.costKnown).toBe(true);
    }
    expect(priced.get("flash-leg")?.usage.costUsd).toBeCloseTo(2, 10);
    expect(priced.get("flash-high-leg")?.usage.costUsd).toBeCloseTo(0.5, 10);
    // The free-tier leg stays a known $0 while its list is the paid row.
    expect(priced.get("z-free-leg")?.usage.costUsd).toBe(0);
    expect(priced.get("z-free-leg")?.usage.listCostUsd).toBeCloseTo(3, 10);
    // The bare id reaches a row only through the run-config mapping.
    expect(priced.get("short-leg")?.usage.costUsd).toBeCloseTo(3, 10);
    expect(priced.get("short-leg")?.usage.listCostUsd).toBeCloseTo(3, 10);
  });

  it("replays a harness-silent turn plus its reported retry", () => {
    // On its own the silent attempt prices to nothing and carries the mark.
    const silent = pricedUsage(usage(), "host-a/flash-model", ALIAS_TABLE);
    expect(silent.usage.tokensReported).toBe(false);
    expect(silent.costKnown).toBe(false);

    const priced = pricedRecord(
      {
        model: { id: "host-a/flash-model" },
        attempts: [
          {
            model: { id: "host-a/flash-model" },
            stop: { kind: "done" },
            usage: usage(),
          },
          {
            model: { id: "host-a/flash-model" },
            stop: { kind: "done" },
            usage: usage({ in: 1_000_000 }),
          },
        ],
      },
      ALIAS_TABLE,
      PRICE_IDS,
    );
    // The reported retry carries the sum, so the aggregate stays unmarked.
    expect(priced.usage.tokensReported).toBeUndefined();
    // The reported retry still prices and the aggregate stays known.
    expect(priced.costKnown).toBe(true);
    expect(priced.usage.costUsd).toBeCloseTo(2, 10);
  });

  it("marks a record whose only usage is a silent turn as unpriced", () => {
    const priced = pricedRecord(
      {
        model: { id: "host-a/flash-model" },
        attempts: [
          {
            model: { id: "host-a/flash-model" },
            stop: { kind: "done" },
            usage: usage(),
          },
        ],
      },
      ALIAS_TABLE,
      PRICE_IDS,
    );
    expect(priced.usage.tokensReported).toBe(false);
    expect(priced.costKnown).toBe(false);
    expect(priced.usage.costUsd).toBeUndefined();
  });

  it("marks a zero-counter usage as unreported and leaves a reported one unmarked", () => {
    const silent = pricedUsage(usage(), "vendor-a/flash-model", ALIAS_TABLE);
    expect(silent.usage.tokensReported).toBe(false);
    const reported = pricedUsage(
      usage({ in: 1_000_000 }),
      "vendor-a/flash-model",
      ALIAS_TABLE,
    );
    expect(reported.usage.tokensReported).toBeUndefined();
    // A harness may report a cost without token counters: the cost stands
    // and the tokens stay marked unreported.
    const costOnly = pricedUsage(
      usage({ costUsd: 0.02 }),
      "mystery/model",
      ALIAS_TABLE,
    );
    expect(costOnly.costKnown).toBe(true);
    expect(costOnly.usage.costUsd).toBeCloseTo(0.02, 10);
    expect(costOnly.usage.tokensReported).toBe(false);
  });

  it("accepts a settled record whose usage marks tokens as unreported", () => {
    const settled = pricedRecord(
      { model: { id: "vendor-a/flash-model" }, usage: usage() },
      ALIAS_TABLE,
      PRICE_IDS,
    );
    expect(settled.usage.tokensReported).toBe(false);
    expect(
      stepRecordSchema.safeParse({
        seq: 1,
        iteration: 1,
        step: "implement",
        round: 1,
        actor: "agent",
        model: { id: "vendor-a/flash-model" },
        usage: settled.usage,
        startedAt: new Date(0).toISOString(),
      }).success,
    ).toBe(true);
  });
});
