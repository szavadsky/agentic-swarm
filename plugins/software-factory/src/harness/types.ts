/**
 * Harness contract (KERNEL0 §4). Caps/Stop/Usage/SessionRef are adapted from
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
   * `details` carries scrubbed, one-line harness error text capped at 501
   * characters, including a leading `…` when truncated. For an acpx crash the
   * exit code and signal are kept outside the cut, followed by the last
   * non-banner stderr line, the last ACP error frame, or a synthetic cause.
   * Other crash paths use stderr or fall back to their exit facts.
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
  /** List-price equivalent from OpenRouter's model list, ignoring any harness figure. */
  listCostUsd?: number;
  /** The harness-reported figure before pricing filled costUsd from OpenRouter. */
  harnessCostUsd?: number;
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
  /** Harness that ran this call; stamped by the kernel tier walk. */
  harness?: string;
};

/**
 * One adapter call: a TurnResult without the fallback list. `attempts` holds
 * calls the adapter made inside this one (a lost session retried de novo), in
 * order, so the caller can record every restart.
 */
export type AdapterTurnResult = Omit<TurnResult, "attempts"> & {
  attempts: TurnAttempt[];
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
  /**
   * Cancellation from the kernel (the wall bound fired). Adapters kill their
   * child and report `cancelled`; aborting after the turn resolved is a no-op.
   */
  signal?: AbortSignal;
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

/**
 * Whether a session recorded by `from` may be resumed by `to`. Portability is
 * directional and only same-harness edges are proven: any other pair starts de
 * novo with the rendered prompt.
 */
export function portable(from: string, to: string): boolean {
  return from === to;
}

/**
 * What a session-end compaction produced: the stored ref plus the tokens the
 * summarization call consumed. `usage` is absent when the harness cannot
 * measure it (no adapter reports compaction usage yet except the fake).
 */
export interface CompactResult {
  session: SessionRef;
  usage?: Usage;
}

export interface Harness {
  id: string;
  /** Probed at pre-flight, per model. */
  caps(model: ModelRef): Promise<Caps>;
  turn(req: TurnRequest): Promise<TurnResult>;
  /** Absent capability = missing member, a type error at the call site. */
  compact?(ref: SessionRef): Promise<CompactResult>;
}
