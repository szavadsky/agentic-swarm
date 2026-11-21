/** Selecting the concerns and debts a pack shows. */

import type { State, StepRecord, TaskFile } from "../types.js";
import type { ConcernAudience } from "./types.js";

/** Task slug -> owning epic, from every task file. */
export function epicByTask(tasks: readonly TaskFile[]): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const task of tasks) {
    if (task.epic !== undefined) bySlug.set(task.slug, task.epic);
  }
  return bySlug;
}

/**
 * A goal-level record is readable at every level. A task's record belongs to
 * its task's epic; a subarchitect's record is that epic's brief upward, so the
 * goal architect reads it too. One epic never reads another's task records.
 */
export function visibleToAudience(
  record: StepRecord,
  bySlug: ReadonlyMap<string, string>,
  audience: ConcernAudience,
): boolean {
  if (record.step === "subarchitect")
    return audience.kind === "goal" || record.architect === audience.epic;
  const epic = record.slug ? bySlug.get(record.slug) : undefined;
  if (epic === undefined) return true;
  return audience.kind === "epic" && audience.epic === epic;
}

/** The records one pack may read: everything `audience` is allowed to see. */
export function recordsForAudience(
  records: readonly StepRecord[],
  tasks: readonly TaskFile[],
  audience: ConcernAudience,
): StepRecord[] {
  const bySlug = epicByTask(tasks);
  return records.filter((record) =>
    visibleToAudience(record, bySlug, audience),
  );
}

/** The record with its fyi debts dropped: a finished epic's notes need not travel. */
function blockingDebtOnly(record: StepRecord): StepRecord {
  const outcome = record.outcome;
  if (!outcome) return record;
  const concerns = outcome.concerns.filter(
    (concern) => concern.kind !== "debt" || concern.calibration !== "fyi",
  );
  if (concerns.length === outcome.concerns.length) return record;
  return { ...record, outcome: { ...outcome, concerns } };
}

/**
 * The records the goal architect's debt register reads: every goal-level
 * record plus the blocking debt of epics that finished. Strict-chain routing
 * keeps a live epic's task concerns inside it; a finished epic has no architect
 * left to close what it left open, and goal `done` refuses while material debt
 * is open, so its blocking debt rides up to the architect that can close it.
 * The finished epic's fyi notes stay behind, as calibration says they need not
 * travel.
 */
export function goalDebtRecords(
  records: readonly StepRecord[],
  tasks: readonly TaskFile[],
  epics: State["epics"],
): StepRecord[] {
  const bySlug = epicByTask(tasks);
  const kept: StepRecord[] = [];
  for (const record of records) {
    if (visibleToAudience(record, bySlug, { kind: "goal" })) {
      kept.push(record);
      continue;
    }
    const epic = record.slug ? bySlug.get(record.slug) : undefined;
    if (epic !== undefined && epics[epic]?.done === true) {
      kept.push(blockingDebtOnly(record));
    }
  }
  return kept;
}
