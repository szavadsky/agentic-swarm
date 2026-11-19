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
  let retriesLeft = Math.max(0, policy.retries);
  let retryIndex = 0;
  let last: { outcome: AttemptOutput<T>; model: ModelRef } | undefined;

  for (const model of chain) {
    for (;;) {
      const outcome = await opts.run(model);
      attempts.push(...(outcome.attempts ?? []));
      attempts.push({ model, stop: outcome.stop, usage: outcome.usage });
      last = { outcome, model };
      if (outcome.stop.kind !== "infra") {
        return { outcome, attempts };
      }
      if (retriesLeft > 0 && isRetryableInfra(outcome.stop)) {
        const delay = Math.min(
          policy.baseDelayMs * 2 ** retryIndex,
          policy.maxDelayMs,
        );
        retriesLeft -= 1;
        retryIndex += 1;
        if (delay > 0) await sleep(delay);
        continue;
      }
      break;
    }
  }

  // `chain` is never empty (primary is always present).
  return { outcome: last!.outcome, attempts };
}
