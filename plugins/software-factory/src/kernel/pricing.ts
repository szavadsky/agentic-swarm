import type {
  ModelRef,
  ServedUsage,
  TurnAttempt,
  Usage,
} from "../harness/types.js";
import { addUsage, reportsUsage, zeroUsage } from "../harness/usage.js";

/** USD per million tokens for one model. All four rates are required. */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  /** Reasoning tokens; `out` already excludes them where the harness splits the counters. */
  reasoning: number;
}

/**
 * OpenRouter model id -> price. A harness id absent from the table is unpriced,
 * not free: only a zero rate or a free-tier id with a known list price makes
 * a turn a known $0.
 */
export type PriceTable = Record<string, ModelPrice>;

/** Harness provider prefixes that never appear in OpenRouter ids. */
const HARNESS_PREFIXES = ["opencode-go", "opencode", "openrouter"];

/** Effort levels an adapter may leave suffixed on the recorded model id. */
const EFFORT_SUFFIXES = ["low", "medium", "high", "xhigh", "max"];

/** A free-tier id: the provider's own marker, `-free` or `:free`. */
export function isFreeTierId(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.endsWith("-free") || lower.endsWith(":free");
}

function stripHarnessPrefix(id: string): string {
  const slash = id.indexOf("/");
  if (slash < 0) return id;
  if (HARNESS_PREFIXES.includes(id.slice(0, slash).toLowerCase()))
    return id.slice(slash + 1);
  return id;
}

function swapFreeSuffix(id: string): string | undefined {
  const lower = id.toLowerCase();
  if (lower.endsWith("-free")) return `${id.slice(0, -"-free".length)}:free`;
  if (lower.endsWith(":free")) return `${id.slice(0, -":free".length)}-free`;
  return undefined;
}

function stripFreeSuffix(id: string): string | undefined {
  // Both suffixes are five characters; the paid equivalent prices the list.
  if (!isFreeTierId(id)) return undefined;
  return id.slice(0, -":free".length);
}

function stripEffortSuffix(id: string): string | undefined {
  const dash = id.lastIndexOf("-");
  if (dash < 0) return undefined;
  if (EFFORT_SUFFIXES.includes(id.slice(dash + 1).toLowerCase()))
    return id.slice(0, dash);
  return undefined;
}

/**
 * One harness id as every OpenRouter id it could name: itself, the
 * provider-stripped form, the effort-stripped forms, and each one's free-tier
 * spellings plus the paid equivalent. Earlier candidates win.
 */
function matchCandidates(model: string): string[] {
  const out: string[] = [];
  const push = (id: string | undefined): void => {
    if (id !== undefined && !out.includes(id)) out.push(id);
  };
  for (const base of [model, stripHarnessPrefix(model)]) {
    for (const root of [base, stripEffortSuffix(base)]) {
      if (root === undefined) continue;
      push(root);
      push(swapFreeSuffix(root));
      push(stripFreeSuffix(root));
    }
  }
  return out;
}

function resolvePriceId(
  model: string,
  priceIds?: Record<string, string>,
): string {
  if (!priceIds) return model;
  const lower = model.toLowerCase();
  const key = Object.keys(priceIds).find((k) => k.toLowerCase() === lower);
  return key ? priceIds[key]! : model;
}

interface PriceIndex {
  exact: Map<string, ModelPrice>;
  suffixes: Map<string, Array<{ id: string; price: ModelPrice }>>;
}

function indexPrices(table: PriceTable): PriceIndex {
  const exact = new Map<string, ModelPrice>();
  const suffixes = new Map<string, Array<{ id: string; price: ModelPrice }>>();
  for (const [id, price] of Object.entries(table)) {
    const lower = id.toLowerCase();
    if (!exact.has(lower)) exact.set(lower, price);
    const segment = lower.slice(lower.lastIndexOf("/") + 1);
    const group = suffixes.get(segment) ?? [];
    group.push({ id, price });
    suffixes.set(segment, group);
  }
  return { exact, suffixes };
}

function suffixPrice(
  ids: string[],
  suffixes: PriceIndex["suffixes"],
): ModelPrice | undefined {
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (lower.includes("/")) continue;
    const group = suffixes.get(lower);
    if (!group) continue;
    const [first] = [...group].sort(
      (a, b) =>
        Number(a.id.includes(":")) - Number(b.id.includes(":")) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return first!.price;
  }
  return undefined;
}

/**
 * The table entry for one harness model id. An explicit `priceIds` entry wins
 * over matching; then exact (case-insensitive), in candidate order; then the
 * provider-less suffix, but only for a bare candidate — a qualified id that
 * matches nothing exactly names another provider's model, not this one.
 * Suffix ties prefer a bare id over a `:variant`, then sort lexicographically,
 * so the match is deterministic. `undefined` means unpriced, never $0.
 */
export function matchPrice(
  table: PriceTable,
  model: string,
  priceIds?: Record<string, string>,
): ModelPrice | undefined {
  if (!model) return undefined;
  const ids = matchCandidates(resolvePriceId(model, priceIds));
  const { exact, suffixes } = indexPrices(table);
  for (const id of ids) {
    const hit = exact.get(id.toLowerCase());
    if (hit) return hit;
  }
  return suffixPrice(ids, suffixes);
}

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
 * OpenRouter price for one usage in USD, ignoring any harness figure: the
 * harness id is matched against the table (`matchPrice`), so a free-tier id
 * prices at its paid equivalent — this is the list-price column. When
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
  opts: { cachedPrefix?: boolean; priceIds?: Record<string, string> } = {},
): number | undefined {
  if (tokenTotal(usage) === 0) return undefined;
  const price = matchPrice(table, model, opts.priceIds);
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
 * Cost of one turn in USD: a non-zero harness figure wins, otherwise the
 * OpenRouter price for the model. A harness `0` is unreported, because
 * harnesses such as opencode report 0 for turns they cannot price; a
 * free-tier id with a known list price is a known $0 turn — the subscription
 * paid nothing marginal, and the list column carries the economics.
 * `undefined` means unknown — the model matches nothing, the harness was
 * silent, or no usage was reported at all — and never means $0.
 */
export function priceUsage(
  usage: Usage,
  model: string,
  table: PriceTable,
  opts: { cachedPrefix?: boolean; priceIds?: Record<string, string> } = {},
): number | undefined {
  const harness = usage.harnessCostUsd ?? usage.costUsd;
  if (harness !== undefined && harness !== 0) return harness;
  const list = priceTableOnly(usage, model, table, opts);
  if (list === undefined) return undefined;
  if (isFreeTierId(model)) return 0;
  return list;
}

/** One served model's usage with its own cost verdict. */
export interface PricedServedUsage extends ServedUsage {
  costKnown: boolean;
}

export interface PricedUsage {
  usage: Usage;
  /** False when any part of the turn has no source for its cost. */
  costKnown: boolean;
  /**
   * Per-model split when the turn resolved its model natively, each entry
   * priced at its own row. Absent for an aggregate-priced turn.
   */
  served?: PricedServedUsage[];
}

/**
 * A turn's usage split by the models that served it, each priced at its own
 * row: `usage` is the sum and `costKnown` is false when any served model has
 * neither a harness figure nor a table row. An unknown served model is
 * unpriced, never $0.
 */
export function pricedServed(
  served: readonly ServedUsage[],
  table: PriceTable,
  opts: { cachedPrefix?: boolean; priceIds?: Record<string, string> } = {},
): PricedUsage {
  let usage = zeroUsage();
  let costKnown = true;
  const entries: PricedServedUsage[] = [];
  for (const entry of served) {
    const priced = pricedUsage(entry.usage, entry.model.id, table, opts);
    usage = addUsage(usage, priced.usage);
    costKnown = costKnown && priced.costKnown;
    entries.push({
      model: entry.model,
      usage: priced.usage,
      costKnown: priced.costKnown,
    });
  }
  return { usage, costKnown, served: entries };
}

/**
 * A turn's usage with its costs attached: `costUsd` is the priced cost (a
 * non-zero harness figure wins, otherwise the table), `listCostUsd` is the
 * table-only list-price equivalent for subscriptions that under-report, and
 * `harnessCostUsd` preserves the harness figure when pricing filled the cost
 * from the table. Idempotent: repricing keeps the original harness figure and
 * recomputes both prices from the same tokens; a usage carrying only the list
 * column was priced from the table and stays list-sourced on reprice. A
 * crash-sealed record has no usage at all; nothing priced it, so it stays
 * unknown instead of becoming a false $0 from empty counters.
 */
export function pricedUsage(
  usage: Usage | undefined,
  model: string | undefined,
  table: PriceTable,
  opts: { cachedPrefix?: boolean; priceIds?: Record<string, string> } = {},
): PricedUsage {
  if (!usage) return { usage: zeroUsage(), costKnown: false };
  const harness =
    usage.harnessCostUsd ??
    (usage.listCostUsd === undefined ? usage.costUsd : undefined);
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

/** The record fields pricing reads; a settled agent step carries all five. */
export interface UsageRecord {
  usage?: Usage;
  model?: ModelRef;
  attempts?: TurnAttempt[];
  /**
   * Models the turn actually served, with their share of the tokens. Present
   * when one call switched models natively (omp `@` aliases); each is priced at
   * its own row instead of the record's single model.
   */
  served?: ServedUsage[];
  /** Resumed turn whose unsplit input is the cached prefix, set at record time. */
  cachedPrefix?: boolean;
  /** This turn's session-end compaction, priced as the hot cache read it was. */
  compactUsage?: Usage;
}

/**
 * One record's usage with cost attached. `served`, when present, is the turn's
 * complete per-model split: summing it replaces both `usage` and `attempts`,
 * because the same tokens appear in all three and only the split prices each
 * model at its own row. Otherwise `attempts` is the complete list of calls the
 * harness made, including the final call, while `usage` holds only the last
 * call of each harness turn: summing the attempts replaces `usage` rather than
 * adding to it, so the final call is counted once. An attempt list that reports
 * nothing falls back to the record's own counters, which is what a harness
 * without per-call usage leaves behind. The compaction is a separate call
 * outside every attempt, so it is always added on top.
 */
export function pricedRecord(
  rec: UsageRecord,
  table: PriceTable,
  priceIds?: Record<string, string>,
): PricedUsage {
  const opts = { cachedPrefix: rec.cachedPrefix, priceIds };
  const reported = (rec.attempts ?? []).filter((attempt) =>
    reportsUsage(attempt.usage),
  );
  let priced: PricedUsage;
  if (rec.served && rec.served.length > 0) {
    priced = pricedServed(rec.served, table, opts);
  } else if (reported.length === 0) {
    priced = pricedUsage(rec.usage, rec.model?.id, table, opts);
  } else {
    let usage = zeroUsage();
    let costKnown = true;
    for (const attempt of reported) {
      const attemptPriced = pricedUsage(
        attempt.usage,
        attempt.model.id,
        table,
        opts,
      );
      usage = addUsage(usage, attemptPriced.usage);
      costKnown = costKnown && attemptPriced.costKnown;
    }
    priced = { usage, costKnown };
  }
  let { usage, costKnown } = priced;
  if (rec.compactUsage && reportsUsage(rec.compactUsage)) {
    const compact = pricedUsage(rec.compactUsage, rec.model?.id, table, {
      cachedPrefix: true,
      priceIds,
    });
    usage = addUsage(usage, compact.usage);
    costKnown = costKnown && compact.costKnown;
    // The compaction ran on the session's own model, so its tokens join that
    // model's row; when the split does not carry that model they stay in the
    // aggregate only rather than inventing an unpriced row.
    const target = priced.served?.find(
      (entry) => entry.model.id === rec.model?.id,
    );
    if (target) {
      target.usage = addUsage(target.usage, compact.usage);
      target.costKnown = target.costKnown && compact.costKnown;
    }
  }
  return priced.served
    ? { usage, costKnown, served: priced.served }
    : { usage, costKnown };
}
