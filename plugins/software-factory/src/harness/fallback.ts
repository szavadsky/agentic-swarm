import { statedWaitMs } from "./stated-wait.js";
import type { ModelRef, Stop, TurnAttempt, Usage } from "./types.js";

/**
 * One retry/fallback mechanism for every adapter (LOG D8): bounded retries for
 * transient infra causes, then the same-harness fallback chain, then the last
 * infra stop. Every call is reported in `attempts`.
 */
export interface RetryPolicy {
  /** Extra calls shared by the whole chain, only for retryable causes. */
  retries: number;
  baseDelayMs: number;
  /** Longest single backoff; a quota stop naming a longer wait is not retried. */
  maxDelayMs: number;
}

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
 * A quota stop whose stated wait is longer than the retry window cannot be
 * cleared by another call seconds later: the chain advances instead. Rate and
 * network stops, and quota stops naming no wait, keep the bounded retries.
 */
function quotaWaitBeyondWindow(stop: Stop, maxDelayMs: number): boolean {
  if (stop.kind !== "infra" || stop.cause !== "quota") return false;
  const waitMs = statedWaitMs(stop.details);
  return waitMs !== undefined && waitMs > maxDelayMs;
}

export interface AttemptOutput<T> {
  stop: Stop;
  usage: Usage;
  value: T;
  /** Calls made inside this one (a lost session retried de novo), recorded first. */
  attempts?: TurnAttempt[];
}

export interface FallbackResult<T> {
  outcome: AttemptOutput<T>;
  attempts: TurnAttempt[];
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

/** Bounded retries for one model, in order; returns its final attempt output. */
async function runModelAttempts<T>(
  model: ModelRef,
  run: (model: ModelRef) => Promise<AttemptOutput<T>>,
  policy: RetryPolicy,
  counters: { retriesLeft: number; retryIndex: number },
  attempts: TurnAttempt[],
  sleep: (ms: number) => Promise<void>,
): Promise<AttemptOutput<T>> {
  for (;;) {
    const outcome = await run(model);
    attempts.push(...(outcome.attempts ?? []));
    attempts.push({ model, stop: outcome.stop, usage: outcome.usage });
    if (outcome.stop.kind !== "infra") return outcome;
    if (counters.retriesLeft > 0 && isRetryableInfra(outcome.stop)) {
      if (quotaWaitBeyondWindow(outcome.stop, policy.maxDelayMs))
        return outcome;
      const delay = Math.min(
        policy.baseDelayMs * 2 ** counters.retryIndex,
        policy.maxDelayMs,
      );
      counters.retriesLeft -= 1;
      counters.retryIndex += 1;
      if (delay > 0) await sleep(delay);
      continue;
    }
    return outcome;
  }
}

export async function runWithFallbacks<T>(opts: {
  primary: ModelRef;
  fallbacks?: ModelRef[];
  retry?: Partial<RetryPolicy>;
  run: (model: ModelRef) => Promise<AttemptOutput<T>>;
  sleep?: (ms: number) => Promise<void>;
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
    const outcome = await runModelAttempts(
      model,
      opts.run,
      policy,
      counters,
      attempts,
      sleep,
    );
    last = { outcome, model };
    if (outcome.stop.kind !== "infra") return { outcome, attempts };
  }

  // `chain` is never empty (primary is always present).
  return { outcome: last!.outcome, attempts };
}
