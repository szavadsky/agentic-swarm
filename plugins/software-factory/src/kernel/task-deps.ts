/**
 * Dependency edges over the derived task graph: an edge on parked or cancelled
 * work no continuation has retired leaves its task waiting on a stopped task,
 * so the turn that wrote it is refused instead of chaining work behind it.
 */
import { baseContinuations, OPEN_TASK_STATUSES } from "./derive/shared.js";
import type { TaskFile, TaskStatus } from "./types.js";

/**
 * Whether a status's dependency edges still matter: merged, finished and
 * cancelled work is history, while a fresh file has no derived status yet.
 */
function isOpen(status: TaskStatus | undefined): boolean {
  return status === undefined || OPEN_TASK_STATUSES.has(status);
}

/** The statuses a continuation chain has to reach for a dependency edge to live. */
const LANDED = (status: TaskStatus | undefined): boolean =>
  status === "merged" || status === "finished";

const STILL_LIVE = (status: TaskStatus | undefined): boolean =>
  status !== "cancelled";

/**
 * Whether the continuation chain of `slug`, walked along `base` edges, holds a
 * task whose status the predicate accepts. `skip` is the dependent itself: its
 * own status cannot retire the edge it waits on, and anything continuing it
 * waits behind that same edge, so the walk stops there.
 */
function continuationReaches(
  slug: string,
  continuations: ReadonlyMap<string, readonly string[]>,
  status: ReadonlyMap<string, TaskStatus>,
  accept: (status: TaskStatus | undefined) => boolean,
  skip: string,
): boolean {
  const seen = new Set<string>([slug]);
  const pending = [...(continuations.get(slug) ?? [])];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current) || current === skip) continue;
    seen.add(current);
    if (accept(status.get(current))) return true;
    pending.push(...(continuations.get(current) ?? []));
  }
  return false;
}

/**
 * Dependency edges onto work no continuation has retired: a parked slug needs a
 * continuation that already landed, a cancelled one a continuation that can
 * still land. The findings name both slugs, so the PM turn that wrote the task
 * can re-route the dependency instead of chaining it behind stopped work.
 */
export function deadDepFindings(
  tasks: readonly TaskFile[],
  status: ReadonlyMap<string, TaskStatus>,
): string[] {
  const continuations = baseContinuations(tasks);
  const findings: string[] = [];
  for (const task of tasks) {
    if (!isOpen(status.get(task.slug))) continue;
    for (const dep of task.deps) {
      const depStatus = status.get(dep);
      if (
        depStatus === "parked" &&
        !continuationReaches(dep, continuations, status, LANDED, task.slug)
      ) {
        findings.push(
          `task "${task.slug}" depends on "${dep}", which is parked with no landed continuation; a parked dependency is satisfied only by one that landed`,
        );
      } else if (
        depStatus === "cancelled" &&
        !continuationReaches(dep, continuations, status, STILL_LIVE, task.slug)
      ) {
        findings.push(
          `task "${task.slug}" depends on "${dep}", which is cancelled with no continuation that can land; the edge can never be satisfied`,
        );
      }
    }
  }
  return findings;
}
