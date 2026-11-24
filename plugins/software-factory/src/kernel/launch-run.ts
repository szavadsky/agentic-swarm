/**
 * The launch's two mutable records: the goal-wide `GoalRun` (counters, stop
 * state) and one iteration's `IterationRun` (resume decision, front/boundary/
 * dispatch results). The phase modules fill them; the goal loop owns them.
 */
import type { BoundaryResult } from "./boundary.js";
import type { DispatchResult } from "./dispatch.js";
import type { FrontResult } from "./front.js";
import type { Hold, Steer } from "./mailbox.js";
import type { SteerPmRun } from "./pm.js";
import type { DrainController } from "./signals.js";
import type {
  Cause,
  GoalDecision,
  KernelRuntime,
  State,
  StepRecord,
} from "./types.js";

export interface GoalRun {
  runtime: KernelRuntime;
  signals: DrainController;
  store: KernelRuntime["store"];
  relaunch: boolean;
  iterations: number;
  loopIndex: number;
  resumeForcedOff: boolean;
  lastSummary?: string;
  ended?: "infra" | "cancelled";
  stopCause?: Cause;
  recoveredRecords: number;
}

export interface IterationRun {
  run: GoalRun;
  before: State;
  recordsBefore: StepRecord[];
  resume: boolean;
  /**
   * The half of the interrupted iteration this pass resumes: `front` when it
   * died before its decision, so the ingestion sequence and the boundary still
   * run; `work` when the architect already decided and only work was left.
   */
  resumePhase: "front" | "work";
  resumeHolds: Hold[];
  iteration: number;
  digestSteer: Steer | null;
  resumeSteerPm?: SteerPmRun;
  front: FrontResult;
  boundary?: BoundaryResult;
  decision: GoalDecision;
  seenSteers: string[];
  dispatched?: DispatchResult;
  dispatchCause?: Cause;
  processedBefore: number;
  humanInterventions: number;
  frontFinished: boolean;
  lastSummary?: string;
  ended?: "infra" | "cancelled";
  stopCause?: Cause;
}
