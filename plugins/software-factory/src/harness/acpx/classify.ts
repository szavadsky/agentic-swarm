import { exitWithDetails, lastNonBannerLine, withDetails } from "../details.js";
import type { Stop } from "../types.js";
import type { AcpxError, AcpxTurnSummary } from "./types.js";

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

function classifyAcpxErrorBase(error: AcpxError): Stop {
  const text = errorText(error);

  if (isNoSessionError(error)) {
    return withDetails(
      { kind: "infra", cause: "crash" },
      error.message ?? text,
    );
  }
  if (
    error.data?.errorName === "provider.quota" ||
    /quota|insufficient balance|billing|usage limit|exceeded your/i.test(text)
  ) {
    return withDetails({ kind: "infra", cause: "quota" }, text);
  }
  if (/\b(402|429)\b/.test(text)) {
    return withDetails({ kind: "infra", cause: "quota" }, text);
  }
  if (
    /did not advertise that model|cannot apply --model|unknown model|model .*not found|model .*not available|no-route/i.test(
      text,
    )
  ) {
    return withDetails({ kind: "infra", cause: "auth" }, text);
  }
  if (
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
  if (/refus|safety|content policy|declined/i.test(text)) {
    return withDetails({ kind: "refusal" }, error.message ?? text);
  }
  if (/abort|cancel|interrupted/i.test(text)) {
    return { kind: "cancelled" };
  }
  if (/timed out|timeout|deadline/i.test(text)) {
    return withDetails({ kind: "infra", cause: "timeout" }, text);
  }
  return withDetails({ kind: "infra", cause: "crash" }, text);
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

export interface AcpxTurnClassificationInput {
  summary: AcpxTurnSummary;
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Raw stderr; only reached when stdout carried no error frame. */
  stderr?: string;
}

/**
 * A prompt that exits 0 can still be cancelled, and no exit code proves an
 * outcome was written. The response frame and the error frames decide.
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

  const reason = input.summary.stopReason;
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

  const details = exitWithDetails(
    input.code,
    input.signal,
    "acpx exited without a session/prompt result",
  );
  return details
    ? { kind: "infra", cause: "crash", details }
    : { kind: "infra", cause: "crash" };
}
