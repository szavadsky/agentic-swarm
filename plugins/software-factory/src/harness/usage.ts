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
 * Field-wise sum; the token counters stay disjoint. Each cost column stays
 * known when either side knows it, so an explicit $0 never degrades to
 * unknown and unknown plus unknown stays unknown.
 */
export function addUsage(a: Usage, b: Usage): Usage {
  const sumKnown = (
    x: number | undefined,
    y: number | undefined,
  ): number | undefined =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  const costUsd = sumKnown(a.costUsd, b.costUsd);
  const listCostUsd = sumKnown(a.listCostUsd, b.listCostUsd);
  const harnessCostUsd = sumKnown(a.harnessCostUsd, b.harnessCostUsd);
  return {
    in: a.in + b.in,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    out: a.out + b.out,
    reasoningOut: a.reasoningOut + b.reasoningOut,
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(listCostUsd !== undefined ? { listCostUsd } : {}),
    ...(harnessCostUsd !== undefined ? { harnessCostUsd } : {}),
  };
}

/**
 * Whether a call reported usage at all. All-zero counters are not a report: a
 * real turn consumes input, so a harness that leaves them at zero (pi via acpx)
 * is silent, and a literal harness `0` cost is its unreported marker too.
 */
export function reportsUsage(usage: Usage): boolean {
  return (
    usage.in +
      usage.cacheRead +
      usage.cacheWrite5m +
      usage.cacheWrite1h +
      usage.out +
      usage.reasoningOut >
      0 ||
    (usage.costUsd !== undefined && usage.costUsd !== 0)
  );
}
