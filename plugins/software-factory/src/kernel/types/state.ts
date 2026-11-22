/** Causes, task state and the actions derived from them. */

import { z } from "zod";
import type {
  GoalDecision,
  ProgressRepeat,
  TaskKind,
  TaskPhase,
  TaskStatus,
} from "./tasks.js";
import type { ReviewVerdict } from "./outcome.js";

/**
 * A park or failure cause, closed by `kind`: the kernel switches on it and
 * never on `detail`. `detail` is free text for prompts, summaries and records.
 */
export const causeKindSchema = z.enum([
  "gates",
  "conflict",
  "base-conflict",
  "no-progress",
  "empty-diff",
  "round-limit",
  "change-requests-exhausted",
  "overflow",
  "infra",
  "infra-repeat",
  "setup",
  "containment",
  "outside-change",
  "integration-moved",
  "budget",
  "steer",
  "blocked",
  "upscope",
  "failed",
  "review-rejected",
  "refused",
  "invalid-outcome",
  "merge-failed",
  "quarantine",
  "held",
  "stuck",
  "resume",
  "gate-flake",
  "note",
  "boundary",
  "error",
  "unknown",
]);
export type CauseKind = z.infer<typeof causeKindSchema>;

export const causeSchema = z.object({
  kind: causeKindSchema,
  detail: z.string(),
});
export type Cause = z.infer<typeof causeSchema>;

export interface TaskState {
  status: TaskStatus;
  /** The task file's epic, copied so a consumer reading state keeps the owner. */
  epic?: string;
  cause?: Cause;
  /** Agent turns spent on this slug, a spend fact only: no bound reads it. */
  turns: number;
  /** Current implementation/review round, 1-based. */
  round: number;
  kind: TaskKind;
  flow: string;
  phase: TaskPhase;
  commit?: string;
  verdict?: ReviewVerdict;
  /** A derived terminal outcome that still needs its park record. */
  park?: Cause;
  /** No-progress over the item's history; the next action is the loop park. */
  loop?: ProgressRepeat;
  /** A red gate run sent the task back to implement: the fix turn resumes its session, and only a merged-result fix skips the next review. */
  gateFix?: boolean;
  /** True when this gate-fix turn is the last allowed fix turn before red gates park. */
  gateLastCall?: boolean;
  /** True when a cleanliness hit earns one revision follow-up turn before review. */
  cleanlinessRevision?: boolean;
  /** True when the author justified a cleanliness hit to advance to review. */
  cleanlinessJustified?: boolean;
}

export type GoalStatus = "active" | "done" | "blocked";

/**
 * One epic's derived state. The epic's last completed subarchitect record owns
 * its decision; `done` additionally requires every task in the epic to be
 * terminal, so a task that reopens reopens the epic. An epic without a
 * subarchitect turn (the top architect owns it) closes on its tasks alone.
 */
export interface EpicState {
  /** The epic's task slugs; goal-level tasks appear only in `tasks`. */
  tasks: string[];
  /** The last completed subarchitect decision; absent before the first turn. */
  decision?: GoalDecision;
  /** No subarchitect veto and no task in the epic is open. */
  done: boolean;
}

export interface State {
  goal: GoalStatus;
  /** Highest iteration seen in records; 0 before the first boundary turn. */
  iteration: number;
  terminal: boolean;
  /** The current iteration was interrupted with ready work left; a relaunch resumes it. */
  interrupted: boolean;
  tasks: Record<string, TaskState>;
  /** Every epic the task files and subarchitect records name. */
  epics: Record<string, EpicState>;
}

export type Action =
  | { kind: "step"; slug: string; step: string; round: number }
  | { kind: "checks"; slug: string }
  | { kind: "merge"; slug: string }
  | { kind: "finish"; slug: string }
  | { kind: "park"; slug: string; cause: Cause }
  | { kind: "boundary" }
  | { kind: "exit"; reason: string };
