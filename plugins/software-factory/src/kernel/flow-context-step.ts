/**
 * Flow step resolution and the turn a step's target runs: the flow and step
 * lookup, which turns are fixes or follow-ups, and the alternate alias a
 * repeated failure escalates to.
 */

import { DECIDE_STEP, decideStep, isDecideStep } from "./pending-signal.js";
import { isRecoveryCrash } from "./recovery-seal.js";
import { frontTarget, frontTaskClass } from "./flow-context-front.js";
import { bySeq } from "./flow-context-history.js";
import type { TurnTarget } from "./flow-context-targets.js";
import { repairFields, resolveTurn } from "./flow-context-targets.js";
import { launchKindOf } from "./metrics.js";
import { agentSteps, isAcceptanceStep, isVerdictStep } from "./review.js";
import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
  TurnSpec,
} from "./types.js";

export function flowOf(runtime: KernelRuntime, task: TaskFile): FlowDefinition {
  const flow = runtime.configs.process.flows[task.flow];
  if (!flow) throw new Error(`flow "${task.flow}" is not configured`);
  return flow;
}

export function findStep(flow: FlowDefinition, id: string): FlowStep {
  // The decide turn is raised by a signal, never configured: it borrows the
  // reviewer's prompt role and alias without entering any step sequence.
  if (id === DECIDE_STEP) return decideStep(flow);
  const step = flow.steps.find((s) => s.id === id);
  if (!step) throw new Error(`flow has no step "${id}"`);
  return step;
}

/**
 * Gates run after a productive turn, immediately before an acceptance step
 * (QA or review, or the end). QA and the reviewer read the already-gated tree.
 * In a DAG flow every productive turn gates: a parallel branch may read the
 * previous branch's tree, so the seam between ready steps is a gate too.
 */
export function checksDue(flow: FlowDefinition, id: string): boolean {
  // The decide turn reads the checks record already on the branch; it never
  // gates the tree it produced no work on.
  if (isDecideStep(id)) return false;
  // The resolve step is outside the agent sequence: its commit is the branch's
  // new tip, so the gates that decide the re-merge always run after it.
  if (id === "resolve") return true;
  if (flow.dag === true) return true;
  const steps = agentSteps(flow);
  const next = steps[steps.findIndex((s) => s.id === id) + 1];
  return !next || isAcceptanceStep(next);
}

export function isFixTurn(
  flow: FlowDefinition,
  state: TaskState,
  stepId: string,
): boolean {
  const bumped =
    state.round > 1 ||
    state.gateFix === true ||
    state.cleanlinessRevision === true;
  if (!bumped) return false;
  const steps = agentSteps(flow);
  if (steps[0]?.id === stepId) return true;
  // A DAG's parallel steps also replay after a gate fix, so a later round of
  // any productive step of one is a fix turn, like the first step's.
  const productive = steps.filter((step) => !isVerdictStep(step));
  return (
    flow.dag === true &&
    state.round > 1 &&
    productive.some((step) => step.id === stepId)
  );
}

/**
 * Whether this turn repeats its step: the productive step's fix turn, or an
 * acceptance round after the first. The step's follow-up mode applies here; a
 * failure-kind retry in the same round belongs to `alternates` instead.
 */
function isFollowUpTurn(
  flow: FlowDefinition,
  state: TaskState,
  stepId: string,
): boolean {
  return isAcceptanceStep(findStep(flow, stepId))
    ? state.round > 1
    : isFixTurn(flow, state, stepId);
}

/**
 * The prompt and alias that actually run this step: a `different-model`
 * follow-up turn keeps the step's prompt and moves to the follow-up alias.
 */
function stepTurn(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): TurnSpec {
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  if (!step.prompt || !step.alias) {
    throw new Error(
      `flow "${task.flow}": step "${stepId}" needs a prompt and an alias`,
    );
  }
  const followUp = step.followUp;
  if (
    followUp?.mode === "different-model" &&
    isFollowUpTurn(flow, state, stepId)
  ) {
    if (!followUp.alias) {
      throw new Error(
        `flow "${task.flow}": step "${stepId}" different-model follow-up needs an alias`,
      );
    }
    return {
      prompt: step.prompt,
      alias: followUp.alias,
      repairPrompt: step.repairPrompt,
      unfinishedPrompt: step.unfinishedPrompt,
      deliverable: step.deliverable,
    };
  }
  return {
    prompt: step.prompt,
    alias: step.alias,
    repairPrompt: step.repairPrompt,
    unfinishedPrompt: step.unfinishedPrompt,
    deliverable: step.deliverable,
  };
}

/**
 * The ladder's "same agent": a trivial task runs its implement step on the
 * front's target, in the front's session. Fix turns keep that target, so they
 * resume the same session chain by alias.
 */
export function isTrivialImplementTurn(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): boolean {
  const step = findStep(flowOf(runtime, task), stepId);
  return (
    !isVerdictStep(step) &&
    stepTurn(runtime, task, state, stepId).prompt === "implementer" &&
    frontTaskClass(runtime, task) === "trivial"
  );
}

/**
 * Whether the step's next turn continues a turn cut off by the process dying:
 * the task's latest record for this step is a bare `infra: crash` seal by an
 * agent at the task's current revision. The prompt follows that recorded
 * interrupt, not the launch kind or any older session.
 */
export function isRelaunchStep(
  records: readonly StepRecord[],
  slug: string,
  stepId: string,
  revision: number,
): boolean {
  const latest = records
    .filter((record) => record.slug === slug && record.step === stepId)
    .sort(bySeq)
    .at(-1);
  return (
    latest?.actor === "agent" &&
    (latest.revision ?? 0) === revision &&
    isRecoveryCrash(latest)
  );
}

/**
 * How many failure-kind launches the step has ended for this task: its
 * alternate position. An agent turn counts when its launch kind is `failure`, and
 * an exhausted gate-fix loop counts for the flow's productive step (the fix
 * step the checks sent back). Records are the only input, so a relaunch derives
 * the same position.
 */
export function alternatePosition(
  records: readonly StepRecord[],
  slug: string,
  stepId: string,
  flow: FlowDefinition,
): number {
  const fixStep = agentSteps(flow)[0]?.id;
  let failures = 0;
  for (const rec of records) {
    if (rec.slug !== slug || !rec.endedAt) continue;
    if (rec.step === stepId) {
      if (rec.actor === "agent" && launchKindOf(rec) === "failure")
        failures += 1;
    } else if (
      stepId === fixStep &&
      rec.step === "park" &&
      rec.cause?.kind === "gates"
    ) {
      // Fix rounds exhausted on red gates: the fix turn ran out of rounds, so
      // the next attempt at the productive step starts on the next alternate.
      failures += 1;
    }
  }
  return failures;
}

/**
 * The alias a step runs on at this position: its own alias at zero, then the
 * alternates in order, staying on the last one once the list is spent so a
 * later amend cannot cycle back to a model that already failed.
 */
function alternateAlias(step: FlowStep, position: number): string | undefined {
  const alternates = step.alternates ?? [];
  if (position <= 0 || alternates.length === 0) return undefined;
  return alternates[Math.min(position, alternates.length) - 1];
}

export function stepTarget(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
  iteration: number,
  records: readonly StepRecord[] = [],
): TurnTarget {
  if (isTrivialImplementTurn(runtime, task, state, stepId)) {
    // The front's alias and model run the turn, but the prompt stays the
    // implementer's: the prompt names the role, not the agent's history.
    const turn = stepTurn(runtime, task, state, stepId);
    return {
      ...frontTarget(runtime, iteration),
      ...repairFields(turn),
      prompt: turn.prompt,
    };
  }
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  const turn = stepTurn(runtime, task, state, stepId);
  const alternate = alternateAlias(
    step,
    alternatePosition(records, task.slug, stepId, flow),
  );
  // A `different-model` follow-up names the fix turn's own alias: it is more
  // specific than the step's alternates. A task tier still escalates the
  // producer, alternate or not.
  const alias =
    turn.alias === step.alias ? (alternate ?? turn.alias) : turn.alias;
  return {
    ...resolveTurn(
      runtime,
      turn.prompt,
      alias,
      isVerdictStep(step) ? undefined : task.tier,
      iteration,
    ),
    ...repairFields(turn),
  };
}
