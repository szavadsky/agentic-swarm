/**
 * The end of a dispatch wave: a transient retry, the drained stop, the
 * steward, the stall PM, kept-land and the plan checker. Only when every stage
 * declines does the iteration end at the boundary or as infra.
 */
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { heldBoundaryCause, undecidedParked } from "./dispatch-holds.js";
import { reloadHolds } from "./dispatch-poll.js";
import {
  dispatchable,
  INFRA_REDISPATCH_DELAYS_MS,
  noteInfra,
} from "./dispatch-start.js";
import type {
  ActiveHolds,
  DispatchResult,
  DispatchState,
} from "./dispatch-types.js";
import { planCheckCause, settledTurns } from "./dispatch-state.js";
import { executeTaskAction } from "./flow.js";
import { runKeptLand } from "./integrate.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  openWork,
  PLAN_CHECK_STEP,
  planChecksSinceConsult,
  runPlanCheckRound,
} from "./plan-check.js";
import { runStallPm } from "./pm.js";
import { runSteward } from "./steward.js";
import type { Cause, State } from "./types.js";
import { headSha } from "./worktree.js";

type Wave = DispatchResult | "continue";

function result(
  state: DispatchState,
  reason: DispatchResult["reason"],
  turns: number,
  extra: Partial<DispatchResult> = {},
): DispatchResult {
  return {
    reason,
    turns,
    taskTurnsStarted: state.taskTurnsStarted,
    allReadyHeld: false,
    ...extra,
  };
}

async function freshTurns(state: DispatchState): Promise<number> {
  return settledTurns(await state.runtime.store.listRecords(), state.iteration);
}

/** The steward owns remaining merge conflicts; a leg's infra is booked per slug. */
async function runStewardStage(
  state: DispatchState,
): Promise<Wave | undefined> {
  let steward: Awaited<ReturnType<typeof runSteward>>;
  try {
    steward = await runSteward(state.runtime, state.iteration, {
      frozen: new Set(
        [...state.infra.entries()]
          .filter(([slug]) => !dispatchable(state, slug))
          .map(([slug]) => slug),
      ),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return result(state, "infra", await freshTurns(state), {
      cause: makeCause("error", `steward: ${cause}`),
    });
  }
  for (const dead of steward.dead)
    noteInfra(state, dead.slug, dead.cause, dead.details);
  for (const slug of steward.attempted) {
    if (!steward.dead.some((dead) => dead.slug === slug))
      state.infra.delete(slug);
  }
  if (steward.cancelled) {
    return result(state, "cancelled", await freshTurns(state));
  }
  return steward.skipped ? undefined : "continue";
}

/** Wave-end stall: parks no stall turn has decided get one PM decision each. */
async function runStallStage(state: DispatchState): Promise<Wave | undefined> {
  if (state.opts.signals?.shouldStop()) return undefined;
  const tasks = await state.runtime.store.listTasks();
  const records = await state.runtime.store.listRecords();
  const snapshot = derive(tasks, records, state.runtime.configs.process.flows);
  const slugs = undecidedParked(records, snapshot, state.iteration);
  if (slugs.length === 0) return undefined;
  const stalled = await runBoundaryTurn(
    state.runtime,
    { iteration: state.iteration, step: "pm" },
    () =>
      runStallPm(state.runtime, {
        iteration: state.iteration,
        state: snapshot,
        slugs,
        cwd: state.runtime.paths.goalCheckout,
      }),
  );
  if (stalled.continued.length === 0) return undefined;
  // The turn may have marked concerns: a resumed wave reads the new holds.
  const holdError = await reloadHolds(state, "holds after the stall turn");
  if (holdError) {
    return result(state, "infra", await freshTurns(state), {
      cause: makeCause("error", holdError),
    });
  }
  return "continue";
}

/**
 * Kept green branches land at wave end, not only at the boundary a restart may
 * never reach. The boundary stays the latest point. A landing or an attempt
 * changes what the next pass must read: the head has moved, or a red or
 * conflicting kept branch is now the steward's.
 */
async function runKeptLandStage(
  state: DispatchState,
): Promise<Wave | undefined> {
  const kept = await runKeptLand(state.runtime, state.iteration);
  if (kept.landed.length === 0 && kept.attempted.length === 0) return undefined;
  return "continue";
}

/** A task-tier checker verifies the plan; `progress` resumes dispatch in this iteration. */
async function runPlanCheckStage(
  state: DispatchState,
): Promise<Wave | undefined> {
  if (
    state.opts.signals?.shouldStop() ||
    !(await state.runtime.store.plans.exists())
  )
    return undefined;
  const tasks = await state.runtime.store.listTasks();
  const records = await state.runtime.store.listRecords();
  const snapshot = derive(tasks, records, state.runtime.configs.process.flows);
  const rounds = records.filter(
    (record) =>
      record.iteration === state.iteration &&
      record.step === PLAN_CHECK_STEP &&
      record.actor === "agent" &&
      record.endedAt,
  ).length;
  const checked = planChecksSinceConsult(records);
  if (
    openWork(snapshot).length > 0 &&
    checked.length < state.runtime.limits.planCheckRounds
  ) {
    const round = await runBoundaryTurn(
      state.runtime,
      { iteration: state.iteration, step: PLAN_CHECK_STEP },
      () =>
        runPlanCheckRound(state.runtime, {
          iteration: state.iteration,
          round: rounds + 1,
          state: snapshot,
        }),
    );
    if (round.status === "architect")
      state.planCheckFindings.push(...round.findings);
    state.planCheckVerdict = round.turn.verdict;
    if (round.continued.length > 0) return "continue";
  } else if (openWork(snapshot).length > 0) {
    state.planCheckVerdict = checked.at(-1)?.outcome?.planCheck?.verdict;
  }
  return undefined;
}

/** Ready promote tasks, in slug order: their readiness stops the wave for the operator. */
function promoteTasks(snapshot: State): string[] {
  return Object.entries(snapshot.tasks)
    .filter(([, task]) => task.status === "ready" && task.promote === true)
    .map(([slug]) => slug)
    .sort();
}

/**
 * A ready promote task drains the wave: no unstarted task begins, started turns
 * finish their flow, and the wave end stops the launch for the operator.
 */
export function drainForPromote(state: DispatchState, snapshot: State): void {
  if (state.drain !== undefined || state.cancelled) return;
  const slugs = promoteTasks(snapshot);
  if (slugs.length === 0) return;
  state.drain = makeCause(
    "boundary",
    `promote task ${slugs.join(", ")} is ready: operator promotion pending`,
  );
}

/**
 * Ends the wave at the operator barrier: each promote task is recorded finished
 * — the stop is its product — and the cause names the goal build to promote.
 */
async function promoteResult(
  state: DispatchState,
  snapshot: State,
  slugs: readonly string[],
  turns: number,
): Promise<DispatchResult> {
  const tasks = await state.runtime.store.listTasks();
  for (const slug of slugs) {
    const task = tasks.find((candidate) => candidate.slug === slug);
    if (!task) throw new Error(`promote task "${slug}" has no task file`);
    await executeTaskAction(
      state.runtime,
      task,
      { kind: "finish", slug },
      state.iteration,
      snapshot.tasks[slug]!,
    );
  }
  const rev = (await headSha(state.runtime.paths.goalCheckout)).slice(0, 12);
  return result(state, "promote", turns, {
    cause: makeCause(
      "boundary",
      `promote task ${slugs.join(", ")}: goal build ${rev} awaits promotion; promote it, then relaunch`,
    ),
  });
}

/** A drained iteration ends normally; the plan-check findings travel as its cause. */
function drainedResult(state: DispatchState, turns: number): DispatchResult {
  const checked = planCheckCause(state);
  const drain = state.drain ?? makeCause("boundary", "drain requested");
  return result(state, "drained", turns, {
    cause: checked
      ? makeCause(
          drain.kind === "budget" ? "budget" : "boundary",
          `${formatCause(drain)}; ${formatCause(checked)}`,
        )
      : drain,
  });
}

/** The boundary stop names remaining holds and plan-check findings. */
function boundaryResult(
  state: DispatchState,
  hold: ActiveHolds,
  snapshot: State,
  turns: number,
): DispatchResult {
  const heldCause = heldBoundaryCause(hold, snapshot);
  const planCheckFinding = planCheckCause(state);
  const causes = [heldCause, planCheckFinding].filter(
    (cause): cause is Cause => cause !== undefined,
  );
  const cause =
    causes.length === 1
      ? causes[0]
      : causes.length > 1
        ? makeCause("boundary", causes.map(formatCause).join("; "))
        : undefined;
  return result(state, "boundary", turns, {
    ...(cause ? { cause } : {}),
    planCheck: state.planCheckVerdict,
    allReadyHeld: heldCause !== undefined,
  });
}

/**
 * Nothing is running and no candidate started. A task seen at the read
 * snapshot may have settled meanwhile, so that re-derives first. A transient
 * fault's backoff runs here; a drain ends normally once no infra remains; the
 * recovering stages (steward, stall PM, plan checker) then get their turns.
 */
export async function waveEnd(
  state: DispatchState,
  snapshot: State,
  hold: ActiveHolds,
  turnsUsed: number,
  runningAtRead: ReadonlySet<string>,
): Promise<Wave> {
  if (runningAtRead.size > 0) return "continue";
  if (state.cancelled) return result(state, "cancelled", turnsUsed);
  const waiting = [...state.infra.values()].find(
    (fault) => fault.retry && !fault.due,
  );
  if (
    waiting &&
    state.drain === undefined &&
    !state.opts.signals?.shouldStop()
  ) {
    await state.sleep(INFRA_REDISPATCH_DELAYS_MS[waiting.retries]!);
    waiting.due = true;
    waiting.retries += 1;
    return "continue";
  }
  // The promote stop waits for the same quiet wave a drain does: its stop is
  // the operator's hand-back, not a reason to abandon an infra retry.
  const promote = promoteTasks(snapshot);
  if (promote.length > 0 && state.infra.size === 0)
    return await promoteResult(state, snapshot, promote, turnsUsed);
  if (state.drain && state.infra.size === 0)
    return drainedResult(state, turnsUsed);
  const steward = await runStewardStage(state);
  if (steward !== undefined) return steward;
  const stall = await runStallStage(state);
  if (stall !== undefined) return stall;
  const kept = await runKeptLandStage(state);
  if (kept !== undefined) return kept;
  const planCheck = await runPlanCheckStage(state);
  if (planCheck !== undefined) return planCheck;
  const turns = await freshTurns(state);
  // The wave is over and its recovery ran: a remaining fault names the stop.
  if (state.infra.size > 0) {
    const causes = [...state.infra.entries()].map(
      ([slug, fault]) => `${slug}: ${fault.cause}`,
    );
    return result(state, "infra", turns, {
      cause: makeCause("boundary", causes.join("; ")),
    });
  }
  return boundaryResult(state, hold, snapshot, turns);
}
