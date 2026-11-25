import type { StepRecord } from "./types.js";

/**
 * The first record a task revision owns. A revision bump follows a park: what
 * the records through the last park of an earlier revision built describes the
 * brief the decider replaced, so phase, counts and terminal fact restart from
 * the amended one. The current revision's parks stay, and a record without the
 * field belongs to revision 0, so old records derive as today. The records
 * themselves stay for the prompts' review history.
 */
export function revisionStart(
  revision: number,
  records: readonly StepRecord[],
): number {
  if (revision === 0) return 0;
  let start = 0;
  records.forEach((rec, index) => {
    if (rec.step === "park" && rec.endedAt && (rec.revision ?? 0) < revision) {
      start = index + 1;
    }
  });
  return start;
}
