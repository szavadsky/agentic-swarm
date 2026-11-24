/**
 * The reduction's mutable state and its two shared transitions: the initial
 * state, and the resolve turn's route back into the flow. The rule handlers
 * under `derive-task-gates.ts` and `derive-task-turn.ts` mutate this object.
 */

import { makeCause } from "./cause.js";
import type { PendingChecks, TerminalFact } from "./derive-task-facts.js";
import { DECIDE_STEP } from "./pending-signal.js";
import { isAcceptanceStep } from "./review.js";
import type {
  Cause,
  FlowDefinition,
  FlowStep,
  PendingSignal,
  ProgressRepeat,
  ReviewVerdict,
  StepRecord,
  TaskFile,
  TaskPhase,
} from "./types.js";

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
  /** Acceptance rounds the decider's `changes` verdicts bought past the bound. */
  roundGrants: number;
  seen: Map<string, { step: string; round: number }>;
  lastInfraStep?: string;
  infraRepeatCount: number;
}

export function createReduceState(
  context: ReduceContext,
  terminal: TerminalFact | null,
): ReduceState {
  return {
    terminal,
    phase: context.firstStep,
    round: 1,
    stepIndex: 0,
    gateFix: false,
    gateLastCall: false,
    gateFixCount: 0,
    cleanlinessRevision: false,
    cleanlinessRevised: false,
    cleanlinessJustified: false,
    cleanlinessRedLines: [],
    cleanlinessAccepted: [],
    mergeFix: false,
    changesPending: false,
    replyOnlyFix: false,
    gatesFailures: 0,
    pendingChecks: null,
    creationAdvance: null,
    seenCountedTurn: false,
    turns: 0,
    resolveRan: false,
    pendingSignal: null,
    signalResume: null,
    roundGrants: 0,
    seen: new Map(),
    infraRepeatCount: 0,
  };
}

/**
 * A settled resolve turn sends the task back to the flow: review when it
 * changed files the conflict did not cover, otherwise straight to checks and
 * the re-merge. The resolve turn is not a flow step, so it lands here rather
 * than through the agent-step sequence.
 */
export function routeResolve(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  state.resolveRan = true;
  state.commit = rec.commit ?? state.commit;
  const outside = rec.outside ?? [];
  const acceptanceIndex = context.steps.findIndex((step) =>
    isAcceptanceStep(step),
  );
  if (outside.length > 0) {
    if (acceptanceIndex < 0) {
      // No acceptance step to judge the un-reviewed work: never land it silently.
      state.park = makeCause(
        "stuck",
        `resolve changed files outside the conflict set and the flow has no acceptance step: ${outside.join(", ")}`,
      );
      state.phase = "parked";
    } else {
      state.round = Math.max(state.round, rec.round + 1);
      state.stepIndex = acceptanceIndex;
      state.phase = context.steps[acceptanceIndex]!.id;
      state.pendingChecks = null;
    }
  } else {
    state.pendingChecks = { nextIndex: context.steps.length, mergeAfter: true };
    state.phase = "checks";
  }
  state.gateFix = false;
  state.gateLastCall = false;
  state.mergeFix = false;
  state.changesPending = false;
}

/**
 * Raises a mechanical signal instead of parking: the phase the next action
 * reads becomes the decide turn, and the resume point says what an approve
 * continues to.
 */
export function raisePendingSignal(
  state: ReduceState,
  signal: PendingSignal,
  resume: SignalResume,
): void {
  state.pendingSignal = signal;
  state.signalResume = resume;
  state.phase = DECIDE_STEP;
}
