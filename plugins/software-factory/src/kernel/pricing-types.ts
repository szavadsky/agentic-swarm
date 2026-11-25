/** The price table and the priced usage it yields. */

import type {
  ModelRef,
  ServedUsage,
  TurnAttempt,
  Usage,
} from "../harness/types.js";

/** USD per million tokens for one model. All four rates are required. */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  /** Reasoning tokens; `out` already excludes them where the harness splits the counters. */
  reasoning: number;
}

/**
 * Price-source model id -> price. A harness id absent from the table is
 * unpriced, not free: only a zero rate or a free-tier id with a known list
 * price makes a turn a known $0.
 */
export type PriceTable = Record<string, ModelPrice>;

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
