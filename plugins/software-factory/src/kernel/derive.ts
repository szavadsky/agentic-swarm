import { DEFAULT_FLOWS, reduceTask } from "./derive-task.js";

export { classifyStop, type StopClassification } from "./derive-task.js";

import type {
  FlowDefinition,
  GoalDecision,
  GoalStatus,
  State,
  StepRecord,
  TaskFile,
  TaskState,
  TaskStatus,
} from "./types.js";

// Augment the shared State shape with the derived "interrupted" flag so the
// interface file stays untouched; the flag is computed in `derive`.
declare module "./types.js" {
  interface State {
    interrupted: boolean;
  }
}

/**
 * The script record the launch appends when the front path stops: a front
 * trivial/task goal has no architect turn, so this record carries its goal
 * decision and `derive` reads it like an architect's.
 */
export const FRONT_STOP_STEP = "front-stop";

/** Dependency edges are satisfied by merged work and by landed spike findings. */
function depsSatisfied(
  task: TaskFile,
  statuses: ReadonlyMap<string, TaskStatus>,
): boolean {
  return task.deps.every((dep) => {
    const status = statuses.get(dep);
    return status === "merged" || status === "finished";
  });
}

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

/**
 * A record recovery sealed after a hard death (SIGKILL, reboot, second signal):
 * a bare `infra: crash` with nothing the turn itself reported. A harness turn
 * that reported a crash carries its usage and prompt bytes; a throwing action
 * recorded by dispatch carries a cause and details. Only the bare seal counts
 * as an interruption; a reported crash counts against the task and blocks resume.
 */
function isRecoveryCrash(rec: StepRecord): boolean {
  if (rec.stop?.kind !== "infra" || rec.stop?.cause !== "crash") return false;
  if (rec.ok !== false) return false;
  if (rec.cause !== undefined) return false;
  if (rec.stop.details !== undefined) return false;
  if (rec.usage !== undefined) return false;
  if (rec.promptBytes !== undefined) return false;
  return true;
}

/** The goal decision a completed record carries: the architect's, or the front path's stop. */
function recordedDecision(rec: StepRecord): GoalDecision | undefined {
  if (!rec.endedAt || !rec.outcome?.decision) return undefined;
  if (rec.actor === "agent" && rec.step === "architect")
    return rec.outcome.decision;
  if (rec.actor === "script" && rec.step === FRONT_STOP_STEP)
    return rec.outcome.decision;
  return undefined;
}

/**
 * Pure, idempotent state derived from task files plus append-only records —
 * the whole crash-recovery story is calling this again. Unfinished records
 * (started, no end) are orphans: they contribute nothing, so the same step is
 * redispatched after the worktree is reconciled.
 *
 * `flows` is the configured flow catalog; without it the built-in
 * implement/review shape is assumed (callers that dispatch use their config).
 */
export function derive(
  tasks: TaskFile[],
  records: StepRecord[],
  flows: Record<string, FlowDefinition> = DEFAULT_FLOWS,
): State {
  const sorted = [...records].sort(bySeq);
  let iteration = 0;
  let goal: GoalStatus = "active";
  for (const rec of sorted) {
    iteration = Math.max(iteration, rec.iteration);
    const decision = recordedDecision(rec);
    if (decision) {
      goal =
        decision === "done"
          ? "done"
          : decision === "blocked"
            ? "blocked"
            : "active";
    }
  }
  const currentIteration = iteration;
  const hasArchitectDecisionThisIteration = sorted.some(
    (rec) =>
      rec.iteration === currentIteration &&
      rec.actor === "agent" &&
      rec.step === "architect" &&
      rec.outcome?.decision !== undefined,
  );
  const hasBlockingCrashThisIteration = sorted.some(
    (rec) =>
      rec.iteration === currentIteration &&
      rec.stop?.kind === "infra" &&
      rec.stop?.cause === "crash" &&
      !isRecoveryCrash(rec),
  );

  const statuses = new Map<string, TaskStatus>();
  const reductions = new Map<string, ReturnType<typeof reduceTask>>();
  for (const task of tasks) {
    const recs = sorted.filter((r) => r.slug === task.slug);
    const flow =
      flows[task.flow] ??
      DEFAULT_FLOWS[task.flow] ??
      DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(task, recs, flow);
    reductions.set(task.slug, reduction);
    // Terminal facts are order-independent; readiness is resolved below.
    if (reduction.terminal) statuses.set(task.slug, reduction.terminal.status);
  }

  const taskStates: Record<string, TaskState> = {};
  for (const task of tasks) {
    const reduction = reductions.get(task.slug)!;
    const terminal = reduction.terminal;
    const status: TaskStatus =
      statuses.get(task.slug) ??
      (depsSatisfied(task, statuses) ? "ready" : "pending");
    statuses.set(task.slug, status);
    taskStates[task.slug] = {
      status,
      cause: terminal?.cause ?? reduction.park,
      turns: reduction.turns,
      round: reduction.round,
      kind: task.kind,
      flow: task.flow,
      phase: terminal ? "done" : reduction.phase,
      commit: terminal?.commit ?? reduction.commit,
      verdict: reduction.verdict,
      park: terminal ? undefined : reduction.park,
      loop: terminal ? undefined : reduction.loop,
      gateFix: terminal ? undefined : reduction.gateFix,
    };
  }

  const interrupted =
    goal === "active" &&
    iteration > 0 &&
    hasArchitectDecisionThisIteration &&
    !hasBlockingCrashThisIteration &&
    Object.values(taskStates).some((task) => task.status === "ready");
  return {
    goal,
    iteration,
    terminal: goal !== "active",
    interrupted,
    tasks: taskStates,
  };
}
