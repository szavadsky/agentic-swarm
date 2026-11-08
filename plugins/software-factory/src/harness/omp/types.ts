import type { PipelineConfig } from "../../core/artifacts.js";
import type { JSONSchema, Usage } from "../types.js";

export interface OmpHarnessOptions {
  /** Path to omp binary (defaults to process.env.OMP_PATH || Bun.which("omp") || "omp") */
  ompBinary?: string;
  /** Path to pre-generated YAML configuration overlay */
  configOverlayPath?: string;
  /** Pipeline configuration used to generate the overlay dynamically */
  pipeline?: PipelineConfig;
  /** Root directory for runtime state (sessions, prompts, overlay). Defaults to cwd/.factory-runtime */
  runtimeDir?: string;
  /** Default execution timeout per turn in milliseconds (defaults to 300_000 = 5m) */
  timeoutMs?: number;
}

export interface OmpParsedResult {
  sessionId?: string;
  sessionTimestamp?: string;
  cwd?: string;
  finalAssistantText: string;
  yieldData?: unknown;
  usage: Usage;
  stopReason?: string;
  rawEvents: unknown[];
  errors: string[];
  toolCallCount: number;
}

export interface OmpRunTurnOptions {
  cwd: string;
  prompt: string;
  model: string;
  tools?: string[];
  systemPromptFile?: string;
  resumeSessionId?: string;
  sessionDir?: string;
  configOverlayPath: string;
  timeoutMs?: number;
  ompBinary?: string;
}

export interface OmpRunTurnResult {
  sessionId?: string;
  sessionTimestamp?: string;
  transcriptPath?: string;
  text: string;
  yieldData?: unknown;
  usage: Usage;
  exitCode: number;
  stderr: string;
  timedOut?: boolean;
}

export interface OmpClassificationResult {
  transient: boolean;
  sessionLost: boolean;
  error?: string;
}
