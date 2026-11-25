/**
 * The acceptance-step verdicts: how an approve advances, a `changes` hands off
 * to the adjudicator or the next fix round, and a reject parks.
 */
import { makeCause } from "./cause.js";
import { phaseAfter } from "./derive-task-facts.js";
import type {
  DeferredFix,
  ReduceContext,
  ReduceState,
} from "./derive-types.js";
import { raisePendingSignal } from "./derive-task-state.js";
import {
  adjudicationDue,
  changeRequestBound,
  isAcceptanceStep,
  isAdjudicatorStep,
  isLastReviewCall,
  launchCounts,
  reviewRoundLimit,
} from "./review.js";
import type { FlowStep, ReviewVerdict, StepRecord } from "./types.js";

/** A productive turn answers the flow: checks before acceptance, else the next step. */
export function applyAnswer(
  context: ReduceContext,
  state: ReduceState,
  idx: number,
  answeredReview: boolean,
  deferred: DeferredFix | null,
): void {
  state.replyOnlyFix = answeredReview;
  state.changesPending = false;
  state.stepIndex = idx + 1;
  const nextStep = context.steps[state.stepIndex];
  if (!nextStep || isAcceptanceStep(nextStep)) {
    state.pendingChecks = {
      nextIndex: state.stepIndex,
      mergeAfter: state.mergeFix,
      ...(deferred ? { emptyFix: deferred } : {}),
    };
    state.phase = "checks";
    return;
  }
  state.pendingChecks = null;
  state.phase = nextStep.id;
}

/** A QA accept advances; checks run before the next acceptance or the end. */
export function advanceAfterQa(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  idx: number,
): void {
  state.stepIndex = idx + 1;
  state.gateFix = false;
  state.gateLastCall = false;
  state.cleanlinessRevision = false;
  // The accepted cleanliness finding and its justification stay: QA accepting
  // the tree does not re-judge a red the author already answered, and the
  // reviewer must still see the reply that held it.
  state.mergeFix = false;
  state.changesPending = false;
  // The checks before QA already judged this tree: do not spend a second run
  // before the reviewer reads the same content.
  const nextStep = context.steps[state.stepIndex];
  const checksNext = !nextStep || isAcceptanceStep(nextStep);
  const judged =
    checksNext && rec.tree !== undefined && rec.tree === state.lastChecksTree;
  state.pendingChecks =
    checksNext && !judged
      ? { nextIndex: state.stepIndex, mergeAfter: false }
      : null;
  state.phase =
    checksNext && !judged ? "checks" : phaseAfterStep(context, state.stepIndex);
}

/** A verdict's approve advances past the step without a checks run. */
export function advancePastStep(
  context: ReduceContext,
  state: ReduceState,
  idx: number,
): void {
  state.stepIndex = idx + 1;
  state.gateFix = false;
  state.gateLastCall = false;
  state.cleanlinessRevision = false;
  state.cleanlinessJustified = false;
  state.mergeFix = false;
  state.changesPending = false;
  state.pendingChecks = null;
  state.phase = phaseAfter(context.flow, state.stepIndex, context.task.kind);
}

/** The adjudicator's re-judged review: approve advances, changes goes back. */
export function applyAdjudicator(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  outcome: StepRecord["outcome"],
  idx: number,
): void {
  if (outcome?.upscope === "yes") {
    state.park = makeCause("upscope", outcome?.summary ?? "no summary");
    state.phase = "parked";
    return;
  }
  state.verdict = outcome?.verdict;
  if (
    state.verdict !== "approve" &&
    state.verdict !== "changes" &&
    state.verdict !== "reject"
  ) {
    state.park = makeCause(
      "invalid-outcome",
      `adjudicate turn delivered no review verdict: ${outcome?.summary ?? "no summary"}`,
    );
    state.phase = "parked";
    state.changesPending = false;
    state.pendingChecks = null;
    return;
  }
  applyVerdict(context, state, rec, outcome, idx);
  state.replyOnlyFix = false;
}

/** A review's verdict: approve advances, changes may hand off, reject parks. */
export function applyReview(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  outcome: StepRecord["outcome"],
  idx: number,
  step: FlowStep,
): void {
  // Standalone escalation (and any review upscope answer): parks with the same
  // cause shape as a status upscope, whatever the verdict says.
  if (outcome?.upscope === "yes") {
    state.park = makeCause("upscope", outcome?.summary ?? "no summary");
    state.phase = "parked";
    return;
  }
  state.verdict = outcome?.verdict;
  applyVerdict(context, state, rec, outcome, idx, step);
  state.replyOnlyFix = false;
}

function applyVerdict(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  outcome: StepRecord["outcome"],
  idx: number,
  step?: FlowStep,
): void {
  const verdict: ReviewVerdict | undefined = outcome?.verdict;
  const summary = outcome?.summary ?? "no summary";
  if (verdict === "approve") {
    advancePastStep(context, state, idx);
  } else if (verdict === "changes") {
    const isLastReview =
      step !== undefined &&
      isLastReviewCall(
        step,
        launchCounts(state.launches, rec.step).changeRequests,
      );
    if (isLastReview) {
      state.park = makeCause(
        "invalid-outcome",
        `changes on the last review call: ${summary}`,
      );
      state.phase = "parked";
      state.changesPending = false;
      state.pendingChecks = null;
    } else {
      applyChanges(context, state, rec, idx);
    }
  } else if (verdict === "reject") {
    state.park = makeCause("review-rejected", summary);
    state.phase = "parked";
  } else if (step?.adjudicate !== undefined) {
    state.park = makeCause(
      "invalid-outcome",
      `adjudicate turn delivered no review verdict: ${summary}`,
    );
    state.phase = "parked";
    state.changesPending = false;
    state.pendingChecks = null;
  }
  // No `else` for a review: a done review always carries a verdict — outcome
  // repair fails the turn otherwise — so a missing verdict never reaches derive.
}

/** `changes`: the adjudicator re-judges it, or the implementer gets the next round. */
function applyChanges(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  idx: number,
): void {
  const adjudicator = context.steps[idx + 1];
  state.gateFix = false;
  state.gateLastCall = false;
  state.cleanlinessRevision = false;
  state.cleanlinessJustified = false;
  state.mergeFix = false;
  state.pendingChecks = null;
  state.changesPending = true;
  if (
    adjudicator !== undefined &&
    isAdjudicatorStep(adjudicator) &&
    adjudicationDue(
      adjudicator,
      context.steps[idx]!,
      launchCounts(state.launches, rec.step).changeRequests + 1,
    )
  ) {
    // The findings are not handed to the implementer yet: the adjudicator
    // re-judges them in the same review cycle.
    state.stepIndex = idx;
    state.phase = adjudicator.id;
    return;
  }
  state.round = rec.round + 1;
  state.stepIndex = 0;
  state.phase = context.firstStep;
}

export function startFixRound(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  state.round = rec.round + 1;
  state.stepIndex = 0;
  state.gateFix = false;
  state.gateLastCall = false;
  state.cleanlinessRevision = false;
  state.cleanlinessJustified = false;
  state.mergeFix = false;
  state.phase = context.firstStep;
  state.changesPending = true;
  state.pendingChecks = null;
}

function phaseAfterStep(context: ReduceContext, index: number) {
  return phaseAfter(context.flow, index, context.task.kind);
}

/**
 * The acceptance calls a step may run: its configured change requests plus the
 * last call, plus the calls a decider's `changes` bought for that step. When
 * the flow settles on an acceptance step past that bound, the signal replaces
 * the kernel's park: the round limit is a mechanical fact, never the decision.
 * The count is the step's own, so one agent's spend never stops another, and a
 * `changes` verdict pays for the call it sends back, so the step it returns to
 * judges the tree that request bought before the limit reads as spent.
 */
export function raiseBudgetSignal(
  context: ReduceContext,
  state: ReduceState,
): void {
  if (state.terminal || state.park || state.pendingSignal) return;
  const index = context.flowIndex.get(state.phase);
  if (index === undefined) return;
  const step = context.steps[index]!;
  if (!isAcceptanceStep(step)) return;
  if (state.verdict === "changes") return;
  const grants = state.roundGrants[step.id] ?? 0;
  const limit = reviewRoundLimit(step) + grants;
  if ((state.calls[step.id] ?? 0) < limit) return;
  const spentRequests =
    (state.launches[step.id]?.changeRequests ?? 0) >=
    changeRequestBound(step) + grants;
  raisePendingSignal(
    state,
    {
      kind: spentRequests ? "change-requests-exhausted" : "round-limit",
      evidence: `after verdict "${state.verdict ?? "none"}" (${limit} call${limit === 1 ? "" : "s"})`,
    },
    { kind: "past-step", index },
  );
}
