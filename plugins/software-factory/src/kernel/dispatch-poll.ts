/**
 * The inbox poll: the dispatch loop's single mailbox consumer, run between
 * dispatch decisions and never inside a turn. It claims one batch only once
 * the configured debounce has held, runs exactly one PM steer turn, and
 * re-reads the holds that turn may have rewritten against the tasks on disk.
 */
import { infraCause } from "./boundary-context.js";
import { answerSettledSpikeSteers } from "./boundary-spike.js";
import { openConcernIds } from "./context-pack/misc.js";
import { activeHolds } from "./dispatch-holds.js";
import type { DispatchState, SteerPoll, SteerWatch } from "./dispatch-types.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  answerFromStoredRoute,
  collectSteerRoutes,
  readHolds,
  type Steer,
  scanInbox,
} from "./mailbox.js";
import { runSteerPm, steerScopeGroups } from "./pm.js";
import type { ArtifactStore, State, StepRecord, TaskFile } from "./types.js";

function claimSteers(state: DispatchState, steers: Steer[]): Steer[] {
  const claim = steers.filter((steer) => !state.seenSteers.has(steer.id));
  for (const steer of claim) {
    state.seenSteers.add(steer.id);
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
 * Delivers a `task` steer's committed answer when a crash left its inbox file
 * behind after the route record landed: the record is the claim, so the poll
 * hands that steer no second PM turn. Returns the ids it answered.
 */
export async function answerStoredTaskSteers(
  store: ArtifactStore,
  records: readonly StepRecord[],
  steers: readonly Steer[],
): Promise<Set<string>> {
  const routes = collectSteerRoutes([...records]);
  const answered = new Set<string>();
  for (const steer of steers) {
    const route = routes.get(steer.id);
    if (route?.route !== "task" || !route.answer) continue;
    await answerFromStoredRoute(store, steer, route.answer);
    answered.add(steer.id);
  }
  return answered;
}

/**
 * Answers the steers whose committed route carries an answer now: a task
 * steer's stored answer and a spike steer whose linked tasks settled. Drops
 * them from the poll's batch; a hold left behind is re-read so the rest of the
 * loop does not keep a task it no longer blocks.
 */
async function answerRoutedSteers(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
  records: readonly StepRecord[],
): Promise<{ steers: Steer[]; error?: string }> {
  const scanned = await scanInbox(state.runtime.store, { settleMs: 0 });
  const answered = await answerStoredTaskSteers(
    state.runtime.store,
    records,
    scanned,
  );
  const spikes = await answerSettledSpikeSteers(
    state.runtime,
    tasks,
    snapshot,
    [...records],
    scanned.filter((steer) => !answered.has(steer.id)),
  );
  for (const id of spikes) answered.add(id);
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

/**
 * One claim gets its one PM steer turn; the holds it wrote are re-read. An
 * injected steer joins the run's seen set the moment the live turn takes it,
 * so no later pass or watch tick claims it again. An infra stop ends the
 * iteration: the next launch continues the committed routes.
 */
async function runSteerBatch(
  state: DispatchState,
  snapshot: State,
  tasks: TaskFile[],
  claim: Steer[],
): Promise<string | undefined> {
  let infraStop: string | undefined;
  await runBoundaryTurn(
    state.runtime,
    { iteration: state.iteration, step: "pm" },
    async () => {
      for (const group of steerScopeGroups(state.runtime, claim)) {
        const run = await runSteerPm(state.runtime, {
          iteration: state.iteration,
          state: snapshot,
          tasks,
          steers: group.steers,
          scope: group.scope,
          cwd: state.runtime.paths.goalCheckout,
          liveSteers: state.liveSteers,
          onClaim: (steer) => state.seenSteers.add(steer.id),
        });
        if (run.status !== "infra") continue;
        infraStop = `steer PM stopped on infrastructure: ${infraCause(run.stop)}`;
        break;
      }
      return undefined;
    },
  );
  if (infraStop !== undefined) return infraStop;
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
  // A steer whose route is committed stays in the inbox until its consumer
  // answers it; this poll answers the ones whose answer exists now instead of
  // claiming them again.
  const { steers, error: answerError } = await answerRoutedSteers(
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
  const openConcerns = openConcernIds(records, tasks);
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
  // A steer with a committed route was claimed already: the record is its
  // claim token, so a later pass never runs a second PM turn for it.
  const routed = collectSteerRoutes([...records]);
  const candidates = steers.filter((steer) => !routed.has(steer.id));
  // The batch claims only once its debounce has held; the watch's clocks
  // decide, and a routed steer never holds it open.
  const batch = watch.batch(candidates);
  if (batch.pending === 0) return { hold, steerTurn: false };
  if (batch.waitMs > 0) return { hold, steerTurn: false, heldMs: batch.waitMs };
  const claim = claimSteers(state, candidates);
  if (claim.length === 0) return { hold, steerTurn: false };
  const holdError = await runSteerBatch(state, snapshot, tasks, claim);
  return {
    hold: activeHolds(state.holds, pending, openConcerns),
    steerTurn: true,
    ...(holdError ? { error: holdError } : {}),
  };
}
