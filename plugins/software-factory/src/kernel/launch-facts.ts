/**
 * What one launch iteration reports and how it names its stop: the status
 * derived from the launch result, the metrics/summary/epic files written from
 * that same derived state, and the goal facts a front path records. The goal
 * orchestration reads these; none of them turn a turn.
 */
import { derive, FRONT_STOP_STEP } from "./derive.js";
import { writeEpicSummaries } from "./epic-summary.js";
import { rolesByStep, writeMetrics } from "./metrics.js";
import { loadPriceTable } from "./openrouter.js";
import { scriptMeta } from "./record.js";
import { statusSource, writeStatus } from "./status.js";
import { writeIterationSummary } from "./summary.js";
import type { Cause, GoalDecision, KernelRuntime, State } from "./types.js";

/** Tasks a front path dispatched that did not land, as `slug status`. */
export function unfinishedTasks(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(
      ([, task]) => task.status !== "merged" && task.status !== "finished",
    )
    .map(([slug, task]) => `${slug} ${task.status}`);
}

/** Non-terminal tasks, as `slug status`: work the goal still owes. */
export function openTasks(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => task.status === "pending" || task.status === "ready")
    .map(([slug, task]) => `${slug} ${task.status}`)
    .sort();
}

/**
 * A front trivial/task goal has no architect turn, so the front path's stop is
 * the recorded goal decision: `derive` reads it as the one source of truth.
 */
export async function recordFrontStop(
  store: KernelRuntime["store"],
  iteration: number,
  decision: GoalDecision,
  summary: string,
): Promise<void> {
  await store.appendRecord(scriptMeta(iteration, FRONT_STOP_STEP), {
    ok: true,
    outcome: {
      status: decision === "done" ? "done" : "blocked",
      summary,
      concerns: [],
      forward: [],
      decision,
    },
  });
}

/** The classified cause plus the scrubbed error tail, as the boundary reports it. */
export function infraCause(stop: { cause: string; details?: string }): string {
  return stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
}

/**
 * The iteration status follows the launch result, not the architect's claim.
 * A done refused for an open epic (derive stays active) reports in-progress,
 * so the summary's distance explains why the goal continues. Infra and signal
 * stops win over any decision; a front-path blocked stop (unfinished tasks,
 * not a user block) reports stopped-with-debt.
 */
export function statusForIteration(opts: {
  decision: GoalDecision;
  ended: "infra" | "cancelled" | undefined;
  stopped: boolean;
  signalsStopped: boolean;
  goal: State["goal"];
}): "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt" {
  if (opts.ended === "infra") return "stopped-with-debt";
  if (opts.signalsStopped || opts.stopped) return "stopped-with-debt";
  if (opts.decision === "done")
    return opts.goal === "done" ? "goal-met" : "in-progress";
  if (opts.decision === "blocked") return "blocked-by-user";
  if (opts.goal === "done") return "goal-met";
  if (opts.goal === "blocked") return "stopped-with-debt";
  return "in-progress";
}

/** Writes the iteration's metrics, summary, epic summaries and status; returns the summary text. */
export async function writeIterationFacts(
  runtime: KernelRuntime,
  iteration: number,
  status: "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt",
  humanInterventions: number,
  cause?: Cause,
): Promise<string> {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const roleByStep = rolesByStep(runtime.configs.process.flows);
  const prices = await loadPriceTable(runtime.priceSource);
  const priceIds = runtime.configs.run.priceIds;
  await writeMetrics(runtime.store, {
    iteration,
    status,
    records,
    state,
    roleByStep,
    prices,
    priceIds,
    humanInterventions,
  });
  const summary = await writeIterationSummary(runtime.store, {
    iteration,
    state,
    records,
    status,
    cause,
    roleByStep,
    prices,
    priceIds,
    humanInterventions,
  });
  await writeEpicSummaries(runtime.store, { iteration, state, records });
  await writeStatus(statusSource(runtime));
  return summary;
}

export async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  humanInterventions: number,
  cause?: Cause,
): Promise<void> {
  try {
    await writeIterationFacts(
      runtime,
      iteration,
      "stopped-with-debt",
      humanInterventions,
      cause,
    );
  } catch {
    // The launch error is the useful one; a broken store cannot report.
  }
}
