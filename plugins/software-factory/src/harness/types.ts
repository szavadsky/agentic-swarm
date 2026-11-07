/**
 * software-factory v2 — Harness Adapter Contract (§4)
 */

export type JSONSchema = Record<string, unknown>;

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface Harness {
  run(l: AgentRun): Promise<AgentOutcome>; // one turn (fresh or resumed)
  complete(c: {
    role: string;
    models: string[];
    system: string;
    prompt: string;
    schema: JSONSchema;
    timeoutSec?: number;
    timeoutMs?: number;
  }): Promise<unknown>;
}

export interface AgentRun {
  agent: string;
  definition: string; // definition = rendered agent md (frontmatter+body)
  prompt: string;
  role: string;
  models: string[];
  tools: string[];
  cwd: string;
  outputSchema: JSONSchema;
  label: string;
  session: { resume?: string; keep: boolean }; // resume: session id from prior outcome; keep: leave resumable
  timeoutSec?: number;
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
      timedOut?: boolean;
      transcriptBytes?: number;
      stdoutBytes?: number;
    };
