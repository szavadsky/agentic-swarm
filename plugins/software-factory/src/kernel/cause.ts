import { type Cause, type CauseKind, causeSchema } from "./types.js";

/** One typed cause, for producers that must name their kind explicitly. */
export function makeCause(kind: CauseKind, detail: string): Cause {
  return { kind, detail };
}

/**
 * The one rendering of a cause: `<kind>: <detail>`, with an empty detail
 * omitted. `note`, `unknown`, `boundary` and `error` carry no category of
 * their own, so their detail stands alone.
 */
export function formatCause(cause: Cause): string {
  if (
    cause.kind === "note" ||
    cause.kind === "unknown" ||
    cause.kind === "boundary" ||
    cause.kind === "error"
  ) {
    return cause.detail || cause.kind;
  }
  return cause.detail ? `${cause.kind}: ${cause.detail}` : cause.kind;
}

interface LegacyPrefix {
  prefix: string;
  kind: CauseKind;
}

/** String prefixes records written before typed causes carry, longest first. */
const LEGACY_PREFIXES: readonly LegacyPrefix[] = [
  { prefix: "worktree setup failed:", kind: "setup" },
  { prefix: "merge commit failed:", kind: "merge-failed" },
  { prefix: "kept-land failed:", kind: "merge-failed" },
  { prefix: "integration moved:", kind: "integration-moved" },
  { prefix: "review rejected:", kind: "review-rejected" },
  { prefix: "invalid outcome:", kind: "invalid-outcome" },
  { prefix: "base-conflict:", kind: "base-conflict" },
  { prefix: "merge failed:", kind: "merge-failed" },
  { prefix: "outside-change:", kind: "outside-change" },
  { prefix: "unanswered steer", kind: "steer" },
  { prefix: "containment:", kind: "containment" },
  { prefix: "empty-diff:", kind: "empty-diff" },
  { prefix: "no-progress:", kind: "no-progress" },
  { prefix: "infra-repeat:", kind: "infra-repeat" },
  { prefix: "conflict:", kind: "conflict" },
  { prefix: "blocked:", kind: "blocked" },
  { prefix: "upscope:", kind: "upscope" },
  { prefix: "refused:", kind: "refused" },
  { prefix: "budget:", kind: "budget" },
  { prefix: "steer:", kind: "steer" },
  { prefix: "infra:", kind: "infra" },
  { prefix: "stuck:", kind: "stuck" },
  { prefix: "held:", kind: "held" },
  { prefix: "gates:", kind: "gates" },
  { prefix: "failed:", kind: "failed" },
];

/**
 * Legacy causes whose whole text is the cause, with no `kind: detail` shape.
 * Each rule keeps the text as the detail so rendering never loses it.
 */
const LEGACY_TEXT: readonly { pattern: RegExp; kind: CauseKind }[] = [
  { pattern: /^task file\s/i, kind: "quarantine" },
  {
    pattern: /^(?:removed from the plan|superseded by|skipped)\b/i,
    kind: "note",
  },
  {
    pattern: /^(?:auto-merged|recovered merge|approved\b.*\blanded as)\b/i,
    kind: "note",
  },
  { pattern: /^the integration head was already merged\b/i, kind: "note" },
  { pattern: /^branch\s".+"\sdoes not exist\b/i, kind: "setup" },
  {
    pattern: /^merge (?:produced no commit|still in progress)\b/i,
    kind: "merge-failed",
  },
  { pattern: /^steward made no merge commit\b/i, kind: "merge-failed" },
  {
    pattern: /^(?:harness\b.*\bcannot resume|trivial task\b)/i,
    kind: "resume",
  },
];

/** A legacy round-limit text names the verdict that spent the rounds. */
const CHANGES_EXHAUSTED = /after verdict\s+"changes"/i;
/** `[review ]round limit reached[:] <verdict facts>`. */
const ROUND_LIMIT = /^(?:review\s+)?round limit reached\b[:\s]*(.*)$/i;
/** `overflow`, `overflow: <facts>`, and the park text `overflow in <step>`. */
const OVERFLOW = /^overflow\b[:\s]*(.*)$/i;

/** The detail a `kind: detail` text carries, without the separator. */
function detailAfter(text: string, prefix: string): string {
  return text
    .slice(prefix.length)
    .replace(/^[:;,\s]+/, "")
    .trim();
}

/** A stored object: typed causes pass through; malformed history stays readable. */
function objectCause(raw: object): Cause {
  const parsed = causeSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : { kind: "unknown", detail: JSON.stringify(raw) };
}

/** A stored text: one of the fixed legacy shapes, else `unknown`. */
function textCause(text: string): Cause {
  const round = ROUND_LIMIT.exec(text);
  if (round) {
    return {
      kind: CHANGES_EXHAUSTED.test(text)
        ? "change-requests-exhausted"
        : "round-limit",
      detail: (round[1] ?? "").replace(/^[:;,\s]+/, ""),
    };
  }
  if (OVERFLOW.test(text)) {
    return { kind: "overflow", detail: detailAfter(text, "overflow") };
  }
  const lower = text.toLowerCase();
  const prefixed = LEGACY_PREFIXES.find((rule) =>
    lower.startsWith(rule.prefix),
  );
  if (prefixed)
    return { kind: prefixed.kind, detail: detailAfter(text, prefixed.prefix) };
  const matched = LEGACY_TEXT.find((rule) => rule.pattern.test(text));
  return matched
    ? { kind: matched.kind, detail: text }
    : { kind: "unknown", detail: text };
}

/**
 * Reads one stored cause, typed or legacy. This is the single place old
 * records' message prefixes become a kind: every other kernel reader switches
 * on `kind`. An unrecognized text stays readable as `unknown`; a malformed
 * object is `unknown` too, because a record is history the kernel may not
 * reject and its text must survive.
 */
export function readCause(raw: unknown): Cause | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "object") return objectCause(raw);
  if (typeof raw !== "string") return { kind: "unknown", detail: String(raw) };
  const text = raw.trim();
  return text === "" ? undefined : textCause(text);
}
