/**
 * The dispatch loop's mutable state and its public result/option types. One
 * dispatch owns one iteration: the running set, the quarantine faults, the
 * steers it has seen, and the drain it is finishing.
 */
import { makeCause } from "./cause.js";
import type { Hold } from "./mailbox.js";
import { readHolds } from "./mailbox.js";
import type { PriceTable } from "./pricing.js";
import { pricedRecord } from "./pricing.js";
import type { DrainController } from "./signals.js";
import type { Cause, KernelRuntime, StepRecord } from "./types.js";

export interface DispatchResult {
  reason: "boundary" | "drained" | "terminal" | "infra" | "cancelled";
  cause?: Cause;
  /** Completed agent turns in this iteration. */
  turns: number;
  /** Started task turns in this iteration. */
  taskTurnsStarted: number;
  /** The latest plancheck verdict of the pass, if any. */
  planCheck?: "progress" | "architect";
  allReadyHeld: boolean;
}

export interface DispatchOptions {
  iteration?: number;
  /**
   * The inbox steer ids the boundary's read covered. Anything else present at
   * dispatch start was dropped after that read, and the architect never saw
   * it, so it gets a PM steer turn here.
   */
  seenSteers?: string[];
  /**
   * The launch's drain controller. A first signal drains through the same
   * channel as an iteration limit: unstarted tasks are refused while started
   * ones finish their flow.
   */
  signals?: DrainController;
  /**
   * Sleeps out a transient fault's backoff before it is re-dispatched. Tests
   * inject a recorder instead of waiting.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The inbox watch's timer cadence, in milliseconds; defaults to
   * `STEER_WATCH_TICK_MS`. Its stable window is the run's
   * `limits.steerDebounceSeconds`, so a test shortens the wait from its run
   * config.
   */
  steerWatchTickMs?: number;
}

export interface Running {
  promise: Promise<void>;
  agent: boolean;
  /** Quota pool and model the turn drew admission against; agent turns only. */
  subscription?: string;
  model?: string;
}

export interface InfraFault {
  cause: string;
  retries: number;
  /** The backoff elapsed: the slug is dispatchable again this iteration. */
  due: boolean;
  retry: boolean;
}

/** Holds still in force: the goal-wide hold name and the slugs held. */
export interface ActiveHolds {
  /** Task slug -> the hold's owner as the boundary names it (`s1`, `concern c-…`). */
  slugs: Map<string, string>;
  /** The steer holding the whole goal, when one does. */
  goal?: string;
}

export interface DispatchState {
  runtime: KernelRuntime;
  opts: DispatchOptions;
  iteration: number;
  taskTurnsStarted: number;
  planCheckVerdict?: "progress" | "architect";
  planCheckFindings: string[];
  running: Map<string, Running>;
  started: Set<string>;
  infra: Map<string, InfraFault>;
  cancelled: boolean;
  drain?: Cause;
  seenSteers: Set<string>;
  /** Fresh files seen once but not yet stable: steer id -> last content hash. */
  settling: Map<string, string>;
  holds: Hold[];
  sleep: (ms: number) => Promise<void>;
  /** The iteration's dollar brake, if configured. */
  usdLimit?: number;
}

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
