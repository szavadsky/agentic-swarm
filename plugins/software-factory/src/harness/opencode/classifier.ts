import { exitDetails, stopDetails } from "../details.js";
import type { Stop } from "../types.js";
import type { OpencodeError, OpencodeEventSummary } from "./events.js";

function errorText(error: OpencodeError): string {
  return [error.type, error.message, error.status, error.statusCode]
    .filter((part) => part !== undefined && part !== null)
    .join(" ");
}

/**
 * opencode error events carry a provider error type plus free text; HTTP 429
 * and free-tier limits are quota (LOG D8), not task failure.
 */
export function classifyOpencodeError(error: OpencodeError): Stop {
  const text = errorText(error);
  const status =
    typeof error.status === "number"
      ? error.status
      : typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

  if (/free[- ]?limit|quota|usage limit|insufficient|billing|exceeded your/i.test(text)) {
    return { kind: "infra", cause: "quota" };
  }
  if (status === 402 || status === 429 || /\b(402|429)\b/.test(text)) {
    return { kind: "infra", cause: "quota" };
  }
  if (status === 401 || status === 403) {
    return { kind: "infra", cause: "auth" };
  }
  if (/rate[\s_-]?limit|too many requests|overloaded|service unavailable|bad gateway/i.test(text)) {
    return { kind: "infra", cause: "rate" };
  }
  if (/unauthori[sz]ed|forbidden|invalid api key|no api key|credential|auth/i.test(text)) {
    return { kind: "infra", cause: "auth" };
  }
  if (/context (length|window)|maximum context|too many tokens|token limit|prompt is too long|overflow/i.test(text)) {
    return { kind: "infra", cause: "overflow" };
  }
  if (/refus|safety|content policy|declined/i.test(text)) {
    return { kind: "refusal", details: error.message };
  }
  if (/abort|cancel|interrupted/i.test(text)) {
    return { kind: "cancelled" };
  }
  if (/no-route|model unavailable|unknown model|not found/i.test(text)) {
    return { kind: "infra", cause: "auth" };
  }
  if (/timed out|timeout|deadline/i.test(text)) {
    return { kind: "infra", cause: "timeout" };
  }
  if (status !== undefined && status >= 500) {
    return { kind: "infra", cause: "rate" };
  }
  const details = stopDetails(text);
  return { kind: "infra", cause: "crash", ...(details ? { details } : {}) };
}

/** Final stop for one `opencode run` process. */
export function classifyOpencodeTurn(input: {
  summary: OpencodeEventSummary;
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Raw process stderr; only reached when the JSON stream carried no error event. */
  stderr?: string;
}): Stop {
  if (input.timedOut) return { kind: "infra", cause: "timeout" };
  const lastError = input.summary.errors.at(-1);
  if (lastError) return classifyOpencodeError(lastError);

  if (input.code !== 0) {
    if (input.signal === "SIGTERM" || input.signal === "SIGINT") {
      return { kind: "cancelled" };
    }
    const details =
      stopDetails(input.stderr) ?? exitDetails(input.code, input.signal);
    return details
      ? { kind: "infra", cause: "crash", details }
      : { kind: "infra", cause: "crash" };
  }

  const reason = input.summary.lastStepReason;
  if (reason === "length" || reason === "max_tokens" || reason === "max-tokens") {
    return { kind: "truncated", cause: "max-tokens" };
  }
  if (reason === "turn-limit" || reason === "max_turns") {
    return { kind: "truncated", cause: "turn-limit" };
  }
  if (reason === "refusal") return { kind: "refusal" };
  return { kind: "done" };
}
