import path from "node:path";
import {
  DASHBOARD_REL_PATH,
  renderDashboard,
  writeDashboardAssets,
} from "./dashboard.js";
import { derive } from "./derive.js";
import {
  DEFAULT_ROLE_BY_STEP,
  type GroupMetrics,
  iterationMetrics,
  type MetricsTotals,
  rolesByStep,
  totalsOf,
} from "./metrics.js";
import { loadPriceTable, type PriceSource } from "./openrouter.js";
import type { PriceTable } from "./pricing.js";
import { latestRunLog } from "./run-log.js";
import { reportView } from "./report-view.js";
import {
  openConcernEntries,
  readStatusMailbox,
  statusConcerns,
  statusSteers,
} from "./status-triage.js";
import type {
  StatusConcern,
  StatusMailbox,
  StatusOpenConcern,
  StatusSteer,
  StatusStop,
} from "./status-triage.js";
import {
  latestPmSummary,
  mechanicalSummary,
  type StatusSummary,
  type StatusTaskCounts,
} from "./status-summary.js";
import { readLatestIntentStatus } from "./summary/intent-status.js";
import type { IntentStatusArtifact } from "./summary/types.js";
import type {
  ArtifactStore,
  FlowDefinition,
  GoalStatus,
  KernelRuntime,
  ReportDebt as StatusDebt,
  ReportTask,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

/** Goal-relative path of the machine-readable status snapshot. */
export const STATUS_REL_PATH = "status.json";

export type { ReportDebt as StatusDebt } from "./types.js";
export type {
  StatusConcern,
  StatusMailbox,
  StatusOpenConcern,
  StatusSteer,
  StatusStop,
  SteerState,
} from "./status-triage.js";

/** One task as status.json names it, with the record a dashboard can link. */
export type StatusTask = ReportTask;

export interface StatusCost {
  turns: number;
  tokens: number;
  /** Sum of the figures the harnesses reported; null when none reported one. */
  harnessCostUsd: number | null;
  /** OpenRouter list-price equivalent; null when no model is priced. */
  listCostUsd: number | null;
  unpricedTurns: number;
}

export interface StatusWork {
  turns: number;
  edits: number;
  addedLines: number;
  removedLines: number;
  testRuns: number;
}

/** The snapshot `factory status --json` prints and the dashboard reads. */
export interface StatusDocument {
  goal: string;
  status: GoalStatus;
  /** Highest iteration seen in the records. */
  iteration: number;
  /** Iterations recorded so far; equals `iteration` and names the count. */
  iterations: number;
  updatedAt: string;
  /**
   * The one-paragraph status the user reads. A PM turn's summary when one was
   * written; otherwise the kernel's mechanical account, so records never read
   * as an unknown status.
   */
  summary: StatusSummary;
  tasks: {
    open: StatusTask[];
    merged: StatusTask[];
    finished: StatusTask[];
    parked: StatusTask[];
    /**
     * Parks whose kept work landed through a `base` continuation; counted
     * apart from live parks.
     */
    superseded: StatusTask[];
    cancelled: StatusTask[];
  };
  distance: {
    pending: string[];
    parks: string[];
    openDebt: StatusDebt[];
  };
  concerns: StatusConcern[];
  /** Open, non-FYI concerns: what the dashboard's default view lists. */
  openConcerns: StatusOpenConcern[];
  /** Every steer the mailbox or a route record names. */
  steers: StatusSteer[];
  /** How the last launch stopped; absent while it runs or before the first launch. */
  stop?: StatusStop;
  /** Latest intent-wise status an architect summary wrote; absent until one does. */
  intentStatus?: IntentStatusArtifact;
  /** Goal-relative path of the latest launch log; absent before the first launch. */
  runLog?: string;
  cost: {
    harnessCostUsd: number | null;
    listCostUsd: number | null;
    harnessCostPerMergedTask: number | null;
    listCostPerMergedTask: number | null;
    unpricedTurns: number;
    byRole: Record<string, StatusCost>;
    byModel: Record<string, StatusCost>;
  };
  work: {
    turns: number;
    edits: number;
    addedLines: number;
    removedLines: number;
    testRuns: number;
    byRole: Record<string, StatusWork>;
    byModel: Record<string, StatusWork>;
  };
  /** Task slugs grouped by epic; absent when the goal carries no epic. */
  epics?: Record<string, string[]>;
}

export interface StatusInput {
  goal: string;
  state: State;
  tasks: readonly TaskFile[];
  /** Latest intent status artifact; absent before an architect summary writes one. */
  intentStatus?: IntentStatusArtifact;
  /** The mailbox queues the dashboard's steer panel reads; absent means none. */
  mailbox?: StatusMailbox;
  /** How the launch that wrote this snapshot stopped; absent while it runs. */
  stop?: StatusStop;
  /** Goal-relative path of the latest launch log; absent before the first launch. */
  runLog?: string;
  records: readonly StepRecord[];
  /** Step id -> role; the process flows supply it at write time. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table; absent means the records' own priced usage only. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  /** Injected by tests; production stamps the write time. */
  updatedAt?: string;
}

/** The counts the mechanical account names, from the grouped tasks. */
function taskCounts(tasks: StatusDocument["tasks"]): StatusTaskCounts {
  const landed = tasks.merged.length + tasks.finished.length;
  return {
    landed,
    total:
      landed + tasks.open.length + tasks.parked.length + tasks.cancelled.length,
    open: tasks.open.length,
    parked: tasks.parked.length,
  };
}

function goalTotals(
  records: readonly StepRecord[],
  roleByStep: Record<string, string>,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): MetricsTotals {
  const numbers = [...new Set(records.map((r) => r.iteration))]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const iterations = numbers.map((n) =>
    iterationMetrics(
      n,
      "in-progress",
      [...records],
      roleByStep,
      0,
      prices,
      priceIds,
    ),
  );
  return totalsOf(iterations);
}

/** One projection per group, keyed by name in sorted order. */
function byName<T>(
  groups: Record<string, GroupMetrics>,
  pick: (entry: GroupMetrics) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.keys(groups)
      .sort()
      .map((name) => [name, pick(groups[name]!)]),
  );
}

function costOf(
  groups: Record<string, GroupMetrics>,
): Record<string, StatusCost> {
  return byName(groups, (entry) => ({
    turns: entry.turns,
    tokens: entry.tokens,
    harnessCostUsd: entry.usage.harnessCostUsd ?? null,
    listCostUsd: entry.usage.listCostUsd ?? null,
    unpricedTurns: entry.unpricedTurns,
  }));
}

function workOf(
  groups: Record<string, GroupMetrics>,
): Record<string, StatusWork> {
  return byName(groups, (entry) => ({
    turns: entry.turns,
    edits: entry.edits,
    addedLines: entry.addedLines,
    removedLines: entry.removedLines,
    testRuns: entry.testRuns,
  }));
}

function workView(totals: MetricsTotals): StatusDocument["work"] {
  return {
    turns: totals.turns,
    edits: totals.edits,
    addedLines: totals.addedLines,
    removedLines: totals.removedLines,
    testRuns: totals.testRuns,
    byRole: workOf(totals.roles),
    byModel: workOf(totals.models),
  };
}

function costView(totals: MetricsTotals): StatusDocument["cost"] {
  return {
    harnessCostUsd: totals.usage.harnessCostUsd ?? null,
    listCostUsd: totals.usage.listCostUsd ?? null,
    unpricedTurns: totals.unpricedTurns,
    harnessCostPerMergedTask: totals.harnessCostPerMergedTask,
    listCostPerMergedTask: totals.listCostPerMergedTask,
    byRole: costOf(totals.roles),
    byModel: costOf(totals.models),
  };
}

/** The snapshot as one data object; every field derives from task files and records. */
export function buildStatus(input: StatusInput): StatusDocument {
  const view = reportView({
    state: input.state,
    tasks: input.tasks,
    records: input.records,
  });
  const { open, merged, finished, parked, superseded, cancelled } = view.groups;
  const tasks = { open, merged, finished, parked, superseded, cancelled };
  const roleByStep = { ...DEFAULT_ROLE_BY_STEP, ...(input.roleByStep ?? {}) };
  const totals = goalTotals(
    input.records,
    roleByStep,
    input.prices ?? {},
    input.priceIds,
  );
  const epics =
    Object.keys(input.state.epics).length > 0
      ? Object.fromEntries(
          Object.entries(input.state.epics).map(([name, epic]) => [
            name,
            epic.tasks,
          ]),
        )
      : undefined;
  return {
    goal: input.goal,
    status: input.state.goal,
    iteration: input.state.iteration,
    iterations: input.state.iteration,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    summary:
      latestPmSummary(input.records) ??
      mechanicalSummary(
        input.state.goal,
        input.state.iteration,
        taskCounts(tasks),
      ),
    tasks,
    distance: view.distance,
    concerns: statusConcerns(input.records),
    openConcerns: openConcernEntries(input.records, view.distance.openDebt),
    steers: statusSteers(input.records, input.mailbox),
    cost: costView(totals),
    work: workView(totals),
    ...(epics ? { epics } : {}),
    ...(input.intentStatus ? { intentStatus: input.intentStatus } : {}),
    ...(input.runLog ? { runLog: input.runLog } : {}),
    ...(input.stop ? { stop: input.stop } : {}),
  };
}

export function renderStatus(status: StatusDocument): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}

/** Everything a status refresh needs from the running kernel. */
export interface StatusSource {
  store: ArtifactStore;
  flows: Record<string, FlowDefinition>;
  priceIds?: Record<string, string>;
  priceSource?: PriceSource;
}

/** Derives the snapshot from the goal's current task files and records. */
export async function collectStatus(
  source: StatusSource,
  stop?: StatusStop,
): Promise<StatusDocument> {
  const tasks = await source.store.listTasks();
  const records = await source.store.listRecords();
  const state = derive(tasks, records, source.flows);
  return buildStatus({
    goal: path.basename(source.store.goalDir),
    state,
    tasks,
    records,
    mailbox: await readStatusMailbox(source.store),
    ...(stop ? { stop } : {}),
    intentStatus: await readLatestIntentStatus(source.store, state.iteration),
    runLog: await latestRunLog(source.store.goalDir),
    roleByStep: rolesByStep(source.flows),
    prices: await loadPriceTable(source.priceSource),
    priceIds: source.priceIds,
  });
}

/** Rewrites `status.json` and its dashboard after an agent launch or finish. */
export async function writeStatus(
  source: StatusSource,
  stop?: StatusStop,
): Promise<string> {
  const status = await collectStatus(source, stop);
  // Render before either write: a template failure never leaves a fresh
  // status.json beside a dashboard describing the previous snapshot.
  const dashboard = renderDashboard(status);
  await writeDashboardAssets(source.store);
  await source.store.writeFile(STATUS_REL_PATH, renderStatus(status));
  await source.store.writeFile(DASHBOARD_REL_PATH, dashboard);
  return STATUS_REL_PATH;
}

/**
 * The stored snapshot, or null when the kernel has not written one. A broken
 * file fails loudly: printing invalid JSON as status would be worse than none.
 */
export async function readStatus(store: ArtifactStore): Promise<string | null> {
  const text = await store.readFile(STATUS_REL_PATH);
  if (text === null) return null;
  try {
    JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${store.pathOf({ area: "goal", rel: STATUS_REL_PATH })} is not valid JSON: ${(err as Error).message}`,
    );
  }
  return text;
}

/** The running kernel's status source; one call per agent launch and finish. */
export function statusSource(runtime: KernelRuntime): StatusSource {
  return {
    store: runtime.store,
    flows: runtime.configs.process.flows,
    priceIds: runtime.configs.run.priceIds,
    priceSource: runtime.priceSource,
  };
}
