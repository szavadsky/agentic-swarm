/**
 * The flow facade: the dispatch action entry point and what dispatch may read
 * from a step's result. The step's phases live in `flow-step.ts` and
 * `flow-turn.ts`; gates, checks, timeouts and result contracts each have their
 * own `flow-*.ts` module.
 */

import { runChecks } from "./flow-checks.js";
import { findStep, flowOf } from "./flow-context.js";
import { taskMeta } from "./flow-meta.js";
import type { TaskActionResult } from "./flow-state.js";
import { runStep } from "./flow-step.js";
import { type MergeResult, mergeTask } from "./integrate.js";
import { appendFinish, appendPark } from "./record.js";
import type { Action, KernelRuntime, TaskFile, TaskState } from "./types.js";

export type { TaskActionResult } from "./flow-state.js";
export { TIMEOUT_SETTLE_GRACE_MS } from "./flow-timeouts.js";

/** Executes one dispatch action; every script step writes its own record. */
export async function executeTaskAction(
  runtime: KernelRuntime,
  task: TaskFile,
  action: Action,
  iteration: number,
  state: TaskState,
): Promise<TaskActionResult | MergeResult> {
  if (action.kind === "step") {
    const flow = flowOf(runtime, task);
    const step = findStep(flow, action.step);
    return runStep({ runtime, task, state, iteration, step, flow });
  }
  if (action.kind === "checks") {
    return runChecks(runtime, task, state, iteration);
  }
  if (action.kind === "merge") {
    return mergeTask(runtime, task, iteration, state);
  }
  if (action.kind === "finish") {
    await appendFinish(
      runtime.store,
      taskMeta(task, state, iteration),
      task,
      state.commit,
    );
    return {};
  }
  if (action.kind === "park") {
    await appendPark(
      runtime.store,
      taskMeta(task, state, iteration),
      action.cause,
    );
    return {};
  }
  return {};
}
