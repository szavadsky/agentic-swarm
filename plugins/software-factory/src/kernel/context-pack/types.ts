/** The context pack's input and the packs it renders. */

import type { BaseGateState } from "../baseline.js";
import type { OpenDebt } from "../derive.js";
import type { Steer } from "../mailbox.js";
import type { WasteSpikeProposal } from "../metrics/recurring.js";
import type { PackBrief } from "./sections.js";
import type {
  PlanCheckEvidence,
  PlanReviewFinding,
  State,
  StepRecord,
  TaskFile,
} from "../types.js";

export interface ForwardedConcern {
  /** Stable identity: the hold file the PM's mark writes and the pack line share it. */
  id: string;
  source: string;
  calibration: string;
  kind: string;
  text: string;
  evidence?: string;
  /** Repeat count for the same fingerprint, e.g. the same risk raised twice. */
  occurrences?: number;
}

/** Whose pack reads a record: the goal's architect or one epic's. */
export type ConcernAudience = { kind: "goal" } | { kind: "epic"; epic: string };

/** The scope a pack reader sees, for filtering records before they render. */
export interface ConcernScope {
  /** Every task, so a record's slug maps to the epic that owns it. */
  tasks?: readonly TaskFile[];
  /** Absent keeps every record, the depth-1 pack. */
  audience?: ConcernAudience;
}

/** The latest plan-check turn's report, for the architect that it summoned. */
export interface PlanCheckPack {
  iteration: number;
  verdict: string;
  evidence: PlanCheckEvidence[];
  /** Why the checker could not run; absent when it reported normally. */
  reason?: string;
}

/** The latest plan-review round's advisory findings, for the next architect turn. */
export interface PlanReviewPack {
  iteration: number;
  /** The reviewer aliases that delivered findings, in run order. */
  reviewers: string[];
  /** Technical concerns; the architect marks them first. */
  technical: PlanReviewFinding[];
  /** Plan-and-dependency notes; numbered after the technical concerns. */
  planNotes: PlanReviewFinding[];
}

/** One plan-review finding, numbered as the architect marks it. */
export interface NumberedPlanFinding extends PlanReviewFinding {
  /** 1-based across both lists: technical first, then plan notes. */
  number: number;
  kind: "technical" | "planNote";
}

/** A spike's finding: its sealed report, or the outcome summary for a legacy spike. */
export interface SpikeFinding {
  slug: string;
  finding: string;
}

/**
 * One pending steer the intent agent carried into the goal's intent, or tried
 * and failed to carry. The architect plans from the diff and sees the steer
 * itself in the pending list.
 */
export interface IntentChange {
  steer: string;
  /** Goal-relative steer file, for the architect to read beside the diff. */
  relPath: string;
  /** Absolute record directory of the intent turn. */
  record: string;
  /** Unified diff the turn carried; absent when it carried nothing. */
  diff?: string;
  /** Why the turn carried nothing; the steer still needs the architect. */
  failure?: string;
}

/**
 * A ready task that started no task turn in the segment before this pack, and
 * what withheld it. Dispatch decides admission from these facts; the pack only
 * reports them, so an aging task cannot stay invisible across boundaries.
 */
export interface ReadyAgingTask {
  slug: string;
  /** Causes in the pack's reporting order; empty when none is recorded. */
  causes: string[];
}

export interface ReadyAgingInput {
  tasks: readonly TaskFile[];
  state: State;
  records: readonly StepRecord[];
  /** The segment whose turns are counted; the pack that reports it follows. */
  segment: number;
  /** Steers still pending: a processed steer's hold no longer decides admission. */
  pendingSteers: readonly string[];
  holds: readonly { steer: string; slugs: readonly string[] }[];
  /** Ready tasks whose next agent step has no live tier, by slug. */
  unavailableAliases?: ReadonlyMap<string, string>;
}

export interface ContextPackInput {
  goal: string;
  iteration: number;
  /** The one epic this pack serves; absent for the goal architect's pack. */
  epic?: string;
  intentPath: string;
  planPath: string;
  checkout: string;
  integrationBranch: string;
  headHash: string;
  /**
   * The commit the goal's integration branch started from, read from the records;
   * absent when none was recorded.
   */
  goalStartHash?: string;
  /**
   * The head the previous iteration's pack recorded, the commit it started from;
   * absent in the first iteration.
   */
  lastIterationHash?: string;
  recordsDir: string;
  tasksDir: string;
  previousSummary?: string;
  /** The previous iteration summary's `## Waste` section, carried into the pack. */
  previousWaste?: string;
  /** Recurring waste at or above the configured threshold; each is a proposal, never a task. */
  spikeProposals?: WasteSpikeProposal[];
  digestPath?: string;
  tasks: TaskFile[];
  state: State;
  /** Findings of spikes that produced one; the architect plans from them. */
  spikeFindings?: SpikeFinding[];
  running?: string[];
  /** Shallow directory index of the goal checkout, already grouped. */
  codeMap?: string[];
  /** Steers routed to the architect; PM-handled steers are answered elsewhere, never here. */
  steers: Steer[];
  /** The PM's hold per steer; the pack shows each steer's held slugs under it. */
  holds?: { steer: string; slugs: readonly string[]; goal: boolean }[];
  /** The PM's routed answers, one line per steer, for architect context. */
  pmAnswers?: string[];
  /** Pending steers the intent agent carried or failed to carry before this pack. */
  intentChanges?: IntentChange[];
  setup: string[];
  gates: { id: string; command: string }[];
  /** Last recorded pre-flight base run; absent when it was skipped. */
  baseGates?: BaseGateState;
  forwarded: ForwardedConcern[];
  /** Every open debt-kind concern, the register's whole content. */
  debts: OpenDebt[];
  /** Absolute path of the run config the launch loaded; absent when not recorded. */
  runConfigPath?: string;
  /** Records with started.yaml but no end.yaml, as paths the architect can drill into. */
  openRecords?: string[];
  /** The latest plan-check report; absent when the checker never ran. */
  planCheck?: PlanCheckPack;
  /** The latest plan-review findings; absent when the reviewer never ran. */
  planReview?: PlanReviewPack;
  /** Ready tasks with no turn in the previous segment; absent before one exists. */
  agedReady?: ReadyAgingTask[];
  /**
   * Absolute path of the derived status JSON the pack renders from; the
   * pointer a briefed section names.
   */
  dataPath?: string;
  /** Sections the preparer judged better as a pointer and one line. */
  briefs?: PackBrief[];
}

export interface AgingContext {
  terminal: ReadonlyMap<string, string>;
  segment: number;
  unavailableAliases: ReadyAgingInput["unavailableAliases"];
}
