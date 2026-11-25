/** The dispatch loop's public shapes: its result and options, the running and fault state. */

import type { Hold, Steer } from "./mailbox.js";
import type { LiveSteerSessions } from "./sessions.js";
import type { DrainController } from "./signals.js";
import type { Cause, KernelRuntime } from "./types.js";

export interface DispatchResult {
  reason:
    | "boundary"
    | "drained"
    | "promote"
    | "terminal"
    | "infra"
    | "cancelled";
  cause?: Cause;
  /** Completed agent turns in this iteration. */
  turns: number;
  /** Started task turns in this iteration. */
  taskTurnsStarted: number;
  /** The latest plancheck verdict of the pass, if any. */
  planCheck?: "progress" | "architect";
  allReadyHeld: boolean;
}

export interface DispatchOptions {
  iteration?: number;
  /**
   * The inbox steer ids the boundary's read covered. Anything else present at
   * dispatch start was dropped after that read, and the architect never saw
   * it, so it gets a PM steer turn here.
   */
  seenSteers?: string[];
  /**
   * The launch's drain controller. A first signal drains through the same
   * channel as an iteration limit: unstarted tasks are refused while started
   * ones finish their flow.
   */
  signals?: DrainController;
  /**
   * Sleeps out a transient fault's backoff before it is re-dispatched. Tests
   * inject a recorder instead of waiting.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The inbox watch's timer cadence, in milliseconds; defaults to
   * `STEER_WATCH_TICK_MS`. Its stable window is the run's
   * `limits.steerDebounceSeconds`, so a test shortens the wait from its run
   * config.
   */
  steerWatchTickMs?: number;
}

export interface Running {
  promise: Promise<void>;
  agent: boolean;
  /** Quota pool and model the turn drew admission against; agent turns only. */
  subscription?: string;
  model?: string;
}

export interface InfraFault {
  cause: string;
  retries: number;
  /** The backoff elapsed: the slug is dispatchable again this iteration. */
  due: boolean;
  retry: boolean;
}

/** Holds still in force: the goal-wide hold name and the slugs held. */
export interface ActiveHolds {
  /** Task slug -> the hold's owner as the boundary names it (`s1`, `concern c-…`). */
  slugs: Map<string, string>;
  /** The steer holding the whole goal, when one does. */
  goal?: string;
}

export interface DispatchState {
  runtime: KernelRuntime;
  opts: DispatchOptions;
  iteration: number;
  taskTurnsStarted: number;
  planCheckVerdict?: "progress" | "architect";
  planCheckFindings: string[];
  running: Map<string, Running>;
  started: Set<string>;
  infra: Map<string, InfraFault>;
  cancelled: boolean;
  drain?: Cause;
  seenSteers: Set<string>;
  /** Fresh files seen once but not yet stable: steer id -> last content hash. */
  settling: Map<string, string>;
  holds: Hold[];
  /** The running PM turn a due steer is injected into instead of a new turn. */
  liveSteers: LiveSteerSessions;
  sleep: (ms: number) => Promise<void>;
  /** The iteration's dollar brake, if configured. */
  usdLimit?: number;
}

/** An inbox claim result: the holds in force, whether a steer turn ran, and its fault. */
export interface SteerPoll {
  hold: ActiveHolds;
  steerTurn: boolean;
  /** An inbox read failed: the iteration ends as an infra stop. */
  error?: string;
  urgent?: string;
}

export interface SteerWatchOptions {
  /** Timer cadence; defaults to `STEER_WATCH_TICK_MS`. */
  tickMs?: number;
  /** Stable-window before an announcement; defaults to `STEER_DEBOUNCE_MS`. */
  debounceMs?: number;
  /**
   * Tries to hand a due steer to the live session before waking the loop. True
   * means the running turn took it; false (or absent) leaves it for the loop's
   * own PM turn, which is the queue path.
   */
  deliver?: (steer: Steer) => Promise<boolean>;
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
