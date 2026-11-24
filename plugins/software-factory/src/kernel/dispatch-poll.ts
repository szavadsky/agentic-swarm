/**
 * The inbox poll: the dispatch loop's single mailbox consumer, run between
 * dispatch decisions and never inside a turn. It claims one settle window per
 * new batch, runs exactly one PM steer turn, and re-reads the holds that turn
 * may have rewritten against the tasks on disk.
 */
import { answerSettledSpikeSteers } from "./boundary-spike.js";
import { openConcernIds } from "./context-pack/misc.js";
import { activeHolds } from "./dispatch-holds.js";
import type { ActiveHolds, DispatchState } from "./dispatch-state.js";
import type { SteerWatch } from "./dispatch-watch.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { readHolds, type Steer, scanInbox } from "./mailbox.js";
import { runSteerPm } from "./pm.js";
import type { State, StepRecord, TaskFile } from "./types.js";

export interface SteerPoll {
  hold: ActiveHolds;
  steerTurn: boolean;
  /** An inbox read failed: the iteration ends as an infra stop. */
  error?: string;
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

/**
 * Re-reads the holds after a turn that may have written or amended them. They
 * validate against the task files now on disk, so a mark naming a task a turn
 * just created still decides.
 */
export async function reloadHolds(
  state: DispatchState,
  after: string,
): Promise<string | undefined> {
  try {
    const tasks = await state.runtime.store.listTasks();
    state.holds = (
      await readHolds(state.runtime.store, {
        knownSlugs: tasks.map((task) => task.slug),
      })
    ).holds;
    return undefined;
  } catch (err) {
    return `${after}: ${(err as Error).message}`;
  }
}

/**
 * Answers the spike steers whose linked tasks settled, and drops them from the
 * poll's batch. A hold left with an answer is re-read so the rest of the loop
 * does not keep a task it no longer blocks.
 */
async function answerSettledSteers(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
  records: readonly StepRecord[],
): Promise<{ steers: Steer[]; error?: string }> {
  const scanned = await scanInbox(state.runtime.store, { settleMs: 0 });
  const answered = await answerSettledSpikeSteers(
    state.runtime,
    tasks,
    snapshot,
    [...records],
    scanned,
  );
  if (answered.size === 0) return { steers: scanned };
  const error = await reloadHolds(
    state,
    `holds after answering ${[...answered].join(", ")}`,
  );
  return {
    steers: scanned.filter((steer) => !answered.has(steer.id)),
    ...(error ? { error } : {}),
  };
}

/** One claim gets its one PM steer turn; the holds it wrote are re-read. */
async function runSteerBatch(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
  claim: Steer[],
): Promise<string | undefined> {
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
        liveSteers: state.liveSteers,
      }),
  );
  return reloadHolds(
    state,
    `steer holds after ${claim.map((steer) => steer.id).join(", ")}`,
  );
}

/**
 * Polls the inbox between dispatch decisions, never inside a turn. The batch
 * gets exactly one PM turn; its record lands before the caller reads records,
 * so its dollars count against the iteration brake. `watch` owns the timer
 * that interrupts a long wait: this pass consumes its wake, so one
 * announcement never makes the loop pass twice.
 */
export async function pollSteers(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
  records: readonly StepRecord[],
  watch: SteerWatch,
): Promise<SteerPoll> {
  const watchError = watch.take();
  // Without an inbox read the batch is unknown, and the loop must not go on
  // as if the mailbox were empty: the watch's failure ends the iteration.
  if (watchError) {
    return {
      hold: activeHolds(state.holds, new Set(), new Set()),
      steerTurn: false,
      error: watchError,
    };
  }
  // A spike steer stays in the inbox until its linked task settles; answer it
  // here, in the same poll that would otherwise claim it again.
  const { steers, error: answerError } = await answerSettledSteers(
    state,
    snapshot,
    tasks,
    records,
  );
  if (answerError) {
    return {
      hold: activeHolds(state.holds, new Set(), new Set()),
      steerTurn: false,
      error: answerError,
    };
  }
  const pending = new Set(steers.map((steer) => steer.id));
  const openConcerns = openConcernIds(records);
  const hold = activeHolds(state.holds, pending, openConcerns);
  const urgent = steers.find((steer) => steer.urgent)?.id;
  if (state.cancelled) {
    return { hold, steerTurn: false, ...(urgent ? { urgent } : {}) };
  }
  // Urgency is the owner's exception: no PM turn, no claim. The steer stays
  // pending for the consult the next iteration opens, and the caller drains.
  if (urgent !== undefined) {
    return { hold, steerTurn: false, urgent };
  }
  // The PM routes nothing before a plan exists, so a steer dropped that early
  // waits for the plan instead of being claimed into an architect hand-off.
  if (!(await state.runtime.store.plans.exists())) {
    return { hold, steerTurn: false };
  }
  const claim = await claimSteers(state, steers);
  if (claim.length === 0) return { hold, steerTurn: false };
  const holdError = await runSteerBatch(state, snapshot, tasks, claim);
  return {
    hold: activeHolds(state.holds, pending, openConcerns),
    steerTurn: true,
    ...(holdError ? { error: holdError } : {}),
  };
}
