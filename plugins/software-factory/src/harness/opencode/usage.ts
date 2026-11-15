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
 * from the export counters: the totals alone when the turn owns the whole
 * session (no resume), or the post-turn total minus the pre-turn baseline when
 * the session is resumed. Callers fall back to the step stream's usage only when
 * a resumed turn could not read its baseline, or the export carries no counters.
 */
export function usageFromSessionDelta(
  before: OpencodeSessionTokens | undefined,
  after: OpencodeSessionTokens,
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

/**
 * Session counters from a `session export` file, or undefined when the file is
 * unreadable, holds malformed JSON, or carries no `info.tokens`. Callers then
 * fall back to the step stream's usage.
 */
export function readExportTokens(
  file: string,
): OpencodeSessionTokens | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed?.info?.tokens;
  } catch {
    return undefined;
  }
}
