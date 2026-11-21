/** Constants and predicates shared by the debt and state reducers. */

import type { StepRecord, TaskFile, TaskStatus } from "../types.js";

/**
 * The script record the launch appends when the front path stops: a front
 * trivial/task goal has no architect turn, so this record carries its goal
 * decision and `derive` reads it like an architect's.
 */
export const FRONT_STOP_STEP = "front-stop";

/** Task statuses that still owe their epic a live subarchitect. */
export const OPEN_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "pending",
  "ready",
  "running",
  "parked",
]);

/** Dependency edges are satisfied by merged work and by landed spike findings. */
export function depsSatisfied(
  task: TaskFile,
  statuses: ReadonlyMap<string, TaskStatus>,
): boolean {
  return task.deps.every((dep) => {
    const status = statuses.get(dep);
    return status === "merged" || status === "finished";
  });
}

export function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

/**
 * A record recovery sealed after a hard death (SIGKILL, reboot, second signal):
 * a bare `infra: crash` with nothing the turn itself reported. A harness turn
 * that reported a crash carries its usage and prompt bytes; a throwing action
 * recorded by dispatch carries a cause and details. Only the bare seal counts
 * as an interruption; a reported crash counts against the task and blocks resume.
 */
export function isRecoveryCrash(rec: StepRecord): boolean {
  if (rec.stop?.kind !== "infra" || rec.stop?.cause !== "crash") return false;
  if (rec.ok !== false) return false;
  if (rec.cause !== undefined) return false;
  if (rec.stop.details !== undefined) return false;
  if (rec.usage !== undefined) return false;
  if (rec.promptBytes !== undefined) return false;
  return true;
}
