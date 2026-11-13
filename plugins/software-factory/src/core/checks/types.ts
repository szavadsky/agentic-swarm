export interface CheckResult {
  name: string;
  ok: boolean;
  summary: string;
  output: string;
  fingerprint: string;
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
