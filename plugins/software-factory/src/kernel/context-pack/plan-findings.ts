/** Numbering and formatting plan-review findings. */

import type {
  ForwardedConcern,
  NumberedPlanFinding,
  PlanReviewPack,
} from "./types.js";

/** The findings in mark order: technical concerns first, then plan notes. */
export function numberedPlanFindings(
  findings: Pick<PlanReviewPack, "technical" | "planNotes">,
): NumberedPlanFinding[] {
  return [
    ...findings.technical.map((finding) => ({
      ...finding,
      kind: "technical" as const,
    })),
    ...findings.planNotes.map((finding) => ({
      ...finding,
      kind: "planNote" as const,
    })),
  ].map((finding, index) => ({ ...finding, number: index + 1 }));
}

/** One finding line: `<n>. <plan line> — <what would satisfy it>`. */
export function formatPlanFinding(finding: NumberedPlanFinding): string {
  return `${finding.number}. ${finding.planLine} — ${finding.finding}`;
}

/**
 * One open concern line for the checker's brief: the id it names in
 * `planCheck.concerns`, what the concern is, and where it was raised.
 */
export function formatOpenConcern(concern: ForwardedConcern): string {
  const repeats =
    concern.occurrences && concern.occurrences > 1
      ? ` x${concern.occurrences}`
      : "";
  return `- ${concern.id} [${concern.kind}/${concern.calibration}]${repeats}: ${concern.text}${
    concern.evidence ? ` (${concern.evidence})` : ""
  } — ${concern.source}`;
}
