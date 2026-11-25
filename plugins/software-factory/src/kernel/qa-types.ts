/** The QA report and the catches metrics count. */

import { z } from "zod";

/** Who else carried a QA finding, so a QA-only count never credits QA alone with it. */
export type QaCatchSource = "gate" | "reviewer" | "reviewer-after" | "none";

/** One QA finding with the record that raised it and who else carried it. */
export interface QaCatch {
  task: string;
  finding: string;
  /** Goal-relative record directory, for evidence. */
  record: string;
  round: number;
  /** `none` makes it a QA-only catch: no gate or reviewer, before or after, carried it. */
  alsoCaughtBy: QaCatchSource;
}

/** The iteration's QA findings: the QA-only count per task, and a sample of all. */
export interface QaCatches {
  /** Every distinct QA finding, whatever else carried it. */
  total: number;
  /** The QA-only catches; a finding a later reviewer repeats is not one. */
  count: number;
  /** QA-only catches per task. Every task with a QA record, zeros included. */
  byTask: Record<string, number>;
  /** The first `limit` distinct QA findings in record order, each with its source. */
  sample: QaCatch[];
}

/**
 * The QA acceptance verdict and its findings. QA is not a reviewer: it accepts
 * the work or sends it back with an actionable list, and the author answers
 * each finding by its position.
 */
export const qaReportSchema = z.object({
  verdict: z
    .enum(["accept", "changes"])
    .describe("accept the work, or send it back with findings"),
  findings: z
    .array(z.string().trim().min(1))
    .default([])
    .describe("one finding per change request, in the author's reply order"),
});

export type QaReport = z.infer<typeof qaReportSchema>;
