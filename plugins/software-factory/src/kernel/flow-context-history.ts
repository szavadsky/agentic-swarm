/**
 * The record facts a turn target and its prompt read: the latest review,
 * acceptance, checks and merge-checks, the task's base commits, and the red
 * gate request count. Pure reads over the record list.
 */
import { formatFixDispositions } from "./record.js";
import { isVerdictStep } from "./review.js";
import type { FlowDefinition, StepRecord, TaskState } from "./types.js";

export function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

export function lastReview(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
): StepRecord | undefined {
  const reviewIds = new Set(
    flow.steps.filter((s) => s.review || s.adjudicate).map((s) => s.id),
  );
  return records
    .filter((r) => r.slug === slug && reviewIds.has(r.step) && r.outcome)
    .sort(bySeq)
    .at(-1);
}

/**
 * The latest turn that accepted or sent back the work: a review, QA or review
 * adjudicator. The author sees its findings; QA sees the findings its next
 * round answers even when the checks record between them is newer.
 */
export function lastAcceptance(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
): StepRecord | undefined {
  const verdictIds = new Set(flow.steps.filter(isVerdictStep).map((s) => s.id));
  return records
    .filter((r) => r.slug === slug && verdictIds.has(r.step) && r.outcome)
    .sort(bySeq)
    .at(-1);
}

/** The latest productive agent turn: the fix whose dispositions a deferred review judges. */
export function lastProductiveTurn(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
): StepRecord | undefined {
  const productiveIds = new Set(
    flow.steps.filter((s) => !isVerdictStep(s)).map((s) => s.id),
  );
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.actor === "agent" &&
        r.outcome &&
        productiveIds.has(r.step),
    )
    .sort(bySeq)
    .at(-1);
}

/**
 * The current fix round's per-finding dispositions for the deferred review:
 * every reply by its finding number, plus the fix summary. Round 1 has no fix
 * to judge unless a cleanliness revision turn ran, and a stale turn must never
 * speak for this one.
 */
export function fixDispositions(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
  round: number,
  state?: TaskState,
): string {
  if (round < 2 && !state?.cleanlinessJustified) return "";
  const fix = lastProductiveTurn(records, slug, flow);
  if (!fix || fix.round !== round || !fix.outcome) return "";
  return formatFixDispositions(fix.outcome);
}

export function lastChecks(
  records: StepRecord[],
  slug: string,
): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "checks")
    .sort(bySeq)
    .at(-1);
}

export function lastMergeChecks(
  records: StepRecord[],
  slug: string,
): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "merge-checks")
    .sort(bySeq)
    .at(-1);
}

export function firstBase(
  records: StepRecord[],
  slug: string,
): string | undefined {
  return records
    .filter((r) => r.slug === slug && r.actor === "agent" && r.base)
    .sort(bySeq)[0]?.base;
}

/**
 * The commit the task's current revision started from: the first agent record
 * stamped with that revision. Records without the field read as revision 0,
 * as derive treats them. An amend's first turn stamps the integration head it
 * merged, which is the range a review of the revised branch should judge.
 */
export function revisionBase(
  records: StepRecord[],
  slug: string,
  revision: number,
): string | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.actor === "agent" &&
        (r.revision ?? 0) === revision &&
        r.base,
    )
    .sort(bySeq)[0]?.base;
}

export function countRedGateRequests(
  records: readonly StepRecord[],
  slug: string,
): number {
  let count = 0;
  for (const rec of records) {
    if (rec.slug !== slug || !rec.endedAt) continue;
    if (rec.step === "checks" && rec.ok === false) count += 1;
    else if (
      rec.step === "merge" &&
      rec.ok === false &&
      rec.cause?.kind === "gates"
    )
      count += 1;
  }
  return count;
}
