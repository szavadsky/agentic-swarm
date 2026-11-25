/** The task reduction's public shapes: terminal facts, pending checks, and the reduce state. */

import type {
  Cause,
  FlowDefinition,
  FlowStep,
  PendingSignal,
  ProgressRepeat,
  ReviewVerdict,
  StepLaunches,
  TaskFile,
  TaskPhase,
  TaskStatus,
} from "./types.js";

export interface TerminalFact {
  status: TaskStatus;
  cause?: Cause;
  commit?: string;
}

export interface TaskReduction {
  terminal: TerminalFact | null;
  phase: TaskPhase;
  round: number;
  launches: Record<string, StepLaunches>;
  turns: number;
  /** An agent turn on this slug has started, ended or not. */
  started: boolean;
  verdict?: ReviewVerdict;
  commit?: string;
  park?: Cause;
  loop?: ProgressRepeat;
  gateFix?: boolean;
  gateLastCall?: boolean;
  cleanlinessRevision?: boolean;
  cleanlinessJustified?: boolean;
  pendingSignal?: PendingSignal;
}

export interface PendingChecks {
  nextIndex: number;
  mergeAfter: boolean;
  /**
   * An empty gate-fix turn whose park awaits these checks: green carries on,
   * an identical red parks, a changed set loops the fix. Riding pendingChecks
   * keeps the deferral with the turn it settles: a review, merge or newer
   * turn clears both together, so a stale deferral can never mis-park.
   */
  emptyFix?: { step: string; round: number };
}

export interface ReduceContext {
  task: TaskFile;
  flow: FlowDefinition;
  steps: FlowStep[];
  flowIndex: Map<string, number>;
  firstStep: string;
}

/**
 * How the decider's approve resumes from the point a signal stopped: past the
 * flow step that raised it, into the checks it gated, or into a fresh landing.
 */
export type SignalResume =
  | { kind: "past-step"; index: number }
  | { kind: "checks"; pending: PendingChecks }
  | { kind: "merge" };

export interface ReduceState {
  terminal: TerminalFact | null;
  phase: TaskPhase;
  round: number;
  launches: Record<string, StepLaunches>;
  /** Acceptance calls each flow step ran: one counted turn that judged the tree. */
  calls: Record<string, number>;
  /** Acceptance calls a decider's `changes` bought past a step's own bound, by step. */
  roundGrants: Record<string, number>;
  stepIndex: number;
  verdict?: ReviewVerdict;
  commit?: string;
  park?: Cause;
  loop?: ProgressRepeat;
  gateFix: boolean;
  gateLastCall: boolean;
  gateFixCount: number;
  gateFailure?: string;
  /** Sorted actionable failing names behind the current gate fix. */
  gateRed?: string[];
  cleanlinessRevision: boolean;
  cleanlinessRevised: boolean;
  cleanlinessJustified: boolean;
  /** The finding lines of the cleanliness red awaiting the author's answer. */
  cleanlinessRedLines: string[];
  /** The cleanliness finding lines the author's reply accepted. */
  cleanlinessAccepted: string[];
  /** The gate fix came from merged-result gates: green checks merge, skipping review. */
  mergeFix: boolean;
  /** The last review's `changes` still awaits its answer. */
  changesPending: boolean;
  /** The fix before the next review answered by replies alone. */
  replyOnlyFix: boolean;
  gatesFailures: number;
  pendingChecks: PendingChecks | null;
  /** The last green task-checks tree. */
  lastChecksTree?: string;
  lastTree?: string;
  /** Tree of the last counted turn. */
  countedTree?: string;
  creationAdvance: { tree: string; headTree: string } | null;
  seenCountedTurn: boolean;
  turns: number;
  resolveRan: boolean;
  /** A mechanical signal awaiting its decide turn. */
  pendingSignal: PendingSignal | null;
  /** Where the signal stopped the flow; its decide turn's approve resumes there. */
  signalResume: SignalResume | null;
  seen: Map<string, { step: string; round: number }>;
  lastInfraStep?: string;
  infraRepeatCount: number;
}

/** A gate fix that changed nothing and defers to the checks that follow it. */
export type DeferredFix = { step: string; round: number };
