import type { Usage } from "./types.js";

export function zeroUsage(): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
  };
}

/** Field-wise sum; the four token counters stay disjoint. */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    in: a.in + b.in,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    out: a.out + b.out,
    reasoningOut: a.reasoningOut + b.reasoningOut,
    costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0),
  };
}
