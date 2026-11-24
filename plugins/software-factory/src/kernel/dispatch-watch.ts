/**
 * The inbox watch: a timer that interrupts the dispatch loop's wait on running
 * turns, so a steer dropped during a long turn is answered before that turn
 * ends. It claims nothing and runs no turn: a wake makes the loop take a
 * normal pass, where `pollSteers` claims the settled batch and runs its one PM
 * turn.
 *
 * A steer is announced once its content has held for the debounce window, so a
 * burst, or one steer written in several steps, reaches the PM as one batch.
 * Nothing is announced before a plan exists: the PM routes nothing without one,
 * so the steer waits for the plan instead of waking the loop to no end.
 */
import { type Steer, scanInbox } from "./mailbox.js";
import type { ArtifactStore } from "./types.js";

/** A single-digit-second timer: the watch looks often, the debounce decides. */
export const STEER_WATCH_TICK_MS = 5_000;
/** How long a stable steer waits before it interrupts a running turn. */
export const STEER_DEBOUNCE_MS = 60_000;

export interface SteerWatchOptions {
  /** Timer cadence; defaults to `STEER_WATCH_TICK_MS`. */
  tickMs?: number;
  /** Stable-window before an announcement; defaults to `STEER_DEBOUNCE_MS`. */
  debounceMs?: number;
}

export interface SteerWatch {
  /**
   * Resolves on the next announcement, or at once when one is still pending.
   * One wait at a time: each pass re-arms it after `take`.
   */
  wake(): Promise<void>;
  /**
   * Consumes the pending wake for this pass and returns a scan failure since
   * the last call. `pollSteers` calls it once per pass; a failed scan ends the
   * iteration as an infra stop instead of vanishing inside the timer.
   */
  take(): string | undefined;
  /** Stops the timer; a dispatch that ends must not leave it running. */
  stop(): void;
}

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
  sightings: Map<string, Sighting>;
  announced: Set<string>;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * Restarts a steer's window when its content is new or changed, and returns
 * the sighting that has been holding when it is not.
 */
function track(
  state: WatchState,
  steer: Steer,
  now: number,
): Sighting | undefined {
  const before = state.sightings.get(steer.id);
  if (before !== undefined && before.hash === steer.hash) return before;
  state.sightings.set(steer.id, { hash: steer.hash, since: now });
  return undefined;
}

/** Forget the files that left the inbox; their next name is a new steer. */
function prune(state: WatchState, present: ReadonlySet<string>): void {
  for (const id of state.sightings.keys()) {
    if (!present.has(id)) state.sightings.delete(id);
  }
}

/**
 * The ids due this tick: their content has held for the debounce window and,
 * when they are the first to be due, the goal has a plan to route them into.
 */
async function dueIds(
  store: ArtifactStore,
  state: WatchState,
  steers: Steer[],
  now: number,
): Promise<string[]> {
  prune(state, new Set(steers.map((steer) => steer.id)));
  const due: string[] = [];
  let hasPlan: boolean | undefined;
  for (const steer of steers) {
    if (state.seen.has(steer.id) || state.announced.has(steer.id)) {
      state.sightings.delete(steer.id);
      continue;
    }
    const sighting = track(state, steer, now);
    if (sighting === undefined || now - sighting.since < state.debounceMs) {
      continue;
    }
    hasPlan ??= await store.plans.exists();
    if (!hasPlan) continue;
    state.announced.add(steer.id);
    state.sightings.delete(steer.id);
    due.push(steer.id);
  }
  return due;
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
    if ((await dueIds(store, state, steers, Date.now())).length > 0) {
      announce();
    }
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
    stop(): void {
      clearInterval(timer);
      const resolve = waiter;
      waiter = undefined;
      resolve?.();
    },
  };
}
