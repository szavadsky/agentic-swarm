import { makeCause } from "./cause.js";
import { DECIDE_STEP } from "./pending-signal.js";
import { agentSteps } from "./review.js";
import type {
  Action,
  Cause,
  FlowDefinition,
  Limits,
  State,
  TaskState,
} from "./types.js";

function park(slug: string, cause: Cause): Action {
  return { kind: "park", slug, cause };
}

function isTerminalStatus(task: TaskState): boolean {
  return (
    task.status === "merged" ||
    task.status === "finished" ||
    task.status === "parked" ||
    task.status === "cancelled"
  );
}

function phaseAction(task: TaskState, slug: string): Action | undefined {
  if (task.phase === "checks") return { kind: "checks", slug };
  if (task.phase === "merge") return { kind: "merge", slug };
  if (task.phase === "resolve")
    return { kind: "step", slug, step: "resolve", round: task.round };
  if (task.phase === "finish") return { kind: "finish", slug };
  if (task.phase === "done" || task.phase === "parked")
    return park(
      slug,
      makeCause("stuck", `no next action for phase "${task.phase}"`),
    );
  return undefined;
}

function agentStepAction(
  task: TaskState,
  slug: string,
  flow: FlowDefinition,
): Action {
  const step = agentSteps(flow).find((s) => s.id === task.phase);
  if (!step)
    return park(
      slug,
      makeCause("stuck", `flow "${task.flow}" has no step "${task.phase}"`),
    );
  // A spent round bound raises a signal in derive, never a park here: the
  // decider owns the limit.
  return { kind: "step", slug, step: step.id, round: task.round };
}

function readyTaskAction(
  task: TaskState,
  slug: string,
  limits: Limits,
): Action {
  if (task.pendingSignal)
    return { kind: "step", slug, step: DECIDE_STEP, round: task.round };
  if (task.park) return park(slug, task.park);
  if (task.loop) {
    const loop = task.loop;
    return park(
      slug,
      makeCause(
        "no-progress",
        `${loop.step} r${loop.round} repeats r${loop.firstRound} (${loop.fingerprint.slice(0, 8)})`,
      ),
    );
  }
  const flow = limits.flows[task.flow];
  if (!flow)
    return park(
      slug,
      makeCause("stuck", `flow "${task.flow}" is not configured`),
    );
  return phaseAction(task, slug) ?? agentStepAction(task, slug, flow);
}

/**
 * Pure dispatch decision. Actions are ordered by slug; the dispatcher admits
 * them against concurrency and drain limits and re-derives after every
 * record. `running` guards against dispatching a task twice.
 */
export function next(
  state: State,
  limits: Limits,
  running: ReadonlySet<string>,
): Action[] {
  if (state.terminal) {
    return [{ kind: "exit", reason: `goal ${state.goal}` }];
  }
  const actions: Action[] = [];
  for (const slug of Object.keys(state.tasks).sort()) {
    if (running.has(slug)) continue;
    const task = state.tasks[slug]!;
    if (isTerminalStatus(task)) continue;
    if (task.status !== "ready") continue;
    actions.push(readyTaskAction(task, slug, limits));
  }
  if (actions.length > 0) return actions;
  if (running.size > 0) return [];
  return [{ kind: "boundary" }];
}
