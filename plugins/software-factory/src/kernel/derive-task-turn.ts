/**
 * The agent-turn rules of a reduction: infra repeats, turn counting, the
 * empty-diff baseline and fingerprint, and the per-step outcome branches
 * (QA, adjudicator, review, and the productive turn that answers them).
 */
import { countOutcomeRepairs } from "../harness/usage.js";
import { makeCause } from "./cause.js";
import { applyDecideTurn, checkTerminalStatus } from "./derive-task-decide.js";
import { committedNothing } from "./derive-task-facts.js";
import { recordInfraRepeat } from "./derive-task-gates.js";
import type {
  DeferredFix,
  ReduceContext,
  ReduceState,
} from "./derive-types.js";
import { raisePendingSignal, routeResolve } from "./derive-task-state.js";
import {
  advanceAfterQa,
  applyAdjudicator,
  applyAnswer,
  applyReview,
  startFixRound,
} from "./derive-task-verdict.js";
import { DECIDE_STEP, isDecideStep } from "./pending-signal.js";
import { isRecoveryCrash } from "./recovery-seal.js";
import { stepFingerprint } from "./progress.js";
import { qaReportOf } from "./qa.js";
import { isLastReviewCall, isVerdictStep } from "./review.js";
import type { FlowStep, StepRecord } from "./types.js";

interface AgentTurn {
  priorTree?: string;
  carriedWork: boolean | null;
  answeredReview: boolean;
  replyCount: number;
}

/** A productive turn that repeated a fingerprint the history already holds. */
interface StepRepeat {
  fingerprint: string;
  step: string;
  round: number;
  firstRound: number;
}

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

  // Infra without a valid outcome: a reported timeout/crash counts as a turn,
  // its second stop on one step raises the repeat signal; bare recovery seals
  // (free interruptions) and other infra stay free and resumable. An overflow
  // its de-novo retry did not cure is the overflow signal, never a park.
  if (isInfra && !hasOutcome) {
    if (stop?.cause === "overflow") raiseOverflowSignal(state, rec, stop);
    else if (isTimeoutOrCrash && !isRecoveryCrash(rec))
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
  const { answeredReview, repeat } = trackFingerprint(
    context,
    state,
    rec,
    priorTree,
    carriedWork,
    replyCount,
  );

  routeCountedTurn(context, state, rec, {
    priorTree,
    carriedWork,
    answeredReview,
    replyCount,
  });
  raiseRepeatSignal(context, state, repeat);
}

/** A step's turn overflowed without an outcome: the decider owns the next move. */
function raiseOverflowSignal(
  state: ReduceState,
  rec: StepRecord,
  stop: NonNullable<StepRecord["stop"]>,
): void {
  const details = stop.kind === "infra" ? stop.details : undefined;
  if (isDecideStep(rec.step)) {
    // The deciding agent itself could not run: keep the signal it owed and let
    // the PM settle it instead of redispatching the same turn forever.
    state.park = makeCause(
      state.pendingSignal?.kind ?? "overflow",
      `${state.pendingSignal?.evidence ?? "no signal"}; the decide turn overflowed`,
    );
    state.phase = "parked";
    return;
  }
  raisePendingSignal(
    state,
    {
      kind: "overflow",
      evidence: `overflow in ${rec.step}${details ? `: ${details}` : ""}`,
    },
    { kind: "retry-step", step: rec.step },
  );
}

/**
 * A repeated tree is a mechanical signal, not a kernel park: the decider
 * judges whether the branch already holds the work or needs another turn.
 */
function raiseRepeatSignal(
  context: ReduceContext,
  state: ReduceState,
  repeat: StepRepeat | undefined,
): void {
  if (
    repeat === undefined ||
    state.terminal ||
    state.park ||
    state.pendingSignal
  )
    return;
  const index = context.flowIndex.get(repeat.step);
  if (index === undefined) return;
  raisePendingSignal(
    state,
    {
      kind: "no-progress",
      evidence: `${repeat.step} r${repeat.round} repeats r${repeat.firstRound} (${repeat.fingerprint.slice(0, 8)})`,
    },
    { kind: "past-step", index },
  );
}

/** A counted turn's target: a kernel turn, a flow step, or a record to ignore here. */
function routeCountedTurn(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  turn: AgentTurn,
): void {
  if (rec.step === "resolve") {
    // The in-flow resolve turn is a real task turn, not a flow step.
    routeResolve(context, state, rec);
    return;
  }
  if (rec.step === DECIDE_STEP) {
    applyDecideTurn(context, state, rec);
    return;
  }
  if (context.flowIndex.has(rec.step))
    applyFlowStepTurn(context, state, rec, turn);
}

/**
 * A base continuation whose kept branch already meets its done-when commits
 * nothing on its first turn: when the advance carried work beyond the head,
 * that no-change turn is progress. Consumed by the first counted turn.
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
): { answeredReview: boolean; repeat?: StepRepeat } {
  if (isDecideStep(rec.step)) return { answeredReview: false };
  const answeredIndex = context.flowIndex.get(rec.step);
  const answeredStep =
    answeredIndex === undefined ? undefined : context.steps[answeredIndex];
  const answeredReview =
    state.changesPending &&
    answeredStep !== undefined &&
    !isVerdictStep(answeredStep) &&
    replyCount > 0 &&
    committedNothing(context.task.kind, rec, priorTree);
  // A turn that raises the empty-diff signal or defers to its following checks
  // is not a no-progress repeat: the decider or those checks own its outcome.
  const empty =
    answeredStep === undefined
      ? { kind: "none" as const }
      : classifyEmptyDiff(
          context,
          state,
          rec,
          answeredStep,
          priorTree,
          carriedWork,
          replyCount,
        );
  const fp =
    answeredReview ||
    empty.kind !== "none" ||
    (isVerdictStep(answeredStep) && state.replyOnlyFix)
      ? null
      : stepFingerprint(context.task.kind, rec, state.lastTree);
  if (!fp) return { answeredReview };
  const prior = state.seen.get(fp);
  if (!prior) {
    state.seen.set(fp, { step: rec.step, round: rec.round });
    return { answeredReview };
  }
  return {
    answeredReview,
    repeat: {
      fingerprint: fp,
      step: rec.step,
      round: rec.round,
      firstRound: prior.round,
    },
  };
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
  // One counted turn is one call of this step's own budget: the acceptance
  // bound counts its calls, never the task-wide round.
  state.calls[rec.step] = (state.calls[rec.step] ?? 0) + 1;
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
  if (empty.stopped) return;
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
  applyAnswer(context, state, idx, turn.answeredReview, empty.deferred);
}

/**
 * An empty commit raises its no-progress signal unless it answers a `changes`
 * review with replies, carries a continuation's kept work, or defers to the
 * checks that follow an empty gate fix. The turn stops at the signal either
 * way: a signal is never a productive turn's advance.
 */
function settleEmptyDiff(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  step: FlowStep,
  priorTree: string | undefined,
  carriedWork: boolean | null,
  replyCount: number,
): { deferred: DeferredFix | null; stopped: boolean } {
  const empty = classifyEmptyDiff(
    context,
    state,
    rec,
    step,
    priorTree,
    carriedWork,
    replyCount,
  );
  if (empty.kind === "signal") {
    raiseSignal(context, state, rec, empty.evidence);
    return { deferred: null, stopped: true };
  }
  if (empty.kind === "deferred")
    return { deferred: { step: rec.step, round: rec.round }, stopped: false };
  return { deferred: null, stopped: false };
}

type EmptyDiff =
  | { kind: "none" }
  | { kind: "deferred" }
  | { kind: "signal"; evidence: string };

/**
 * What an empty productive turn means: nothing, a fix that defers to its
 * following checks, or the signal the decider answers.
 */
function classifyEmptyDiff(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  step: FlowStep,
  priorTree: string | undefined,
  carriedWork: boolean | null,
  replyCount: number,
): EmptyDiff {
  if (
    isVerdictStep(step) ||
    !committedNothing(context.task.kind, rec, priorTree) ||
    carriedWork === true ||
    (state.changesPending && replyCount > 0)
  )
    return { kind: "none" };
  if (carriedWork !== false && (state.gateFix || state.cleanlinessRevision))
    return { kind: "deferred" };
  return {
    kind: "signal",
    evidence:
      carriedWork === false
        ? `${rec.step} r${rec.round} kept work is already on the head`
        : `${rec.step} r${rec.round} committed no changes`,
  };
}

/** A mechanical signal replaces the kernel park: the decide turn owns the call. */
function raiseSignal(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  evidence: string,
): void {
  raisePendingSignal(
    state,
    { kind: "empty-diff", evidence },
    {
      kind: "past-step",
      index: context.flowIndex.get(rec.step) ?? state.stepIndex,
    },
  );
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
    applyQaChanges(context, state, rec, qa, idx);
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
  idx: number,
): void {
  if (
    isLastReviewCall(
      context.steps[context.flowIndex.get(rec.step)!]!,
      state.launches[rec.step]?.changeRequests ?? 0,
    )
  ) {
    // The outcome validator refuses this, so a delivered record is a contract
    // breach: the decider reads the request and decides ship, fix, or park.
    raisePendingSignal(
      state,
      {
        kind: "invalid-outcome",
        evidence: `qa changes on the last acceptance call: ${rec.outcome?.summary ?? "no summary"}`,
      },
      { kind: "past-step", index: idx },
    );
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
