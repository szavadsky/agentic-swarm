/** Quota stops: the pool stopped the turn, so it is reported apart from waste. */

import type { StepRecord } from "./types.js";

/**
 * A turn the provider stopped on quota before it landed anything. The pool is
 * the cause, not the turn: reported apart from waste, never counted in it.
 */
export interface QuotaStop {
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  detail: string;
}

/**
 * A quota exhaustion a harness reports as a crash: "You've hit your session
 * limit" arrives that way, and older records keep that shape.
 */
const SESSION_LIMIT = /session[- ]?limit|usage limit/i;

/** A stop the provider imposed on the pool: quota, an exhausted pool, or a session limit. */
function namesQuota(stop: StepRecord["stop"]): boolean {
  if (stop?.kind !== "infra") return false;
  if (stop.cause === "quota" || stop.cause === "unavailable") return true;
  return stop.cause === "crash" && SESSION_LIMIT.test(stop.details ?? "");
}

/**
 * A quota stop that landed no work: the turn was refused a launch, so the pool
 * is reported apart. A stop on a turn that did land real work (edits) stays
 * waste: the work existed and the turn still failed to deliver.
 */
export function isQuotaStop(rec: StepRecord): boolean {
  return (
    rec.actor === "agent" &&
    rec.endedAt !== undefined &&
    rec.outcome === undefined &&
    namesQuota(rec.stop) &&
    (rec.edits?.files ?? 0) === 0
  );
}

/** One row per quota stop, in record order, with its own record and detail. */
export function quotaStopsOf(
  ordered: readonly StepRecord[],
  roleOf: (step: string) => string,
  recordOf: (rec: StepRecord) => string,
  detailOf: (rec: StepRecord) => string,
): QuotaStop[] {
  return ordered.filter(isQuotaStop).map((rec) => {
    const role = roleOf(rec.step);
    return {
      record: recordOf(rec),
      role,
      alias: rec.alias ?? role,
      ...(rec.slug ? { slug: rec.slug } : {}),
      step: rec.step,
      round: rec.round,
      detail: detailOf(rec),
    };
  });
}
