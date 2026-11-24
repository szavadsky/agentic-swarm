/** Zero-edit turns, split by what the turn owed: a reply, a finding or a diff. */

import type { StepRecord, TaskFile } from "../types.js";
import type { ZeroEditCounts } from "./types.js";

/**
 * Steps whose product is the answer, not a diff: reviews and QA judge, the
 * boundary turns decide, and the steward skips when there is nothing to
 * resolve. A zero-edit turn on any other step owed work and made none.
 */
const REPLY_STEPS: ReadonlySet<string> = new Set([
  "adjudicate",
  "architect",
  "digest",
  "front",
  "intent",
  "plancheck",
  "planreturn",
  "planreview",
  "pm",
  "qa",
  "review",
  "steward",
  "subarchitect",
]);

/**
 * The slugs whose delivered product is a finding: a spike task, or any slug a
 * finish record handed a report. The report is committed by the spike turn, so
 * its empty diff is the product, not a no-op.
 */
export function spikeSlugs(
  all: readonly StepRecord[],
  tasks: readonly TaskFile[] | undefined,
): Set<string> {
  const slugs = new Set<string>();
  for (const task of tasks ?? []) {
    if (task.kind === "spike") slugs.add(task.slug);
  }
  for (const rec of all) {
    if (rec.step === "finish" && rec.report !== undefined && rec.slug) {
      slugs.add(rec.slug);
    }
  }
  return slugs;
}

/** Counts the iteration's zero-edit turns, reply and finding before no-op. */
export function zeroEditCounts(
  turns: readonly StepRecord[],
  spikes: ReadonlySet<string>,
): ZeroEditCounts {
  const counts: ZeroEditCounts = { reply: 0, finding: 0, noop: 0 };
  for (const rec of turns) {
    // A turn with no measured diff is not a zero-edit fact, so it counts
    // nowhere: the split reports what the records show, never an assumption.
    if (rec.edits === undefined || rec.edits.files > 0) continue;
    if (REPLY_STEPS.has(rec.step)) {
      counts.reply += 1;
    } else if (rec.slug !== undefined && spikes.has(rec.slug)) {
      counts.finding += 1;
    } else {
      counts.noop += 1;
    }
  }
  return counts;
}
