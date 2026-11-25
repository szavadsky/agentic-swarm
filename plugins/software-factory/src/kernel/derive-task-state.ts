/**
 * The reduction's mutable state and its two shared transitions: the initial
 * state, and the resolve turn's route back into the flow. The rule handlers
 * under `derive-task-gates.ts` and `derive-task-turn.ts` mutate this object.
 */

import { makeCause } from "./cause.js";
import type {
  PendingChecks,
  ReduceContext,
  ReduceState,
  SignalResume,
  TerminalFact,
} from "./derive-types.js";
import { DECIDE_STEP } from "./pending-signal.js";
import { countLaunch, emptyLaunches, isAcceptanceStep } from "./review.js";
import type { FlowStep, PendingSignal, StepRecord } from "./types.js";

export function createReduceState(
  context: ReduceContext,
  terminal: TerminalFact | null,
): ReduceState {
  return {
    terminal,
    phase: context.firstStep,
    round: 1,
    launches: {},
    calls: {},
    roundGrants: {},
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
    seen: new Map(),
    infraRepeatCount: 0,
  };
}

/** Add one ended agent turn to its step's launch counts. */
export function recordLaunch(state: ReduceState, rec: StepRecord): void {
  const counts = state.launches[rec.step] ?? emptyLaunches();
  state.launches[rec.step] = counts;
  countLaunch(counts, rec);
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
