import { derive } from "./derive.js";
import { executeTaskAction, type TaskActionResult } from "./flow.js";
import { stepTarget } from "./flow-context.js";
import { next } from "./next.js";
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

function agentStop(result: TaskActionResult | MergeResult): { reason: "infra" | "cancelled"; cause?: string } | undefined {
  if ("infra" in result && result.infra) return { reason: "infra", cause: result.infra.cause };
  if ("cancelled" in result && result.cancelled) return { reason: "cancelled" };
  return undefined;
}

/**
 * The dispatch loop: `next` proposes, this loop admits. Admission holds the
 * absolute and per-harness turn limits and never starts two tasks whose scopes
 * touch. On an optional iteration limit the loop drains: no new turns, in-flight
 * work finishes, then the caller ends the iteration normally.
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
  let stop: { reason: "infra" | "cancelled"; cause?: string } | undefined;
  let drain: string | undefined;

  const start = (action: Action & { slug: string }, taskState: TaskState, task: TaskFile, agent: boolean, harnessId?: string): void => {
    const promise = (async () => {
      const result = await executeTaskAction(runtime, task, action, iteration, taskState);
      const ended = agentStop(result);
      if (ended) stop = ended;
    })().finally(() => {
      running.delete(action.slug);
    });
    running.set(action.slug, { promise, scope: task.scope, agent, harnessId });
    if (agent) started.add(action.slug);
  };

  for (;;) {
    const tasks = await runtime.store.listTasks();
    const records = await runtime.store.listRecords();
    const state = derive(tasks, records, runtime.configs.process.flows);
    const turnsUsed = records.filter(
      (r) => r.iteration === iteration && r.actor === "agent" && r.endedAt
    ).length;

    if (state.terminal) {
      await Promise.allSettled([...running.values()].map((r) => r.promise));
      return { reason: "terminal", turns: turnsUsed };
    }

    const agentCount = (): number => [...running.values()].filter((r) => r.agent).length;
    const elapsedMs = Date.now() - iterationStart(records, iteration);
    if (!drain && !stop) {
      if (runtime.limits.iterationTurns !== undefined && turnsUsed >= runtime.limits.iterationTurns) {
        drain = `iteration turn limit ${runtime.limits.iterationTurns} reached`;
      } else if (
        runtime.limits.iterationWallMs !== undefined &&
        elapsedMs >= runtime.limits.iterationWallMs
      ) {
        drain = `iteration wall limit ${runtime.limits.iterationWallMs}ms reached`;
      }
    }

    const candidates = next(state, runtime.limits, new Set(running.keys())).filter(
      (a): a is Action & { slug: string } => a.kind !== "boundary" && a.kind !== "exit"
    );

    for (const action of candidates) {
      if (running.has(action.slug)) continue;
      const task = tasks.find((t) => t.slug === action.slug);
      if (!task) throw new Error(`action names unknown task "${action.slug}"`);
      const taskState = state.tasks[action.slug]!;

      if (action.kind === "step") {
        if (stop) continue;
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
        if (stop) continue;
        if (drain && !started.has(action.slug) && taskState.turns === 0) continue;
        if (overlapsRunning(task.scope, running)) continue;
        start(action, taskState, task, false);
        continue;
      }

      // Park and finish are terminal script steps of an item; they never
      // start work, so they are allowed even while draining.
      const result = await executeTaskAction(runtime, task, action, iteration, taskState);
      const ended = agentStop(result);
      if (ended) stop = ended;
    }

    if (running.size === 0) {
      if (stop) return { reason: stop.reason, cause: stop.cause, turns: turnsUsed };
      if (drain) return { reason: "drained", cause: drain, turns: turnsUsed };
      return { reason: "boundary", turns: turnsUsed };
    }
    await Promise.race([...running.values()].map((r) => r.promise));
  }
}
