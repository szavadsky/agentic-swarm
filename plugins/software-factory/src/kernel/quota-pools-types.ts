/** The quota pools' latch and call shapes. */

/** One pool's stored latch: when it may serve again, and a probe in flight. */
export interface PoolReset {
  /** Epoch ms at which the pool may serve again; a past time leaves a probe due. */
  resetAt: number;
  /** An admitted probe has not reported yet: the pool serves no one until it does. */
  probing?: true;
}

/** Pool key -> its stored latch. */
export type PoolResets = Map<string, PoolReset>;

/** What one tier call may do with its pool. */
export type PoolCall =
  | { kind: "free" }
  | { kind: "latched" }
  | { kind: "probe"; claim: PoolReset };
