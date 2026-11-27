/** The waste accounting an iteration accumulates. */

import type { StepRecord } from "./types.js";
import { type QuotaStop } from "./waste-quota.js";
import { type RebuttedReview } from "./waste-rebutted.js";

/**
 * Why a turn was wasted. Rebutted reviews are not a reason: a change request
 * the author answered with replies alone, which the next review accepted, is
 * the accepted tax, counted apart from waste.
 */
export interface WasteCounts {
  /** The implementer spent tokens and landed nothing. */
  implementerFailure: number;
  /** The outcome/verdict protocol failed: refusal, truncation, invalid outcome. */
  structureProtocol: number;
  /** A containment breach refused the turn's work. */
  structureContainment: number;
  /** Outcome-repair calls were needed before the turn delivered. */
  structureOutcomeChannel: number;
  /** Infra stopped the turn or a gate could not run. */
  structureInfra: number;
  /**
   * A gate red, a gate that could not run, or an infra misjudgment rejected
   * the turn although the work was not at fault: the same tree passed, or the
   * task had to be re-run.
   */
  incorrectRejection: number;
}

export type WasteReason = keyof WasteCounts;

/** One wasted turn; the record names the turn and the evidence names its proof. */
export interface WasteEntry {
  reason: WasteReason;
  /** Goal-relative record directory of the wasted turn. */
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  /** Goal-relative record directory that proves the classification. */
  evidence: string;
  detail: string;
}

export interface WasteAccounting {
  /** Wasted turns in this iteration: one entry per turn. */
  turns: number;
  counts: WasteCounts;
  entries: WasteEntry[];
  /** Quota stops that landed no work; reported apart from waste. */
  quotaStops: QuotaStop[];
  /** Review turns rebutted by replies alone and then accepted; counted apart from waste. */
  rebuttedReviews: RebuttedReview[];
}

export interface WasteInput {
  /** The iteration's records, in any order. */
  records: readonly StepRecord[];
  /**
   * Other iterations' records, evidence only. A gate timeout or an
   * infra-misjudged rejection may park a task in an earlier iteration, so the
   * turn that re-runs it lands here without its park.
   */
  history?: readonly StepRecord[];
  /** The role a step's prompt names, for the per-role counts. */
  roleOf(step: string): string;
}
