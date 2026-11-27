/**
 * The dispatch facade: one iteration's loop (`next` proposes, admission
 * disposes) and the public result/options. The rule modules are
 * `dispatch-{state,holds,start,poll,admit,end}.ts`.
 */
import { answerSettledSpikeSteers } from "./boundary-spike.js";
import { makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { admitAction, updateDrain } from "./dispatch-admit.js";
import { drainForPromote, waveEnd } from "./dispatch-end.js";
import { answerStoredTaskSteers, pollSteers } from "./dispatch-poll.js";
import type {
  DispatchOptions,
  DispatchResult,
  DispatchState,
  SteerWatch,
} from "./dispatch-types.js";
import { readInitialHolds, settledTurns } from "./dispatch-state.js";
import { createSteerWatch, STEER_DEBOUNCE_MS } from "./dispatch-watch.js";
import { scanInbox } from "./mailbox.js";
import { next } from "./next.js";
import { LiveSteerSessions } from "./sessions.js";
import type { Action, KernelRuntime } from "./types.js";

export { INFRA_REDISPATCH_DELAYS_MS } from "./dispatch-start.js";
export type { DispatchOptions, DispatchResult } from "./dispatch-types.js";
export {
  iterationSpend,
  iterationStart,
  settledTurns,
} from "./dispatch-state.js";

/** The iteration's initial state, started set and holds; a hold read failure ends it. */
async function prepareDispatch(
  runtime: KernelRuntime,
  opts: DispatchOptions,
): Promise<DispatchState | DispatchResult> {
  const initialTasks = await runtime.store.listTasks();
  const initialRecords = await runtime.store.listRecords();
  const initial = derive(
    initialTasks,
    initialRecords,
    runtime.configs.process.flows,
  );
  const iteration = opts.iteration ?? Math.max(1, initial.iteration);
  const state: DispatchState = {
    runtime,
    opts,
    iteration,
    taskTurnsStarted: 0,
    planCheckFindings: [],
    running: new Map(),
    started: new Set(
      initialRecords
        .filter(
          (r) => r.iteration === iteration && r.actor === "agent" && r.slug,
        )
        .map((r) => r.slug!),
    ),
    infra: new Map(),
    cancelled: false,
    seenSteers: new Set(opts.seenSteers ?? []),
    holds: [],
    liveSteers: new LiveSteerSessions(),
    sleep:
      opts.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    usdLimit: runtime.limits.iterationUsd,
  };
  const failed = await readInitialHolds(
    state,
    initialTasks.map((task) => task.slug),
    initialRecords,
  );
  return failed ?? state;
}

async function settleRunning(state: DispatchState): Promise<void> {
  await Promise.allSettled([...state.running.values()].map((r) => r.promise));
}

/** Waits out a debounced steer batch; the watch's own wake ends it early. */
async function waitForBatch(ms: number, watch: SteerWatch): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      watch.wake(),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * overall, per-subscription and per-model turn limits; within a wave, order
 * comes from `deps` only. A task whose tiers all ended on transient infra is
 * re-dispatched after a backoff inside the same iteration, so a transport
 * glitch never freezes it for the launch. On an optional iteration limit —
 * turns, wall clock or dollars — the loop drains: a task that has not started
 * this iteration gets no turn, tasks already started finish their flow,
 * in-flight work settles, then the caller ends the iteration normally. Only
 * when nothing is dispatchable does the wave run the steward, the stall PM and
 * the plan check, and only then does an infra fault end it.
 */
interface LoopRead {
  runningAtRead: Set<string>;
  tasks: Awaited<ReturnType<KernelRuntime["store"]["listTasks"]>>;
  recordsBefore: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>;
  snapshot: ReturnType<typeof derive>;
}

interface PollStage {
  polled: Awaited<ReturnType<typeof pollSteers>>;
  records: LoopRead["recordsBefore"];
  turnsUsed: number;
  tasks: LoopRead["tasks"];
  snapshot: LoopRead["snapshot"];
}

/** Snapshot the running set before reading records, never after. */
async function readLoop(state: DispatchState): Promise<LoopRead> {
  const runningAtRead = new Set(state.running.keys());
  const tasks = await state.runtime.store.listTasks();
  const recordsBefore = await state.runtime.store.listRecords();
  return {
    runningAtRead,
    tasks,
    recordsBefore,
    snapshot: derive(tasks, recordsBefore, state.runtime.configs.process.flows),
  };
}

/** Answer the routed steers whose answer exists after the last pass. */
async function answerSettledSteers(state: DispatchState): Promise<void> {
  const read = await readLoop(state);
  const scanned = await scanInbox(state.runtime.store, { settleMs: 0 });
  const answered = await answerStoredTaskSteers(
    state.runtime.store,
    read.recordsBefore,
    scanned,
  );
  await answerSettledSpikeSteers(
    state.runtime,
    read.tasks,
    read.snapshot,
    read.recordsBefore,
    scanned.filter((steer) => !answered.has(steer.id)),
  );
}

/** Poll the inbox and the iteration brake; a failed poll ends the iteration. */
async function pollStage(
  state: DispatchState,
  read: LoopRead,
  watch: SteerWatch,
): Promise<PollStage | DispatchResult> {
  const polled = await pollSteers(
    state,
    read.snapshot,
    read.tasks,
    read.recordsBefore,
    watch,
  );
  if (polled.error) {
    await settleRunning(state);
    return {
      reason: "infra",
      cause: makeCause("error", polled.error),
      turns: settledTurns(
        await state.runtime.store.listRecords(),
        state.iteration,
      ),
      taskTurnsStarted: state.taskTurnsStarted,
      allReadyHeld: false,
    };
  }
  // A steer PM turn is an agent record written after the first read; re-read
  // so it prices into this iteration's brake like every other PM turn.
  const records = polled.steerTurn
    ? await state.runtime.store.listRecords()
    : read.recordsBefore;
  const turnsUsed = settledTurns(records, state.iteration);
  let tasks = read.tasks;
  let snapshot = read.snapshot;
  if (polled.steerTurn) {
    tasks = await state.runtime.store.listTasks();
    snapshot = derive(tasks, records, state.runtime.configs.process.flows);
  }
  await updateDrain(state, polled, records, turnsUsed);
  return { polled, records, turnsUsed, tasks, snapshot };
}

/** Every proposed action is offered to admission once, in `next` order. */
async function admitWave(
  state: DispatchState,
  stage: PollStage,
  runningAtRead: ReadonlySet<string>,
): Promise<void> {
  const candidates = next(
    stage.snapshot,
    state.runtime.limits,
    runningAtRead,
  ).filter(
    (action): action is Action & { slug: string } =>
      action.kind !== "boundary" && action.kind !== "exit",
  );
  for (const action of candidates) {
    await admitAction(
      state,
      action,
      stage.tasks,
      stage.snapshot,
      stage.polled.hold,
      stage.turnsUsed,
      stage.records,
      runningAtRead,
    );
  }
}

/**
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * overall, per-subscription and per-model turn limits; within a wave, order
 * comes from `deps` only. A task whose tiers all ended on transient infra is
 * re-dispatched after a backoff inside the same iteration, so a transport
 * glitch never freezes it for the launch. On an optional iteration limit —
 * turns, wall clock or dollars — the loop drains: a task that has not started
 * this iteration gets no turn, tasks already started finish their flow,
 * in-flight work settles, then the caller ends the iteration normally. Only
 * when nothing is dispatchable does the wave run the steward, the stall PM and
 * the plan check, and only then does an infra fault end it. An inbox watch on
 * its own timer wakes the loop for a settled steer, so the wait on running
 * turns cannot delay that steer's PM turn past them. Every dispatch pass
 * honors the same debounce, so a pass holding an inside-window batch waits
 * the remainder out before it ends the wave.
 */
export async function runDispatch(
  runtime: KernelRuntime,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const prepared = await prepareDispatch(runtime, opts);
  if ("reason" in prepared) return prepared;
  const state = prepared;
  const debounceMs = runtime.limits.steerDebounceMs ?? STEER_DEBOUNCE_MS;
  let heldSince: number | undefined;
  const watch = createSteerWatch(runtime.store, state.seenSteers, {
    ...(opts.steerWatchTickMs !== undefined
      ? { tickMs: opts.steerWatchTickMs }
      : {}),
    debounceMs,
    deliver: (steer) => state.liveSteers.inject(steer),
  });
  try {
    for (;;) {
      const read = await readLoop(state);
      if (read.snapshot.terminal) {
        await settleRunning(state);
        // A final settle must answer its spike steer before the launch stops:
        // a terminal goal never reaches the boundary that would answer it.
        await answerSettledSteers(state);
        return {
          reason: "terminal",
          turns: settledTurns(read.recordsBefore, state.iteration),
          taskTurnsStarted: state.taskTurnsStarted,
          allReadyHeld: false,
        };
      }
      const stage = await pollStage(state, read, watch);
      if ("reason" in stage) return stage;
      // A ready promote task drains before admission: started turns finish, no
      // unstarted work begins, and the wave end stops the launch.
      drainForPromote(state, stage.snapshot);
      await admitWave(state, stage, read.runningAtRead);
      if (state.running.size > 0) {
        // The watch's wake breaks the wait when a steer has sat long enough:
        // the next pass claims it and runs its PM turn before these end.
        await Promise.race([
          ...state.running.values().map((r) => r.promise),
          watch.wake(),
        ]);
        continue;
      }
      // Pending steers inside their debounce window keep the pass alive: the
      // batch gets its one claim and PM turn before the wave ends. A live
      // writer keeps restarting its window; the two-window cap ends the wait
      // instead of stalling the wave forever.
      const heldMs = stage.polled.heldMs;
      if (heldMs !== undefined) {
        heldSince ??= Date.now();
        const left = 2 * debounceMs - (Date.now() - heldSince);
        if (left > 0 && !state.cancelled && !state.opts.signals?.shouldStop()) {
          await waitForBatch(Math.min(heldMs, left), watch);
          continue;
        }
      } else {
        heldSince = undefined;
      }
      const ended = await waveEnd(
        state,
        read.snapshot,
        stage.turnsUsed,
        read.runningAtRead,
      );
      if (ended === "continue") continue;
      // A terminal script step settles inside this wave, after the poll read;
      // answer its steer here because the wave may end without another pass.
      await answerSettledSteers(state);
      return ended;
    }
  } finally {
    watch.stop();
  }
}
