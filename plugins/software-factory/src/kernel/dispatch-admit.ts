/**
 * Admission for one proposed action: the drain and hold filters, the turn and
 * concurrency limits, the target's quota pools, and the step/script/terminal
 * split. Admission never parks a task; holds only keep unstarted work out.
 */
import { makeCause } from "./cause.js";
import type {
  ActiveHolds,
  DispatchState,
  SteerPoll,
} from "./dispatch-types.js";
import {
  dispatchable,
  noteInfra,
  runTerminalAction,
  startAction,
} from "./dispatch-start.js";
import { iterationSpend, iterationStart } from "./dispatch-state.js";
import {
  stepTarget,
  tierIdentity,
  type ResolvedTier,
  type TurnTarget,
} from "./flow-context.js";
import { loadPriceTable } from "./openrouter.js";
import type {
  Action,
  State,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

/** Sets the iteration's drain cause on the first limit, urgent steer or goal hold. */
export async function updateDrain(
  state: DispatchState,
  polled: SteerPoll,
  records: StepRecord[],
  turnsUsed: number,
): Promise<void> {
  if (state.drain || state.cancelled) return;
  const elapsedMs = Date.now() - iterationStart(records, state.iteration);
  const iterationWallMs = state.runtime.limits.iterationWallMs;
  if (polled.urgent !== undefined) {
    // An urgent steer ends the iteration early: started work runs to the end,
    // nothing new starts, and the next consult sees the steer.
    state.drain = makeCause("steer", `${polled.urgent} marked urgent`);
  } else if (polled.hold.goal !== undefined) {
    // A goal hold is a drain with a name: started tasks run their flow to the
    // end, nothing new starts, and the architect sees the remainder.
    state.drain = makeCause("steer", `${polled.hold.goal} goal hold`);
  } else if (
    state.runtime.limits.iterationTurns !== undefined &&
    turnsUsed >= state.runtime.limits.iterationTurns
  ) {
    state.drain = makeCause(
      "boundary",
      `iteration turn limit ${state.runtime.limits.iterationTurns} reached`,
    );
  } else if (iterationWallMs !== undefined && elapsedMs >= iterationWallMs) {
    state.drain = makeCause(
      "boundary",
      `iteration wall limit ${iterationWallMs}ms reached`,
    );
  } else if (state.usdLimit !== undefined) {
    const spent = iterationSpend(
      records,
      state.iteration,
      await loadPriceTable(state.runtime.priceSource),
      state.runtime.configs.run.priceIds,
    );
    if (spent >= state.usdLimit) {
      state.drain = makeCause(
        "budget",
        `iteration USD limit $${state.usdLimit.toFixed(4)} reached (spent $${spent.toFixed(4)})`,
      );
    }
  }
}

function agentCount(state: DispatchState): number {
  return [...state.running.values()].filter((r) => r.agent).length;
}

/** A drain refuses unstarted work; tasks already started finish their flow. */
function drainAllows(state: DispatchState, slug: string): boolean {
  return state.drain === undefined || state.started.has(slug);
}

/** A hold keeps an unstarted task from starting; it never interrupts one. */
function holdAllows(
  state: DispatchState,
  slug: string,
  hold: ActiveHolds,
): boolean {
  return !hold.slugs.has(slug) || state.started.has(slug);
}

/** The turn budget counts running turns too, so admissions never overshoot. */
function turnAllows(state: DispatchState, turnsUsed: number): boolean {
  const limit = state.runtime.limits.iterationTurns;
  return (
    state.drain !== undefined ||
    limit === undefined ||
    turnsUsed + agentCount(state) < limit
  );
}

/** One tier's pool and model caps against the turns already running. */
function tierAdmits(state: DispatchState, tier: ResolvedTier): boolean {
  if (tier.subscription !== undefined) {
    const poolLimit =
      state.runtime.limits.concurrency.perSubscription[tier.subscription];
    if (poolLimit !== undefined) {
      const onPool = [...state.running.values()].filter(
        (r) => r.agent && r.subscription === tier.subscription,
      ).length;
      if (onPool >= poolLimit) return false;
    }
  }
  const modelLimit = state.runtime.limits.concurrency.perModel[tier.model.id];
  if (modelLimit !== undefined) {
    const onModel = [...state.running.values()].filter(
      (r) => r.agent && r.model === tier.model.id,
    ).length;
    if (onModel >= modelLimit) return false;
  }
  return true;
}

/**
 * The target's tiers in configured order, first one admitted by its caps.
 * A capped pool falls back to the next tier in the chain instead of waiting;
 * every tier capped still waits. The chosen leg's identity rides the action so
 * the step starts on the same leg admission judged, even if the chain is
 * re-resolved and its order changes.
 */
function admitTarget(
  state: DispatchState,
  slug: string,
  target: TurnTarget,
): ResolvedTier | undefined {
  if (target.unavailable !== undefined) {
    noteInfra(state, slug, target.unavailable);
    return undefined;
  }
  return target.tiers.find((tier) => tierAdmits(state, tier));
}

/** A started task turn is admitted only below all three concurrency limits. */
function admitStep(
  state: DispatchState,
  action: Action & { slug: string; kind: "step" },
  task: TaskFile,
  taskState: TaskState,
  hold: ActiveHolds,
  turnsUsed: number,
  records: StepRecord[],
): void {
  if (!drainAllows(state, action.slug)) return;
  if (!holdAllows(state, action.slug, hold)) return;
  if (!turnAllows(state, turnsUsed)) return;
  if (agentCount(state) >= state.runtime.limits.concurrency.overall) return;
  // Admission counts the pool and model each tier would draw on and starts
  // the first one below its caps, whichever harness that is.
  const target = stepTarget(
    state.runtime,
    task,
    taskState,
    action.step,
    records,
  );
  const tier = admitTarget(state, action.slug, target);
  if (tier === undefined) return;
  startAction(
    state,
    { ...action, tier: tierIdentity(tier) },
    taskState,
    task,
    true,
    {
      subscription: tier.subscription,
      model: tier.model.id,
    },
  );
}

/** Checks and merges run while draining once the task itself has started. */
function admitScript(
  state: DispatchState,
  action: Action & { slug: string; kind: "checks" | "merge" },
  task: TaskFile,
  taskState: TaskState,
  hold: ActiveHolds,
): void {
  if (state.drain && !state.started.has(action.slug) && taskState.turns === 0)
    return;
  if (
    hold.slugs.has(action.slug) &&
    !state.started.has(action.slug) &&
    taskState.turns === 0
  )
    return;
  startAction(state, action, taskState, task, false);
}

/**
 * Admits one candidate. A slug already running (now or at the read snapshot) is
 * skipped; a cancelled dispatch or a frozen fault admits nothing new. A park
 * or finish is a terminal script step and runs even while draining.
 */
export async function admitAction(
  state: DispatchState,
  action: Action & { slug: string },
  tasks: TaskFile[],
  snapshot: State,
  hold: ActiveHolds,
  turnsUsed: number,
  records: StepRecord[],
  runningAtRead: ReadonlySet<string>,
): Promise<void> {
  if (runningAtRead.has(action.slug) || state.running.has(action.slug)) return;
  if (state.cancelled || !dispatchable(state, action.slug)) return;
  // A signal raised while a turn was awaited must refuse the next start.
  if (state.drain === undefined && state.opts.signals?.shouldStop()) {
    state.drain = makeCause("boundary", "signal: drain requested");
  }
  const task = tasks.find((candidate) => candidate.slug === action.slug);
  if (!task) throw new Error(`action names unknown task "${action.slug}"`);
  const taskState = snapshot.tasks[action.slug]!;
  if (action.kind === "step") {
    admitStep(state, action, task, taskState, hold, turnsUsed, records);
    return;
  }
  if (action.kind === "checks" || action.kind === "merge") {
    admitScript(state, action, task, taskState, hold);
    return;
  }
  await runTerminalAction(state, action, taskState, task);
}
