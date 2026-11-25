/** The retry/fallback mechanism's public shapes, shared by every adapter. */

import type { Stop, TurnAttempt, Usage } from "./types.js";

/** One retry/fallback policy: bounded retries with the shared fallback chain. */
export interface RetryPolicy {
  /** Extra calls shared by the whole chain, only for retryable causes. */
  retries: number;
  baseDelayMs: number;
  /**
   * Longest single backoff, and the longest stated quota wait a retry may sit
   * out: a quota stop naming a longer wait is not retried.
   */
  maxDelayMs: number;
}

/** One call's outcome: its stop, the usage it cost, and the value it produced. */
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
