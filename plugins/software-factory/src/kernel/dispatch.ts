import { derive } from "./derive.js";
import { executeTaskAction, type TaskActionResult } from "./flow.js";
import { stepTarget } from "./flow-context.js";
import { readHolds, scanInbox, type Hold } from "./mailbox.js";
import { next } from "./next.js";
import { runSteerPm } from "./pm.js";
import { pricedRecord, type PriceTable } from "./pricing.js";
import { appendPark } from "./record.js";
import type { Action, KernelRuntime, State, StepRecord, TaskFile, TaskState } from "./types.js";
import type { MergeResult } from "./integrate.js";

export interface DispatchResult {
  reason: "boundary" | "drained" | "terminal" | "infra" | "cancelled";
  cause?: string;
  /** Completed agent turns in this iteration. */
  turns: number;
}

interface Running {
  promise: Promise<void>;
  scope: readonly string[];
  agent: boolean;
  harnessId?: string;
}

/** The literal path prefix of a glob; two scopes can only collide inside theirs. */
function literalPrefix(pattern: string): string {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  const wildcard = normalized.search(/[*?[{]/);
  return wildcard === -1 ? normalized : normalized.slice(0, wildcard);
}

function prefixContains(outer: string, inner: string): boolean {
  if (outer === inner) return true;
  const dir = outer.endsWith("/") ? outer : `${outer}/`;
  return inner.startsWith(dir);
}

/** Conservative glob-glob overlap: `src/**` overlaps `src/a.ts`, never `src/ab.ts`. */
export function scopesOverlap(a: readonly string[], b: readonly string[]): boolean {
  for (const left of a) {
    for (const right of b) {
      const la = literalPrefix(left);
      const lb = literalPrefix(right);
      if (la === "" || lb === "") return true;
      if (prefixContains(la, lb) || prefixContains(lb, la)) return true;
    }
  }
  return false;
}

function overlapsRunning(scope: readonly string[], running: ReadonlyMap<string, Running>): boolean {
  if (scope.length === 0) return false;
  for (const entry of running.values()) {
    if (scopesOverlap(scope, entry.scope)) return true;
  }
  return false;
}

/** Agent turns charged to the item budget; boundary roles and infra stops are free. */
function settledTurns(records: StepRecord[], iteration: number): number {
  return records.filter(
    (r) =>
      r.iteration === iteration &&
      r.actor === "agent" &&
      r.endedAt &&
      r.slug !== undefined &&
      r.step !== "architect" &&
      r.step !== "pm" &&
      r.stop?.kind !== "infra"
  ).length;
}

function iterationStart(records: StepRecord[], iteration: number): number {
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
function iterationSpend(records: StepRecord[], iteration: number, prices: PriceTable): number {
  let usd = 0;
  for (const rec of records) {
    if (rec.iteration !== iteration || rec.actor !== "agent" || !rec.endedAt) continue;
    const cost = pricedRecord(rec, prices).usage.costUsd;
    if (cost !== undefined) usd += cost;
  }
  return usd;
}

function agentStop(result: TaskActionResult | MergeResult): { reason: "infra" | "cancelled"; cause?: string } | undefined {
  if ("infra" in result && result.infra) return { reason: "infra", cause: result.infra.cause };
  if ("cancelled" in result && result.cancelled) return { reason: "cancelled" };
  return undefined;
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
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * absolute and per-harness turn limits and never starts two tasks whose scopes
 * touch. On an optional iteration limit — turns, wall clock or dollars — the
 * loop drains: a task that has not started this iteration gets no turn, tasks
 * already started finish their flow, in-flight work settles, then the caller
 * ends the iteration normally.
 */
export async function runDispatch(
  runtime: KernelRuntime,
  opts: { iteration?: number } = {}
): Promise<DispatchResult> {
  const initialTasks = await runtime.store.listTasks();
  const initialRecords = await runtime.store.listRecords();
  const initial = derive(initialTasks, initialRecords, runtime.configs.process.flows);
  const iteration = opts.iteration ?? Math.max(1, initial.iteration);
  const running = new Map<string, Running>();
  const started = new Set(
    initialRecords
      .filter((r) => r.iteration === iteration && r.actor === "agent" && r.slug)
      .map((r) => r.slug!)
  );
  // Infra stops are per slug for this iteration: the faulted task waits for the
  // next launch, independent work keeps going, and only an iteration where
  // nothing else is dispatchable ends as infra.
  const infra = new Map<string, string | undefined>();
  let cancelled = false;
  let drain: string | undefined;
  const usdLimit = runtime.limits.iterationUsd;

  // Steers already in the inbox when dispatch starts are the boundary's: the
  // architect saw them and only the architect marks them processed. Only drops
  // after this point get a mid-run PM turn, so a boundary steer never triggers
  // a second PM consult in the same iteration.
  const steersAtStart = await scanInbox(runtime.store, { settleMs: 0 });
  const seenSteers = new Set(steersAtStart.map((steer) => steer.id));
  let holds = await readHolds(runtime.store);

  /**
   * Polls the inbox between dispatch decisions, never inside a turn. New
   * steers get exactly one PM turn for the batch; its record lands before the
   * caller reads records, so its dollars count against the iteration brake.
   */
  const pollSteers = async (
    state: State,
    tasks: TaskFile[]
  ): Promise<{ hold: ActiveHolds; steerTurn: boolean }> => {
    const steers = await scanInbox(runtime.store, { settleMs: 0 });
    const pending = new Set(steers.map((steer) => steer.id));
    const fresh = steers.filter((steer) => !seenSteers.has(steer.id));
    for (const steer of fresh) seenSteers.add(steer.id);
    if (cancelled || fresh.length === 0) {
      return { hold: activeHolds(holds, pending), steerTurn: false };
    }
    await runSteerPm(runtime, { iteration, state, tasks, steers: fresh, cwd: runtime.paths.goalCheckout });
    holds = await readHolds(runtime.store);
    return { hold: activeHolds(holds, pending), steerTurn: true };
  };

  const start = (action: Action & { slug: string }, taskState: TaskState, task: TaskFile, agent: boolean, harnessId?: string): void => {
    const promise = (async () => {
      const result = await executeTaskAction(runtime, task, action, iteration, taskState);
      const ended = agentStop(result);
      if (ended?.reason === "infra") infra.set(action.slug, ended.cause);
      else if (ended?.reason === "cancelled") cancelled = true;
    })().finally(() => {
      running.delete(action.slug);
    });
    running.set(action.slug, { promise, scope: task.scope, agent, harnessId });
    if (agent) started.add(action.slug);
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
      return { reason: "terminal", turns };
    }

    const polled = await pollSteers(state, tasks);
    const hold = polled.hold;
    // A steer PM turn is an agent record written after the first read; re-read
    // so it prices into this iteration's brake like every other PM turn.
    const records = polled.steerTurn ? await runtime.store.listRecords() : recordsBefore;
    const turnsUsed = settledTurns(records, iteration);

    const agentCount = (): number => [...running.values()].filter((r) => r.agent).length;
    const elapsedMs = Date.now() - iterationStart(records, iteration);
    if (!drain && !cancelled) {
      if (hold.goal !== undefined) {
        // A goal hold is a drain with a name: in-flight steps settle unmerged,
        // nothing new starts, and the architect sees the remainder.
        drain = `steer: ${hold.goal} goal hold`;
      } else if (runtime.limits.iterationTurns !== undefined && turnsUsed >= runtime.limits.iterationTurns) {
        drain = `iteration turn limit ${runtime.limits.iterationTurns} reached`;
      } else if (
        runtime.limits.iterationWallMs !== undefined &&
        elapsedMs >= runtime.limits.iterationWallMs
      ) {
        drain = `iteration wall limit ${runtime.limits.iterationWallMs}ms reached`;
      } else if (usdLimit !== undefined) {
        const spent = iterationSpend(records, iteration, runtime.configs.run.prices ?? {});
        if (spent >= usdLimit) {
          drain = `budget: iteration USD limit $${usdLimit.toFixed(4)} reached (spent $${spent.toFixed(4)})`;
        }
      }
    }

    const candidates = next(state, runtime.limits, runningAtRead).filter(
      (a): a is Action & { slug: string } => a.kind !== "boundary" && a.kind !== "exit"
    );

    for (const action of candidates) {
      if (runningAtRead.has(action.slug) || running.has(action.slug)) continue;
      if (cancelled || infra.has(action.slug)) continue;
      const task = tasks.find((t) => t.slug === action.slug);
      if (!task) throw new Error(`action names unknown task "${action.slug}"`);
      const taskState = state.tasks[action.slug]!;

      // A held task that has not run this iteration waits for the architect;
      // one that has finishes its in-flight step first, then parks unmerged.
      // A park the task earned itself runs with its own cause: the steer did
      // not stop it, and the architect needs the reason the task stopped.
      const heldBySteer = hold.goal ?? hold.slugs.get(action.slug);
      if (heldBySteer !== undefined && action.kind !== "park") {
        if (started.has(action.slug)) {
          await appendPark(
            runtime.store,
            { iteration, slug: action.slug, round: taskState.round },
            `steer: ${heldBySteer}`
          );
        }
        continue;
      }

      if (action.kind === "step") {
        if (drain && !started.has(action.slug)) continue;
        if (!drain && runtime.limits.iterationTurns !== undefined && turnsUsed + agentCount() >= runtime.limits.iterationTurns) {
          continue;
        }
        if (agentCount() >= runtime.limits.concurrency) continue;
        const target = stepTarget(runtime, task, taskState, action.step);
        const limit = runtime.limits.perHarness[target.harness.id];
        if (limit !== undefined) {
          const onHarness = [...running.values()].filter(
            (r) => r.agent && r.harnessId === target.harness.id
          ).length;
          if (onHarness >= limit) continue;
        }
        if (overlapsRunning(task.scope, running)) continue;
        start(action, taskState, task, true, target.harness.id);
        continue;
      }

      if (action.kind === "checks" || action.kind === "merge") {
        if (drain && !started.has(action.slug) && taskState.turns === 0) continue;
        if (overlapsRunning(task.scope, running)) continue;
        start(action, taskState, task, false);
        continue;
      }

      // Park and finish are terminal script steps of an item; they never
      // start work, so they are allowed even while draining.
      const result = await executeTaskAction(runtime, task, action, iteration, taskState);
      const ended = agentStop(result);
      if (ended?.reason === "infra") infra.set(action.slug, ended.cause);
      else if (ended?.reason === "cancelled") cancelled = true;
    }

    if (running.size === 0) {
      // A task seen running at the snapshot may have settled during the reads:
      // its fresh records are visible but its slug was excluded above. Re-derive
      // instead of reporting boundary with dispatchable work on disk.
      if (runningAtRead.size > 0) continue;
      if (cancelled) return { reason: "cancelled", turns: turnsUsed };
      if (infra.size > 0) {
        const causes = [...infra.entries()].map(([slug, cause]) => (cause ? `${slug}: ${cause}` : slug));
        return { reason: "infra", cause: causes.join("; "), turns: turnsUsed };
      }
      if (drain) return { reason: "drained", cause: drain, turns: turnsUsed };
      return { reason: "boundary", turns: turnsUsed };
    }
    await Promise.race([...running.values()].map((r) => r.promise));
  }
}
