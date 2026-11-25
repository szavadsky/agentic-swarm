import { statedWaitMs } from "./stated-wait.js";
import type {
  AttemptOutput,
  FallbackResult,
  RetryPolicy,
} from "./fallback-types.js";
import type { ModelRef, PoolLatch, Stop, TurnAttempt } from "./types.js";

export type {
  AttemptOutput,
  FallbackResult,
  RetryPolicy,
} from "./fallback-types.js";

/**
 * One retry/fallback mechanism for every adapter (LOG D8): bounded retries for
 * transient infra causes, then the same-harness fallback chain, then the last
 * infra stop. A quota stop is a pool decision, not a retry: it is final after at
 * most one retry at a stated reset, and it latches the pool so a retry or
 * fallback that reads the latch makes no call. Every call is reported in
 * `attempts`.
 */

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  retries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
};

/**
 * Quota, provider saturation and transport loss are worth retrying; auth,
 * overflow, timeout and crash are not.
 */
export function isTransientInfraCause(cause: string): boolean {
  return cause === "quota" || cause === "rate" || cause === "network";
}

export function isRetryableInfra(stop: Stop): boolean {
  return stop.kind === "infra" && isTransientInfraCause(stop.cause);
}

/**
 * A quota stop's stated reset, when it names one. A wait inside `maxDelayMs`
 * is slept in full and retried once; a longer wait, or none at all, makes the
 * stop final at once. Rate and network stops keep the bounded backoff.
 */
function quotaStatedWait(stop: Stop): number | undefined {
  if (stop.kind !== "infra" || stop.cause !== "quota") return undefined;
  return statedWaitMs(stop.details);
}

/** Primary first, then fallbacks, deduplicated by model id and effort. */
export function modelChain(
  primary: ModelRef,
  fallbacks?: ModelRef[],
): ModelRef[] {
  const seen = new Set<string>();
  const chain: ModelRef[] = [];
  for (const model of [primary, ...(fallbacks ?? [])]) {
    const key = `${model.id}\u0000${model.effort ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push(model);
  }
  return chain;
}

/** The wait a quota stop may retry at, or undefined when the stop is final. */
function quotaRetryDelay(
  stop: Stop,
  policy: RetryPolicy,
  counters: { retriesLeft: number; retryIndex: number },
  quotaRetries: number,
  pool: PoolLatch | undefined,
): number | undefined {
  const wait = quotaStatedWait(stop);
  if (
    wait === undefined ||
    wait > policy.maxDelayMs ||
    quotaRetries > 0 ||
    counters.retriesLeft === 0 ||
    (pool !== undefined && !pool.live())
  ) {
    return undefined;
  }
  return wait;
}

/** The backoff a rate or network stop may retry after; undefined means final. */
function transientRetryDelay(
  stop: Stop,
  policy: RetryPolicy,
  counters: { retriesLeft: number; retryIndex: number },
  pool: PoolLatch | undefined,
): number | undefined {
  if (counters.retriesLeft === 0 || !isRetryableInfra(stop)) return undefined;
  if (pool !== undefined && !pool.live()) return undefined;
  return Math.min(
    policy.baseDelayMs * 2 ** counters.retryIndex,
    policy.maxDelayMs,
  );
}

/** A quota stop already seen still extends its reset when another leg latched first. */
function latchSeenQuota(stop: Stop, pool: PoolLatch): void {
  if (stop.kind === "infra" && stop.cause === "quota") pool.dead(stop);
}

/** Bounded retries for one model, in order; returns its final attempt output. */
async function runModelAttempts<T>(
  model: ModelRef,
  run: (model: ModelRef) => Promise<AttemptOutput<T>>,
  policy: RetryPolicy,
  counters: { retriesLeft: number; retryIndex: number },
  attempts: TurnAttempt[],
  sleep: (ms: number) => Promise<void>,
  pool: PoolLatch | undefined,
): Promise<AttemptOutput<T>> {
  let quotaRetries = 0;
  let previous: AttemptOutput<T> | undefined;
  for (;;) {
    // A leg that reads the latch makes no call: another tier already decided
    // the pool is dead. A quota stop already seen still extends its reset.
    if (previous !== undefined && pool !== undefined && !pool.live()) {
      latchSeenQuota(previous.stop, pool);
      return previous;
    }
    const outcome = await run(model);
    attempts.push(...(outcome.attempts ?? []));
    attempts.push({ model, stop: outcome.stop, usage: outcome.usage });
    previous = outcome;
    if (outcome.stop.kind !== "infra") return outcome;

    const quotaWait = quotaRetryDelay(
      outcome.stop,
      policy,
      counters,
      quotaRetries,
      pool,
    );
    if (quotaWait !== undefined) {
      quotaRetries += 1;
      counters.retriesLeft -= 1;
      counters.retryIndex += 1;
      await sleep(quotaWait);
      continue;
    }
    if (outcome.stop.cause === "quota") {
      // One retry at a stated reset; a no-wait, over-window or repeated quota
      // stop chooses for every alias drawing on the pool.
      pool?.dead(outcome.stop);
      return outcome;
    }
    const delay = transientRetryDelay(outcome.stop, policy, counters, pool);
    if (delay === undefined) return outcome;
    counters.retriesLeft -= 1;
    counters.retryIndex += 1;
    if (delay > 0) await sleep(delay);
  }
}

export async function runWithFallbacks<T>(opts: {
  primary: ModelRef;
  fallbacks?: ModelRef[];
  retry?: Partial<RetryPolicy>;
  run: (model: ModelRef) => Promise<AttemptOutput<T>>;
  sleep?: (ms: number) => Promise<void>;
  /** The tier's pool: read before every retry and fallback, latched on a final quota stop. */
  pool?: PoolLatch;
}): Promise<FallbackResult<T>> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...opts.retry };
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const chain = modelChain(opts.primary, opts.fallbacks);
  const attempts: TurnAttempt[] = [];
  const counters = {
    retriesLeft: Math.max(0, policy.retries),
    retryIndex: 0,
  };
  let last: { outcome: AttemptOutput<T>; model: ModelRef } | undefined;

  for (const model of chain) {
    // Only the first call is the caller's to admit; a later model is a fallback
    // and must read the latch before making its call.
    if (last !== undefined && opts.pool !== undefined && !opts.pool.live())
      break;
    const outcome = await runModelAttempts(
      model,
      opts.run,
      policy,
      counters,
      attempts,
      sleep,
      opts.pool,
    );
    last = { outcome, model };
    if (outcome.stop.kind !== "infra") return { outcome, attempts };
    // Quota chose for the whole pool: no later model on the same tier chain.
    if (outcome.stop.cause === "quota") return { outcome, attempts };
  }

  // `chain` is never empty (primary is always present).
  if (!last) throw new Error("model chain is empty");
  return { outcome: last.outcome, attempts };
}
