/**
 * The dispatch loop's mutable state helpers: the initial holds, the drain
 * arithmetic and the iteration's spend. The public shape lives in
 * `dispatch-types.ts`.
 */
import { makeCause } from "./cause.js";
import type { DispatchResult, DispatchState } from "./dispatch-types.js";
import { readHolds } from "./mailbox.js";
import type { PriceTable } from "./pricing.js";
import { pricedRecord } from "./pricing.js";
import type { Cause, StepRecord } from "./types.js";

/** The plan-check PM's unfixed findings, once, as the summary cause. */
export function planCheckCause(state: DispatchState): Cause | undefined {
  return state.planCheckFindings.length > 0
    ? makeCause(
        "boundary",
        `PM ladder routed to the architect: ${[...new Set(state.planCheckFindings)].join("; ")}`,
      )
    : undefined;
}

/** Agent turns charged to the iteration's turn count; boundary roles and infra stops are free. */
export function settledTurns(records: StepRecord[], iteration: number): number {
  return records.filter(
    (r) =>
      r.iteration === iteration &&
      r.actor === "agent" &&
      r.endedAt &&
      r.slug !== undefined &&
      r.step !== "architect" &&
      r.step !== "pm" &&
      r.stop?.kind !== "infra",
  ).length;
}

export function iterationStart(
  records: StepRecord[],
  iteration: number,
): number {
  const times = records
    .filter((r) => r.iteration === iteration)
    .map((r) => Date.parse(r.startedAt))
    .filter((n) => Number.isFinite(n));
  return times.length > 0 ? Math.min(...times) : Date.now();
}

/**
 * Dollars this iteration has already spent: every settled agent record priced
 * through `pricedRecord`, the same call metrics and digest make, so a retried
 * or fallen-back turn counts each reported attempt exactly once. A turn whose
 * cost is unknown adds $0 — the brake treats it as free because it has nothing
 * better to go on, and the summary reports how many turns were blind.
 */
export function iterationSpend(
  records: StepRecord[],
  iteration: number,
  prices: PriceTable,
  priceIds?: Record<string, string>,
): number {
  let usd = 0;
  for (const rec of records) {
    if (rec.iteration !== iteration || rec.actor !== "agent" || !rec.endedAt)
      continue;
    const cost = pricedRecord(rec, prices, priceIds).usage.costUsd;
    if (cost !== undefined) usd += cost;
  }
  return usd;
}

/** The initial holds; a read failure refuses the whole iteration. */
export async function readInitialHolds(
  state: DispatchState,
  knownSlugs: string[],
  initialRecords: StepRecord[],
): Promise<DispatchResult | undefined> {
  try {
    state.holds = (await readHolds(state.runtime.store, { knownSlugs })).holds;
    return undefined;
  } catch (err) {
    // A hold file that cannot be read decides what may merge, so nothing is
    // dispatched this iteration; the launch surfaces the infra stop.
    return {
      reason: "infra",
      cause: makeCause("error", `steer holds: ${(err as Error).message}`),
      turns: settledTurns(initialRecords, state.iteration),
      taskTurnsStarted: 0,
      allReadyHeld: false,
    };
  }
}
