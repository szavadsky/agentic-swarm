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

/**
 * Field-wise sum; the token counters stay disjoint. Cost stays known when
 * either side knows it, so an explicit $0 never degrades to unknown and
 * unknown plus unknown stays unknown.
 */
export function addUsage(a: Usage, b: Usage): Usage {
  const costUsd =
    a.costUsd === undefined && b.costUsd === undefined
      ? undefined
      : (a.costUsd ?? 0) + (b.costUsd ?? 0);
  return {
    in: a.in + b.in,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    out: a.out + b.out,
    reasoningOut: a.reasoningOut + b.reasoningOut,
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}
