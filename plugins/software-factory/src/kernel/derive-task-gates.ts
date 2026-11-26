/**
 * The script-record rules of a reduction: task checks (the flake and empty-fix
 * deferrals, the gate fix ceiling), merge outcomes (gate fix, the one resolve
 * turn, terminal parks), and crashes on non-agent steps. They mutate the
 * reduction state and never read the task file beyond its kind.
 */
import type { CheckResult } from "../core/checks/types.js";
import { formatCause, makeCause } from "./cause.js";
import {
  cleanlinessLines,
  everyCleanlinessLineAccepted,
  failingChecksText,
  failingNames,
  mergeGateNames,
  parkedGateNames,
  phaseAfter,
  redChecksText,
  sameFailingSet,
} from "./derive-task-facts.js";
import type {
  PendingChecks,
  ReduceContext,
  ReduceState,
} from "./derive-types.js";
import { raisePendingSignal } from "./derive-task-state.js";
import { attributedFailures, isInfraCheck } from "./gates.js";
import { isRecoveryCrash } from "./recovery-seal.js";
import { checksFixLimit, isLastChecksFixCall } from "./review.js";
import type { Cause, StepRecord } from "./types.js";

export function advancePendingChecks(
  context: ReduceContext,
  state: ReduceState,
  pending: PendingChecks,
): void {
  state.cleanlinessRevision = false;
  state.gateFix = false;
  state.gateLastCall = false;
  state.stepIndex = pending.nextIndex;
  state.phase = pending.mergeAfter
    ? phaseAfter(context.flow, context.steps.length, context.task.kind)
    : phaseAfter(context.flow, state.stepIndex, context.task.kind);
}

function handleCleanlinessRevision(
  context: ReduceContext,
  state: ReduceState,
  red: readonly CheckResult[],
): void {
  state.cleanlinessRevision = true;
  state.cleanlinessRevised = true;
  state.cleanlinessRedLines = cleanlinessLines(red);
  state.gateFix = false;
  state.gateLastCall = false;
  state.gateFailure = failingChecksText(red);
  state.gateRed = failingNames(red);
  state.stepIndex = 0;
  state.phase = context.firstStep;
}

function settleChecksVerdict(
  context: ReduceContext,
  state: ReduceState,
  red: readonly CheckResult[],
  pending: PendingChecks,
): void {
  const cleanlinessOnly =
    red.some((check) => check.name === "cleanliness") &&
    !red.some((check) => check.name !== "cleanliness");
  // Justification belongs to the finding: a red whose every line the author
  // already accepted is held wherever it reappears, including after QA.
  if (
    cleanlinessOnly &&
    everyCleanlinessLineAccepted(red, state.cleanlinessAccepted)
  ) {
    advancePendingChecks(context, state, pending);
    return;
  }
  if (cleanlinessOnly && !state.cleanlinessRevised) {
    handleCleanlinessRevision(context, state, red);
    return;
  }
  state.cleanlinessRevision = false;
  settleRedChecks(context, state, red, pending);
}

/** A red checks run settles the pending gate verdict: park, fix, or advance. */
export function applyChecks(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  if (rec.ok === true && rec.tree !== undefined)
    state.lastChecksTree = rec.tree;
  const pending = state.pendingChecks;
  if (!pending) return;
  // The reds this record charges the task: an inherited failure is not the
  // task's, so it never opens a revision, a fix or a park.
  const charged = attributedFailures(rec.checks);
  if (rec.ok === false && charged.length > 0 && charged.every(isInfraCheck)) {
    // Persistent infra checks are routed to the infra verdict turn, never
    // parked as "gate could not start". Keep pendingChecks so phase stays checks.
    return;
  } else if (rec.ok === false) {
    settleChecksVerdict(context, state, charged, pending);
  } else {
    advancePendingChecks(context, state, pending);
  }
  state.pendingChecks = null;
}

/** The deferred empty-fix comparison, the gate fix ceiling, or a new fix round. */
function settleRedChecks(
  context: ReduceContext,
  state: ReduceState,
  red: readonly CheckResult[],
  pending: NonNullable<ReduceState["pendingChecks"]>,
): void {
  const deferred = pending.emptyFix;
  // An accepted red was held above; a red reaching here was not accepted, so
  // an empty fix that repeats it is a deterministic red.
  if (
    deferred &&
    (state.gateRed === undefined || sameFailingSet(red, state.gateRed))
  ) {
    // The fix changed nothing and the same checks still fail: a deterministic
    // red the fix did not address. A red without a comparable baseline (merge
    // gates with no recorded checks) raises the same signal; green and changed
    // reds move on below.
    raisePendingSignal(
      state,
      {
        kind: "empty-diff",
        evidence:
          state.gateFailure !== undefined
            ? `${deferred.step} r${deferred.round} committed no changes after red checks: ${state.gateFailure}`
            : `${deferred.step} r${deferred.round} committed no changes`,
      },
      { kind: "past-step", index: context.flowIndex.get(deferred.step) ?? 0 },
    );
    return;
  }
  state.gateFixCount += 1;
  if (state.gateFixCount > checksFixLimit(context.flow)) {
    // The fix rounds are spent and the task checks are still red: the branch
    // sits on a red base. The decider accepts the red, grants one more fix or
    // parks; the kernel no longer parks on its own count.
    const spent = state.gateFixCount - 1;
    raisePendingSignal(
      state,
      {
        kind: "gates",
        evidence: `task checks red after ${spent} fix turn${spent === 1 ? "" : "s"}: ${parkedGateNames(context.task, red)}`,
      },
      { kind: "checks", pending },
    );
    state.gateFix = false;
    state.gateLastCall = false;
    state.gateFailure = failingChecksText(red);
    state.gateRed = failingNames(red);
    state.mergeFix = false;
    state.pendingChecks = null;
    return;
  }
  state.gateFix = true;
  state.gateLastCall = isLastChecksFixCall(context.flow, state.gateFixCount);
  state.gateFailure = failingChecksText(red);
  state.gateRed = failingNames(red);
  // A task-checks reroute ends the merge-fix: this fix goes back to review.
  state.mergeFix = false;
  state.stepIndex = 0;
  state.phase = context.firstStep;
}

/** A merge outcome: done, a gate fix, a conflict's one resolve turn, or a park. */
export function applyMerge(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  // A merge start sealed by crash recovery is not an outcome: the planned
  // commit is still in the record and the merge queue recovers it.
  if (rec.stop?.kind === "infra") return;
  if (rec.ok === true) {
    state.gateFix = false;
    state.gateLastCall = false;
    state.mergeFix = false;
    state.pendingChecks = null;
    state.phase = "done";
    return;
  }
  if (rec.ok !== false) return;
  const cause = rec.cause;
  if (cause?.kind === "gates") applyMergeGates(context, state, rec, cause);
  else if (cause?.kind === "conflict")
    applyMergeConflict(context, state, cause);
  else if (cause?.kind === "infra") return;
  else if (cause?.kind === "no-progress" || cause?.kind === "merge-failed") {
    state.park = cause;
    state.phase = "parked";
  } else {
    state.park = cause
      ? makeCause("merge-failed", formatCause(cause))
      : makeCause("merge-failed", "merge failed without a recorded cause");
    state.phase = "parked";
  }
}

/** A red merge's gate fix: one fix turn, then the signal the decider answers. */
function applyMergeGates(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  cause: Cause,
): void {
  state.gateFixCount += 1;
  state.gatesFailures += 1;
  if (
    state.gatesFailures === 1 &&
    state.gateFixCount <= checksFixLimit(context.flow)
  ) {
    state.gateFix = true;
    state.gateLastCall = isLastChecksFixCall(context.flow, state.gateFixCount);
    state.mergeFix = true;
    state.gateFailure = redChecksText(rec);
    // No matched names (old records without checks) leaves no baseline: the
    // deferred comparison then signals on any red.
    const names = [...mergeGateNames(rec)].sort();
    state.gateRed = names.length > 0 ? names : undefined;
    // The fix answers the red gates, not the last review: no verdict awaits it.
    state.changesPending = false;
    state.stepIndex = 0;
    state.phase = context.firstStep;
    state.pendingChecks = null;
    return;
  }
  // The merged result is still red after its gate fix: the goal branch the task
  // would land on is red. The decider retries the landing, grants a fix or parks.
  state.gateFailure = redChecksText(rec) ?? cause.detail;
  const names = [...mergeGateNames(rec)].sort();
  state.gateRed = names.length > 0 ? names : undefined;
  raisePendingSignal(
    state,
    {
      kind: "gates",
      evidence: `merge gates red after the gate fix: ${state.gateFailure}`,
    },
    { kind: "merge" },
  );
  state.gateFix = false;
  state.gateLastCall = false;
  state.mergeFix = false;
  state.pendingChecks = null;
}

/** A conflict either gets the flow's single resolve turn or parks. */
function applyMergeConflict(
  context: ReduceContext,
  state: ReduceState,
  cause: Cause,
): void {
  const resolveStep = context.flow.steps.some((step) => step.id === "resolve");
  if (state.resolveRan || !resolveStep) {
    // The one resolve turn already ran for this merge attempt, or the flow
    // config has no resolve step: the conflict is the park.
    state.park = cause;
    state.phase = "parked";
    return;
  }
  state.gateFix = false;
  state.gateLastCall = false;
  state.mergeFix = false;
  state.changesPending = false;
  state.pendingChecks = null;
  state.phase = "resolve";
}

/**
 * A crash the script reports counts like a harness crash on the same step: a
 * throwing pre-harness step parks after two repeats instead of redispatching
 * forever. Only reported crashes on flow steps count; bare recovery seals,
 * script phases, quota/rate/network/auth/overflow/glitch and drain stay free.
 */
export function applyScriptFailure(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  const stop = rec.stop;
  const timeoutOrCrash =
    stop?.kind === "infra" &&
    (stop.cause === "timeout" || stop.cause === "crash");
  if (
    !timeoutOrCrash ||
    rec.outcome?.status ||
    !context.flowIndex.has(rec.step) ||
    isRecoveryCrash(rec)
  )
    return;
  recordInfraRepeat(state, rec.step, stop);
}

/** Counts a repeated infra crash on one step; the second parks. */
export function recordInfraRepeat(
  state: ReduceState,
  step: string,
  stop: StepRecord["stop"],
): void {
  if (state.lastInfraStep === step) state.infraRepeatCount += 1;
  else {
    state.lastInfraStep = step;
    state.infraRepeatCount = 1;
  }
  state.turns += 1;
  if (state.infraRepeatCount >= 2) {
    state.park = makeCause("infra-repeat", infraDetail(stop));
    state.phase = "parked";
  }
}

/** `cause: details`, with the infra-only fields read off the narrowed union. */
function infraDetail(stop: StepRecord["stop"]): string {
  if (!stop || stop.kind !== "infra") return "infra";
  return `${stop.cause}${stop.details ? `: ${stop.details}` : ""}`;
}
