import type { Usage } from "../types.js";

/**
 * pi's `/session` reply is human text, not JSON (acpx probe §4):
 * `Tokens: in 2403, out 87, cache read 1216, cache write 0, total 3706`.
 * The counters are cumulative for the session; output already includes any
 * reasoning pi did, so it stays in `out` and `reasoningOut` stays zero.
 */
export function usageFromAcpxSessionText(text: string): Usage | undefined {
  const match =
    /Tokens:\s*in\s+([\d,]+),\s*out\s+([\d,]+),\s*cache read\s+([\d,]+),\s*cache write\s+([\d,]+)/i.exec(
      text,
    );
  if (!match) return undefined;
  const [, input, output, cacheRead, cacheWrite] = match;
  if (!input || !output || !cacheRead || !cacheWrite) return undefined;
  const count = (value: string): number => Number(value.replace(/,/g, ""));
  return {
    in: count(input),
    cacheRead: count(cacheRead),
    cacheWrite5m: count(cacheWrite),
    cacheWrite1h: 0,
    out: count(output),
    reasoningOut: 0,
  };
}

/** Session-cumulative counters become one turn's usage by non-negative delta. */
export function turnUsageFromTotals(
  current: Usage,
  previous: Usage | undefined,
): Usage {
  if (!previous) return current;
  const delta = (now: number, before: number): number =>
    Math.max(0, now - before);
  return {
    in: delta(current.in, previous.in),
    cacheRead: delta(current.cacheRead, previous.cacheRead),
    cacheWrite5m: delta(current.cacheWrite5m, previous.cacheWrite5m),
    cacheWrite1h: delta(current.cacheWrite1h, previous.cacheWrite1h),
    out: delta(current.out, previous.out),
    reasoningOut: delta(current.reasoningOut, previous.reasoningOut),
  };
}
