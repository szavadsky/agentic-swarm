/**
 * Harness contract (KERNEL0 §4). Caps/Stop/Usage/SessionRef are verbatim from
 * `manifesto.advice.md:96-143`; flows branch on Caps, never on harness id.
 */

/** Provider-qualified model id plus the effort level to request from Caps.effort. */
export interface ModelRef {
  id: string;
  effort?: string;
}

export type Caps = {
  resume: boolean;
  compact: "none" | "local" | "server";
  fork: boolean;
  subagents: "none" | "spawn" | "steer";
  structuredOutput: "none" | "native";
  /** Levels this model accepts on this harness. */
  effort: string[];
  usage: { cache: boolean; cost: boolean };
};

export type Stop =
  | { kind: "done" }
  | { kind: "cancelled" }
  /** Task-side: the model declined. */
  | { kind: "refusal"; details?: string }
  /** Task-side: the turn was cut short with a half-written artifact. */
  | { kind: "truncated"; cause: "max-tokens" | "turn-limit" }
  /**
   * Infrastructure trouble must never consume item budget or review rounds.
   * `details` carries the scrubbed, one-line tail of the harness error text: at
   * most 500 characters of text, with a leading `…` added when truncated. The
   * text is a structured error message, stderr, or a synthetic cause, falling
   * back to the exit code and signal when stderr is empty.
   */
  | {
      kind: "infra";
      cause: "quota" | "rate" | "auth" | "crash" | "overflow" | "timeout";
      details?: string;
    };

export type Usage = {
  in: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  out: number;
  reasoningOut: number;
  costUsd?: number;
};

export type SessionRef = {
  harness: string;
  id: string;
  /** Resume is cwd-bound. */
  cwd: string;
  model: ModelRef;
  /** Cache lifetime runs from the start of the last request, not turn end. */
  lastRequestStartedAt: string;
  retentionTier: "short" | "long";
  compacted: boolean;
  /** Harness-managed session home; resume resolves against it, not the current launch dir. */
  dir?: string;
};

/** One call to the harness, after fallback expansion. */
export type TurnAttempt = {
  model: ModelRef;
  stop: Stop;
  usage: Usage;
};

export interface TurnRequest {
  model: ModelRef;
  effort?: string;
  cwd: string;
  system?: string;
  prompt: string;
  session?: SessionRef;
  /** Same-harness fallback chain, tried in order after the primary. */
  fallbacks?: ModelRef[];
  /** Where a harness without native structured output expects the agent to write its outcome. */
  outcomePath?: string;
  timeouts: { idleMs: number; wallMs: number };
  /** Harness configuration passed through untouched. */
  opaque?: unknown;
}

export type TurnResult = {
  stop: Stop;
  text: string;
  usage: Usage;
  session?: SessionRef;
  /** Model actually used (primary or the last fallback that produced this result). */
  model: ModelRef;
  /** Every attempt made for this turn; empty/one entry when no retry or fallback ran. */
  attempts?: TurnAttempt[];
  /** Path to the raw stream transcript, when the harness stores one. */
  transcript?: string;
};

export interface Harness {
  id: string;
  /** Probed at pre-flight, per model. */
  caps(model: ModelRef): Promise<Caps>;
  turn(req: TurnRequest): Promise<TurnResult>;
  /** Absent capability = missing member, a type error at the call site. */
  compact?(ref: SessionRef): Promise<SessionRef>;
}
