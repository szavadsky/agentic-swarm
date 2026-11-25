import type { RetryPolicy } from "../fallback.js";
import type { CacheTtl, ModelRef, Usage } from "../types.js";

/** Directories the runtime keeps for one launch: sessions, prompts and their base. */
export interface OmpDirs {
  base: string;
  sessions: string;
  prompts: string;
}

/** The overlay written for a turn: cache retention plus the entry's opaque options. */
export interface OmpOverlayOptions {
  /** Cheap model every spawned subagent must run on. */
  subagentModel?: string;
  /** Provider cache lifetime from `sessions.retention`. */
  retention: CacheTtl;
  /**
   * Harness-entry `options`: omp config keys, passed through untouched. The
   * shipped run config carries the unattended policy (memory/auto-learn off,
   * approval, disabled providers, retry); the adapter adds only runtime facts.
   */
  options?: Record<string, unknown>;
}

/** Raw usage omp reports on an assistant message (`message_end.message.usage`). */
export interface OmpMessageUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoningTokens?: number;
  cost?: { total?: number } | number;
}

export interface OmpTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface OmpStats {
  sessionId?: string;
  sessionFile?: string;
  tokens?: OmpTokens;
  cost?: number;
}

/** The frame-summed usage and last assistant facts of one turn. */
export interface OmpFrameSummary {
  /** Usage summed from `message_end` frames (fallback when session stats are unavailable). */
  usage: Usage;
  lastAssistantStopReason?: string;
  assistantText?: string;
}

/** Everything one turn's usage is computed from. */
export interface OmpTurnUsage {
  /** Session stats before the prompt; absent when the RPC query failed. */
  before?: OmpStats;
  /** Session stats after the prompt; absent when the RPC query failed. */
  after?: OmpStats;
  /** Frame-sum usage, used when either stats snapshot is missing. */
  fallback: Usage;
  /** Parent session file; child transcripts live beside it. */
  sessionFile?: string;
  /** Epoch ms at which the prompt was sent; earlier child messages belong to an earlier turn. */
  sinceMs: number;
}

/** Error object omp attaches to `prompt_result.status === "error"`. */
export interface OmpPromptError {
  message?: string;
  provider?: string;
  model?: string;
  httpStatus?: number;
  retryable?: boolean;
  code?: string;
}

/** The `prompt_result` frame's data; only the fields the turn reads. */
export interface OmpPromptResult {
  /** Terminal status omp reports for the prompt. */
  status?: "completed" | "error" | "aborted";
  /** Error object omp attaches when `status` is "error". */
  error?: OmpPromptError;
  /** A subarchitect child keeps its session open after the prompt settles. */
  sessionSettled?: boolean;
}

/** How omp's process ended, when it died before a `prompt_result`. */
export interface OmpTurnFailure {
  /** Child process exit code, when omp died before a prompt_result. */
  code?: number | null;
  /** Child process exit signal, when omp died before a prompt_result. */
  signal?: string | null;
  stderr?: string;
  /** The adapter's own wall/idle timer caused the kill. */
  timedOut?: boolean;
}

/** Fields one omp turn's stop is classified from. */
export interface OmpTurnOutcomeInput {
  abortReason?: "idle" | "wall";
  failure?: OmpTurnFailure;
  promptResult?: OmpPromptResult;
  lastStopReason?: string;
  usage?: Usage;
  text?: string;
}

/** Options one `omp --mode rpc` process is launched with. */
export interface OmpRpcOptions {
  binary: string;
  args: string[];
  cwd: string;
  /** Names the run config allows this child to inherit. */
  envAllowlist?: readonly string[];
  /** Called for every retained frame; used for idle timers and usage fallback. */
  onFrame?: (frame: any) => void;
  maxStderrBytes?: number;
}

/** Harness configuration carried through `TurnRequest.opaque`. */
export interface OmpTurnOpaque {
  tools?: string[];
  subagentModel?: ModelRef | string;
  addDirs?: string[];
  overlayExtra?: Record<string, unknown>;
  /**
   * Transient agent definitions for this launch: each markdown is written to a
   * content-addressed extension package's `agents/` root and the package is
   * passed with `-e`, so the worktree and the global config stay untouched.
   */
  agents?: { name: string; markdown: string }[];
}

export interface OmpHarnessOptions {
  /** Run-config `harnesses.omp.binary`; defaults to PATH, then the bare `omp`. */
  binary?: string;
  /** Caller-given session store; sessions and overlays live here, never in a worktree. */
  sessionDir: string;
  /** Cheap model for subagents spawned inside a turn. */
  subagentModel?: ModelRef | string;
  /** Provider cache TTL from `sessions.retention`; no default. */
  retention: CacheTtl;
  retry?: Partial<RetryPolicy>;
  /** Harness-entry `options`: omp overlay keys, passed through untouched. */
  options?: Record<string, unknown>;
  /** Run-config names this harness's children may inherit on top of the base set. */
  envAllowlist?: readonly string[];
  readyTimeoutMs?: number;
  /**
   * Canonical artifact LSP config. When set, each turn installs it into the
   * turn cwd and omp runs without `--no-lsp`; absent keeps LSP off.
   */
  lspConfig?: string;
}

export const OMP_ID = "omp";

/**
 * Whether a model id is an omp role/chain alias (`@free`) rather than a
 * catalogue selector. Aliases resolve inside omp's own chain: `models --json`
 * carries no entry for them, so an alias probed through the CLI reports the
 * union of every catalogued thinking list plus `auto`, the CLI-enum level no
 * model list carries.
 */
export function isOmpAlias(modelId: string): boolean {
  return modelId.startsWith("@");
}

/**
 * Built-ins an unattended factory turn may use. `task` is omitted: its
 * in-session workers run on a quota pool the factory cannot see or latch, so a
 * turn enables them only by naming `task` in its opaque `tools`.
 */
export const DEFAULT_TOOLS = ["read", "bash", "edit", "write", "glob", "grep"];

export function selectorOf(
  model: ModelRef | string | undefined,
): string | undefined {
  if (!model) return undefined;
  return typeof model === "string"
    ? model
    : `${model.id}${model.effort ? `:${model.effort}` : ""}`;
}
