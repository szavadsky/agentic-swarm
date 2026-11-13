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
 * price for the model. A harness `0` contradicts a table entry and is treated
 * as unreported, because harnesses such as opencode report 0 for turns they
 * cannot price; free models stay a known $0 through an explicit zero entry.
 * `undefined` means unknown — the model is not in the table and the harness was
 * silent — and never means $0.
 *
 * Cache writes have no rate of their own in the table, so they are priced at
 * the input rate; harnesses report no distinct write rate here.
 */
export function priceUsage(usage: Usage, model: string, table: PriceTable): number | undefined {
  const price = table[model];
  // A harness zero is authoritative only when no table entry can contradict it.
  if (usage.costUsd !== undefined && (usage.costUsd !== 0 || !price)) return usage.costUsd;
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

/** A turn's raw usage with its cost attached, leaving records themselves untouched. */
export function pricedUsage(usage: Usage, model: string | undefined, table: PriceTable): PricedUsage {
  const costUsd = priceUsage(usage, model ?? "", table);
  return costUsd === undefined
    ? { usage, costKnown: false }
    : { usage: { ...usage, costUsd }, costKnown: true };
}
