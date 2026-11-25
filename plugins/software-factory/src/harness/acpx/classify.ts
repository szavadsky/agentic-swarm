import { exitWithDetails, lastNonBannerLine, withDetails } from "../details.js";
import { isTransportFailure } from "../transport.js";
import type { Stop } from "../types.js";
import type {
  AcpxError,
  AcpxTurnClassificationInput,
  AcpxTurnSummary,
} from "./types.js";

export type { AcpxTurnClassificationInput } from "./types.js";

function errorText(error: AcpxError): string {
  const data = error.data ?? {};
  return [
    error.code,
    error.message,
    data.details,
    data.acpxCode,
    data.detailCode,
    data.errorName,
    data.service,
  ]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(" ");
}

export function isNoSessionError(error: AcpxError): boolean {
  return (
    error.data?.acpxCode === "NO_SESSION" ||
    error.code === -32002 ||
    /no acpx session found/i.test(errorText(error))
  );
}

/** Matches known infrastructure error patterns in harness or agent text. */
export function classifyErrorText(
  text: string,
  preferredDetails?: string,
): Stop | undefined {
  if (
    /quota|insufficient balance|billing|usage limit|exceeded your/i.test(
      text,
    ) ||
    /\b(402|429)\b/.test(text)
  ) {
    return withDetails({ kind: "infra", cause: "quota" }, text);
  }
  if (
    /did not advertise that model|cannot apply --model|unknown model|model .*not found|model .*not available|no-route/i.test(
      text,
    ) ||
    /\b(401|403)\b/.test(text) ||
    /unauthori[sz]ed|forbidden|invalid api key|no api key|credential/i.test(
      text,
    )
  ) {
    return withDetails({ kind: "infra", cause: "auth" }, text);
  }
  if (
    /rate[\s_-]?limit|too many requests|overloaded|service unavailable|bad gateway|\b(502|503)\b/i.test(
      text,
    )
  ) {
    return withDetails({ kind: "infra", cause: "rate" }, text);
  }
  if (
    /context (length|window)|maximum context|too many tokens|token limit|prompt is too long|overflow/i.test(
      text,
    )
  ) {
    return withDetails({ kind: "infra", cause: "overflow" }, text);
  }
  // Transport loss precedes refusal/abort: `ECONNREFUSED` and an aborted
  // socket carry those words without being a model refusal or a user cancel.
  if (isTransportFailure(text)) {
    return withDetails({ kind: "infra", cause: "network" }, text);
  }
  if (/refus|safety|content policy|declined/i.test(text)) {
    return withDetails({ kind: "refusal" }, preferredDetails ?? text);
  }
  if (/abort|cancel|interrupted/i.test(text)) {
    return { kind: "cancelled" };
  }
  if (/timed out|timeout|deadline/i.test(text)) {
    return withDetails({ kind: "infra", cause: "timeout" }, text);
  }
  return undefined;
}

function classifyAcpxErrorBase(error: AcpxError): Stop {
  const text = errorText(error);

  if (isNoSessionError(error)) {
    return withDetails(
      { kind: "infra", cause: "crash" },
      error.message ?? text,
    );
  }
  if (error.data?.errorName === "provider.quota") {
    return withDetails({ kind: "infra", cause: "quota" }, text);
  }
  const byText = classifyErrorText(text, error.message ?? text);
  if (byText) return byText;
  return withDetails({ kind: "infra", cause: "crash" }, text);
}

/**
 * A completed prompt (end_turn) whose usage was measured as zero did no model work.
 * The cause is derived from the agent text and adapter error metadata through the
 * existing error classifier. With no text or unclassified text/adapter errors,
 * defaults to rate with details naming the text or the zero-usage completion.
 */
export function classifyZeroUsageTurn(summary: AcpxTurnSummary): Stop {
  const text = summary.text.trim();
  if (text) {
    const fromText = classifyErrorText(text);
    if (fromText) return fromText;
  }
  if (summary.adapterError) {
    const fromAdapter = classifyAcpxError(summary.adapterError);
    if (fromAdapter.kind === "infra" && fromAdapter.cause !== "crash") {
      return fromAdapter;
    }
    if (fromAdapter.kind !== "infra") {
      return fromAdapter;
    }
  }
  return withDetails(
    { kind: "infra", cause: "rate" },
    text || "completed prompt with zero measured usage",
  );
}

/**
 * acpx error classes from probe §8. A rejected model is a harness/auth problem,
 * provider quota is infrastructure, and anything else keeps its scrubbed text.
 * A crash also names the process exit facts, which no error frame carries.
 */
export function classifyAcpxError(
  error: AcpxError,
  exit?: { code: number | null; signal: string | null },
): Stop {
  const stop = classifyAcpxErrorBase(error);
  if (!exit || stop.kind !== "infra" || stop.cause !== "crash") return stop;
  const details = exitWithDetails(exit.code, exit.signal, errorText(error));
  return details ? { ...stop, details } : stop;
}

/**
 * The stop a parsed prompt result names. A result is the turn's outcome even
 * when acpx exits nonzero afterwards, after the result frame reached stdout.
 * An unrecognised reason leaves the caller to the exit facts.
 */
function stopForStopReason(reason: string | undefined): Stop | undefined {
  if (reason === "cancelled") return { kind: "cancelled" };
  if (reason === "refusal") return { kind: "refusal" };
  if (
    reason === "max_tokens" ||
    reason === "max-tokens" ||
    reason === "length"
  ) {
    return { kind: "truncated", cause: "max-tokens" };
  }
  if (reason === "max_turns" || reason === "turn-limit") {
    return { kind: "truncated", cause: "turn-limit" };
  }
  if (reason === "end_turn") return { kind: "done" };
  return undefined;
}

/**
 * A wall timeout or an ACP error frame means any result already on stdout is
 * untrustworthy, so those decide first. Otherwise the prompt result decides,
 * and only a turn with no recognised result is judged from the exit facts.
 * SIGTERM/SIGINT with no result is the caller's cancellation.
 */
export function classifyAcpxTurn(input: AcpxTurnClassificationInput): Stop {
  if (input.timedOut) return { kind: "infra", cause: "timeout" };

  const error = input.summary.errors.at(-1);
  if (error) {
    return classifyAcpxError(error, {
      code: input.code,
      signal: input.signal,
    });
  }

  const byResult = stopForStopReason(input.summary.stopReason);
  if (byResult) return byResult;

  if (input.code !== 0) {
    if (input.signal === "SIGTERM" || input.signal === "SIGINT") {
      return { kind: "cancelled" };
    }
    const details = exitWithDetails(
      input.code,
      input.signal,
      lastNonBannerLine(input.stderr),
    );
    return details
      ? { kind: "infra", cause: "crash", details }
      : { kind: "infra", cause: "crash" };
  }

  const details = exitWithDetails(
    input.code,
    input.signal,
    "acpx exited without a session/prompt result",
  );
  return details
    ? { kind: "infra", cause: "crash", details }
    : { kind: "infra", cause: "crash" };
}
