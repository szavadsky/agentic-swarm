import { iterationUsdBrake } from "./config.js";
import { derive } from "./derive.js";
import { executeTaskAction, type TaskActionResult } from "./flow.js";
import { stepTarget } from "./flow-context.js";
import { next } from "./next.js";
import { priceUsage, type PriceTable } from "./pricing.js";
import type { Action, KernelRuntime, StepRecord, TaskFile, TaskState } from "./types.js";
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

function iterationStart(records: StepRecord[], iteration: number): number {
  const times = records
    .filter((r) => r.iteration === iteration)
    .map((r) => Date.parse(r.startedAt))
    .filter((n) => Number.isFinite(n));
  return times.length > 0 ? Math.min(...times) : Date.now();
}

/**
 * Dollars this iteration has already spent: every settled agent record priced
 * through `priceUsage`. A turn whose cost is unknown adds $0 — the brake treats
 * it as free because it has nothing better to go on, and the summary reports
 * how many turns were blind.
 */
function iterationSpend(records: StepRecord[], iteration: number, prices: PriceTable): number {
  let usd = 0;
  for (const rec of records) {
    if (rec.iteration !== iteration || rec.actor !== "agent" || !rec.endedAt) continue;
    const cost = rec.usage ? priceUsage(rec.usage, rec.model?.id ?? "", prices) : undefined;
    if (cost !== undefined) usd += cost;
  }
  return usd;
}

function agentStop(result: TaskActionResult | MergeResult): { reason: "infra" | "cancelled"; cause?: string } | undefined {
  if ("infra" in result && result.infra) return { reason: "infra", cause: result.infra.cause };
  if ("cancelled" in result && result.cancelled) return { reason: "cancelled" };
  return undefined;
}

/**
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * absolute and per-harness turn limits and never starts two tasks whose scopes
 * touch. On an optional iteration limit — turns, wall clock or dollars — the
 * loop drains: no new turns, in-flight work finishes, then the caller ends the
 * iteration normally.
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
  const usdLimit = iterationUsdBrake(runtime.configs);

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
    const records = await runtime.store.listRecords();
    const state = derive(tasks, records, runtime.configs.process.flows);
    const turnsUsed = records.filter(
      (r) =>
        r.iteration === iteration &&
        r.actor === "agent" &&
        r.endedAt &&
        r.slug !== undefined &&
        r.step !== "architect" &&
        r.step !== "pm" &&
        r.stop?.kind !== "infra"
    ).length;

    if (state.terminal) {
      await Promise.allSettled([...running.values()].map((r) => r.promise));
      return { reason: "terminal", turns: turnsUsed };
    }

    const agentCount = (): number => [...running.values()].filter((r) => r.agent).length;
    const elapsedMs = Date.now() - iterationStart(records, iteration);
    if (!drain && !cancelled) {
      if (runtime.limits.iterationTurns !== undefined && turnsUsed >= runtime.limits.iterationTurns) {
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

      if (action.kind === "step") {
        if (drain && !started.has(action.slug)) continue;
        if (!drain && runtime.limits.iterationTurns !== undefined && turnsUsed + agentCount() >= runtime.limits.iterationTurns) {
          continue;
        }
        if (agentCount() >= runtime.limits.concurrency) continue;
        const target = stepTarget(runtime, task, taskState, action.step);
        const limit = runtime.limits.perHarness[target.harnessId];
        if (limit !== undefined) {
          const onHarness = [...running.values()].filter(
            (r) => r.agent && r.harnessId === target.harnessId
          ).length;
          if (onHarness >= limit) continue;
        }
        if (overlapsRunning(task.scope, running)) continue;
        start(action, taskState, task, true, target.harnessId);
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
