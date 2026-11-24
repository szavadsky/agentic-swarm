/**
 * The agent-turn rules of a reduction: infra repeats, turn counting, the
 * empty-diff baseline and fingerprint, and the per-step outcome branches
 * (QA, adjudicator, review, and the productive turn that answers them).
 */
import { countOutcomeRepairs } from "../harness/usage.js";
import { makeCause } from "./cause.js";
import { committedNothing } from "./derive-task-facts.js";
import { recordInfraRepeat } from "./derive-task-gates.js";
import {
  type ReduceContext,
  type ReduceState,
  routeResolve,
} from "./derive-task-state.js";
import {
  advanceAfterQa,
  applyAdjudicator,
  applyReview,
  startFixRound,
} from "./derive-task-verdict.js";
import { isRecoveryCrash } from "./recovery-seal.js";
import { stepFingerprint } from "./progress.js";
import { qaReportOf } from "./qa.js";
import { isAcceptanceStep, isLastReviewCall, isVerdictStep } from "./review.js";
import type { FlowStep, StepRecord } from "./types.js";

interface AgentTurn {
  priorTree?: string;
  carriedWork: boolean | null;
  answeredReview: boolean;
  replyCount: number;
}

type DeferredFix = { step: string; round: number };

/**
 * One ended agent record: ignored infra turns first, then the counted turn,
 * fingerprint and the step's rule. A record that parks leaves `phase` parked.
 */
export function applyAgentTurn(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  const stop = rec.stop;
  const outcome = rec.outcome;
  const status = outcome?.status;
  const hasOutcome = !!outcome && !!status;
  const isInfra = stop?.kind === "infra";
  const isTimeoutOrCrash =
    isInfra && (stop.cause === "timeout" || stop.cause === "crash");

  // Infra without a valid outcome: a reported timeout/crash counts as a turn
  // and parks after two repeats on the same step; bare recovery seals (free
  // interruptions) and other infra stay free and resumable.
  if (isInfra && !hasOutcome) {
    if (isTimeoutOrCrash && !isRecoveryCrash(rec))
      recordInfraRepeat(state, rec.step, stop);
    return;
  }

  // A valid outcome is kept whatever the stop; reset repeat tracking.
  state.lastInfraStep = undefined;
  state.infraRepeatCount = 0;

  // Outcome repairs are harness turns on the same record; each one counts like
  // the turn that needed it.
  state.turns += 1 + countOutcomeRepairs(rec.attempts);
  if (stop?.kind === "truncated") return;
  if (stop?.kind === "cancelled" && !hasOutcome) return;

  const priorTree = state.countedTree;
  if (rec.tree !== undefined) state.countedTree = rec.tree;
  const carriedWork = takeCreationAdvance(state, priorTree);
  const replyCount = rec.outcome?.replies?.length ?? 0;
  const answeredReview = trackFingerprint(
    context,
    state,
    rec,
    priorTree,
    carriedWork,
    replyCount,
  );

  if (rec.step === "resolve") {
    // The in-flow resolve turn is a real task turn, not a flow step.
    routeResolve(context, state, rec);
    return;
  }
  if (!context.flowIndex.has(rec.step)) return;
  applyFlowStepTurn(context, state, rec, {
    priorTree,
    carriedWork,
    answeredReview,
    replyCount,
  });
}

/**
 * A base continuation whose kept branch already meets its done-when commits
 * nothing on its first turn: when the creation advance carried work beyond the
 * head, that no-change turn is progress. Consumed by the first counted turn.
 */
function takeCreationAdvance(
  state: ReduceState,
  priorTree: string | undefined,
): boolean | null {
  if (state.seenCountedTurn) return null;
  let carriedWork: boolean | null = null;
  if (
    state.creationAdvance !== null &&
    priorTree === state.creationAdvance.tree
  ) {
    carriedWork = state.creationAdvance.tree !== state.creationAdvance.headTree;
  }
  state.seenCountedTurn = true;
  state.creationAdvance = null;
  return carriedWork;
}

/**
 * The repeated-tree fingerprint. A reply-only fix, the review judging it, and
 * a deferred empty gate fix all repeat a tree by design, so they skip it and
 * the round budget bounds the loop instead.
 */
function trackFingerprint(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  priorTree: string | undefined,
  carriedWork: boolean | null,
  replyCount: number,
): boolean {
  const answeredIndex = context.flowIndex.get(rec.step);
  const answeredStep =
    answeredIndex === undefined ? undefined : context.steps[answeredIndex];
  const answeredReview =
    state.changesPending &&
    answeredStep !== undefined &&
    !isVerdictStep(answeredStep) &&
    replyCount > 0 &&
    committedNothing(context.task.kind, rec, priorTree);
  const emptyGateFix =
    (state.gateFix || state.cleanlinessRevision) &&
    !state.changesPending &&
    carriedWork !== true &&
    answeredStep !== undefined &&
    !isVerdictStep(answeredStep) &&
    committedNothing(context.task.kind, rec, priorTree);
  const fp =
    answeredReview ||
    emptyGateFix ||
    (isVerdictStep(answeredStep) && state.replyOnlyFix)
      ? null
      : stepFingerprint(context.task.kind, rec, state.lastTree);
  if (fp) {
    const prior = state.seen.get(fp);
    if (prior && !state.loop) {
      state.loop = {
        fingerprint: fp,
        step: rec.step,
        round: rec.round,
        firstRound: prior.round,
      };
    } else if (!prior) {
      state.seen.set(fp, { step: rec.step, round: rec.round });
    }
  }
  return answeredReview;
}

function checkTerminalStatus(state: ReduceState, rec: StepRecord): boolean {
  if (rec.stop?.kind === "refusal") {
    state.park = makeCause("refused", rec.stop.details ?? "no details");
    state.phase = "parked";
    return true;
  }
  const status = rec.outcome?.status;
  const summary = rec.outcome?.summary ?? "no summary";
  if (status === "blocked" || status === "failed" || status === "upscope") {
    state.park = makeCause(status, summary);
    state.phase = "parked";
    return true;
  }
  return false;
}

function checkCleanlinessJustification(
  state: ReduceState,
  rec: StepRecord,
): void {
  if (!state.cleanlinessRevision) return;
  const hasReplies = Boolean(
    rec.outcome?.replies && rec.outcome.replies.length > 0,
  );
  const hasSummary = Boolean(
    rec.outcome?.summary && rec.outcome.summary.trim().length > 0,
  );
  if (hasReplies || hasSummary) {
    state.cleanlinessJustified = true;
    // The reply accepts the lines of the red it answered: a later red naming
    // only those lines is the same finding and holds.
    state.cleanlinessAccepted = state.cleanlinessRedLines;
  }
}

/** A counted turn's step rules: stop statuses, empty diff, then its step kind. */
function applyFlowStepTurn(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  turn: AgentTurn,
): void {
  // A productive turn starts a new merge attempt: a later conflict gets its
  // own single resolve.
  state.resolveRan = false;

  state.round = Math.max(state.round, rec.round);
  state.commit = rec.commit ?? state.commit;
  if (checkTerminalStatus(state, rec)) return;

  const idx = context.flowIndex.get(rec.step)!;
  const step = context.steps[idx]!;
  const empty = settleEmptyDiff(
    context,
    state,
    rec,
    step,
    turn.priorTree,
    turn.carriedWork,
    turn.replyCount,
  );
  if (empty.parked) return;
  if (step.qa) {
    applyQa(context, state, rec, rec.outcome, idx);
    return;
  }
  if (step.adjudicate !== undefined) {
    applyAdjudicator(context, state, rec, rec.outcome, idx);
    return;
  }
  if (step.review) {
    applyReview(context, state, rec, rec.outcome, idx, step);
    return;
  }
  checkCleanlinessJustification(state, rec);
  applyAnswer(context, state, idx, turn, empty.deferred);
}

/**
 * An empty commit is its own no-progress signal unless it answers a `changes`
 * review with replies, carries a continuation's kept work, or defers to the
 * checks that follow an empty gate fix.
 */
function settleEmptyDiff(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  step: FlowStep,
  priorTree: string | undefined,
  carriedWork: boolean | null,
  replyCount: number,
): { deferred: DeferredFix | null; parked: boolean } {
  if (
    isVerdictStep(step) ||
    !committedNothing(context.task.kind, rec, priorTree)
  )
    return { deferred: null, parked: false };
  if (carriedWork !== true && (!state.changesPending || replyCount === 0)) {
    if (carriedWork === false) {
      state.park = makeCause(
        "empty-diff",
        `${rec.step} r${rec.round} kept work is already on the head`,
      );
      state.phase = "parked";
      return { deferred: null, parked: true };
    }
    if (state.gateFix || state.cleanlinessRevision) {
      // The fix answered red checks with no diff; the following checks settle it.
      return { deferred: { step: rec.step, round: rec.round }, parked: false };
    }
    state.park = makeCause(
      "empty-diff",
      `${rec.step} r${rec.round} committed no changes`,
    );
    state.phase = "parked";
    return { deferred: null, parked: true };
  }
  return { deferred: null, parked: false };
}

/** QA's verdict: accept advances, changes starts the next round, else park. */
function applyQa(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  outcome: StepRecord["outcome"],
  idx: number,
): void {
  const qa = qaReportOf(outcome);
  if (qa?.verdict === "changes") {
    applyQaChanges(context, state, rec, qa);
    return;
  }
  if (qa?.verdict === "accept") {
    advanceAfterQa(context, state, rec, idx);
    return;
  }
  state.park = makeCause(
    "invalid-outcome",
    `qa turn delivered no qa verdict: ${outcome?.summary ?? "no summary"}`,
  );
  state.phase = "parked";
  state.changesPending = false;
  state.pendingChecks = null;
  state.replyOnlyFix = false;
}

function applyQaChanges(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  qa: { findings: readonly string[] },
): void {
  if (
    isLastReviewCall(
      context.steps[context.flowIndex.get(rec.step)!]!,
      rec.round,
    )
  ) {
    // The outcome validator refuses this; a recorded changes on the last call
    // is a contract breach, never a merge.
    state.park = makeCause(
      "invalid-outcome",
      `qa changes on the last acceptance call: ${rec.outcome?.summary ?? "no summary"}`,
    );
    state.phase = "parked";
    state.changesPending = false;
    state.pendingChecks = null;
  } else if (qa.findings.length === 0) {
    state.park = makeCause(
      "invalid-outcome",
      `qa changes without findings: ${rec.outcome?.summary ?? "no summary"}`,
    );
    state.phase = "parked";
    state.changesPending = false;
    state.pendingChecks = null;
  } else {
    startFixRound(context, state, rec);
    state.verdict = "changes";
  }
  state.replyOnlyFix = false;
}

/** A productive turn answers the flow: checks before acceptance, else the next step. */
function applyAnswer(
  context: ReduceContext,
  state: ReduceState,
  idx: number,
  turn: AgentTurn,
  deferred: DeferredFix | null,
): void {
  state.replyOnlyFix = turn.answeredReview;
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
