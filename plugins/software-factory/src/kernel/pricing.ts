import { zeroUsage } from "../harness/usage.js";
import type { Usage } from "../harness/types.js";

/** USD per million tokens for one model. All four rates are required. */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  /** Reasoning tokens; `out` already excludes them where the harness splits the counters. */
  reasoning: number;
}

/**
 * Model id (as recorded on the turn) -> price. A model absent from the table is
 * unpriced, not free: only an explicit zero entry makes a turn a known $0.
 */
export type PriceTable = Record<string, ModelPrice>;

const PER_MTOK = 1_000_000;

/**
 * Cost of one turn in USD: a non-zero harness figure wins, otherwise the table
 * price for the model. A harness `0` is unreported, because harnesses such as
 * opencode report 0 for turns they cannot price; free models stay a known $0
 * through an explicit zero entry in the table. `undefined` means unknown — the
 * model is not in the table and the harness was silent — and never means $0.
 *
 * Cache writes have no rate of their own in the table, so they are priced at
 * the input rate; harnesses report no distinct write rate here.
 */
export function priceUsage(usage: Usage, model: string, table: PriceTable): number | undefined {
  if (usage.costUsd !== undefined && usage.costUsd !== 0) return usage.costUsd;
  const price = table[model];
  if (!price) return undefined;
  return (
    ((usage.in + usage.cacheWrite5m + usage.cacheWrite1h) * price.input +
      usage.cacheRead * price.cachedInput +
      usage.out * price.output +
      usage.reasoningOut * price.reasoning) /
    PER_MTOK
  );
}

export interface PricedUsage {
  usage: Usage;
  /** False when neither the harness nor the table priced this turn. */
  costKnown: boolean;
}

/**
 * A turn's raw usage with its cost attached, leaving records themselves
 * untouched. A crash-sealed record has no usage at all; nothing priced it, so
 * it stays unknown instead of becoming a false $0 from empty counters.
 */
export function pricedUsage(
  usage: Usage | undefined,
  model: string | undefined,
  table: PriceTable
): PricedUsage {
  if (!usage) return { usage: zeroUsage(), costKnown: false };
  const costUsd = priceUsage(usage, model ?? "", table);
  if (costUsd === undefined) {
    // Drop the harness's unpriced figure: a raw `0` must not sum into a total
    // as if it were a known zero.
    const unpriced = { ...usage };
    delete unpriced.costUsd;
    return { usage: unpriced, costKnown: false };
  }
  return { usage: { ...usage, costUsd }, costKnown: true };
}
