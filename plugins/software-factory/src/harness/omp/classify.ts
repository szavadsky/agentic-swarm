import { exitDetails, stopDetails } from "../details.js";
import type { Stop } from "../types.js";

/** Error object omp attaches to `prompt_result.status === "error"`. */
export interface OmpPromptError {
  message?: string;
  provider?: string;
  model?: string;
  httpStatus?: number;
  retryable?: boolean;
  code?: string;
}

const AUTH = /unauthori[sz]ed|forbidden|invalid api key|no api key|missing api key|credential|model .*not found|no-route|model unavailable/i;
const OVERFLOW = /context (length|window)|maximum context|too many tokens|token limit|prompt is too long|overflow/i;
const REFUSAL = /refus|safety|content policy|blocked by|declined/i;
const ABORTED = /abort|interrupted by user/i;
const TIMEOUT = /timed out|timeout|deadline exceeded/i;
const QUOTA = /free[- ]?limit|free usage limit|quota|usage limit|insufficient|billing|exceeded your/i;
const RATE = /rate[\s_-]?limit|too many requests|overloaded|service unavailable|bad gateway/i;

/** Attaches the scrubbed error text where the Stop shape allows details. */
function withDetails(stop: Stop, text: string | undefined): Stop {
  if (stop.kind !== "infra" && stop.kind !== "refusal") return stop;
  const details = stopDetails(text);
  return details ? { ...stop, details } : stop;
}

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
export function classifyOmpStopReason(stopReason: string | undefined): Stop | undefined {
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

/** omp exiting before the RPC ready frame: bad model/credential, or a launch crash. */
export function classifyOmpLaunchFailure(stderr: string): Stop {
  if (AUTH.test(stderr) || /no api key|not authenticated|login/i.test(stderr)) {
    return { kind: "infra", cause: "auth", details: stopDetails(stderr) };
  }
  return { kind: "infra", cause: "crash", details: stopDetails(stderr) };
}

export interface OmpTurnFailure {
  /** Child process exit code, when omp died before a prompt_result. */
  code?: number | null;
  /** Child process exit signal, when omp died before a prompt_result. */
  signal?: string | null;
  stderr?: string;
  /** The adapter's own wall/idle timer caused the kill. */
  timedOut?: boolean;
}

export interface OmpTurnOutcomeInput {
  abortReason?: "idle" | "wall";
  failure?: OmpTurnFailure;
  promptResult?: any;
  lastStopReason?: string;
}

/** Final stop for one omp RPC process, from the frames the adapter collected. */
export function classifyOmpTurn(input: OmpTurnOutcomeInput): Stop {
  if (input.abortReason || input.failure?.timedOut) {
    return { kind: "infra", cause: "timeout" };
  }
  if (input.promptResult?.status === "error") {
    return classifyOmpError(input.promptResult.error as OmpPromptError);
  }
  if (input.promptResult?.status === "aborted") return { kind: "cancelled" };
  if (input.promptResult?.status === "completed") {
    return classifyOmpStopReason(input.lastStopReason) ?? { kind: "done" };
  }
  if (input.failure?.signal === "SIGTERM" || input.failure?.signal === "SIGINT") {
    return { kind: "cancelled" };
  }
  if (input.failure) {
    const stop = classifyOmpLaunchFailure(input.failure.stderr ?? "");
    if (stop.kind === "infra" && !stop.details) {
      const exit = exitDetails(input.failure.code ?? null, input.failure.signal ?? null);
      if (exit) return { ...stop, details: exit };
    }
    return stop;
  }
  return withDetails(
    { kind: "infra", cause: "crash" },
    "no prompt_result and no failure captured"
  );
}
