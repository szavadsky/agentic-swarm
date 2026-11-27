/** A turn an infra fault made redundant: work a park threw away, done again. */
import type { StepRecord } from "./types.js";

export interface RerunWaste {
  /** The turn that re-ran the parked task's work. */
  turn: StepRecord;
  /** The park that rejected the previous attempt over infra. */
  evidence: StepRecord;
  detail: string;
}
