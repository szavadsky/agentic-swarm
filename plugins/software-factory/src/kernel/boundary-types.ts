/**
 * The boundary's public shapes: the consult's result and options, the mutable
 * context its phases share, the epic consult and its failure, the recorded
 * hashes a pack carries, one architect turn's result, the spike steer's
 * verdict, the steered hosting contract and a boundary turn's meta.
 */
import type { LiveAgents, SubagentInfo } from "../harness/types.js";
import type { PackBrief } from "./context-pack/types.js";
import type { IntentChange } from "./context-pack.js";
import type { Steer } from "./mailbox.js";
import type { PlanFile } from "./plan-file.js";
import type { PlanSnapshot } from "./pm.js";
import type {
  ArchitectReason,
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
  launchReason?: ArchitectReason;
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

export interface EpicConsult {
  epic: string;
  plan: PlanFile;
  changed: boolean;
  /** The turn's outcome, so a steer it answered reaches the mailbox. */
  outcome?: Outcome;
}

export interface ConsultFailure {
  cause: string;
  stop?: { cause: string; details?: string };
}

export interface EpicConsultOptions {
  iteration: number;
  epic: string;
  packRel: string;
  goalPlanFile: PlanFile;
  digestPath?: string;
  records: readonly StepRecord[];
  turn: string;
  /**
   * `report` is the bottom-up pass: the epic reports upward and leaves its plan
   * to the top's direction pass. `direction` is the top-down consult.
   */
  pass: "report" | "direction";
}

export interface EpicPackOptions extends Omit<EpicConsultOptions, "packRel"> {
  tasks: readonly TaskFile[];
  state: State;
  planText: string;
  /** Only this epic's pending steers; another epic's never appear here. */
  steers?: readonly Steer[];
  runConfigPath?: string;
}

/** The pack's historical hashes: where the goal started and where its last iteration started. */
export interface RecordedPackHashes {
  goalStartHash: string | undefined;
  lastIterationHash: string | undefined;
}

export type SpikeSteerAction = "architect" | "handled" | "skip";

/** One epic's consult, handed to a live child of the architect's session. */
export interface SteeredConsult {
  epic: string;
  plan: PlanFile;
  planBefore: string | null;
  name: string;
  outcomePath: string;
  /** The full consult the script steers over IRC. */
  prompt: string;
  promptBytes: number;
  child?: SubagentInfo;
}

/**
 * The live host's contract: one named child per epic that already has a plan to
 * review, the architect prompt's launch block and the agent definition, and the
 * start/stop pairing around the owning turn.
 */
export interface SteeredHosting {
  consults: SteeredConsult[];
  agents: { name: string; markdown: string }[];
  /** The architect prompt's block: one launch row per child, empty without children. */
  block: string;
  /** Starts the IRC monitor; a child is steered when the registry admits it. */
  start(agents: LiveAgents): void;
  /** Ends the monitor after the owning turn closes and reports why a child was not steered. */
  stop(): Promise<string[]>;
}

export interface BoundaryTurnMeta {
  iteration: number;
  /** The boundary step a containment incident names, e.g. `architect`. */
  step: string;
}
