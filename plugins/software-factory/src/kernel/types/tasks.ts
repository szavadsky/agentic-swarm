/** Task-file shapes. */

import type { Outcome } from "./outcome.js";

export type GoalDecision = NonNullable<Outcome["decision"]>;
/** Spike finishes with findings; development merges its branch. */
export type TaskKind = "development" | "spike";

/** One configured task type: the flow it runs, its kind, its output schema and when it fits. */
export interface TaskTypeDefinition {
  flow: string;
  kind: TaskKind;
  /** A kernel outcome schema name; a task type never supplies its own. */
  schema: string;
  /**
   * The type's product may live outside git: the task finishes without a
   * committed report and never merges. Absent reads as false.
   */
  nogit?: boolean;
  /**
   * The type is an operator barrier: the task runs no flow, its readiness drains
   * the launch and stops it so the operator promotes the build, and it is
   * recorded finished at that stop so a relaunch continues. Absent reads as false.
   */
  promote?: boolean;
  /** One line naming the work this type fits, so a planner never picks by name. */
  useWhen: string;
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
  /** The type's product may live outside git; absent reads as false. */
  nogit?: boolean;
  /** The type stops the launch for operator promotion; absent reads as false. */
  promote?: boolean;
  deps: string[];
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
  /**
   * Environment facts this task's implementer turns render: infra facts, known
   * flakes and workarounds. Per task; absent or empty renders nothing.
   */
  envNotes?: string[];
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
