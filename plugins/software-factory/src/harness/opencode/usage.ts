import fs from "node:fs";
import type { Usage } from "../types.js";
import { zeroUsage } from "../usage.js";

/** Session counters from `session export` `info.tokens` or `GET /api/session`. */
export interface OpencodeSessionTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

/**
 * A real export records cache writes only on the session total (`info.tokens`),
 * not on any assistant message or `step_finish` part, so per-turn usage comes
 * from the session-level delta. Opencode reports one cache-write counter with no
 * TTL split, so it prices as 5m like the step stream does.
 */
export function usageFromSessionDelta(
  before: OpencodeSessionTokens | undefined,
  after: OpencodeSessionTokens
): Usage {
  const delta = (a: number | undefined, b: number | undefined) =>
    Math.max(0, (b ?? 0) - (a ?? 0));
  const usage = zeroUsage();
  usage.in = delta(before?.input, after.input);
  usage.cacheRead = delta(before?.cache?.read, after.cache?.read);
  usage.cacheWrite5m = delta(before?.cache?.write, after.cache?.write);
  usage.out = delta(before?.output, after.output);
  usage.reasoningOut = delta(before?.reasoning, after.reasoning);
  return usage;
}

/** Session counters from a `session export` file, or undefined when it is unreadable. */
export function readExportTokens(file: string): OpencodeSessionTokens | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed?.info?.tokens;
  } catch {
    return undefined;
  }
}
