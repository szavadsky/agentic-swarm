/** The index sections a pack preparer may name with a pointer and a one-line brief. */

import { z } from "zod";

/**
 * The sections the preparer decides on. Every other section always renders
 * whole: dispatch-critical facts and pointers the architect must not lose.
 */
export const PACK_SECTIONS = [
  "planCheck",
  "planReview",
  "forwarded",
  "spikeFindings",
  "pmAnswers",
  "codeMap",
] as const;

export type PackSection = (typeof PACK_SECTIONS)[number];

/** One section the preparer judged better as a brief; the script places it. */
export const packBriefSchema = z.object({
  section: z.enum(PACK_SECTIONS),
  summary: z
    .string()
    .min(1)
    .describe(
      "one line: what the section says and why it does not change this iteration's plan",
    ),
});

export type PackBrief = z.infer<typeof packBriefSchema>;
