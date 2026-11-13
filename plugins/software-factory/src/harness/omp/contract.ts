/**
 * Private v2 contract used by the omp adapter until S1 moves it onto the
 * kernel harness contract (`src/harness/types.ts`). Kept local so the adapter
 * compiles while the rest of the factory is pruned.
 */

export type JSONSchema = Record<string, unknown>;

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface ModelFallbackInfo {
  /** Model argument that failed (e.g. `@simpler`). */
  from: string;
  /** Model argument tried next (literal model or @role). */
  to: string;
  /** Failure reason for the `from` model. */
  reason: string;
}

export type OnModelFallback = (info: ModelFallbackInfo) => void | Promise<unknown>;

export interface Harness {
  run(l: AgentRun): Promise<AgentOutcome>;
  /** Probe which tool names omp accepts; returns the unknown ones. */
  validateTools?(tools: string[]): Promise<string[]>;
  complete(c: {
    role: string;
    models: string[];
    system: string;
    prompt: string;
    schema: JSONSchema;
    timeoutSec?: number;
    timeoutMs?: number;
    onModelFallback?: OnModelFallback;
  }): Promise<unknown>;
}

export interface AgentRun {
  agent: string;
  definition: string;
  prompt: string;
  role: string;
  models: string[];
  tools: string[];
  cwd: string;
  outputSchema: JSONSchema;
  label: string;
  session: { resume?: string; keep: boolean };
  timeoutSec?: number;
  onModelFallback?: OnModelFallback;
  onSession?: (sessionId: string) => void | Promise<void>;
  onUsage?: (usage: Usage) => void | Promise<void>;
}

export type AgentOutcome =
  | {
      ok: true;
      data: unknown;
      sessionId?: string;
      traceRef?: string;
      usage?: Usage;
      transcriptBytes?: number;
      stdoutBytes?: number;
      toolCallCount?: number;
    }
  | {
      ok: false;
      error: string;
      data?: unknown;
      sessionId?: string;
      traceRef?: string;
      usage?: Usage;
      transient?: boolean;
      sessionLost?: boolean;
      launchError?: boolean;
      timedOut?: boolean;
      transcriptBytes?: number;
      stdoutBytes?: number;
      toolCallCount?: number;
    };
