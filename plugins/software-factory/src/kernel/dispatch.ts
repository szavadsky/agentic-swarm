import fs from "node:fs";
import path from "node:path";
import { derive } from "./derive.js";
import { executeTaskAction, type TaskActionResult } from "./flow.js";
import { stepTarget } from "./flow-context.js";
import type { MergeResult } from "./integrate.js";
import { type Hold, readHolds, type Steer, scanInbox } from "./mailbox.js";
import { next } from "./next.js";
import {
  latestPlanCheck,
  PLAN_CHECK_STEP,
  runPlanCheck,
} from "./plan-check.js";
import {
  runPlanCheckPm,
  runStallPm,
  runSteerPm,
  STALL_ROUTES_STEP,
} from "./pm.js";
import { loadPriceTable } from "./openrouter.js";
import { type PriceTable, pricedRecord } from "./pricing.js";
import { scriptMeta } from "./record.js";
import { runSteward } from "./steward.js";
import type { DrainController } from "./signals.js";
import type {
  Action,
  KernelRuntime,
  State,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

export interface DispatchResult {
  reason: "boundary" | "drained" | "terminal" | "infra" | "cancelled";
  cause?: string;
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
}

interface Running {
  promise: Promise<void>;
  agent: boolean;
  /** Quota pool and model the turn drew admission against; agent turns only. */
  subscription?: string;
  model?: string;
}

/** Agent turns charged to the iteration's turn count; boundary roles and infra stops are free. */
export function settledTurns(records: StepRecord[], iteration: number): number {
  return records.filter(
    (r) =>
      r.iteration === iteration &&
      r.actor === "agent" &&
      r.endedAt &&
      r.slug !== undefined &&
      r.step !== "architect" &&
      r.step !== "pm" &&
      r.stop?.kind !== "infra",
  ).length;
}

export function iterationStart(
  records: StepRecord[],
  iteration: number,
): number {
  const times = records
    .filter((r) => r.iteration === iteration)
    .map((r) => Date.parse(r.startedAt))
    .filter((n) => Number.isFinite(n));
  return times.length > 0 ? Math.min(...times) : Date.now();
}

/**
 * Dollars this iteration has already spent: every settled agent record priced
 * through `pricedRecord`, the same call metrics and digest make, so a retried
 * or fallen-back turn counts each reported attempt exactly once. A turn whose
 * cost is unknown adds $0 — the brake treats it as free because it has nothing
 * better to go on, and the summary reports how many turns were blind.
 */
export function iterationSpend(
  records: StepRecord[],
  iteration: number,
  prices: PriceTable,
  priceIds?: Record<string, string>,
): number {
  let usd = 0;
  for (const rec of records) {
    if (rec.iteration !== iteration || rec.actor !== "agent" || !rec.endedAt)
      continue;
    const cost = pricedRecord(rec, prices, priceIds).usage.costUsd;
    if (cost !== undefined) usd += cost;
  }
  return usd;
}

function agentStop(
  result: TaskActionResult | MergeResult,
): { reason: "infra" | "cancelled"; cause?: string } | undefined {
  if ("infra" in result && result.infra)
    return { reason: "infra", cause: result.infra.cause };
  if ("cancelled" in result && result.cancelled) return { reason: "cancelled" };
  return undefined;
}

function crashMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * A throwing action records the crash as an infra stop and names the task; the
 * launch and its siblings keep going. Recording failure must not mask the
 * original crash, so it is logged and the crash cause is still returned.
 */
async function recordCrash(
  runtime: KernelRuntime,
  iteration: number,
  action: Action & { slug: string },
  taskState: TaskState,
  err: unknown,
): Promise<string> {
  const message = crashMessage(err);
  const cause = `crash: ${message}`;
  try {
    await runtime.store.appendRecord(
      scriptMeta(
        iteration,
        action.kind === "step" ? action.step : action.kind,
        {
          slug: action.slug,
          round: taskState.round,
        },
      ),
      {
        ok: false,
        cause,
        stop: { kind: "infra", cause: "crash", details: message },
      },
    );
  } catch (storeErr) {
    console.warn(
      `[factory] recordCrash: failed to record crash for "${action.slug}": ${crashMessage(storeErr)}; original crash: ${message}`,
    );
  }
  return cause;
}

interface ActiveHolds {
  /** Task slug -> the steer that holds it. First steer in file order wins. */
  slugs: Map<string, string>;
  /** The steer holding the whole goal, when one does. */
  goal?: string;
}

/**
 * A hold applies only while its steer is still pending: the architect answers a
 * steer at the boundary and moves it to processed, and the hold then expires
 * with it. This also keeps a hold file from surviving into later iterations.
 */
function activeHolds(holds: Hold[], pending: ReadonlySet<string>): ActiveHolds {
  const slugs = new Map<string, string>();
  let goal: string | undefined;
  for (const hold of holds) {
    if (!pending.has(hold.steer)) continue;
    if (hold.goal && goal === undefined) goal = hold.steer;
    for (const slug of hold.slugs) {
      if (!slugs.has(slug)) slugs.set(slug, hold.steer);
    }
  }
  return { slugs, goal };
}

/**
 * Names the steers whose slug holds still gate non-terminal work when dispatch
 * exhausts. A hold that voids every pending task ends the iteration early at
 * the boundary with this cause; a partial hold reports the same way.
 */
function heldBoundaryCause(
  hold: ActiveHolds,
  state: State,
): string | undefined {
  const bySteer = new Map<string, string[]>();
  for (const [slug, steer] of hold.slugs) {
    const status = state.tasks[slug]?.status;
    if (
      status === undefined ||
      status === "merged" ||
      status === "finished" ||
      status === "parked" ||
      status === "cancelled"
    )
      continue;
    const list = bySteer.get(steer) ?? [];
    list.push(slug);
    bySteer.set(steer, list);
  }
  if (bySteer.size === 0) return undefined;
  return [...bySteer.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([steer, slugs]) =>
        `steer: ${steer} holds ${[...slugs].sort().join(", ")}`,
    )
    .join("; ");
}

/**
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * overall, per-subscription and per-model turn limits; within a wave, order
 * comes from `deps` only. On an optional iteration limit — turns, wall clock
 * or dollars — the loop drains: a task that has not started this iteration
 * gets no turn, tasks already started finish their flow, in-flight work
 * settles, then the caller ends the iteration normally.
 */
export async function runDispatch(
  runtime: KernelRuntime,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const initialTasks = await runtime.store.listTasks();
  const initialRecords = await runtime.store.listRecords();
  const initial = derive(
    initialTasks,
    initialRecords,
    runtime.configs.process.flows,
  );
  const iteration = opts.iteration ?? Math.max(1, initial.iteration);
  let taskTurnsStarted = 0;
  let planCheck: "progress" | "architect" | undefined;
  const running = new Map<string, Running>();
  const started = new Set(
    initialRecords
      .filter((r) => r.iteration === iteration && r.actor === "agent" && r.slug)
      .map((r) => r.slug!),
  );
  // Infra stops are per slug for this iteration: the faulted task waits for the
  // next launch, independent work keeps going, and only an iteration where
  // nothing else is dispatchable ends as infra.
  const infra = new Map<string, string | undefined>();
  let cancelled = false;
  let drain: string | undefined;
  const usdLimit = runtime.limits.iterationUsd;

  // Only the ids the boundary actually read are the boundary's. A steer that
  // was not read there never reached the architect, so dispatch must not lose
  // it: it gets a PM steer turn on the first poll.
  const seenSteers = new Set(opts.seenSteers ?? []);
  /** Fresh files seen once but not yet stable: steer id -> last content hash. */
  const settling = new Map<string, string>();

  let holds: Hold[];
  try {
    ({ holds } = await readHolds(runtime.store, {
      knownSlugs: initialTasks.map((task) => task.slug),
    }));
  } catch (err) {
    // A hold file that cannot be read decides what may merge, so nothing is
    // dispatched this iteration; the launch surfaces the infra stop.
    return {
      reason: "infra",
      cause: `steer holds: ${(err as Error).message}`,
      turns: settledTurns(initialRecords, iteration),
      taskTurnsStarted: 0,
      allReadyHeld: false,
    };
  }

  /**
   * Polls the inbox between dispatch decisions, never inside a turn. A newly
   * seen batch gets one settle window for the whole batch; a still-growing
   * file is remembered by content hash and claimed only once that content
   * held across a later pass. The batch then gets exactly one PM turn; its
   * record lands before the caller reads records, so its dollars count against
   * the iteration brake.
   */
  const pollSteers = async (
    state: State,
    tasks: TaskFile[],
  ): Promise<{
    hold: ActiveHolds;
    steerTurn: boolean;
    holdError?: string;
    urgent?: string;
  }> => {
    const steers = await scanInbox(runtime.store, { settleMs: 0 });
    const pending = new Set(steers.map((steer) => steer.id));
    const urgent = steers.find((steer) => steer.urgent)?.id;
    if (cancelled)
      return { hold: activeHolds(holds, pending), steerTurn: false, urgent };
    // Urgency is the owner's exception: no PM turn, no claim. The steer stays
    // pending for the consult the next iteration opens, and the caller drains.
    if (urgent !== undefined)
      return { hold: activeHolds(holds, pending), steerTurn: false, urgent };

    const claim: Steer[] = [];
    const firstSight = steers.filter(
      (steer) => !seenSteers.has(steer.id) && !settling.has(steer.id),
    );
    const firstIds = new Set(firstSight.map((steer) => steer.id));
    if (firstSight.length > 0) {
      const settled = new Map(
        (await scanInbox(runtime.store)).map((steer) => [steer.id, steer]),
      );
      for (const steer of firstSight) {
        const stable = settled.get(steer.id);
        if (stable) claim.push(stable);
        else settling.set(steer.id, steer.hash);
      }
    }
    for (const steer of steers) {
      if (seenSteers.has(steer.id) || firstIds.has(steer.id)) continue;
      const before = settling.get(steer.id);
      if (before === undefined) continue;
      if (before === steer.hash) claim.push(steer);
      else settling.set(steer.id, steer.hash);
    }
    for (const steer of claim) {
      seenSteers.add(steer.id);
      settling.delete(steer.id);
    }
    if (claim.length === 0) {
      return { hold: activeHolds(holds, pending), steerTurn: false };
    }

    await runSteerPm(runtime, {
      iteration,
      state,
      tasks,
      steers: claim,
      cwd: runtime.paths.goalCheckout,
    });
    try {
      // The steer turn may have created tasks; validate holds against the files
      // on disk now, not the pre-turn list, so a hold naming a new task stands.
      const after = await runtime.store.listTasks();
      ({ holds } = await readHolds(runtime.store, {
        knownSlugs: after.map((task) => task.slug),
      }));
    } catch (err) {
      return {
        hold: activeHolds(holds, pending),
        steerTurn: true,
        holdError: `steer holds after ${claim.map((steer) => steer.id).join(", ")}: ${(err as Error).message}`,
      };
    }
    return { hold: activeHolds(holds, pending), steerTurn: true };
  };

  const start = (
    action: Action & { slug: string },
    taskState: TaskState,
    task: TaskFile,
    agent: boolean,
    quota?: { subscription?: string; model?: string },
  ): void => {
    const promise = (async () => {
      try {
        const result = await executeTaskAction(
          runtime,
          task,
          action,
          iteration,
          taskState,
        );
        const ended = agentStop(result);
        if (ended?.reason === "infra") infra.set(action.slug, ended.cause);
        else if (ended?.reason === "cancelled") cancelled = true;
      } catch (err) {
        infra.set(
          action.slug,
          await recordCrash(runtime, iteration, action, taskState, err),
        );
      }
    })().finally(() => {
      running.delete(action.slug);
    });
    running.set(action.slug, {
      promise,
      agent,
      subscription: quota?.subscription,
      model: quota?.model,
    });
    if (agent) started.add(action.slug);
    if (action.kind === "step") taskTurnsStarted += 1;
  };

  for (;;) {
    // Snapshot the running set before reading records: an action that finishes
    // during the reads is then still blocked, and one that is absent from the
    // snapshot has already written its records. Reading first and snapshotting
    // after can pair a stale state with an idle slug and dispatch it twice.
    const runningAtRead = new Set(running.keys());
    const tasks = await runtime.store.listTasks();
    const recordsBefore = await runtime.store.listRecords();
    const state = derive(tasks, recordsBefore, runtime.configs.process.flows);

    if (state.terminal) {
      await Promise.allSettled([...running.values()].map((r) => r.promise));
      const turns = settledTurns(recordsBefore, iteration);
      return {
        reason: "terminal",
        turns,
        taskTurnsStarted,
        allReadyHeld: false,
      };
    }

    const polled = await pollSteers(state, tasks);
    if (polled.holdError) {
      await Promise.allSettled([...running.values()].map((r) => r.promise));
      const turns = settledTurns(await runtime.store.listRecords(), iteration);
      return {
        reason: "infra",
        cause: polled.holdError,
        turns,
        taskTurnsStarted,
        allReadyHeld: false,
      };
    }
    const hold = polled.hold;
    // A steer PM turn is an agent record written after the first read; re-read
    // so it prices into this iteration's brake like every other PM turn.
    const records = polled.steerTurn
      ? await runtime.store.listRecords()
      : recordsBefore;
    const turnsUsed = settledTurns(records, iteration);

    let effectiveState = state;
    let effectiveTasks = tasks;
    if (polled.steerTurn) {
      effectiveTasks = await runtime.store.listTasks();
      effectiveState = derive(
        effectiveTasks,
        records,
        runtime.configs.process.flows,
      );
    }

    const agentCount = (): number =>
      [...running.values()].filter((r) => r.agent).length;
    const elapsedMs = Date.now() - iterationStart(records, iteration);
    const iterationWallMs = runtime.limits.iterationWallMs;
    if (!drain && !cancelled) {
      if (polled.urgent !== undefined) {
        // An urgent steer ends the iteration early: started work runs to the
        // end, nothing new starts, and the next consult sees the steer.
        drain = `steer: ${polled.urgent} marked urgent`;
      } else if (hold.goal !== undefined) {
        // A goal hold is a drain with a name: started tasks run their flow to
        // the end, nothing new starts, and the architect sees the remainder.
        // Parks happen only through the existing park causes, never from a hold.
        drain = `steer: ${hold.goal} goal hold`;
      } else if (
        runtime.limits.iterationTurns !== undefined &&
        turnsUsed >= runtime.limits.iterationTurns
      ) {
        drain = `iteration turn limit ${runtime.limits.iterationTurns} reached`;
      } else if (
        iterationWallMs !== undefined &&
        elapsedMs >= iterationWallMs
      ) {
        drain = `iteration wall limit ${iterationWallMs}ms reached`;
      } else if (usdLimit !== undefined) {
        const spent = iterationSpend(
          records,
          iteration,
          await loadPriceTable(runtime.priceSource),
          runtime.configs.run.priceIds,
        );
        if (spent >= usdLimit) {
          drain = `budget: iteration USD limit $${usdLimit.toFixed(4)} reached (spent $${spent.toFixed(4)})`;
        }
      }
    }

    const candidates = next(
      effectiveState,
      runtime.limits,
      runningAtRead,
    ).filter(
      (a): a is Action & { slug: string } =>
        a.kind !== "boundary" && a.kind !== "exit",
    );

    for (const action of candidates) {
      if (runningAtRead.has(action.slug) || running.has(action.slug)) continue;
      if (cancelled || infra.has(action.slug)) continue;
      // A signal raised while a turn was awaited must refuse the next start.
      // Draining here, per admission, closes the window a wave-top check misses.
      if (drain === undefined && opts.signals?.shouldStop()) {
        drain = "signal: drain requested";
      }
      const task = effectiveTasks.find((t) => t.slug === action.slug);
      if (!task) throw new Error(`action names unknown task "${action.slug}"`);
      const taskState = effectiveState.tasks[action.slug]!;

      // A hold is an admission filter only: it keeps an unstarted task from
      // starting and never parks or blocks a task mid-flow. Parks happen only
      // through the existing park causes, which stay allowed below.

      if (action.kind === "step") {
        if (drain && !started.has(action.slug)) continue;
        if (hold.slugs.has(action.slug) && !started.has(action.slug)) continue;
        if (
          !drain &&
          runtime.limits.iterationTurns !== undefined &&
          turnsUsed + agentCount() >= runtime.limits.iterationTurns
        ) {
          continue;
        }
        if (agentCount() >= runtime.limits.concurrency.overall) continue;
        // The target is already on the working tier: admission counts the pool
        // and model the turn will actually draw on, whichever harness that is.
        const target = stepTarget(
          runtime,
          task,
          taskState,
          action.step,
          iteration,
        );
        if (target.subscription !== undefined) {
          const poolLimit =
            runtime.limits.concurrency.perSubscription[target.subscription];
          if (poolLimit !== undefined) {
            const onPool = [...running.values()].filter(
              (r) => r.agent && r.subscription === target.subscription,
            ).length;
            if (onPool >= poolLimit) continue;
          }
        }
        const modelLimit = runtime.limits.concurrency.perModel[target.model.id];
        if (modelLimit !== undefined) {
          const onModel = [...running.values()].filter(
            (r) => r.agent && r.model === target.model.id,
          ).length;
          if (onModel >= modelLimit) continue;
        }
        start(action, taskState, task, true, {
          subscription: target.subscription,
          model: target.model.id,
        });
        continue;
      }

      if (action.kind === "checks" || action.kind === "merge") {
        if (drain && !started.has(action.slug) && taskState.turns === 0)
          continue;
        if (
          hold.slugs.has(action.slug) &&
          !started.has(action.slug) &&
          taskState.turns === 0
        )
          continue;
        start(action, taskState, task, false);
        continue;
      }

      // Park and finish are terminal script steps of an item; they never
      // start work, so they are allowed even while draining.
      try {
        const result = await executeTaskAction(
          runtime,
          task,
          action,
          iteration,
          taskState,
        );
        const ended = agentStop(result);
        if (ended?.reason === "infra") infra.set(action.slug, ended.cause);
        else if (ended?.reason === "cancelled") cancelled = true;
      } catch (err) {
        infra.set(
          action.slug,
          await recordCrash(runtime, iteration, action, taskState, err),
        );
      }
    }

    if (running.size === 0) {
      // A task seen running at the snapshot may have settled during the reads:
      // its fresh records are visible but its slug was excluded above. Re-derive
      // instead of reporting boundary with dispatchable work on disk.
      if (runningAtRead.size > 0) continue;
      if (cancelled)
        return {
          reason: "cancelled",
          turns: turnsUsed,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      if (infra.size > 0) {
        const causes = [...infra.entries()].map(([slug, cause]) =>
          cause ? `${slug}: ${cause}` : slug,
        );
        return {
          reason: "infra",
          cause: causes.join("; "),
          turns: turnsUsed,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      }
      if (drain)
        return {
          reason: "drained",
          cause: drain,
          turns: turnsUsed,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      // Wave end: the steward owns remaining merge conflicts. A wave that did
      // work re-derives (landed merges unblock deps); a skipped or held wave
      // is the boundary.
      let steward: Awaited<ReturnType<typeof runSteward>>;
      try {
        steward = await runSteward(runtime, iteration);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        const turns = settledTurns(
          await runtime.store.listRecords(),
          iteration,
        );
        return {
          reason: "infra",
          cause: `steward: ${cause}`,
          turns,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      }
      if (steward.infra) {
        const turns = settledTurns(
          await runtime.store.listRecords(),
          iteration,
        );
        return {
          reason: "infra",
          cause: steward.infra.cause,
          turns,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      }
      if (steward.cancelled) {
        const turns = settledTurns(
          await runtime.store.listRecords(),
          iteration,
        );
        return {
          reason: "cancelled",
          turns,
          taskTurnsStarted,
          allReadyHeld: false,
        };
      }
      if (!steward.skipped) continue;
      // Zero-merge stall: the dispatch set ran out with no merges and fresh
      // parks, and no drain caused it. The PM owns the dispatch sets, so one
      // stall turn resolves it in this iteration; a second stall, an
      // all-left turn, or any drain falls through to the boundary as today.
      // Owner ruling 2.
      if (!opts.signals?.shouldStop()) {
        const stallTasks = await runtime.store.listTasks();
        const stallRecords = await runtime.store.listRecords();
        const stallState = derive(
          stallTasks,
          stallRecords,
          runtime.configs.process.flows,
        );
        const merges = stallRecords.filter(
          (record) =>
            record.iteration === iteration &&
            record.step === "merge" &&
            record.ok === true &&
            record.endedAt,
        ).length;
        const attempted = stallRecords.some(
          (record) =>
            record.iteration === iteration &&
            record.step === STALL_ROUTES_STEP &&
            record.endedAt,
        );
        if (merges === 0 && !attempted) {
          const slugs = [
            ...new Set(
              stallRecords
                .filter(
                  (record) =>
                    record.iteration === iteration &&
                    record.step === "park" &&
                    record.endedAt &&
                    record.slug &&
                    stallState.tasks[record.slug]?.status === "parked",
                )
                .map((record) => record.slug!),
            ),
          ].sort();
          if (slugs.length > 0) {
            const stalled = await runStallPm(runtime, {
              iteration,
              state: stallState,
              slugs,
              cwd: runtime.paths.goalCheckout,
            });
            if (stalled.continued.length > 0) continue;
          }
        }
      }
      // Plan check: the dispatch set ran out short of terminal. A task-tier
      // checker verifies the plan against the repo; on `progress` the PM
      // writes the follow-ups and dispatch resumes in this iteration, and
      // the checker re-runs after. `architect`, an empty follow-up list, a
      // failed PM turn, or exhausted rounds fall through to the boundary,
      // whose pack carries the checker's evidence per plan item. Without a
      // plan there is nothing to verify, so the front path dispatches as
      // before instead of spending a checker turn. The alias is required by
      // pre-flight, so only the plan's presence gates this step.
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      if (!opts.signals?.shouldStop() && fs.existsSync(planPath)) {
        const checkTasks = await runtime.store.listTasks();
        const checkRecords = await runtime.store.listRecords();
        const checkState = derive(
          checkTasks,
          checkRecords,
          runtime.configs.process.flows,
        );
        const rounds = checkRecords.filter(
          (record) =>
            record.iteration === iteration &&
            record.step === PLAN_CHECK_STEP &&
            record.actor === "agent" &&
            record.endedAt,
        ).length;
        if (rounds < runtime.limits.planCheckRounds) {
          const checked = await runPlanCheck(runtime, {
            iteration,
            round: rounds + 1,
            state: checkState,
          });
          planCheck = checked.verdict;
          if (
            !checked.infra &&
            checked.verdict === "progress" &&
            checked.followUps.length > 0
          ) {
            const followed = await runPlanCheckPm(runtime, {
              iteration,
              state: checkState,
              followUps: checked.followUps,
              cwd: runtime.paths.goalCheckout,
            });
            if (followed.continued.length > 0) continue;
          }
        } else {
          planCheck = latestPlanCheck(checkRecords)?.verdict as
            | "progress"
            | "architect"
            | undefined;
        }
      }
      const turns = settledTurns(await runtime.store.listRecords(), iteration);
      const heldCause = heldBoundaryCause(hold, state);
      return heldCause
        ? {
            reason: "boundary",
            cause: heldCause,
            turns,
            taskTurnsStarted,
            planCheck,
            allReadyHeld: true,
          }
        : {
            reason: "boundary",
            turns,
            taskTurnsStarted,
            planCheck,
            allReadyHeld: false,
          };
    }
    await Promise.race([...running.values()].map((r) => r.promise));
  }
}
