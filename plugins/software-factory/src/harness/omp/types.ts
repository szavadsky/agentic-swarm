import type { RetryPolicy } from "../fallback.js";
import type { ModelRef } from "../types.js";

/** Harness configuration carried through `TurnRequest.opaque`. */
export interface OmpTurnOpaque {
  tools?: string[];
  subagentModel?: ModelRef | string;
  approvalMode?: "always-ask" | "always-ask-cached" | "write" | "yolo";
  addDirs?: string[];
  overlayExtra?: Record<string, unknown>;
}

export interface OmpHarnessOptions {
  /** Run-config `harnesses.omp.binary`; defaults to PATH, then the bare `omp`. */
  binary?: string;
  /** Caller-given session store; sessions and overlays live here, never in a worktree. */
  sessionDir: string;
  /** Cheap model for subagents spawned inside a turn. */
  subagentModel?: ModelRef | string;
  /** Provider cache window; the launch overlay and the session stamp share it. */
  retention?: "short" | "long";
  retry?: Partial<RetryPolicy>;
  overlayExtra?: Record<string, unknown>;
  readyTimeoutMs?: number;
}

export const OMP_ID = "omp";

/**
 * Every value omp's `--thinking` flag parses; any other string fails its
 * argument parse before a session starts (`omp --thinking highest` is the
 * observed case). `models --json` carries per-model lists, but an `@` alias
 * has no catalog entry, so this enum is all pre-flight can know of it.
 */
export const OMP_THINKING_LEVELS: readonly string[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
];

/** Built-ins an unattended factory turn may use; `task` enables pinned subagents. */
export const DEFAULT_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "glob",
  "grep",
  "task",
];

export function selectorOf(
  model: ModelRef | string | undefined,
): string | undefined {
  if (!model) return undefined;
  return typeof model === "string"
    ? model
    : `${model.id}${model.effort ? `:${model.effort}` : ""}`;
}
