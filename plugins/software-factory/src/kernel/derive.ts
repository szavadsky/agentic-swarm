import { DEFAULT_FLOWS, reduceTask } from "./derive-task.js";

import type {
  Concern,
  ConcernId,
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
 * `debt closed: <text>` forward lines, where a close matches when it equals
 * the debt or quotes it (either direction contains the other) and short
 * fragments (<24 chars on the shorter side) never match, so
 * `debt closed: tests` cannot retire an unrelated paragraph.
 */
function closedDebtTexts(records: readonly StepRecord[]): {
  cited: Set<string>;
  quoted: Set<string>;
} {
  const byId = debtTextsById(records);
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
 * Every open debt-kind concern, any calibration, deduplicated by text and
 * carrying the id of the record that first raised it. FYI entries are notes
 * for the architect's register, not blockers: `materialOpenDebts` is the
 * done-detection view.
 */
export function openDebts(records: readonly StepRecord[]): OpenDebt[] {
  const byText = new Map<string, OpenDebt>();
  for (const rec of [...records].sort(bySeq)) {
    if (!rec.outcome) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.kind !== "debt") continue;
      const key = normalizeDebtText(concern.text);
      if (byText.has(key)) continue;
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
  }
  const { cited, quoted } = closedDebtTexts(records);
  const isClosed = (norm: string): boolean =>
    cited.has(norm) ||
    [...quoted].some((c) => {
      if (c === norm) return true;
      const shorter = Math.min(c.length, norm.length);
      if (shorter < 24) return false;
      return c.includes(norm) || norm.includes(c);
    });
  return [...byText.entries()]
    .filter(([norm]) => !isClosed(norm))
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
    // A quarantine report rides on the current iteration but starts none:
    // the first launch's preflight quarantine must not number the first
    // real iteration as 2 or mark the launch a relaunch.
    if (rec.step !== "task-quarantine") {
      iteration = Math.max(iteration, rec.iteration);
    }
    const decision = recordedDecision(rec);
    if (decision) {
      // Done sees open debt: a done recorded while material debt is open is
      // refused — the goal stays active so the next boundary must plan the
      // removers. The check reads records up to this decision, so a later
      // close needs a later done to land.
      if (decision === "done") {
        const prior = sorted.filter((r) => r.seq <= rec.seq);
        if (hasOpenDebt(prior)) continue;
        goal = "done";
      } else if (decision === "blocked") {
        goal = "blocked";
      } else {
        goal = "active";
      }
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
  // A terminal slug whose file is unreadable (or deleted) keeps its status:
  // the store lists no task for it, so without this the slug would vanish
  // from derived state, reconcile would stop freezing it, and a later file
  // reusing the slug would inherit the terminal record. Only
  // merged/finished/cancelled persist here; a parked slug without a file is
  // gone (its quarantine record is the report). The stand-in kind is `task`,
  // so a spike merge would read as `merged`; spike flows finish rather than
  // merge, so the default holds in practice.
  const knownSlugs = new Set(tasks.map((task) => task.slug));
  const orphanSlugs = new Set<string>();
  for (const rec of sorted) {
    if (rec.slug && !knownSlugs.has(rec.slug)) orphanSlugs.add(rec.slug);
  }
  const orphanReductions = new Map<string, ReturnType<typeof reduceTask>>();
  for (const slug of orphanSlugs) {
    const recs = sorted.filter((r) => r.slug === slug);
    const standin: TaskFile = {
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
    const flow =
      flows[standin.flow] ??
      DEFAULT_FLOWS[standin.flow] ??
      DEFAULT_FLOWS["implement-review"]!;
    const reduction = reduceTask(standin, recs, flow);
    orphanReductions.set(slug, reduction);
    if (
      reduction.terminal?.status === "merged" ||
      reduction.terminal?.status === "finished" ||
      reduction.terminal?.status === "cancelled"
    ) {
      statuses.set(slug, reduction.terminal.status);
    }
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
      gateLastCall: terminal ? undefined : reduction.gateLastCall,
    };
  }
  for (const slug of [...orphanSlugs].sort()) {
    const reduction = orphanReductions.get(slug)!;
    const terminal = reduction.terminal;
    if (
      terminal?.status !== "merged" &&
      terminal?.status !== "finished" &&
      terminal?.status !== "cancelled"
    )
      continue;
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
