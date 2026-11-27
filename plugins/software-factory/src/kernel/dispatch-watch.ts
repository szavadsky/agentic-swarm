/**
 * The inbox watch: a timer that interrupts the dispatch loop's wait on running
 * turns, so a steer dropped during a long turn is answered before that turn
 * ends. A due steer is first offered to a live session (the running PM turn
 * takes it into its own steerRoutes); only an undelivered one wakes the loop
 * for a normal pass, where `pollSteers` claims the settled batch and runs its
 * one PM turn. The watch claims nothing and runs no turn itself.
 *
 * A steer is announced once its content has held for the debounce window, so a
 * burst, or one steer written in several steps, reaches the PM as one batch.
 * Nothing is announced before a plan exists: the PM routes nothing without one,
 * so the steer waits for the plan instead of waking the loop to no end.
 */
import type {
  SteerBatch,
  SteerWatch,
  SteerWatchOptions,
} from "./dispatch-types.js";
import { type Steer, scanInbox } from "./mailbox.js";
import type { ArtifactStore } from "./types.js";

/** A single-digit-second timer: the watch looks often, the debounce decides. */
export const STEER_WATCH_TICK_MS = 5_000;
/** How long a stable steer waits before it interrupts a running turn. */
export const STEER_DEBOUNCE_MS = 60_000;

interface Sighting {
  hash: string;
  /** When this content was first seen; a change restarts the window. */
  since: number;
}

/** What the watch remembers between ticks. */
interface WatchState {
  /** The run's claimed steer ids: a steer already taken is never announced. */
  seen: ReadonlySet<string>;
  debounceMs: number;
  deliver?: (steer: Steer) => Promise<boolean>;
  sightings: Map<string, Sighting>;
  announced: Set<string>;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * Returns the sighting that has been holding, or stores a new one for content
 * that is new or changed and returns that.
 */
function track(state: WatchState, steer: Steer, now: number): Sighting {
  const before = state.sightings.get(steer.id);
  if (before !== undefined && before.hash === steer.hash) return before;
  const sighting: Sighting = { hash: steer.hash, since: now };
  state.sightings.set(steer.id, sighting);
  return sighting;
}

/** Forget the files that left the inbox; their next name is a new steer. */
function prune(state: WatchState, present: ReadonlySet<string>): void {
  for (const id of state.sightings.keys()) {
    if (!present.has(id)) state.sightings.delete(id);
  }
}

/**
 * The batch waiting on the debounce window. A new or changed steer restarts the
 * wait for the whole batch, so drops inside one window are claimed together.
 * `waitMs` is how long the newest steer still has to hold; zero means the batch
 * is due now.
 */
function pendingBatch(
  state: WatchState,
  steers: Steer[],
  now: number,
  claimed: (steer: Steer) => boolean,
): { steers: Steer[]; waitMs: number } {
  prune(state, new Set(steers.map((steer) => steer.id)));
  const pending: Steer[] = [];
  let newest: Sighting | undefined;
  for (const steer of steers) {
    const sighting = track(state, steer, now);
    if (claimed(steer)) continue;
    pending.push(steer);
    if (newest === undefined || sighting.since > newest.since) {
      newest = sighting;
    }
  }
  const waitMs =
    pending.length === 0 || newest === undefined
      ? 0
      : Math.max(0, state.debounceMs - (now - newest.since));
  return {
    steers: pending,
    waitMs,
  };
}

/**
 * The steers due this tick: their content has held for the debounce window and
 * the goal has a plan to route them into. A selected steer is marked announced
 * before this function returns, so a tick that overlaps a slow delivery cannot
 * select it again.
 */
async function dueSteers(
  store: ArtifactStore,
  state: WatchState,
  steers: Steer[],
  now: number,
): Promise<Steer[]> {
  const batch = pendingBatch(
    state,
    steers,
    now,
    (steer) => state.seen.has(steer.id) || state.announced.has(steer.id),
  );
  if (batch.steers.length === 0 || batch.waitMs > 0) return [];
  if (!(await store.plans.exists())) return [];
  // The plan probe yielded: a tick that ran meanwhile may have selected one of
  // these already, so re-check and claim before delivery starts.
  return batch.steers.filter((steer) => {
    if (state.seen.has(steer.id) || state.announced.has(steer.id)) {
      return false;
    }
    state.announced.add(steer.id);
    return true;
  });
}

/** Hands each due steer to the live session; an undelivered one wakes the loop. */
async function deliverDue(
  state: WatchState,
  due: Steer[],
  announce: () => void,
): Promise<void> {
  for (const steer of due) {
    const delivered = (await state.deliver?.(steer)) ?? false;
    if (!delivered) announce();
  }
}

/**
 * Starts the watch over the store's inbox. `seen` is the run's claimed steer
 * ids (the boundary's read set plus every claim this pass made): a steer the
 * mailbox consumer already took is never announced again.
 */
export function createSteerWatch(
  store: ArtifactStore,
  seen: ReadonlySet<string>,
  opts: SteerWatchOptions = {},
): SteerWatch {
  const state: WatchState = {
    seen,
    debounceMs: opts.debounceMs ?? STEER_DEBOUNCE_MS,
    ...(opts.deliver ? { deliver: opts.deliver } : {}),
    sightings: new Map(),
    announced: new Set(),
  };
  let waiter: (() => void) | undefined;
  let pending = false;
  let error: string | undefined;

  const announce = (): void => {
    pending = true;
    const resolve = waiter;
    waiter = undefined;
    resolve?.();
  };

  const tick = async (): Promise<void> => {
    let steers: Steer[];
    try {
      steers = await scanInbox(store, { settleMs: 0 });
    } catch (err) {
      error = `steer watch: ${message(err)}`;
      announce();
      return;
    }
    const due = await dueSteers(store, state, steers, Date.now());
    await deliverDue(state, due, announce);
  };

  const timer = setInterval(
    () => void tick(),
    opts.tickMs ?? STEER_WATCH_TICK_MS,
  );
  timer.unref?.();

  return {
    wake(): Promise<void> {
      if (pending) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiter = resolve;
      });
    },
    take(): string | undefined {
      pending = false;
      const failed = error;
      error = undefined;
      return failed;
    },
    batch(steers: readonly Steer[]): SteerBatch {
      const pending = pendingBatch(state, [...steers], Date.now(), (steer) =>
        state.seen.has(steer.id),
      );
      return { pending: pending.steers.length, waitMs: pending.waitMs };
    },
    stop(): void {
      clearInterval(timer);
      const resolve = waiter;
      waiter = undefined;
      resolve?.();
    },
  };
}
