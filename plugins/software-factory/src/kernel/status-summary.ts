/** The status paragraph status.json and the dashboard lead with. */

import { recordDirName } from "./store.js";
import type { GoalStatus, StepRecord } from "./types.js";

/**
 * The one-paragraph status the user reads: the latest summary a PM turn wrote,
 * or the kernel's own account when no PM turn wrote one. The kernel derivation
 * reads only derived task counts, so a goal with records never shows an
 * unknown status.
 */
export interface StatusSummary {
  /** `pm` when a PM turn wrote the paragraph; `mechanical` when the kernel derived it. */
  source: "pm" | "mechanical";
  text: string;
  iteration: number;
  /** `records/<dir>` of the PM turn; absent for the kernel's derivation. */
  record?: string;
}

/** The task counts the mechanical account names. */
export interface StatusTaskCounts {
  landed: number;
  total: number;
  open: number;
  parked: number;
}

function recordPath(record: StepRecord): string {
  return `records/${recordDirName(record.seq, record)}`;
}

/** The latest PM turn that wrote a non-empty summary; a later empty turn keeps the last one written. */
export function latestPmSummary(
  records: readonly StepRecord[],
): StatusSummary | undefined {
  const pm = records
    .filter((record) => record.step === "pm")
    .sort((a, b) => a.seq - b.seq)
    .map((record) => ({ record, text: record.outcome?.summary.trim() ?? "" }))
    .filter(({ text }) => text.length > 0)
    .at(-1);
  if (!pm) return undefined;
  return {
    source: "pm",
    text: pm.text,
    iteration: pm.record.iteration,
    record: recordPath(pm.record),
  };
}

/** The kernel's own status account, always a value. */
export function mechanicalSummary(
  goal: GoalStatus,
  iteration: number,
  counts: StatusTaskCounts,
): StatusSummary {
  const text =
    counts.total === 0
      ? `Goal ${goal}, iteration ${iteration}; no task recorded yet.`
      : `Goal ${goal}, iteration ${iteration}; ${counts.landed} of ${counts.total} tasks landed, ${counts.open} open, ${counts.parked} parked.`;
  return { source: "mechanical", text, iteration };
}
