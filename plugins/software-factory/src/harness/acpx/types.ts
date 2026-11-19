import type { RetryPolicy } from "../fallback.js";
import type { Usage } from "../types.js";
import type { AcpxConfig } from "./config.js";

export interface AcpxHarnessOptions {
  /** Harness id: a run-config name bound to the acpx adapter. */
  id: string;
  /** Explicit acpx executable (tests and `harnesses.<id>.binary`); defaults to PATH, then `bunx acpx`. */
  binary?: string;
  /** Run-config `acpx` block; a per-turn opaque overrides it. */
  acpx: AcpxConfig;
  /** Harness-entry `options`: `args`/`env`, validated then passed to the acpx child. */
  options?: Record<string, unknown>;
  /** Run-config names this harness's children may inherit on top of the base set. */
  envAllowlist?: readonly string[];
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
  /** Adapter error metadata extracted from session_info_update, e.g. _meta.codex.error. */
  adapterError?: AcpxError;
}

/** One slash command's parsed transcript plus the process facts behind it. */
export interface AcpxCommandResult {
  /** Parsed `--format json` transcript; `errors` carries the ACP error frames. */
  summary: AcpxTurnSummary;
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  stderr: string;
}
