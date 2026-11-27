/**
 * Admission for one proposed action: the drain and hold filters, the turn and
 * concurrency limits, the target's quota pools, and the step/script/terminal
 * split. Admission never parks a task; holds only keep unstarted work out.
 */

import type { Release } from "../core/semaphores-types.js";
import { makeCause } from "./cause.js";
import {
  dispatchable,
  noteInfra,
  runTerminalAction,
  startAction,
} from "./dispatch-start.js";
import { iterationSpend, iterationStart } from "./dispatch-state.js";
import type {
  ActiveHolds,
  DispatchState,
  SteerPoll,
} from "./dispatch-types.js";
import {
  findStep,
  flowOf,
  stepTarget,
  tierIdentity,
  type ResolvedTier,
  type TurnTarget,
} from "./flow-context.js";
import { loadPriceTable } from "./openrouter.js";
import { semaphoresFor, turnSemaphoreNames } from "./semaphores.js";
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

interface ReservedTier {
  tier: ResolvedTier;
  release: Release;
}

/**
 * Takes every semaphore the tier needs in one all-or-nothing reservation. A
 * contended set takes nothing, so admission tries the next tier instead of
 * waiting on a fallback that could run now.
 */
function reserveTurn(
  state: DispatchState,
  stepSemaphores: readonly string[] | undefined,
  tier: ResolvedTier,
): Release | undefined {
  return semaphoresFor(state.runtime.configs).tryAcquire(
    turnSemaphoreNames(state.runtime.configs, stepSemaphores, tier),
  );
}

/**
 * The target's tiers in configured order, first one admitted by its caps and
 * whose semaphores are all free. A capped or contended tier falls back to the
 * next tier in the chain instead of waiting; every tier blocked still waits.
 * The chosen tier's identity and its held release ride the action so the step
 * starts on the same leg admission judged, even if the chain is re-resolved.
 */
function admitTarget(
  state: DispatchState,
  slug: string,
  target: TurnTarget,
  semaphores: readonly string[] | undefined,
): ReservedTier | undefined {
  if (target.unavailable !== undefined) {
    noteInfra(state, slug, target.unavailable);
    return undefined;
  }
  for (const tier of target.tiers) {
    if (!tierAdmits(state, tier)) continue;
    const release = reserveTurn(state, semaphores, tier);
    if (release === undefined) continue;
    return { tier, release };
  }
  return undefined;
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
  const step = findStep(flowOf(state.runtime, task), action.step);
  const admitted = admitTarget(state, action.slug, target, step.semaphores);
  if (admitted === undefined) return;
  startAction(
    state,
    {
      ...action,
      tier: tierIdentity(admitted.tier),
      semaphoresHeld: true,
    },
    taskState,
    task,
    true,
    {
      subscription: admitted.tier.subscription,
      model: admitted.tier.model.id,
    },
    admitted.release,
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
