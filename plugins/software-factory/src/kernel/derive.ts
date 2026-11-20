import { DEFAULT_FLOWS, reduceTask } from "./derive-task.js";

import type {
  Concern,
  ConcernId,
  RecordedConcern,
  EpicState,
  FlowDefinition,
  GoalDecision,
  GoalStatus,
  State,
  StepRecord,
  TaskFile,
  TaskState,
  TaskStatus,
} from "./types.js";

/**
 * The script record the launch appends when the front path stops: a front
 * trivial/task goal has no architect turn, so this record carries its goal
 * decision and `derive` reads it like an architect's.
 */
export const FRONT_STOP_STEP = "front-stop";

/** Task statuses that still owe their epic a live subarchitect. */
export const OPEN_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "pending",
  "ready",
  "running",
  "parked",
]);

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

/** One debt-kind concern the kernel recorded, with the id ingest assigned it. */
export interface OpenDebt {
  /** `<recordId>#<n>` of the first record that raised the debt; absent on a hand-built record. */
  id?: ConcernId;
  text: string;
  evidence?: string;
  calibration: Concern["calibration"];
  /** `slug step rN` of the first record that raised it. */
  source: string;
  iteration: number;
  seq: number;
}

function normalizeDebtText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A top-level plan bullet; prose and nested lines (`  - done: …`) name no owner. */
const PLAN_BULLET = /^-\s+(.+)$/;

/** A line's cited ingest ids: `<recordId>#<n>` tokens, never a longer id's prefix. */
function citedIds(line: string): Set<string> {
  return new Set(line.match(/[\w.-]+#\d+/g) ?? []);
}

/**
 * A quote matches when it equals the debt text or the two contain each other.
 * A short fragment (<24 chars on the shorter side) never matches, so
 * `debt closed: tests` cannot retire an unrelated paragraph.
 */
function quotes(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 24) return false;
  return a.includes(b) || b.includes(a);
}

/** Every ingested debt concern's normalized text, by the id ingest assigned it. */
function debtTextsById(records: readonly StepRecord[]): Map<ConcernId, string> {
  const byId = new Map<ConcernId, string>();
  for (const rec of records) {
    for (const concern of rec.outcome?.concerns ?? []) {
      if (concern.kind !== "debt" || !concern.id) continue;
      byId.set(concern.id, normalizeDebtText(concern.text));
    }
  }
  return byId;
}

/**
 * The normalized texts retired so far, by two strengths. `cited` holds the
 * debt a `debtClosed` id names, resolved through ingest's ids: that id closes
 * exactly that debt, however many rounds raised it. `quoted` holds legacy
 * `debt closed: <text>` forward lines, matched by `quotes`.
 */
function closedDebtTexts(
  records: readonly StepRecord[],
  byId: ReadonlyMap<ConcernId, string>,
): {
  cited: Set<string>;
  quoted: Set<string>;
} {
  const cited = new Set<string>();
  const quoted = new Set<string>();
  for (const rec of records) {
    for (const forward of rec.outcome?.forward ?? []) {
      const text = /^debt closed:\s*(.+)$/i.exec(forward)?.[1]?.trim();
      if (text) quoted.add(normalizeDebtText(text));
    }
    for (const entry of rec.outcome?.debtClosed ?? []) {
      const text = byId.get(entry.id.trim());
      if (text) cited.add(text);
    }
  }
  return { cited, quoted };
}

/**
 * The normalized debt texts the plan owns: a top-level bullet names a debt by
 * citing the id ingest assigned it or by quoting its text. Ownership is read
 * from the plan on disk each time, so a bullet the next plan drops returns the
 * debt to the register.
 */
function planOwnedDebtTexts(
  plan: string,
  byId: ReadonlyMap<ConcernId, string>,
): Set<string> {
  const owned = new Set<string>();
  for (const line of plan.split(/\r?\n/)) {
    const bullet = PLAN_BULLET.exec(line)?.[1];
    if (!bullet) continue;
    const cited = citedIds(bullet);
    const normalized = normalizeDebtText(bullet);
    for (const [id, text] of byId) {
      if (cited.has(id) || quotes(normalized, text)) owned.add(text);
    }
  }
  return owned;
}

/**
 * Every open debt-kind concern, any calibration, deduplicated by text and
 * carrying the id of the record that first raised it. FYI entries are notes
 * for the architect's register, not blockers: `materialOpenDebts` is the
 * done-detection view.
 *
 * `plan` is the register's view: a debt a top-level plan bullet names is
 * owned and leaves the register. Done-detection never passes a plan — owning
 * debt does not remove it, so only `debtClosed` or a `debt closed:` forward
 * line lands a done.
 */
/** Records one concern as an open debt unless its text is already known. */
function addDebt(
  byText: Map<string, OpenDebt>,
  rec: StepRecord,
  concern: RecordedConcern,
): void {
  if (concern.kind !== "debt") return;
  const key = normalizeDebtText(concern.text);
  if (byText.has(key)) return;
  byText.set(key, {
    ...(concern.id ? { id: concern.id } : {}),
    text: concern.text,
    ...(concern.evidence ? { evidence: concern.evidence } : {}),
    calibration: concern.calibration,
    source: `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`,
    iteration: rec.iteration,
    seq: rec.seq,
  });
}

/** Whether a cited id or a quoted close names the debt as closed. */
function isClosedDebt(
  norm: string,
  cited: ReadonlySet<string>,
  quoted: ReadonlySet<string>,
): boolean {
  if (cited.has(norm)) return true;
  for (const quote of quoted) if (quotes(quote, norm)) return true;
  return false;
}

export function openDebts(
  records: readonly StepRecord[],
  plan?: string,
): OpenDebt[] {
  const byText = new Map<string, OpenDebt>();
  for (const rec of [...records].sort(bySeq)) {
    if (!rec.outcome) continue;
    for (const concern of rec.outcome.concerns) addDebt(byText, rec, concern);
  }
  const byId = debtTextsById(records);
  const { cited, quoted } = closedDebtTexts(records, byId);
  const owned = plan ? planOwnedDebtTexts(plan, byId) : new Set<string>();
  return [...byText.entries()]
    .filter(([norm]) => !owned.has(norm) && !isClosedDebt(norm, cited, quoted))
    .map(([, debt]) => debt)
    .sort((a, b) => a.seq - b.seq);
}

/** The open debts that block done: architect/owner calibration. */
export function materialOpenDebts(records: readonly StepRecord[]): OpenDebt[] {
  return openDebts(records).filter((debt) => debt.calibration !== "fyi");
}

/** True while any material debt is still open. */
export function hasOpenDebt(records: readonly StepRecord[]): boolean {
  return materialOpenDebts(records).length > 0;
}

/** The ids ingest assigned to debt concerns; a `debtClosed` id must name one. */
export function knownDebtIds(records: readonly StepRecord[]): Set<ConcernId> {
  return new Set(debtTextsById(records).keys());
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

/** The latest numbered iteration; a quarantine rides along without numbering one. */
function latestIteration(sorted: readonly StepRecord[]): number {
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

function hasArchitectDecision(
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

function hasBlockingCrash(
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

type TaskReduction = ReturnType<typeof reduceTask>;

/** Reduces every task file; terminal statuses land in `statuses`. */
function reduceTasks(
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
    scope: [],
    revision: 0,
    source: "orphan terminal record",
    body: "",
  };
}

interface OrphanReductions {
  slugs: Set<string>;
  reductions: Map<string, TaskReduction>;
}

/**
 * Reductions for terminal slugs whose file is unreadable or deleted. Only
 * merged/finished/cancelled persist here; a parked slug without a file is gone
 * (its quarantine record is the report). The stand-in kind is `task`, so a
 * spike merge would read as `merged`; spike flows finish rather than merge, so
 * the default holds in practice.
 */
function reduceOrphans(
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
): TaskState {
  const terminal = reduction.terminal;
  return {
    status,
    ...(task.epic !== undefined ? { epic: task.epic } : {}),
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
    gateLastCall: terminal ? undefined : reduction.gateLastCall,
  };
}

/** Resolves each task's status and state, and groups tasks under their epic. */
function buildTaskStates(
  tasks: TaskFile[],
  statuses: Map<string, TaskStatus>,
  reductions: ReadonlyMap<string, TaskReduction>,
  taskStates: Record<string, TaskState>,
  epics: Record<string, EpicState>,
): void {
  for (const task of tasks) {
    const reduction = reductions.get(task.slug)!;
    const status: TaskStatus =
      statuses.get(task.slug) ??
      (depsSatisfied(task, statuses) ? "ready" : "pending");
    statuses.set(task.slug, status);
    taskStates[task.slug] = taskStateFor(task, reduction, status);
    if (task.epic !== undefined) {
      const group = epics[task.epic] ?? { tasks: [], done: false };
      group.tasks.push(task.slug);
      epics[task.epic] = group;
    }
  }
}

/** Keeps the terminal state of a slug whose task file is gone. */
function addOrphanTaskStates(
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
      round: reduction.round,
      kind: "development",
      flow: "implement-review",
      phase: "done",
      commit: terminal.commit,
      verdict: reduction.verdict,
      park: undefined,
      loop: undefined,
      gateFix: undefined,
      gateLastCall: undefined,
    };
  }
}

/** The epic's own architect owns its decision. */
function applySubarchitectDecisions(
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

/** `done` also waits for every task in the epic to land. */
function closeEpics(
  epics: Record<string, EpicState>,
  statuses: ReadonlyMap<string, TaskStatus>,
): void {
  for (const epic of Object.values(epics)) {
    epic.done =
      (epic.decision === undefined || epic.decision === "done") &&
      !epic.tasks.some((slug) =>
        OPEN_TASK_STATUSES.has(statuses.get(slug) ?? "pending"),
      );
  }
}

/** The goal decision the records settle on, latest last. */
function settleGoal(
  sorted: readonly StepRecord[],
  epics: Record<string, EpicState>,
): GoalStatus {
  let goal: GoalStatus = "active";
  for (const rec of sorted) {
    const decision = recordedDecision(rec);
    if (!decision) continue;
    // Done sees open debt and open epics: a done recorded while either is
    // open is refused — the goal stays active so the next boundary plans the
    // removers or lets an epic's architect close it. The check reads records
    // up to this decision, so a later close needs a later done to land.
    if (decision === "done") {
      const prior = sorted.filter((r) => r.seq <= rec.seq);
      if (hasOpenDebt(prior)) continue;
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
  const iteration = latestIteration(sorted);
  const hasArchitectDecisionThisIteration = hasArchitectDecision(
    sorted,
    iteration,
  );
  const hasBlockingCrashThisIteration = hasBlockingCrash(sorted, iteration);

  const statuses = new Map<string, TaskStatus>();
  const reductions = reduceTasks(tasks, sorted, flows, statuses);
  const orphans = reduceOrphans(
    sorted,
    new Set(tasks.map((task) => task.slug)),
    flows,
    statuses,
  );

  const taskStates: Record<string, TaskState> = {};
  const epics: Record<string, EpicState> = {};
  buildTaskStates(tasks, statuses, reductions, taskStates, epics);
  addOrphanTaskStates(orphans, taskStates);

  applySubarchitectDecisions(sorted, epics);
  closeEpics(epics, statuses);

  const goal = settleGoal(sorted, epics);
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
    epics,
  };
}
