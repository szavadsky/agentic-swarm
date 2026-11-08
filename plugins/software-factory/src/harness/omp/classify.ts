import type { OmpClassificationResult, OmpParsedResult } from "./types.js";

const TRANSIENT_PATTERNS: RegExp[] = [
  /rate[\s_-]?limit/i,
  /quota[\s_-]?exceeded/i,
  /resource[\s_-]?exhausted/i,
  /overloaded/i,
  /context[\s_-]?deadline[\s_-]?exceeded/i,
  /econnreset/i,
  /etimedout/i,
  /enotfound/i,
  /socket\s+hang\s+up/i,
  /connection\s+reset/i,
  /fetch\s+failed/i,
  /network\s+error/i,
  /temporary\s+failure/i,
  /service\s+unavailable/i,
  /bad\s+gateway/i,
  /gateway\s+timeout/i,
  /internal\s+server\s+error/i,
  /\b(429|500|502|503|504)\b/,
];

const SESSION_LOST_PATTERNS: RegExp[] = [
  /session\s+["']?[^"'\s]+["']?\s+not\s+found/i,
  /no\s+session\s+(found|with\s+id)/i,
  /unknown\s+session/i,
  /failed\s+to\s+load\s+session/i,
  /cannot\s+resume/i,
  /session\s+file\s+not\s+found/i,
];
const LAUNCH_ERROR_PATTERNS: RegExp[] = [
  /built-in tools unavailable/i,
  /no such tool/i,
  /unknown flag/i,
  /unrecognized (flag|option|argument)/i,
  /invalid.*--tools/i,
  /bad flag/i,
  /failed to parse (flags|options|config)/i,
];

/**
 * Classifies an OMP process outcome as transient, sessionLost, or permanent agent failure (§12.3).
 */
export function classifyOmpOutcome(opts: {
  exitCode: number;
  stderr: string;
  stdout?: string;
  parsed?: OmpParsedResult;
  resumeRequested?: boolean;
  timedOut?: boolean;
}): OmpClassificationResult {
  const { exitCode, stderr, stdout = "", parsed, resumeRequested = false, timedOut = false } = opts;

  // 1. Timeout detection
  if (timedOut) {
    return {
      transient: true,
      sessionLost: false,
      error: "Execution timed out",
    };
  }

  // 2. Killed by SIGTERM (143) or SIGKILL (137)
  if (exitCode === 143 || exitCode === 137) {
    return {
      transient: true,
      sessionLost: false,
      error: `Process terminated by signal (${exitCode})`,
    };
  }

  const combinedText = [
    stderr,
    stdout,
    ...(parsed?.errors ?? []),
  ].join("\n");

  // 3. Resume target missing (sessionLost)
  if (resumeRequested) {
    for (const pat of SESSION_LOST_PATTERNS) {
      if (pat.test(combinedText)) {
        return {
          transient: false,
          sessionLost: true,
          error: stderr.trim() || "Resumed session target not found",
        };
      }
    }
  }

  // 4. Provider / network / transient error
  for (const pat of TRANSIENT_PATTERNS) {
    if (pat.test(combinedText)) {
      return {
        transient: true,
        sessionLost: false,
        error: stderr.trim() || combinedText.trim() || "Transient provider or network error",
      };
    }
  }
  // 4b. Stop reason abort or error (§4, spike 2)
  if (parsed?.stopReason === "abort") {
    return {
      transient: false,
      sessionLost: false,
      error: stderr.trim() || (parsed.errors.length ? parsed.errors.join("\n") : undefined) || "Agent turn aborted (stopReason: abort)",
    };
  }

  if (parsed?.stopReason === "error") {
    return {
      transient: false,
      sessionLost: false,
      error: stderr.trim() || (parsed.errors.length ? parsed.errors.join("\n") : undefined) || "Agent turn failed (stopReason: error)",
    };
  }

  // 4c. Launch/config error: omp never ran the agent (bad tools, flags, config).
  // Not transient (retrying with the same config cannot help) and not an agent
  // failure — callers fail the RUN fast with the error surfaced, burning no
  // attempts or consults.
  for (const pat of LAUNCH_ERROR_PATTERNS) {
    if (pat.test(combinedText)) {
      return {
        transient: false,
        sessionLost: false,
        launchError: true,
        error: stderr.trim() || combinedText.trim(),
      };
    }
  }

  // 5. Normal agent / client failure
  return {
    transient: false,
    sessionLost: false,
    error: stderr.trim() || combinedText.trim() || `Process failed with exit code ${exitCode}`,
  };
}
