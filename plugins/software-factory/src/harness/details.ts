import type { Stop } from "./types.js";

/** Longest crash detail kept; the useful part of a failure is its tail. */
const MAX_DETAILS_CHARS = 500;

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [
    /\b(api[-_]?key|access[-_]?key|secret|token|password|passwd)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    "$1$2[redacted]",
  ],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted]"],
];

/** Masks token-shaped values: API keys, bearer headers, and key=value secrets. */
export function scrubSecrets(text: string): string {
  let scrubbed = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

/**
 * One-line tail of harness stderr for `Stop.details`; secrets are scrubbed
 * before truncation so a cut cannot leave half a token behind.
 */
export function stopDetails(
  text: string | undefined,
  max = MAX_DETAILS_CHARS
): string | undefined {
  const collapsed = scrubSecrets(text ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!collapsed) return undefined;
  return collapsed.length > max ? `…${collapsed.slice(-max)}` : collapsed;
}

/**
 * Attaches the scrubbed error text to the stops that carry `details`. Other
 * stop kinds ignore it, and empty text leaves the stop unchanged.
 */
export function withDetails(stop: Stop, text: string | undefined): Stop {
  if (stop.kind !== "infra" && stop.kind !== "refusal") return stop;
  const details = stopDetails(text);
  return details ? { ...stop, details } : stop;
}

/** Fallback when a process dies without writing stderr. */
export function exitDetails(
  code: number | null,
  signal: string | null
): string | undefined {
  if (code === null && signal === null) return undefined;
  return `exit ${code ?? "none"}, signal ${signal ?? "none"}`;
}
