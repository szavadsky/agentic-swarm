import type { RetryPolicy } from "../fallback.js";
import type { Usage } from "../types.js";

/** Agents the acpx dispatcher can run; each is its own Harness id. */
export type AcpxAgent = "pi" | "codex";

export interface AcpxHarnessOptions {
  agent: AcpxAgent;
  /** Explicit acpx executable (tests and ACPX_PATH); defaults to PATH, then `bunx acpx`. */
  binary?: string;
  retry?: Partial<RetryPolicy>;
}

/** Executable plus leading args; `bunx` needs `acpx` before the CLI arguments. */
export interface AcpxCommand {
  binary: string;
  prefix: string[];
}

export interface AcpxErrorData {
  acpxCode?: string;
  detailCode?: string;
  origin?: string;
  errorName?: string;
  service?: string;
  details?: string;
  [key: string]: unknown;
}

export interface AcpxError {
  code?: number;
  message?: string;
  data?: AcpxErrorData;
}

/** Result of parsing one acpx `--format json` transcript. */
export interface AcpxTurnSummary {
  /** Last contiguous agent text message; pi's startup banner is an earlier one. */
  text: string;
  usage: Usage;
  stopReason?: string;
  sessionId?: string;
  errors: AcpxError[];
}

/**
 * Effort is a session config option, not a `--model` suffix (probe §3).
 * The lists are the values each adapter advertised during the probe.
 */
export const ACPX_EFFORT: Record<AcpxAgent, { configId: string; levels: string[] }> = {
  pi: { configId: "thought_level", levels: ["off", "minimal", "low", "medium", "high", "xhigh"] },
  codex: { configId: "reasoning_effort", levels: ["low", "medium", "high", "xhigh", "max"] },
};
