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
 * Pending dependents per task: work still waiting on that task to land. A
 * ready or landed dependent is no longer blocked, so only pending counts.
 */
function blockedDependents(tasks: State["tasks"]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of Object.values(tasks)) {
    if (task.status !== "pending") continue;
    for (const dep of task.deps ?? []) {
      counts.set(dep, (counts.get(dep) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Started work finishes before new work starts from a tip its own merge will
 * move; among unstarted work the task opening the most pending dependents
 * goes first.
 */
function priority(
  a: string,
  b: string,
  tasks: State["tasks"],
  unblocks: ReadonlyMap<string, number>,
): number {
  const startedA = tasks[a]!.started === true;
  const startedB = tasks[b]!.started === true;
  if (startedA !== startedB) return startedA ? -1 : 1;
  if (!startedA) {
    const dependents = (unblocks.get(b) ?? 0) - (unblocks.get(a) ?? 0);
    if (dependents !== 0) return dependents;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure dispatch decision. Actions order started work first and, among
 * unstarted work, the task unblocking the most dependents; the dispatcher
 * admits them against concurrency and drain limits and re-derives after every
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
  const unblocks = blockedDependents(state.tasks);
  const ready = Object.keys(state.tasks).filter((slug) => {
    if (running.has(slug)) return false;
    const task = state.tasks[slug]!;
    return !isTerminalStatus(task) && task.status === "ready";
  });
  ready.sort((a, b) => priority(a, b, state.tasks, unblocks));
  const actions = ready.map((slug) =>
    readyTaskAction(state.tasks[slug]!, slug, limits),
  );
  if (actions.length > 0) return actions;
  if (running.size > 0) return [];
  return [{ kind: "boundary" }];
}
