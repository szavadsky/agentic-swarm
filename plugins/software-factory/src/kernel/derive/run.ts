/** The derive entry point. */

import { DEFAULT_FLOWS } from "../derive-task.js";
import type {
  EpicState,
  FlowDefinition,
  State,
  StepRecord,
  TaskFile,
  TaskState,
  TaskStatus,
} from "../types.js";
import { bySeq } from "./shared.js";
import {
  addOrphanTaskStates,
  applySubarchitectDecisions,
  buildTaskStates,
  closeEpics,
  hasArchitectDecision,
  hasBlockingCrash,
  latestIteration,
  reduceOrphans,
  reduceTasks,
  settleGoal,
} from "./state.js";

/**
 * Pure, idempotent state derived from task files plus append-only records —
 * the whole crash-recovery story is calling this again. Unfinished records
 * (started, no end) are orphans: they contribute nothing, so the same step is
 * redispatched after the worktree is reconciled.
 *
 * `flows` is the configured flow catalog; without it the built-in
 * implement/review shape is assumed (callers that dispatch use their config).
 */
export function derive(
  tasks: TaskFile[],
  records: StepRecord[],
  flows: Record<string, FlowDefinition> = DEFAULT_FLOWS,
): State {
  const sorted = [...records].sort(bySeq);
  const iteration = latestIteration(sorted);
  const hasArchitectDecisionThisIteration = hasArchitectDecision(
    sorted,
    iteration,
  );
  const hasBlockingCrashThisIteration = hasBlockingCrash(sorted, iteration);

  const statuses = new Map<string, TaskStatus>();
  const reductions = reduceTasks(tasks, sorted, flows, statuses);
  const orphans = reduceOrphans(
    sorted,
    new Set(tasks.map((task) => task.slug)),
    flows,
    statuses,
  );

  const taskStates: Record<string, TaskState> = {};
  const epics: Record<string, EpicState> = {};
  buildTaskStates(tasks, sorted, statuses, reductions, taskStates, epics);
  addOrphanTaskStates(orphans, taskStates);

  applySubarchitectDecisions(sorted, epics);
  closeEpics(epics, statuses);

  const goal = settleGoal(sorted, epics);
  const interrupted =
    goal === "active" &&
    iteration > 0 &&
    hasArchitectDecisionThisIteration &&
    !hasBlockingCrashThisIteration &&
    Object.values(taskStates).some((task) => task.status === "ready");
  return {
    goal,
    iteration,
    terminal: goal !== "active",
    interrupted,
    tasks: taskStates,
    epics,
  };
}
