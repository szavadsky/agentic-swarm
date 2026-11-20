/**
 * Starting one dispatch action: the transient-fault quarantine, the async
 * agent turn with its completion hook, and the terminal script steps.
 */
import { isTransientInfraCause } from "../harness/fallback.js";
import { makeCause } from "./cause.js";
import type { DispatchState, InfraFault } from "./dispatch-state.js";
import type { TaskActionResult } from "./flow.js";
import { executeTaskAction } from "./flow.js";
import type { MergeResult } from "./integrate.js";
import { scriptMeta } from "./record.js";
import type { Action, TaskFile, TaskState } from "./types.js";

/**
 * Re-dispatch delays for a task whose tiers all ended on transient infra, in
 * order. The harness already retried each tier inside its own policy; these are
 * the wave's remaining chances to keep the iteration alive before the fault
 * names the launch stop.
 */
export const INFRA_REDISPATCH_DELAYS_MS: readonly number[] = [1_000, 2_000];

type EndedAction =
  | { reason: "infra"; cause: string; details?: string }
  | { reason: "cancelled" }
  | undefined;

function agentStop(result: TaskActionResult | MergeResult): EndedAction {
  if ("infra" in result && result.infra) {
    return {
      reason: "infra",
      cause: result.infra.cause,
      ...(result.infra.details ? { details: result.infra.details } : {}),
    };
  }
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
  state: DispatchState,
  action: Action & { slug: string },
  taskState: TaskState,
  err: unknown,
): Promise<string> {
  const message = crashMessage(err);
  const cause = `crash: ${message}`;
  try {
    await state.runtime.store.appendRecord(
      scriptMeta(
        state.iteration,
        action.kind === "step" ? action.step : action.kind,
        { slug: action.slug, round: taskState.round },
      ),
      {
        ok: false,
        cause: makeCause("error", cause),
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

/**
 * Records one fault for its slug. A transient cause earns the next backoff;
 * once every delay is spent, or for auth/crash/timeout/overflow, the slug is
 * frozen for the launch.
 */
export function noteInfra(
  state: DispatchState,
  slug: string,
  cause: string,
  details?: string,
): void {
  const retries = state.infra.get(slug)?.retries ?? 0;
  const fault: InfraFault = {
    cause: details ? `${cause}: ${details}` : cause,
    retries,
    due: false,
    retry:
      isTransientInfraCause(cause) &&
      retries < INFRA_REDISPATCH_DELAYS_MS.length,
  };
  state.infra.set(slug, fault);
}

/** A due retry is dispatchable; a frozen or unpaid backoff is not. */
export function dispatchable(state: DispatchState, slug: string): boolean {
  const fault = state.infra.get(slug);
  return fault === undefined || fault.due;
}

function settleEnded(
  state: DispatchState,
  slug: string,
  ended: EndedAction,
): void {
  if (ended?.reason === "infra")
    noteInfra(state, slug, ended.cause, ended.details);
  else if (ended?.reason === "cancelled") state.cancelled = true;
  else state.infra.delete(slug);
}

async function executeAndRecord(
  state: DispatchState,
  action: Action & { slug: string },
  taskState: TaskState,
  task: TaskFile,
): Promise<void> {
  try {
    const result = await executeTaskAction(
      state.runtime,
      task,
      action,
      state.iteration,
      taskState,
    );
    settleEnded(state, action.slug, agentStop(result));
  } catch (err) {
    noteInfra(
      state,
      action.slug,
      await recordCrash(state, action, taskState, err),
    );
  }
}

/** Starts an async turn; its promise settles the slug's quarantine when done. */
export function startAction(
  state: DispatchState,
  action: Action & { slug: string },
  taskState: TaskState,
  task: TaskFile,
  agent: boolean,
  quota?: { subscription?: string; model?: string },
): void {
  const promise = executeAndRecord(state, action, taskState, task).finally(
    () => {
      state.running.delete(action.slug);
    },
  );
  state.running.set(action.slug, {
    promise,
    agent,
    subscription: quota?.subscription,
    model: quota?.model,
  });
  if (agent) state.started.add(action.slug);
  if (action.kind === "step") state.taskTurnsStarted += 1;
}

/** Park and finish are terminal script steps: they never start work, so they run while draining. */
export async function runTerminalAction(
  state: DispatchState,
  action: Action & { slug: string },
  taskState: TaskState,
  task: TaskFile,
): Promise<void> {
  await executeAndRecord(state, action, taskState, task);
}
