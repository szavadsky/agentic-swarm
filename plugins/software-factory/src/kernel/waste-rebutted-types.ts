/** A rebutted review and the record facts its classification reads. */

import type { StepRecord } from "./types.js";

/**
 * A review whose `changes` the author rebutted with replies alone and the next
 * review accepted: the request was withdrawn, so it is accepted tax, not waste.
 */
export interface RebuttedReview {
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  summary: string;
}

export interface RebuttedReviewInput {
  /** The iteration's records, sorted by seq. */
  ordered: readonly StepRecord[];
  /** Record paths already counted as waste: a structure failure wins. */
  wasted: ReadonlySet<string>;
  /** The role a step's prompt names. */
  roleOf(step: string): string;
  /** Goal-relative record directory of a turn. */
  recordOf(rec: StepRecord): string;
  /** One line, so a long model summary never breaks the section or the pack. */
  summaryOf(text: string): string;
}
