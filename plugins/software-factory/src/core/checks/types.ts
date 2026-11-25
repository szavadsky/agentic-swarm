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

/** How a finding affects the tree, mapped from CTRF status or SARIF level. */
export type FindingSeverity = "error" | "warning" | "info";

/**
 * One gate finding. CTRF tests, SARIF results and log regexes all land here, so
 * a fix turn and the pre-existing check read one vocabulary.
 */
export interface Finding {
  /** The gate that produced it. */
  check: string;
  /** The producer the report names: a CTRF tool, a SARIF driver or `regex`/`log`. */
  tool: string;
  /** The file the finding points at, when the report names one. */
  file?: string;
  /** One-based line, when the report names one. */
  line?: number;
  /** A rule id, test name or test id; the stable part of a test finding. */
  rule?: string;
  severity: FindingSeverity;
  message: string;
  /** Stable identity a later run matches against the base. */
  fingerprint: string;
}

export interface ParsedCase {
  name: string;
  status: "pass" | "fail";
  /** The file the report recorded for this case, when it names one. */
  file?: string;
}

export interface ParsedJunit {
  cases: ParsedCase[];
  /** The report carries a `<failure>` or `<error>` anywhere, cases or not. */
  suiteFailed: boolean;
}

/** A repo-declared escape hatch for a tool that emits no standard report. */
export interface LogRegex {
  /** A JavaScript regex; named groups file, line, rule, severity and message are read. */
  pattern: string;
  tool?: string;
  rule?: string;
  severity?: FindingSeverity;
}

/**
 * The outcome of running a worktree's dependency/bootstrap setup before its
 * gates: whether every declared command succeeded and why the first failed.
 */
export interface SetupResult {
  ok: boolean;
  /** Commands declared (possibly empty). */
  commands: string[];
  /** Commands that ran to success before any failure. */
  ran: string[];
  durationMs: number;
  /** First failing command, when ok=false. */
  failedCommand?: string;
  /** Timed-out/failure detail, when ok=false. */
  error?: string;
}
