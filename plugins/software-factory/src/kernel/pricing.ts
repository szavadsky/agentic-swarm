import type { ModelRef, TurnAttempt, Usage } from "../harness/types.js";
import { addUsage, zeroUsage } from "../harness/usage.js";

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

function tokenTotal(usage: Usage): number {
  return (
    usage.in +
    usage.cacheRead +
    usage.cacheWrite5m +
    usage.cacheWrite1h +
    usage.out +
    usage.reasoningOut
  );
}

/**
 * Whether a call reported usage at all. All-zero counters are not a report: a
 * real turn consumes input, so a harness that leaves them at zero (pi via acpx)
 * is silent, and a literal harness `0` cost is its unreported marker too.
 */
function reportsUsage(usage: Usage): boolean {
  return (
    tokenTotal(usage) > 0 ||
    (usage.costUsd !== undefined && usage.costUsd !== 0)
  );
}

/**
 * Table price for one usage in USD, ignoring any harness figure. When
 * `cachedPrefix` is set and the harness did not split the cache (input only,
 * no cache counters), the input is priced at the cached rate: a resumed
 * turn's prefix is cached, and an unreported split on a resumed turn is that
 * prefix, not fresh input. Fresh turns and split caches always price input
 * at the full rate.
 *
 * Cache writes have no rate of their own in the table, so they are priced at
 * the input rate; harnesses report no distinct write rate here.
 */
export function priceTableOnly(
  usage: Usage,
  model: string,
  table: PriceTable,
  opts: { cachedPrefix?: boolean } = {},
): number | undefined {
  if (tokenTotal(usage) === 0) return undefined;
  const price = table[model];
  if (!price) return undefined;
  const cacheUnsplit =
    usage.in > 0 &&
    usage.cacheRead === 0 &&
    usage.cacheWrite5m === 0 &&
    usage.cacheWrite1h === 0;
  const inputRate =
    opts.cachedPrefix && cacheUnsplit ? price.cachedInput : price.input;
  return (
    ((usage.in + usage.cacheWrite5m + usage.cacheWrite1h) * inputRate +
      usage.cacheRead * price.cachedInput +
      usage.out * price.output +
      usage.reasoningOut * price.reasoning) /
    PER_MTOK
  );
}

/**
 * Cost of one turn in USD: a non-zero harness figure wins, otherwise the table
 * price for the model. A harness `0` is unreported, because harnesses such as
 * opencode report 0 for turns they cannot price; free models stay a known $0
 * through an explicit zero entry in the table. `undefined` means unknown — the
 * model is not in the table, the harness was silent, or no usage was reported
 * at all — and never means $0.
 */
export function priceUsage(
  usage: Usage,
  model: string,
  table: PriceTable,
  opts: { cachedPrefix?: boolean } = {},
): number | undefined {
  const harness = usage.harnessCostUsd ?? usage.costUsd;
  if (harness !== undefined && harness !== 0) return harness;
  return priceTableOnly(usage, model, table, opts);
}

export interface PricedUsage {
  usage: Usage;
  /** False when any part of the turn has no source for its cost. */
  costKnown: boolean;
}

/**
 * A turn's usage with its costs attached: `costUsd` is the priced cost (a
 * non-zero harness figure wins, otherwise the table), `listCostUsd` is the
 * table-only list-price equivalent for subscriptions that under-report, and
 * `harnessCostUsd` preserves the harness figure when pricing filled the cost
 * from the table. Idempotent: repricing an already-priced usage keeps the
 * original harness figure and recomputes both prices from the same tokens. A
 * crash-sealed record has no usage at all; nothing priced it, so it stays
 * unknown instead of becoming a false $0 from empty counters.
 */
export function pricedUsage(
  usage: Usage | undefined,
  model: string | undefined,
  table: PriceTable,
  opts: { cachedPrefix?: boolean } = {},
): PricedUsage {
  if (!usage) return { usage: zeroUsage(), costKnown: false };
  const harness = usage.harnessCostUsd ?? usage.costUsd;
  const costUsd = priceUsage(usage, model ?? "", table, opts);
  const listCostUsd = priceTableOnly(usage, model ?? "", table, opts);
  if (costUsd === undefined) {
    // Drop the harness's unpriced figure: a raw `0` must not sum into a total
    // as if it were a known zero. The original figure stays visible as
    // `harnessCostUsd`, and the list price stays when the table has the model.
    const unpriced: Usage = { ...usage };
    delete unpriced.costUsd;
    if (harness !== undefined) unpriced.harnessCostUsd = harness;
    else delete unpriced.harnessCostUsd;
    if (listCostUsd !== undefined) unpriced.listCostUsd = listCostUsd;
    else delete unpriced.listCostUsd;
    return { usage: unpriced, costKnown: false };
  }
  const priced: Usage = { ...usage, costUsd };
  if (harness !== undefined) priced.harnessCostUsd = harness;
  else delete priced.harnessCostUsd;
  if (listCostUsd !== undefined) priced.listCostUsd = listCostUsd;
  else delete priced.listCostUsd;
  return { usage: priced, costKnown: true };
}

/** The record fields pricing reads; a settled agent step carries all four. */
export interface UsageRecord {
  usage?: Usage;
  model?: ModelRef;
  attempts?: TurnAttempt[];
  /** Resumed turn whose unsplit input is the cached prefix, set at record time. */
  cachedPrefix?: boolean;
}

/**
 * One record's usage with cost attached. `attempts` is the complete list of
 * calls the harness made, including the final call, while `usage` holds only
 * the last call of each harness turn: summing the attempts replaces `usage`
 * rather than adding to it, so the final call is counted once. An attempt list
 * that reports nothing falls back to the record's own counters, which is what a
 * harness without per-call usage leaves behind.
 */
export function pricedRecord(rec: UsageRecord, table: PriceTable): PricedUsage {
  const opts = { cachedPrefix: rec.cachedPrefix };
  const reported = (rec.attempts ?? []).filter((attempt) =>
    reportsUsage(attempt.usage),
  );
  if (reported.length === 0)
    return pricedUsage(rec.usage, rec.model?.id, table, opts);
  let usage = zeroUsage();
  let costKnown = true;
  for (const attempt of reported) {
    const priced = pricedUsage(attempt.usage, attempt.model.id, table, opts);
    usage = addUsage(usage, priced.usage);
    costKnown = costKnown && priced.costKnown;
  }
  return { usage, costKnown };
}
