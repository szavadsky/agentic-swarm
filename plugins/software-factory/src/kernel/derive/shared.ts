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

/** Continuation edges: each slug's `base`, inverted to the tasks continuing it. */
export function baseContinuations(
  tasks: readonly TaskFile[],
): Map<string, string[]> {
  const continuations = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.base === undefined) continue;
    const list = continuations.get(task.base) ?? [];
    list.push(task.slug);
    continuations.set(task.base, list);
  }
  return continuations;
}

/**
 * A dependency is satisfied by its own merge or finish, or by a task
 * continuing it through `base`, transitively. Only a parked or cancelled slug
 * resolves through a continuation: a live one owes its own work. A parked or
 * cancelled slug with no merged or finished continuation stays unsatisfied.
 */
function depSatisfied(
  slug: string,
  statuses: ReadonlyMap<string, TaskStatus>,
  continuations: ReadonlyMap<string, readonly string[]>,
): boolean {
  const status = statuses.get(slug);
  if (status === "merged" || status === "finished") return true;
  if (status !== "parked" && status !== "cancelled") return false;
  const pending = [slug];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of continuations.get(current) ?? []) {
      const nextStatus = statuses.get(next);
      if (nextStatus === "merged" || nextStatus === "finished") return true;
      pending.push(next);
    }
  }
  return false;
}

/** Dependency edges are satisfied by merged work, a landed spike finding, or a merged/finished base continuation. */
export function depsSatisfied(
  task: TaskFile,
  statuses: ReadonlyMap<string, TaskStatus>,
  continuations: ReadonlyMap<string, readonly string[]>,
): boolean {
  return task.deps.every((dep) => depSatisfied(dep, statuses, continuations));
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
