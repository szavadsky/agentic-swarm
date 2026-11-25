/**
 * The boundary's public result/option types and the mutable consult context
 * its phases share. The phases live under `boundary-stage.ts` (digest, pack),
 * `boundary-checker.ts` (the plan checker), `boundary-architect.ts` (the
 * architect turn), `boundary-saga.ts` (the epic passes) and `boundary-tail.ts`
 * (steers, review, PM); `boundary.ts` composes them.
 */

import type { EpicConsult } from "./boundary-consult.js";
import type { PackBrief } from "./context-pack/types.js";
import type { IntentChange } from "./context-pack.js";
import type { Steer } from "./mailbox.js";
import type { PlanFile } from "./plan-file.js";
import type { PlanSnapshot } from "./pm.js";
import type {
  GoalDecision,
  KernelRuntime,
  Outcome,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

export interface BoundaryResult {
  iteration: number;
  decision: GoalDecision;
  cause?: string;
  /** A PM rung ended on infrastructure: the launch ends as infra, never dispatches. */
  stop?: { cause: string; details?: string };
  outcome?: Outcome;
  packPath?: string;
  /** Inbox steer ids the architect saw; dispatch must not steer them again. */
  seenSteers: string[];
}

export interface BoundaryOptions {
  relaunch: boolean;
  /** The front turn's iteration; the boundary runs in it instead of starting a new one. */
  iteration?: number;
  /** Goal-relative pack the front prepared; the scripted pack is not rendered. */
  frontPack?: string;
  /** Absolute path of the run config the launch loaded; the pack names it. */
  runConfigPath?: string;
  /**
   * Write this consult's launch digest. Defaults to `relaunch`; a resume always
   * passes false — a repair resume because it already posted its digest, a
   * clean one because it ran none — so the evidence is not gathered twice.
   */
  digest?: boolean;
  /** Test seam; production derives the reason from the consult's own inputs. */
  launchReason?: import("./types.js").ArchitectReason;
}

/** One architect turn's result, kept with the pre-turn snapshots it is judged against. */
export interface ArchitectTurnResult {
  record: StepRecord;
  outcome?: Outcome;
}

export interface ConsultContext {
  runtime: KernelRuntime;
  opts: BoundaryOptions;
  tasks: TaskFile[];
  records: StepRecord[];
  state: State;
  iteration: number;
  plan: PlanFile;
  steers: Steer[];
  seenSteers: string[];
  forArchitect: Steer[];
  /** Epic-scoped steers waiting for their own architect, by epic. */
  forEpicArchitect: Map<string, Steer[]>;
  /** Epics whose steers this iteration's consult already presented or answered. */
  epicSteersAnswered: Set<string>;
  pmAnswers: string[];
  /** Pending steers the intent agent carried (or failed to carry) before this pack. */
  intentChanges?: IntentChange[];
  digestPath?: string;
  packRel?: string;
  /** The preparer's briefs, reused when the report pass re-renders the pack. */
  packBriefs?: PackBrief[];
  /** Files and plans the architect turn must not have touched or written. */
  tasksBefore?: Map<string, string>;
  plansBefore?: PlanSnapshot[];
  planBefore?: string | null;
  architect?: ArchitectTurnResult;
  /** Epics a steered child already consulted inside the architect's session. */
  steeredDone?: Map<string, EpicConsult>;
  consults?: EpicConsult[];
}

/** The result shape every phase returns; packPath appears once the pack exists. */
export function boundaryResult(
  context: ConsultContext,
  decision: GoalDecision,
  extra: Partial<BoundaryResult> = {},
): BoundaryResult {
  return {
    iteration: context.iteration,
    decision,
    ...(context.packRel ? { packPath: context.packRel } : {}),
    seenSteers: context.seenSteers,
    ...extra,
  };
}
