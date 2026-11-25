/** Rebutted reviews: a `changes` request answered by replies alone and then accepted. */

import type { StepRecord } from "./types.js";
import type {
  RebuttedReview,
  RebuttedReviewInput,
} from "./waste-rebutted-types.js";
export type { RebuttedReview } from "./waste-rebutted-types.js";

/** A turn the reduction routes: ended with an outcome, not cut short. */
function routedTurn(rec: StepRecord): boolean {
  return (
    rec.actor === "agent" &&
    rec.endedAt !== undefined &&
    rec.outcome?.status !== undefined &&
    rec.stop?.kind !== "truncated"
  );
}

/** The first later agent turn on the same task, whatever it delivered. */
function nextAgentTurn(
  ordered: readonly StepRecord[],
  rec: StepRecord,
): StepRecord | undefined {
  return ordered.find(
    (next) =>
      next.seq > rec.seq &&
      routedTurn(next) &&
      next.slug !== undefined &&
      next.slug === rec.slug &&
      (next.revision ?? 0) === (rec.revision ?? 0),
  );
}

/**
 * The answer a review's `changes` got: a task turn that committed nothing and
 * answered in `replies`. A code change, no reply or a verdict turn leaves the
 * request standing.
 */
function repliesOnlyAnswer(
  ordered: readonly StepRecord[],
  review: StepRecord,
): StepRecord | undefined {
  const answer = nextAgentTurn(ordered, review);
  if (!answer || answer.outcome?.verdict !== undefined) return undefined;
  if (answer.outcome?.status !== "done") return undefined;
  if ((answer.outcome.replies?.length ?? 0) === 0) return undefined;
  return answer.edits?.files === 0 ? answer : undefined;
}

/** The next review verdict the same task delivered. */
function nextVerdict(
  ordered: readonly StepRecord[],
  rec: StepRecord,
): StepRecord | undefined {
  return ordered.find(
    (next) =>
      next.seq > rec.seq &&
      routedTurn(next) &&
      next.slug === rec.slug &&
      (next.revision ?? 0) === (rec.revision ?? 0) &&
      next.outcome?.verdict !== undefined,
  );
}

/** The reviews whose change requests the author rebutted and the next review accepted. */
export function rebuttedReviewsOf(
  input: RebuttedReviewInput,
): RebuttedReview[] {
  return input.ordered
    .filter((rec) => {
      if (
        !routedTurn(rec) ||
        rec.outcome?.verdict !== "changes" ||
        input.wasted.has(input.recordOf(rec))
      ) {
        return false;
      }
      const answer = repliesOnlyAnswer(input.ordered, rec);
      return (
        answer !== undefined &&
        nextVerdict(input.ordered, answer)?.outcome?.verdict === "approve"
      );
    })
    .map((review) => {
      const role = input.roleOf(review.step);
      return {
        record: input.recordOf(review),
        role,
        alias: review.alias ?? role,
        ...(review.slug ? { slug: review.slug } : {}),
        step: review.step,
        round: review.round,
        summary: input.summaryOf(review.outcome?.summary ?? "no summary"),
      };
    });
}
