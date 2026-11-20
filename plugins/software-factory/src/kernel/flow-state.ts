/**
 * The flow's result shape and the per-step run context its phase helpers
 * thread. `flow.ts` re-exports the public result type.
 */
import type { InfraCause } from "../harness/types.js";
import type { TurnTarget } from "./flow-context.js";
import type { TimeoutTracker } from "./flow-timeouts.js";
import type { Job } from "./flow-worktree.js";
import type { ConflictSnapshot } from "./merge-conflict.js";

type Contained = Awaited<
  ReturnType<typeof import("./worktree.js").containmentSnapshot>
>;
type Timeouts = NonNullable<
  import("../harness/types.js").TurnRequest["timeouts"]
>;

import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

export interface TaskActionResult {
  /** The classified fault, unflattened so dispatch can judge its cause. */
  infra?: { cause: InfraCause; details?: string };
  cancelled?: boolean;
}

/** The mutable progress of one step's preparation; helpers fill it in phases. */
export interface StepRun {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  iteration: number;
  step: FlowStep;
  flow: FlowDefinition;
  records: StepRecord[];
  ensured: Job;
  fix: boolean;
  resolveStep: boolean;
  amendedFirstTurn: boolean;
  keptBranch: boolean;
  pendingResolve: { head: string; paths: string[] } | null;
  resolveIsCreation: boolean;
  resolveIsFirstTurn: boolean;
  startPoint: string;
  preexisting: Set<string>;
  resolve?: {
    head: string;
    conflicts: string[];
    snapshot: ConflictSnapshot;
  };
  target?: TurnTarget;
  session?: import("../harness/types.js").SessionRef;
  trivial: boolean;
  turnCwd?: string;
  vars?: Record<string, string>;
  baseHash?: string;
  lastCall: boolean;
  contained?: Contained;
  timeouts?: Timeouts;
  tracked?: TimeoutTracker;
  startHead?: string;
  breach?: string;
}
