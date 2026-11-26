/**
 * Crossing a DAG flow in derive. The turn rules still own the verdict-routed
 * phases (a `changes` loop, its gate fix, a park); a DAG flow only needs one
 * more rule: the phase after a productive turn is the next ready step, and
 * when every step has completed it is the pending checks at the tail.
 */
import { firstReadyStep } from "./dag.js";
import type { ReduceContext, ReduceState } from "./derive-types.js";
import { agentSteps, isAdjudicatorStep, isVerdictStep } from "./review.js";
import type { StepRecord } from "./types.js";

/**
 * The rounds in which the flow's agent steps completed, from the records:
 * an ended agent turn of a step that the flow owns and that is not an
 * adjudicator or `resolve`. A `changes` loop or a fix round re-completes the
 * productive steps, so the round recorded is the turn's; it is the stamp a
 * successor's `after` edges test against.
 */
function completedRounds(
  context: ReduceContext,
  recs: readonly StepRecord[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const rec of recs) {
    if (
      rec.actor !== "agent" ||
      !rec.endedAt ||
      !context.flowIndex.has(rec.step) ||
      rec.step === "resolve"
    )
      continue;
    const step = context.steps[context.flowIndex.get(rec.step)!]!;
    if (isAdjudicatorStep(step)) continue;
    out.set(rec.step, rec.round);
  }
  return out;
}

/**
 * Whether a verdict turn (review, QA or adjudicator) already ran in `round`.
 * A walk with no ready step lands on `merge` or `finish` without a new tail
 * check, while a ready step still runs after the verdict and
 * `settleDagEndPhase` hands it the phase.
 */
function judgedThisRound(
  context: ReduceContext,
  recs: readonly StepRecord[],
  round: number,
): boolean {
  return recs.some(
    (rec) =>
      rec.actor === "agent" &&
      rec.endedAt &&
      rec.round === round &&
      context.flowIndex.has(rec.step) &&
      isVerdictStep(context.steps[context.flowIndex.get(rec.step)!]!),
  );
}

/** The first ready step at this round, or undefined. */
function readyStep(
  context: ReduceContext,
  state: ReduceState,
  recs: readonly StepRecord[],
): ReturnType<typeof firstReadyStep> {
  return firstReadyStep(
    context.flow,
    completedRounds(context, recs),
    state.round,
  );
}

/**
 * The fix-round root: gated by the same ready rule as a plain round, so a
 * DAG's fix round starts at its first ready step rather than its first list
 * step.
 */
function settleDagChanges(
  context: ReduceContext,
  state: ReduceState,
  recs: readonly StepRecord[],
): void {
  const step = readyStep(context, state, recs);
  if (step && state.phase !== step.id) {
    state.phase = step.id;
    state.stepIndex = context.flowIndex.get(step.id)!;
  }
}

/**
 * The end-phase landing. A ready step always wins over the end phase: an
 * acceptance verdict judging this round does not excuse a step that depends
 * on it from running, so merge/finish stays only when no step is ready.
 */
function settleDagEndPhase(
  context: ReduceContext,
  state: ReduceState,
  recs: readonly StepRecord[],
): void {
  const step = readyStep(context, state, recs);
  if (step) {
    state.phase = step.id;
    state.stepIndex = context.flowIndex.get(step.id)!;
  }
}

/**
 * The ready walk. The checks that ended the productive node's turn have
 * judged its tree. Their verdict decides the DAG's shape: when a step is
 * ready the phase moves there; otherwise the tail has completed this round
 * and the phase goes to the checks, whose records settle their own gated-end
 * branch. `parked` and `done` never move here either.
 */
function settleDagWalk(
  context: ReduceContext,
  state: ReduceState,
  recs: readonly StepRecord[],
): void {
  if (state.phase !== "checks" && !context.flowIndex.has(state.phase)) return;
  const step = readyStep(context, state, recs);
  if (step) {
    if (state.phase === step.id) return;
    state.phase = step.id;
    state.stepIndex = context.flowIndex.get(step.id)!;
    return;
  }
  const tail = agentSteps(context.flow).length;
  // A productive turn's gate is still owed: keep it and its checks phase. Its
  // verdict's checks judged an earlier tree, not the one this turn produced.
  if (state.pendingChecks) return;
  // An acceptance verdict's end phase is final: it judged this round's tree,
  // so no new tail check is scheduled and the flow lands on the merge
  // directly. Only a walk without any verdict goes to the tail gates.
  if (judgedThisRound(context, recs, state.round)) {
    state.phase = context.task.kind === "spike" ? "finish" : "merge";
    state.stepIndex = tail;
    return;
  }
  state.pendingChecks = { nextIndex: tail, mergeAfter: false };
  state.phase = "checks";
  state.stepIndex = tail;
}

/**
 * The DAG phase move. When no step is ready, the tail has completed this
 * round: the flow lands on the pending checks at the tail, and the merge
 * follows exactly as a linear flow's does. The turn rule's own pending-checks
 * or gate routing is never overwritten here: when the phase already is a
 * routed one (`checks`, `parked`, or a step re-routed to a fix round's first
 * step), the first ready step wins unless the tail is complete.
 */
export function settleDag(
  context: ReduceContext,
  state: ReduceState,
  recs: readonly StepRecord[],
): void {
  if (!context.flow.dag) return;
  if (state.park || state.loop) return;
  // A gate fix re-runs from the first step and a `changes` answer owns the
  // next round; both re-routing belongs to the turn rules, not this move.
  if (state.gateFix || state.cleanlinessRevision) return;
  if (state.changesPending) {
    settleDagChanges(context, state, recs);
    return;
  }
  if (state.phase === "merge" || state.phase === "finish") {
    settleDagEndPhase(context, state, recs);
    return;
  }
  settleDagWalk(context, state, recs);
}
