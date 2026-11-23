import type { RetryPolicy } from "../fallback.js";
import type { CacheTtl, ModelRef } from "../types.js";

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
