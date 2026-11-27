/** Reducing records and tasks into the goal's task, epic and status state. */

import { DEFAULT_FLOWS, reduceTask } from "../derive-task.js";
import { isRecoveryCrash } from "../recovery-seal.js";
import {
  BUILTIN_INGESTION_IDS,
  type EpicState,
  type FlowDefinition,
  type GoalDecision,
  type GoalStatus,
  type StepRecord,
  type TaskFile,
  type TaskState,
  type TaskStatus,
} from "../types.js";
import {
  FRONT_STOP_STEP,
  baseContinuations,
  depsSatisfied,
  landingFacts,
  openEpicTask,
  supersedingContinuation,
} from "./shared.js";
import type { OrphanReductions, TaskReduction } from "./types.js";

/** The goal decision a completed record carries: the architect's, or the front path's stop. */
function recordedDecision(rec: StepRecord): GoalDecision | undefined {
  if (!rec.endedAt || !rec.outcome?.decision) return undefined;
  if (rec.actor === "agent" && rec.step === "architect")
    return rec.outcome.decision;
  if (rec.actor === "script" && rec.step === FRONT_STOP_STEP)
    return rec.outcome.decision;
  return undefined;
}

/** The steps every goal records before its first decision: the branch, then the classifier. */
const INGESTION_STEPS: ReadonlySet<string> = new Set(BUILTIN_INGESTION_IDS);

/** A task turn: an agent turn on a slug; kernel and boundary steps name none. */
function isTaskTurn(rec: StepRecord): boolean {
  return rec.actor === "agent" && rec.slug !== undefined;
}

/**
 * Whether the iteration died inside its ingestion phase: it recorded its branch
 * or classifier step, no decision followed, and no task turn ran. A front path
 * that dispatched keeps its own iteration — the next one runs the architect — so
 * task work ends the front phase even before a decision.
 */
export function ingestionInterrupted(
  sorted: readonly StepRecord[],
  iteration: number,
): boolean {
  const inIteration = sorted.filter((rec) => rec.iteration === iteration);
  if (inIteration.some((rec) => recordedDecision(rec) !== undefined))
    return false;
  if (inIteration.some(isTaskTurn)) return false;
  return inIteration.some(
    (rec) => rec.endedAt !== undefined && INGESTION_STEPS.has(rec.step),
  );
}

/** The latest numbered iteration; a quarantine rides along without numbering one. */
export function latestIteration(sorted: readonly StepRecord[]): number {
  let iteration = 0;
  for (const rec of sorted) {
    // A quarantine report rides on the current iteration but starts none: the
    // first launch's preflight quarantine must not number the first real
    // iteration as 2 or mark the launch a relaunch.
    if (rec.step !== "task-quarantine") {
      iteration = Math.max(iteration, rec.iteration);
    }
  }
  return iteration;
}

export function hasArchitectDecision(
  sorted: readonly StepRecord[],
  iteration: number,
): boolean {
  return sorted.some(
    (rec) =>
      rec.iteration === iteration &&
      rec.actor === "agent" &&
      rec.step === "architect" &&
      rec.outcome?.decision !== undefined,
  );
}

export function hasBlockingCrash(
  sorted: readonly StepRecord[],
  iteration: number,
): boolean {
  return sorted.some(
    (rec) =>
      rec.iteration === iteration &&
      rec.stop?.kind === "infra" &&
      rec.stop?.cause === "crash" &&
      !isRecoveryCrash(rec),
  );
}

/** The configured flow, the built-in one, or the default shape. */
function flowFor(
  name: string,
  flows: Record<string, FlowDefinition>,
): FlowDefinition {
  return (
    flows[name] ?? DEFAULT_FLOWS[name] ?? DEFAULT_FLOWS["implement-review"]!
  );
}

/** Reduces every task file; terminal statuses land in `statuses`. */
export function reduceTasks(
  tasks: TaskFile[],
  sorted: readonly StepRecord[],
  flows: Record<string, FlowDefinition>,
  statuses: Map<string, TaskStatus>,
): Map<string, TaskReduction> {
  const reductions = new Map<string, TaskReduction>();
  for (const task of tasks) {
    const recs = sorted.filter((r) => r.slug === task.slug);
    const reduction = reduceTask(task, recs, flowFor(task.flow, flows));
    reductions.set(task.slug, reduction);
    // Terminal facts are order-independent; readiness is resolved below.
    if (reduction.terminal) statuses.set(task.slug, reduction.terminal.status);
  }
  return reductions;
}

/** The stand-in a terminal record needs when its task file is gone. */
function standinTask(slug: string): TaskFile {
  return {
    slug,
    title: slug,
    kind: "development",
    flow: "implement-review",
    deps: [],
    revision: 0,
    source: "orphan terminal record",
    body: "",
  };
}

/**
 * Reductions for terminal slugs whose file is unreadable or deleted. Only
 * merged/finished/cancelled persist here; a parked slug without a file is gone
 * (its quarantine record is the report). The stand-in kind is `task`, so a
 * spike merge would read as `merged`; spike flows finish rather than merge, so
 * the default holds in practice.
 */
export function reduceOrphans(
  sorted: readonly StepRecord[],
  knownSlugs: ReadonlySet<string>,
  flows: Record<string, FlowDefinition>,
  statuses: Map<string, TaskStatus>,
): OrphanReductions {
  const slugs = new Set<string>();
  for (const rec of sorted) {
    if (rec.slug && !knownSlugs.has(rec.slug)) slugs.add(rec.slug);
  }
  const reductions = new Map<string, TaskReduction>();
  for (const slug of slugs) {
    const recs = sorted.filter((r) => r.slug === slug);
    const standin = standinTask(slug);
    const reduction = reduceTask(standin, recs, flowFor(standin.flow, flows));
    reductions.set(slug, reduction);
    const status = reduction.terminal?.status;
    if (
      status === "merged" ||
      status === "finished" ||
      status === "cancelled"
    ) {
      statuses.set(slug, status);
    }
  }
  return { slugs, reductions };
}

function taskStateFor(
  task: TaskFile,
  reduction: TaskReduction,
  status: TaskStatus,
  supersededBy: string | undefined,
): TaskState {
  const terminal = reduction.terminal;
  return {
    status,
    ...(task.epic !== undefined ? { epic: task.epic } : {}),
    deps: task.deps,
    cause: terminal?.cause ?? reduction.park,
    turns: reduction.turns,
    started: reduction.started,
    round: reduction.round,
    launches: reduction.launches,
    kind: task.kind,
    flow: task.flow,
    ...(task.promote ? { promote: true } : {}),
    ...(supersededBy !== undefined ? { supersededBy } : {}),
    phase: terminal ? "done" : reduction.phase,
    commit: terminal?.commit ?? reduction.commit,
    verdict: reduction.verdict,
    park: terminal ? undefined : reduction.park,
    gateFix: terminal ? undefined : reduction.gateFix,
    gateLastCall: terminal ? undefined : reduction.gateLastCall,
    cleanlinessRevision: terminal ? undefined : reduction.cleanlinessRevision,
    cleanlinessJustified: terminal ? undefined : reduction.cleanlinessJustified,
    pendingSignal: terminal ? undefined : reduction.pendingSignal,
  };
}

/** Resolves each task's status and state, and groups tasks under their epic. */
export function buildTaskStates(
  tasks: TaskFile[],
  sorted: readonly StepRecord[],
  statuses: Map<string, TaskStatus>,
  reductions: ReadonlyMap<string, TaskReduction>,
  taskStates: Record<string, TaskState>,
  epics: Record<string, EpicState>,
): void {
  const continuations = baseContinuations(tasks);
  const landings = landingFacts(sorted);
  for (const task of tasks) {
    const reduction = reductions.get(task.slug)!;
    const status: TaskStatus =
      statuses.get(task.slug) ??
      (depsSatisfied(task, statuses, continuations) ? "ready" : "pending");
    statuses.set(task.slug, status);
    taskStates[task.slug] = taskStateFor(
      task,
      reduction,
      status,
      supersedingContinuation(task.slug, landings, statuses, continuations),
    );
    if (task.epic !== undefined) {
      const group = epics[task.epic] ?? { tasks: [], done: false };
      group.tasks.push(task.slug);
      epics[task.epic] = group;
    }
  }
}

/** Keeps the terminal state of a slug whose task file is gone. */
export function addOrphanTaskStates(
  orphans: OrphanReductions,
  taskStates: Record<string, TaskState>,
): void {
  for (const slug of [...orphans.slugs].sort()) {
    const reduction = orphans.reductions.get(slug)!;
    const terminal = reduction.terminal;
    if (
      terminal?.status !== "merged" &&
      terminal?.status !== "finished" &&
      terminal?.status !== "cancelled"
    ) {
      continue;
    }
    taskStates[slug] = {
      status: terminal.status,
      cause: terminal.cause,
      turns: reduction.turns,
      started: reduction.started,
      round: reduction.round,
      launches: reduction.launches,
      kind: "development",
      flow: "implement-review",
      phase: "done",
      commit: terminal.commit,
      verdict: reduction.verdict,
      park: undefined,
      gateFix: undefined,
      gateLastCall: undefined,
    };
  }
}

/** The epic's own architect owns its decision. */
export function applySubarchitectDecisions(
  sorted: readonly StepRecord[],
  epics: Record<string, EpicState>,
): void {
  for (const rec of sorted) {
    if (rec.step !== "subarchitect" || !rec.architect || !rec.endedAt) continue;
    const decision = rec.outcome?.decision;
    if (!decision) continue;
    const epic = epics[rec.architect] ?? { tasks: [], done: false };
    epic.decision = decision;
    epics[rec.architect] = epic;
  }
}

/** `done` also waits for every task in the epic to land; a retired park already has. */
export function closeEpics(
  epics: Record<string, EpicState>,
  taskStates: Readonly<Record<string, TaskState>>,
): void {
  for (const epic of Object.values(epics)) {
    epic.done =
      (epic.decision === undefined || epic.decision === "done") &&
      !epic.tasks.some((slug) => openEpicTask(taskStates[slug]));
  }
}

/** The goal decision the records settle on, latest last. */
export function settleGoal(
  sorted: readonly StepRecord[],
  epics: Record<string, EpicState>,
): GoalStatus {
  let goal: GoalStatus = "active";
  for (const rec of sorted) {
    const decision = recordedDecision(rec);
    if (!decision) continue;
    // Done sees open epics only: a done recorded while one is open is refused,
    // so the next boundary lets the epic's architect close it. Debt is the
    // architect's to own — the kernel never drops a done over it; the summary
    // lists what remains open.
    if (decision === "done") {
      if (Object.values(epics).some((epic) => !epic.done)) continue;
      goal = "done";
    } else if (decision === "blocked") {
      goal = "blocked";
    } else {
      goal = "active";
    }
  }
  return goal;
}
