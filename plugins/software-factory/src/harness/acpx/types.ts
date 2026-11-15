import type { RetryPolicy } from "../fallback.js";
import type { Usage } from "../types.js";
import type { AcpxConfig } from "./config.js";

export interface AcpxHarnessOptions {
  /** Harness id: a run-config name bound to the acpx adapter. */
  id: string;
  /** Explicit acpx executable (tests and ACPX_PATH); defaults to PATH, then `bunx acpx`. */
  binary?: string;
  /** Run-config `acpx` block; a per-turn opaque replaces it. */
  acpx: AcpxConfig;
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
  /** Last contiguous agent text message; a startup banner is an earlier one. */
  text: string;
  usage: Usage;
  stopReason?: string;
  sessionId?: string;
  errors: AcpxError[];
}
