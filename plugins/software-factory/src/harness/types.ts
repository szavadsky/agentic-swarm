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

/**
 * A harness's live answer for one model. Harnesses whose model and effort
 * values exist only inside a session implement `Harness.probe`; pre-flight uses
 * it instead of static capabilities.
 */
export interface ModelProbe {
  /** Whether the harness offered this model in a live session. */
  listed: boolean;
  /** Live model ids, used to explain a rejected model. */
  available: string[];
  /** Live effort values for this model; empty means it offers none. */
  effort: string[];
  /** Effort encoded in the configured model id, when its suffix names one. */
  modelEffort?: string;
}

export type Stop =
  | { kind: "done" }
  | { kind: "cancelled" }
  /** Task-side: the model declined. */
  | { kind: "refusal"; details?: string }
  /** Task-side: the turn was cut short with a half-written artifact. */
  | { kind: "truncated"; cause: "max-tokens" | "turn-limit" }
  /**
   * Infrastructure trouble must never consume a review round.
   * `details` carries scrubbed, one-line harness error text capped at 501
   * characters, including a leading `…` when truncated. For an acpx crash the
   * exit code and signal are kept outside the cut, followed by the last
   * non-banner stderr line, the last ACP error frame, or a synthetic cause.
   * Other crash paths use stderr or fall back to their exit facts.
   * `network` is a transport loss (reset socket, failed fetch) or an error the
   * provider itself marked retryable; `quota` and `rate` are retried alike.
   * `unavailable` means the turn never reached a harness: its alias had no live
   * tier, and `details` names the exhausted pools and their stored resets.
   */
  | {
      kind: "infra";
      cause:
        | "quota"
        | "rate"
        | "network"
        | "auth"
        | "crash"
        | "overflow"
        | "timeout"
        | "unavailable"
        | "glitch";
      details?: string;
    };

/** Every infrastructure cause a stop can carry. */
export type InfraCause = Extract<Stop, { kind: "infra" }>["cause"];

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
  /** Last model-stream activity in the turn, or the turn's end when none arrived. */
  lastRequestStartedAt: string;
  retentionTier: "short" | "long";
  compacted: boolean;
  /**
   * Session-cumulative token totals last read from the harness's usage command;
   * a later turn reports the delta. Adapters without cumulative counters omit it.
   */
  cumulativeUsage?: Usage;
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

/**
 * One model a single call actually served, with the tokens it served. A
 * harness-native chain (omp's `@` aliases) can switch models inside one call;
 * these entries are measurement only — routing, admission and fallback
 * accounting keep using the requested alias.
 */
export interface ServedUsage {
  model: ModelRef;
  usage: Usage;
}

/** One live child of a running turn, as the harness's own registry names it. */
export interface SubagentInfo {
  /** The spawn `name`, the id IRC addresses. */
  id: string;
  /** The agent definition the child runs. */
  agent: string;
  status: string;
  sessionFile?: string;
}

/**
 * The children of a turn that is still running. Available only through
 * `TurnRequest.onLive`: once the owning process closes, a fresh resume has an
 * empty registry and a parked child is reachable only by name through the
 * model-side `agent://` path.
 */
export interface LiveAgents {
  list(): Promise<SubagentInfo[]>;
  steer(id: string, message: string): Promise<void>;
}

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
  /**
   * Harnesses that can steer (`Caps.subagents === "steer"`) call this once the
   * launch is live and before the prompt, so the caller can steer children the
   * turn spawns. The handle dies with the turn; a harness that cannot steer
   * never calls it.
   */
  onLive?: (agents: LiveAgents) => void;
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
  /**
   * Per-model split of this turn when the harness resolved its model inside one
   * call (a native chain); `usage` is the sum of these entries. Absent when the
   * call retried — earlier calls are outside it — so such a turn keeps the
   * aggregate usage and its single attributable model.
   */
  served?: ServedUsage[];
  /** Path to the raw stream transcript, when the harness stores one. */
  transcript?: string;
};

/**
 * Whether a session recorded by `from` may be resumed by `to`. Same-harness
 * resume is always allowed; every other pair starts de novo with the rendered
 * prompt unless the run config declares that edge in its `from` -> `to`
 * direction.
 */
export function portable(
  from: string,
  to: string,
  graph: { from: string; to: string }[] = [],
): boolean {
  return from === to || graph.some((e) => e.from === from && e.to === to);
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
  /** Live model/effort discovery for harnesses that only expose it in a session. */
  probe?(model: ModelRef): Promise<ModelProbe>;
  turn(req: TurnRequest): Promise<TurnResult>;
  /** Absent capability = missing member, a type error at the call site. */
  compact?(ref: SessionRef): Promise<CompactResult>;
}
