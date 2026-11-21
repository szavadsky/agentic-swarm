/** Task-file shapes. */

import type { Outcome } from "./outcome.js";

export type GoalDecision = NonNullable<Outcome["decision"]>;
/** Spike finishes with findings; development merges its branch. */
export type TaskKind = "development" | "spike";

/** One configured task type: the flow it runs, its kind and its output schema. */
export interface TaskTypeDefinition {
  flow: string;
  kind: TaskKind;
  /** A kernel outcome schema name; a task type never supplies its own. */
  schema: string;
}

export interface TaskFile {
  slug: string;
  title: string;
  /** The configured type this file named; absent on a legacy file. */
  type?: string;
  /** Resolved from `type`; a legacy file declares it directly. */
  kind: TaskKind;
  /** Resolved from `type`; a legacy file declares it directly. */
  flow: string;
  deps: string[];
  scope: string[];
  /** The epic that owns this task; absent means goal-level work. */
  epic?: string;
  tier?: string;
  /**
   * The decider's revision of this task, 0 until it amends a park under the
   * same slug. Derive counts only records after the park an earlier revision
   * ended, so a bump restarts the flow with its counts while the kept branch
   * and the records stay.
   */
  revision: number;
  /** A parked task whose kept branch this task continues from. */
  base?: string;
  /** Plan heading this task derives from. */
  source: string;
  body: string;
  /** Outcome reminders for this task's turns; defaults to process `reminders`. */
  repairTurns?: number;
  /**
   * Per-turn wall bound in minutes for this task's turns; overrides the alias
   * wall, still capped by the run's `limits.turnMinutes`. Owner ruling 2.
   */
  turnMinutes?: number;
  /** Plan-checker re-runs per iteration; exhausted rounds consult the architect. */
}

export interface TaskFileFinding {
  slug: string;
  file: string;
  kind: "malformed" | "unconfigured-type";
  reason: string;
}

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "merged"
  | "finished"
  | "parked"
  | "cancelled";

/**
 * The next thing the task needs: a flow step id, or one of the script phases.
 * Flow step ids are open so a configured flow (not this union) drives dispatch.
 */
export type TaskPhase = string;

/** A completed step repeated an earlier fingerprint in the item's history. */
export interface ProgressRepeat {
  fingerprint: string;
  step: string;
  round: number;
  firstRound: number;
}
