/**
 * The kernel-raised decide turn: it answers the mechanical signal the flow
 * stopped on. Its outcome resumes the flow (approve), grants the next fix
 * budget (changes) or parks with the decider's cause (reject).
 */
import { makeCause } from "./cause.js";
import { advancePendingChecks } from "./derive-task-gates.js";
import type { ReduceContext, ReduceState } from "./derive-types.js";
import { applyAnswer, startFixRound } from "./derive-task-verdict.js";
import type { CauseKind, StepRecord } from "./types.js";

/**
 * Signals the kernel raised for a cause it would otherwise have parked. A
 * reject keeps that cause kind so the steward, the PM and the metrics route
 * the park by what actually stopped the task, never by who confirmed it.
 */
const MECHANICAL_PARK_KINDS: ReadonlySet<CauseKind> = new Set([
  "conflict",
  "infra-repeat",
  "overflow",
  "no-progress",
  "invalid-outcome",
]);

/** A refused stop or an agent's terminal status parks the task with its cause. */
export function checkTerminalStatus(
  state: ReduceState,
  rec: StepRecord,
): boolean {
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

/**
 * The decide turn answers the signal through its outcome: an approve resumes
 * where the signal stopped (the kept work or red gates are sufficient), a
 * changes grants the next fix round or gate-fix budget, a reject parks, and a
 * blocked/failed/upscope status parks with that cause. A decide turn that
 * settled nothing parks the signal so the PM stall turn decides it; it never
 * redispatches the same signal.
 */
export function applyDecideTurn(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  const signal = state.pendingSignal;
  const resume = state.signalResume;
  state.pendingSignal = null;
  state.signalResume = null;
  if (!signal) return;
  state.round = Math.max(state.round, rec.round);
  state.commit = rec.commit ?? state.commit;
  if (checkTerminalStatus(state, rec)) return;
  const outcome = rec.outcome;
  if (!outcome?.status) {
    state.park = makeCause(
      signal.kind,
      `${signal.evidence}; the decider settled no outcome`,
    );
    state.phase = "parked";
    return;
  }
  const verdict = outcome.verdict;
  if (verdict === "approve") {
    approveSignal(context, state, resume);
    return;
  }
  if (verdict === "changes") {
    if (signal.kind === "gates") {
      grantGateFix(context, state, resume);
      return;
    }
    grantFixRound(context, state, rec, resume);
    return;
  }
  if (verdict === "reject") {
    // A mechanical cause keeps its kind: it is what the steward and the PM
    // route by, and the decider's summary is the direction on top.
    state.park =
      signal.kind === "gates" || MECHANICAL_PARK_KINDS.has(signal.kind)
        ? makeCause(
            signal.kind,
            `${signal.evidence}; the decider rejected: ${outcome.summary ?? "no summary"}`,
          )
        : makeCause(
            "review-rejected",
            outcome.summary ?? "the decider rejected the work",
          );
    state.phase = "parked";
    return;
  }
  state.park = makeCause(
    "invalid-outcome",
    `decide turn delivered no review verdict: ${outcome.summary ?? "no summary"}`,
  );
  state.phase = "parked";
}

/** Approval resumes the flow from the point the signal stopped. */
function approveSignal(
  context: ReduceContext,
  state: ReduceState,
  resume: ReduceState["signalResume"],
): void {
  if (resume?.kind === "checks") {
    advancePendingChecks(context, state, resume.pending);
    return;
  }
  if (resume?.kind === "retry-step") {
    // A crash or overflow left the branch unjudged: approving retries the step
    // that stopped, with its gate-fix and change-answer flags intact.
    state.stepIndex = context.flowIndex.get(resume.step) ?? state.stepIndex;
    state.phase = resume.step;
    state.pendingChecks = null;
    return;
  }
  if (resume?.kind === "merge") {
    // The red was the landing's, not the branch's: try the queue again.
    state.gateFix = false;
    state.gateLastCall = false;
    state.mergeFix = false;
    state.changesPending = false;
    state.pendingChecks = null;
    state.phase = "merge";
    return;
  }
  // The approval is the answer to the round the signal stopped: the acceptance
  // round after it judges the same tree by design.
  applyAnswer(
    context,
    state,
    resume?.kind === "past-step" ? resume.index : state.stepIndex,
    true,
    null,
  );
}

/** A decider `changes` grants a fresh gate-fix budget for the named red. */
function grantGateFix(
  context: ReduceContext,
  state: ReduceState,
  resume: ReduceState["signalResume"],
): void {
  state.gateFixCount = 0;
  state.gateFix = true;
  state.gateLastCall = false;
  state.mergeFix = resume?.kind === "merge";
  state.changesPending = false;
  state.cleanlinessRevision = false;
  state.pendingChecks = null;
  state.stepIndex = 0;
  state.phase = context.firstStep;
}

/**
 * A non-gate `changes` buys the stopped step one more call and starts the next
 * fix round; the call that round pays for is the step's last call, so it ships
 * or parks on its own outcome.
 */
function grantFixRound(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
  resume: ReduceState["signalResume"],
): void {
  if (resume?.kind === "past-step") {
    const granted = context.steps[resume.index];
    if (granted !== undefined)
      state.roundGrants[granted.id] = (state.roundGrants[granted.id] ?? 0) + 1;
  }
  state.verdict = "changes";
  startFixRound(context, state, rec);
}
