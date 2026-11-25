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
 * The two records a park's retirement compares: its own last park and each
 * slug's last verified merge.
 */
interface LandingFacts {
  parks: ReadonlyMap<string, StepRecord>;
  merges: ReadonlyMap<string, StepRecord>;
}

/**
 * Collects the last ended park and verified (`ok`) merge per slug in one pass.
 */
export function landingFacts(sorted: readonly StepRecord[]): LandingFacts {
  const parks = new Map<string, StepRecord>();
  const merges = new Map<string, StepRecord>();
  for (const rec of sorted) {
    if (rec.slug === undefined || rec.endedAt === undefined) continue;
    if (rec.step === "park") parks.set(rec.slug, rec);
    else if (rec.step === "merge" && rec.ok === true) merges.set(rec.slug, rec);
  }
  return { parks, merges };
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

/** True when the child's last verified merge sorts after the park. */
function mergeAfterPark(
  child: string,
  park: StepRecord,
  landings: LandingFacts,
): boolean {
  const merge = landings.merges.get(child);
  return merge !== undefined && bySeq(park, merge) < 0;
}

/**
 * Visits one slug's continuations, queueing the unmerged ones; returns a merged
 * child whose verified merge landed after the park.
 */
function visitChildren(
  current: string,
  frontier: string[],
  seen: Set<string>,
  park: StepRecord,
  landings: LandingFacts,
  statuses: ReadonlyMap<string, TaskStatus>,
  continuations: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  const children = [...(continuations.get(current) ?? [])].sort();
  for (const child of children) {
    if (seen.has(child)) continue;
    seen.add(child);
    if (statuses.get(child) === "merged") {
      if (mergeAfterPark(child, park, landings)) return child;
      continue;
    }
    frontier.push(child);
  }
  return undefined;
}

/**
 * The continuation that retired a parked slug's work: the shallowest slug
 * reachable along `base` edges whose verified merge came after the park. A
 * merge recorded before the park verified an earlier revision, so it leaves
 * the park live; a merged node ends its chain because its branch is history,
 * not a continuation base. An unmerged continuation is walked through (it
 * may be parked and continued again), matching `depsSatisfied`.
 */
export function supersedingContinuation(
  slug: string,
  landings: LandingFacts,
  statuses: ReadonlyMap<string, TaskStatus>,
  continuations: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  const park = landings.parks.get(slug);
  if (park === undefined || statuses.get(slug) !== "parked") return undefined;
  const frontier = [slug];
  const seen = new Set<string>([slug]);
  while (frontier.length > 0) {
    const landing = visitChildren(
      frontier.shift()!,
      frontier,
      seen,
      park,
      landings,
      statuses,
      continuations,
    );
    if (landing !== undefined) return landing;
  }
  return undefined;
}

export function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}
