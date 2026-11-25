import { exitDetails, stopDetails, withDetails } from "../details.js";
import type { Stop } from "../types.js";
import type {
  OmpPromptError,
  OmpTurnFailure,
  OmpTurnOutcomeInput,
} from "./types.js";
import { isTransportFailure } from "../transport.js";
import { reportsUsage } from "../usage.js";

export type {
  OmpPromptError,
  OmpPromptResult,
  OmpTurnFailure,
  OmpTurnOutcomeInput,
} from "./types.js";

const AUTH =
  /unauthori[sz]ed|forbidden|invalid api key|no api key|missing api key|credential|model .*not found|no-route|model unavailable/i;
const OVERFLOW =
  /context (length|window)|maximum context|too many tokens|token limit|prompt is too long|overflow/i;
const REFUSAL = /refus|safety|content policy|blocked by|declined/i;
// A word, not the `ECONNABORTED` substring; transport codes are matched above.
const ABORTED = /\babort(?:ed)?\b|interrupted by user/i;
const TIMEOUT = /timed out|timeout|deadline exceeded/i;
const QUOTA =
  /free[- ]?limit|free usage limit|quota|usage limit|insufficient|billing|exceeded your/i;
const RATE =
  /rate[\s_-]?limit|too many requests|overloaded|service unavailable|bad gateway/i;
/**
 * Maps a provider error to the kernel's infra/task-side stop vocabulary.
 * HTTP 429 and free-tier limits are quota (LOG D8), even when the message also
 * says "rate limit"; the policy retries quota and rate alike.
 */
export function classifyOmpError(error: OmpPromptError | undefined): Stop {
  const text = [error?.message, error?.code].filter(Boolean).join(" ");
  const status = error?.httpStatus;

  if (status === 401 || status === 403 || AUTH.test(text)) {
    return withDetails({ kind: "infra", cause: "auth" }, text);
  }
  if (status === 429 || QUOTA.test(text)) {
    return withDetails({ kind: "infra", cause: "quota" }, text);
  }
  if (OVERFLOW.test(text)) {
    return withDetails({ kind: "infra", cause: "overflow" }, text);
  }
  // A transport loss or the provider's own retryable flag is transient: the
  // retry policy backs off and fails over, never fails the task. It precedes
  // the refusal/abort words because `ECONNREFUSED` and an aborted socket carry
  // those words without being either.
  if (isTransportFailure(text) || error?.retryable === true) {
    return withDetails({ kind: "infra", cause: "network" }, text);
  }
  if (REFUSAL.test(text)) {
    return withDetails({ kind: "refusal" }, error?.message ?? text);
  }
  if (ABORTED.test(text)) {
    return { kind: "cancelled" };
  }
  if (status === 408 || status === 504 || TIMEOUT.test(text)) {
    return withDetails({ kind: "infra", cause: "timeout" }, text);
  }
  if (RATE.test(text) || (status !== undefined && status >= 500)) {
    return withDetails({ kind: "infra", cause: "rate" }, text);
  }
  return withDetails({ kind: "infra", cause: "crash" }, text);
}

/** Assistant `stopReason` values that override a "completed" prompt result. */
export function classifyOmpStopReason(
  stopReason: string | undefined,
): Stop | undefined {
  switch (stopReason) {
    case "max_tokens":
    case "max-tokens":
    case "length":
      return { kind: "truncated", cause: "max-tokens" };
    case "turn_limit":
    case "turn-limit":
    case "max_turns":
      return { kind: "truncated", cause: "turn-limit" };
    case "aborted":
      return { kind: "cancelled" };
    case "refusal":
      return { kind: "refusal" };
    case "error":
      return { kind: "infra", cause: "crash" };
    default:
      return undefined;
  }
}

/** omp exiting before the RPC ready frame: bad model/credential, a lost socket, or a launch crash. */
export function classifyOmpLaunchFailure(stderr: string): Stop {
  if (AUTH.test(stderr) || /no api key|not authenticated|login/i.test(stderr)) {
    return { kind: "infra", cause: "auth", details: stopDetails(stderr) };
  }
  if (isTransportFailure(stderr)) {
    return { kind: "infra", cause: "network", details: stopDetails(stderr) };
  }
  return { kind: "infra", cause: "crash", details: stopDetails(stderr) };
}

/** A completed prompt: its stop reason, a zero-usage glitch, or done. */
function classifyCompleted(input: OmpTurnOutcomeInput): Stop {
  const stop = classifyOmpStopReason(input.lastStopReason);
  if (stop) return stop;
  if (input.usage && !reportsUsage(input.usage) && !input.text) {
    return withDetails(
      { kind: "infra", cause: "glitch" },
      "zero-usage, no-output",
    );
  }
  return { kind: "done" };
}

/** A process failure: its launch cause plus the exit facts when it named none. */
function classifyFailure(failure: OmpTurnFailure): Stop {
  const stop = classifyOmpLaunchFailure(failure.stderr ?? "");
  if (stop.kind === "infra" && !stop.details) {
    const exit = exitDetails(failure.code ?? null, failure.signal ?? null);
    if (exit) return { ...stop, details: exit };
  }
  return stop;
}

/** Final stop for one omp RPC process, from the frames the adapter collected. */
export function classifyOmpTurn(input: OmpTurnOutcomeInput): Stop {
  if (input.abortReason || input.failure?.timedOut) {
    return { kind: "infra", cause: "timeout" };
  }
  if (input.promptResult?.status === "error") {
    return classifyOmpError(input.promptResult.error);
  }
  if (input.promptResult?.status === "aborted") return { kind: "cancelled" };
  if (input.promptResult?.status === "completed") {
    return classifyCompleted(input);
  }
  if (
    input.failure?.signal === "SIGTERM" ||
    input.failure?.signal === "SIGINT"
  ) {
    return { kind: "cancelled" };
  }
  if (input.failure) return classifyFailure(input.failure);
  return withDetails(
    { kind: "infra", cause: "crash" },
    "no prompt_result and no failure captured",
  );
}
