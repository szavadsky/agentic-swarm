/** Numbering and formatting plan-review findings. */

import type { NumberedPlanFinding, PlanReviewPack } from "./types.js";

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
