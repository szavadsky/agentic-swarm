/** Park friction: settled records by cause, the merged tasks they took, landings. */

import type { StepRecord, TaskFile } from "../types.js";
import type { ParkMetrics } from "./types.js";

/** Record order: the sequence number, the start stamp breaking a tie. */
function after(left: StepRecord, right: StepRecord): boolean {
  return (
    left.seq > right.seq ||
    (left.seq === right.seq && left.startedAt > right.startedAt)
  );
}

/** Each slug's last settled park: the revision its landing is compared to. */
function lastParkBySlug(all: readonly StepRecord[]): Map<string, StepRecord> {
  const last = new Map<string, StepRecord>();
  for (const rec of all) {
    if (rec.step !== "park" || rec.endedAt === undefined || !rec.slug) continue;
    const previous = last.get(rec.slug);
    if (previous === undefined || after(rec, previous)) last.set(rec.slug, rec);
  }
  return last;
}

/**
 * Every settled park record counts (all slugs, all rounds) beside the distinct
 * parked slugs and the distinct merged tasks. A park's work landed unchanged
 * when a verified merge followed it and the task file still carries the parked
 * revision; a task file the store does not list is unknown, never zero.
 */
export function parkMetrics(
  all: readonly StepRecord[],
  tasks: readonly TaskFile[] | undefined,
): ParkMetrics {
  const records = all.filter(
    (rec) => rec.step === "park" && rec.endedAt !== undefined,
  );
  const parks = lastParkBySlug(all);
  const byCause: Record<string, number> = {};
  for (const rec of records) {
    const cause = rec.cause?.kind ?? "unknown";
    byCause[cause] = (byCause[cause] ?? 0) + 1;
  }
  const merges = all.filter(
    (rec) => rec.step === "merge" && rec.ok === true && rec.slug !== undefined,
  );
  const mergedSlugs = new Set(merges.map((rec) => rec.slug!));
  const revisionBySlug = new Map(
    (tasks ?? []).map((task) => [task.slug, task.revision]),
  );
  let landedUnchanged = 0;
  let landedAmended = 0;
  let landedUnknown = 0;
  for (const [slug, park] of parks) {
    const landed = merges.some(
      (merge) => merge.slug === slug && after(merge, park),
    );
    if (!landed) continue;
    const revision = revisionBySlug.get(slug);
    if (revision === undefined) {
      landedUnknown += 1;
    } else if (revision === (park.revision ?? 0)) {
      landedUnchanged += 1;
    } else {
      landedAmended += 1;
    }
  }
  return {
    records: records.length,
    distinctSlugs: parks.size,
    mergedSlugs: mergedSlugs.size,
    perMergedTask:
      mergedSlugs.size > 0 ? records.length / mergedSlugs.size : null,
    byCause,
    landedUnchanged,
    landedAmended,
    landedUnknown,
  };
}
