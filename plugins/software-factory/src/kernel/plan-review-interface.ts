import type { Outcome, PlanReviewMark, PlanReviewOutcome } from "./types.js";
export type { PlanReviewRound } from "./plan-review-types.js";

/**
 * A completed plan review delivers findings, not a verdict: a bare done hides
 * the technical concerns the architect must see before the PM.
 */
export function validatePlanReviewDelivery(outcome: Outcome): string[] {
  if (outcome.status !== "done") return [];
  const findings: string[] = [];
  if (outcome.verdict !== undefined) {
    findings.push(
      "a plan review has no verdict: deliver `planReview` findings instead",
    );
  }
  if (!outcome.planReview) {
    findings.push(
      "planReview is required on a completed plan review: {technical: [], planNotes: []} when the plan has no findings",
    );
  }
  return findings;
}

/**
 * The architect answers every finding the review delivered: one mark per
 * number 1..N, no duplicate and no number outside the review. A return turn
 * takes no goal decision and no verdict; the consult already decided.
 */
export function validatePlanReturnDelivery(
  findings: PlanReviewOutcome,
  outcome: Outcome,
): string[] {
  if (outcome.status !== "done") return [];
  const problems: string[] = [];
  if (outcome.decision !== undefined) {
    problems.push(
      "a plan-review return takes no decision: the consult already decided continue",
    );
  }
  if (outcome.verdict !== undefined) {
    problems.push("a plan-review return takes no verdict");
  }
  problems.push(...validatePlanReviewMarks(findings, outcome.planReviewMarks));
  return problems;
}

/** Every finding marked exactly once, within 1..N. */
export function validatePlanReviewMarks(
  findings: PlanReviewOutcome,
  marks: readonly PlanReviewMark[] | undefined,
): string[] {
  const total = findings.technical.length + findings.planNotes.length;
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const mark of marks ?? []) {
    if (mark.finding < 1 || mark.finding > total) {
      problems.push(
        `planReviewMarks: finding ${mark.finding} is outside 1..${total}`,
      );
    } else if (seen.has(mark.finding)) {
      problems.push(`planReviewMarks: finding ${mark.finding} is marked twice`);
    } else {
      seen.add(mark.finding);
    }
  }
  for (let number = 1; number <= total; number++) {
    if (!seen.has(number)) {
      problems.push(`planReviewMarks: finding ${number} is unmarked`);
    }
  }
  return problems;
}
