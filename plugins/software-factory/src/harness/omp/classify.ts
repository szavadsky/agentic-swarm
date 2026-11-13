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

/**
 * Maps a provider error to the kernel's infra/task-side stop vocabulary.
 * HTTP 429 and free-tier limits are quota (LOG D8), even when the message also
 * says "rate limit"; the policy retries quota and rate alike.
 */
export function classifyOmpError(error: OmpPromptError | undefined): Stop {
  const text = [error?.message, error?.code].filter(Boolean).join(" ");
  const status = error?.httpStatus;

  if (status === 401 || status === 403 || AUTH.test(text)) {
    return { kind: "infra", cause: "auth" };
  }
  if (status === 429 || QUOTA.test(text)) {
    return { kind: "infra", cause: "quota" };
  }
  if (OVERFLOW.test(text)) {
    return { kind: "infra", cause: "overflow" };
  }
  if (REFUSAL.test(text)) {
    return { kind: "refusal", details: error?.message };
  }
  if (ABORTED.test(text)) {
    return { kind: "cancelled" };
  }
  if (status === 408 || status === 504 || TIMEOUT.test(text)) {
    return { kind: "infra", cause: "timeout" };
  }
  if (RATE.test(text) || (status !== undefined && status >= 500)) {
    return { kind: "infra", cause: "rate" };
  }
  return { kind: "infra", cause: "crash", details: truncate(text) };
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
    return { kind: "infra", cause: "auth", details: truncate(stderr) };
  }
  return { kind: "infra", cause: "crash", details: truncate(stderr) };
}

/** Keep the tail: the reason is usually the last line. Secrets are omp's own stderr, never credentials. */
function truncate(text: string, max = 500): string | undefined {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  return t.length > max ? `…${t.slice(-max)}` : t;
}

export interface OmpTurnFailure {
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
    if (stop.kind === "infra" && !stop.details && input.failure.signal) {
      return { ...stop, details: `signal ${input.failure.signal}` };
    }
    return stop;
  }
  return { kind: "infra", cause: "crash", details: "no prompt_result and no failure captured" };
}
