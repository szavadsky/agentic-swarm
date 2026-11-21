/** Shapes the derivation reads out of records and returns to callers. */

import { reduceTask } from "../derive-task.js";
import type { Concern, ConcernId } from "../types.js";

/** One debt-kind concern the kernel recorded, with the id ingest assigned it. */
export interface OpenDebt {
  /** `<recordId>#<n>` of the first record that raised the debt; absent on a hand-built record. */
  id?: ConcernId;
  text: string;
  evidence?: string;
  calibration: Concern["calibration"];
  /** `slug step rN` of the first record that raised it. */
  source: string;
  iteration: number;
  seq: number;
}

export type TaskReduction = ReturnType<typeof reduceTask>;

export interface OrphanReductions {
  slugs: Set<string>;
  reductions: Map<string, TaskReduction>;
}
