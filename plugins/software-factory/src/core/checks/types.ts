/**
 * A failing check's owner: `new` is the task's own failure, `inherited` was
 * already red on the base tree before the task ran.
 */
export type CheckAttribution = "new" | "inherited";

export interface CheckResult {
  name: string;
  ok: boolean;
  summary: string;
  output: string;
  fingerprint: string;
  /**
   * Stamp of who owns the failure, written when the checks record closes. A
   * green check, an infra red (never a verdict on the tree) and a record
   * written before the stamp carry none.
   */
  attribution?: CheckAttribution;
  /**
   * A red kept for the reviewer and steward but never blocking: a gate or a
   * task declared advisory. The check still carries its output and summary.
   */
  advisory?: boolean;
  details?: unknown;
  flaky?: string[];
  skipped?: boolean;
  mutatesWorktree?: boolean;
  improvements?: string[];
}

/**
 * Trims a text string to at most maxBytes (UTF-8) taking the trailing portion.
 */
export function tailCap(text: string, maxBytes: number): string {
  if (!text) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return buf.subarray(buf.length - maxBytes).toString("utf8");
}
