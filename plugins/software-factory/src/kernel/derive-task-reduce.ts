/**
 * The reduction loop: one task's records in order, dispatched to the script
 * and agent rule modules, then the terminal fact and pending work folded into
 * the phase the caller acts on.
 */
import {
  revisionStart,
  type TaskReduction,
  terminalFactFromRecords,
} from "./derive-task-facts.js";
import {
  applyChecks,
  applyMerge,
  applyScriptFailure,
} from "./derive-task-gates.js";
import {
  createReduceState,
  type ReduceContext,
  type ReduceState,
  routeResolve,
} from "./derive-task-state.js";
import { applyAgentTurn } from "./derive-task-turn.js";
import { agentSteps } from "./review.js";
import type { FlowDefinition, StepRecord, TaskFile } from "./types.js";

/** Script records that never move the phase or count a turn. */
const FREE_STEPS = new Set(["merge-checks", "debt", "setup", "pm-validate"]);

/** One record's rule: commit/base-advance facts, script phases, or an agent turn. */
function applyRecord(
  context: ReduceContext,
  state: ReduceState,
  rec: StepRecord,
): void {
  if (rec.step === "commit") {
    state.lastTree = rec.tree ?? state.lastTree;
    return;
  }
  if (rec.step === "base-advance") {
    // A continuation worktree advanced to the integration head without the
    // agent (creation merge or reused-worktree sync): the next turn's
    // empty-diff baseline is the post-advance tree, not the last counted
    // turn's. Free: not a turn.
    state.countedTree = rec.tree ?? state.countedTree;
    // Only the creation advance carries, and only for the first counted turn.
    if (
      !state.seenCountedTurn &&
      state.creationAdvance === null &&
      rec.tree !== undefined &&
      rec.headTree !== undefined
    ) {
      state.creationAdvance = { tree: rec.tree, headTree: rec.headTree };
    }
    return;
  }
  if (rec.step === "checks") {
    applyChecks(context, state, rec);
    return;
  }
  if (FREE_STEPS.has(rec.step)) return;
  if (rec.step === "merge") {
    applyMerge(context, state, rec);
    return;
  }
  if (rec.step === "resolve" && rec.actor === "script") {
    // A clean head merge needed no turn but still settles the conflict.
    routeResolve(context, state, rec);
    return;
  }
  if (rec.actor === "script") {
    applyScriptFailure(context, state, rec);
    return;
  }
  if (rec.actor === "agent") applyAgentTurn(context, state, rec);
}

/** Folds pending work and the terminal fact into the reduction's final shape. */
function finishReduction(
  state: ReduceState,
  terminal: TaskReduction["terminal"],
): TaskReduction {
  if (state.pendingChecks) state.phase = "checks";
  if (state.park) state.phase = "parked";
  if (terminal) {
    state.phase = "done";
    state.gateFix = false;
    state.gateLastCall = false;
    state.park = undefined;
    state.commit = terminal.commit ?? state.commit;
  }
  return {
    terminal,
    phase: state.phase,
    round: state.round,
    turns: state.turns,
    verdict: state.verdict,
    commit: state.commit,
    park: terminal ? undefined : state.park,
    loop: state.loop,
    gateFix: terminal ? undefined : state.gateFix || undefined,
    gateLastCall: terminal
      ? undefined
      : (state.gateFix && state.gateLastCall) || undefined,
    cleanlinessRevision: terminal
      ? undefined
      : state.cleanlinessRevision || undefined,
    cleanlinessJustified: terminal
      ? undefined
      : state.cleanlinessJustified || undefined,
  };
}

/**
 * One task's phase machine. It reads records, never config side effects: the
 * configured flow supplies the step order, `checks` gates the last productive
 * step before a review, and a merged-result gate failure adds one fix turn
 * without consuming a review round.
 */
export function reduceTask(
  task: TaskFile,
  records: StepRecord[],
  flow: FlowDefinition,
): TaskReduction {
  const steps = agentSteps(flow);
  const context: ReduceContext = {
    task,
    flow,
    steps,
    flowIndex: new Map(steps.map((step, i) => [step.id, i])),
    firstStep: steps[0]?.id ?? "done",
  };
  const owned = records.slice(revisionStart(task, records));
  const terminal = terminalFactFromRecords(owned, task.slug, task.kind);
  const state = createReduceState(context, terminal);

  for (const rec of owned) {
    if (!rec.endedAt) continue;
    applyRecord(context, state, rec);
  }
  return finishReduction(state, terminal);
}
