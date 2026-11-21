/** The acpx turn's public runtime shape and its internal turn state. */

import type {
  AdapterTurnResult,
  ModelRef,
  SessionRef,
  Stop,
  TurnAttempt,
  TurnRequest,
  Usage,
} from "../../types.js";
import type { AcpxRunConfig } from "../config.js";
import type { AcpxCommand, AcpxTurnSummary } from "../types.js";

export interface AcpxRuntime {
  id: string;
  command: AcpxCommand;
  acpx: AcpxRunConfig;
  /** Caller-given session store; turn transcripts live here, never in a worktree. */
  sessionDir: string;
  /** Run-config names this runtime's children may inherit on top of the base set. */
  envAllowlist?: readonly string[];
}

export interface SetupFailure {
  stop: Stop;
  /** acpx answered NO_SESSION: the named record is gone. */
  noSession: boolean;
}

export interface PromptProcessResult {
  code: number | null;
  signal: string | null;
  stderr: string;
  timedOut: boolean;
  /** The kernel's AbortSignal fired; the child was killed, not reaped. */
  aborted: boolean;
  /** Local receipt time of the last non-empty stdout line; absent when none arrived. */
  lastEventAt?: string;
  /** Persisted stdout stream, once the process ran. */
  transcript?: string;
  /** First failure opening or writing the transcript; the caller raises it. */
  transcriptError?: Error;
}

/** Whether one attempt finished the turn or must retry de novo. */
export type AttemptOutcome =
  | { retry: true }
  | { retry: false; result: AdapterTurnResult };

/** Per-turn values every phase reads: the adapter, config, request and names. */
export interface AcpxTurnContext {
  runtime: AcpxRuntime;
  config: AcpxRunConfig;
  req: TurnRequest;
  model: ModelRef;
  wire: { id: string; effort?: string };
  /** Global args plus the agent selection: the prefix of every acpx command. */
  base: string[];
  globals: string[];
  selection: string[];
  resume: string | undefined;
  name: string;
  attempts: TurnAttempt[];
}

export interface UsageMeasurement {
  usage: Usage;
  storedSession: SessionRef | undefined;
  usageMeasured: boolean;
}

export interface PromptPhase {
  processResult: PromptProcessResult;
  summary: AcpxTurnSummary;
  lost: boolean;
}
