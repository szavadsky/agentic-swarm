/**
 * The inbox poll between dispatch decisions, never inside a turn: one settle
 * window per new batch, then exactly one PM steer turn; the holds it may
 * rewrite are re-read against the tasks on disk after that turn.
 */
import { activeHolds } from "./dispatch-holds.js";
import type { ActiveHolds, DispatchState } from "./dispatch-state.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { readHolds, type Steer, scanInbox } from "./mailbox.js";
import { runSteerPm } from "./pm.js";
import type { State, TaskFile } from "./types.js";

export interface SteerPoll {
  hold: ActiveHolds;
  steerTurn: boolean;
  holdError?: string;
  urgent?: string;
}

/** First sight: a stable file is claimed now, a growing one waits on its hash. */
async function claimFirstSight(
  state: DispatchState,
  steers: Steer[],
): Promise<{ claim: Steer[]; firstIds: Set<string> }> {
  const firstSight = steers.filter(
    (steer) => !state.seenSteers.has(steer.id) && !state.settling.has(steer.id),
  );
  const claim: Steer[] = [];
  const firstIds = new Set(firstSight.map((steer) => steer.id));
  if (firstSight.length === 0) return { claim, firstIds };
  const settled = new Map(
    (await scanInbox(state.runtime.store)).map((steer) => [steer.id, steer]),
  );
  for (const steer of firstSight) {
    const stable = settled.get(steer.id);
    if (stable) claim.push(stable);
    else state.settling.set(steer.id, steer.hash);
  }
  return { claim, firstIds };
}

/** A remembered file is claimed once its content held across a later pass. */
function claimSettling(
  state: DispatchState,
  steers: Steer[],
  firstIds: ReadonlySet<string>,
): Steer[] {
  const claim: Steer[] = [];
  for (const steer of steers) {
    if (state.seenSteers.has(steer.id) || firstIds.has(steer.id)) continue;
    const before = state.settling.get(steer.id);
    if (before === undefined) continue;
    if (before === steer.hash) claim.push(steer);
    else state.settling.set(steer.id, steer.hash);
  }
  return claim;
}

/**
 * A newly seen batch gets one settle window for the whole batch; a
 * still-growing file is remembered by content hash and claimed only once that
 * content held across a later pass.
 */
async function claimSteers(
  state: DispatchState,
  steers: Steer[],
): Promise<Steer[]> {
  const first = await claimFirstSight(state, steers);
  const claim = [
    ...first.claim,
    ...claimSettling(state, steers, first.firstIds),
  ];
  for (const steer of claim) {
    state.seenSteers.add(steer.id);
    state.settling.delete(steer.id);
  }
  return claim;
}

/** The steer turn may have created tasks; holds validate against the files now on disk. */
async function refreshHolds(
  state: DispatchState,
  claim: readonly Steer[],
): Promise<string | undefined> {
  try {
    const after = await state.runtime.store.listTasks();
    state.holds = (
      await readHolds(state.runtime.store, {
        knownSlugs: after.map((task) => task.slug),
      })
    ).holds;
    return undefined;
  } catch (err) {
    return `steer holds after ${claim.map((steer) => steer.id).join(", ")}: ${(err as Error).message}`;
  }
}

/**
 * Polls the inbox between dispatch decisions, never inside a turn. The batch
 * gets exactly one PM turn; its record lands before the caller reads records,
 * so its dollars count against the iteration brake.
 */
export async function pollSteers(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
): Promise<SteerPoll> {
  const steers = await scanInbox(state.runtime.store, { settleMs: 0 });
  const pending = new Set(steers.map((steer) => steer.id));
  const urgent = steers.find((steer) => steer.urgent)?.id;
  if (state.cancelled) {
    return {
      hold: activeHolds(state.holds, pending),
      steerTurn: false,
      urgent,
    };
  }
  // Urgency is the owner's exception: no PM turn, no claim. The steer stays
  // pending for the consult the next iteration opens, and the caller drains.
  if (urgent !== undefined) {
    return {
      hold: activeHolds(state.holds, pending),
      steerTurn: false,
      urgent,
    };
  }
  const claim = await claimSteers(state, steers);
  if (claim.length === 0) {
    return { hold: activeHolds(state.holds, pending), steerTurn: false };
  }
  await runBoundaryTurn(
    state.runtime,
    { iteration: state.iteration, step: "pm" },
    () =>
      runSteerPm(state.runtime, {
        iteration: state.iteration,
        state: snapshot,
        tasks,
        steers: claim,
        cwd: state.runtime.paths.goalCheckout,
      }),
  );
  const holdError = await refreshHolds(state, claim);
  return {
    hold: activeHolds(state.holds, pending),
    steerTurn: true,
    ...(holdError ? { holdError } : {}),
  };
}
