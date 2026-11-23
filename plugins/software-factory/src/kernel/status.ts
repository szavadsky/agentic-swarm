import path from "node:path";
import {
  DASHBOARD_REL_PATH,
  renderDashboard,
  writeDashboardAssets,
} from "./dashboard.js";
import { derive, materialOpenDebts, type OpenDebt } from "./derive.js";
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
import { recordDirName } from "./store.js";
import {
  type IntentStatusArtifact,
  readLatestIntentStatus,
} from "./summary/intent-status.js";
import type {
  ArtifactStore,
  Cause,
  Concern,
  ConcernId,
  FlowDefinition,
  GoalStatus,
  KernelRuntime,
  State,
  StepRecord,
  TaskFile,
  TaskKind,
  TaskState,
  TaskStatus,
} from "./types.js";

/** Goal-relative path of the machine-readable status snapshot. */
export const STATUS_REL_PATH = "status.json";

/** One task as status.json names it, with the record a dashboard can link. */
export interface StatusTask {
  slug: string;
  title: string;
  status: TaskStatus;
  kind: TaskKind;
  epic?: string;
  round: number;
  turns: number;
  commit?: string;
  cause?: Cause;
  /** `records/<dir>` of the slug's latest record. */
  record?: string;
}

/** One open debt, with the record that raised it. */
export interface StatusDebt {
  id?: ConcernId;
  text: string;
  evidence?: string;
  calibration: Concern["calibration"];
  /** `slug step rN` of the record that raised it. */
  source: string;
  iteration: number;
  record?: string;
}

/** One concern a record delivered, with its source record. */
export interface StatusConcern {
  id?: ConcernId;
  slug?: string;
  step: string;
  round: number;
  kind: Concern["kind"];
  calibration: Concern["calibration"];
  text: string;
  evidence?: string;
  /** `records/<dir>` of the record that raised it. */
  record: string;
}

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
  tasks: {
    open: StatusTask[];
    merged: StatusTask[];
    finished: StatusTask[];
    parked: StatusTask[];
    cancelled: StatusTask[];
  };
  distance: {
    pending: string[];
    parks: string[];
    openDebt: StatusDebt[];
  };
  concerns: StatusConcern[];
  /** Latest intent-wise status an architect summary wrote; absent until one does. */
  intentStatus?: IntentStatusArtifact;
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

const OPEN: ReadonlySet<TaskStatus> = new Set(["pending", "ready", "running"]);

function recordPath(record: StepRecord): string {
  return `records/${recordDirName(record.seq, record)}`;
}

/** The record directory a concern id names: `<recordId>#<n>`. */
function concernRecord(id: ConcernId | undefined): string | undefined {
  if (!id) return undefined;
  const dir = id.slice(0, id.indexOf("#"));
  return dir ? `records/${dir}` : undefined;
}

function latestRecords(
  records: readonly StepRecord[],
): Map<string, StepRecord> {
  const latest = new Map<string, StepRecord>();
  for (const record of [...records].sort((a, b) => a.seq - b.seq)) {
    if (record.slug) latest.set(record.slug, record);
  }
  return latest;
}

function statusTask(
  slug: string,
  state: TaskState,
  titles: ReadonlyMap<string, string>,
  latest: ReadonlyMap<string, StepRecord>,
): StatusTask {
  const record = latest.get(slug);
  return {
    slug,
    title: titles.get(slug) ?? slug,
    status: state.status,
    kind: state.kind,
    ...(state.epic ? { epic: state.epic } : {}),
    round: state.round,
    turns: state.turns,
    ...(state.commit ? { commit: state.commit } : {}),
    ...(state.cause ? { cause: state.cause } : {}),
    ...(record ? { record: recordPath(record) } : {}),
  };
}

function groupTasks(tasks: StatusTask[]): StatusDocument["tasks"] {
  return {
    open: tasks.filter((task) => OPEN.has(task.status)),
    merged: tasks.filter((task) => task.status === "merged"),
    finished: tasks.filter((task) => task.status === "finished"),
    parked: tasks.filter((task) => task.status === "parked"),
    cancelled: tasks.filter((task) => task.status === "cancelled"),
  };
}

function statusTasks(input: StatusInput): StatusTask[] {
  const titles = new Map(input.tasks.map((task) => [task.slug, task.title]));
  const latest = latestRecords(input.records);
  return Object.entries(input.state.tasks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, state]) => statusTask(slug, state, titles, latest));
}

function debtEntry(debt: OpenDebt): StatusDebt {
  const record = concernRecord(debt.id);
  return {
    ...(debt.id ? { id: debt.id } : {}),
    text: debt.text,
    ...(debt.evidence ? { evidence: debt.evidence } : {}),
    calibration: debt.calibration,
    source: debt.source,
    iteration: debt.iteration,
    ...(record ? { record } : {}),
  };
}

function statusConcerns(records: readonly StepRecord[]): StatusConcern[] {
  return records.flatMap((record) =>
    (record.outcome?.concerns ?? []).map((concern) => ({
      ...(concern.id ? { id: concern.id } : {}),
      ...(record.slug ? { slug: record.slug } : {}),
      step: record.step,
      round: record.round,
      kind: concern.kind,
      calibration: concern.calibration,
      text: concern.text,
      ...(concern.evidence ? { evidence: concern.evidence } : {}),
      record: recordPath(record),
    })),
  );
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

function costOf(
  groups: Record<string, GroupMetrics>,
): Record<string, StatusCost> {
  const out: Record<string, StatusCost> = {};
  for (const name of Object.keys(groups).sort()) {
    const entry = groups[name]!;
    out[name] = {
      turns: entry.turns,
      tokens: entry.tokens,
      harnessCostUsd: entry.usage.harnessCostUsd ?? null,
      listCostUsd: entry.usage.listCostUsd ?? null,
      unpricedTurns: entry.unpricedTurns,
    };
  }
  return out;
}

function workOf(
  groups: Record<string, GroupMetrics>,
): Record<string, StatusWork> {
  const out: Record<string, StatusWork> = {};
  for (const name of Object.keys(groups).sort()) {
    const entry = groups[name]!;
    out[name] = {
      turns: entry.turns,
      edits: entry.edits,
      addedLines: entry.addedLines,
      removedLines: entry.removedLines,
      testRuns: entry.testRuns,
    };
  }
  return out;
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
  const tasks = statusTasks(input);
  const groups = groupTasks(tasks);
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
    tasks: groups,
    distance: {
      pending: groups.open
        .filter((task) => task.status !== "running")
        .map((task) => task.slug),
      parks: groups.parked.map((task) => task.slug),
      openDebt: materialOpenDebts([...input.records]).map(debtEntry),
    },
    concerns: statusConcerns(input.records),
    cost: costView(totals),
    work: workView(totals),
    ...(epics ? { epics } : {}),
    ...(input.intentStatus ? { intentStatus: input.intentStatus } : {}),
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
): Promise<StatusDocument> {
  const tasks = await source.store.listTasks();
  const records = await source.store.listRecords();
  const state = derive(tasks, records, source.flows);
  return buildStatus({
    goal: path.basename(source.store.goalDir),
    state,
    tasks,
    records,
    intentStatus: await readLatestIntentStatus(source.store, state.iteration),
    roleByStep: rolesByStep(source.flows),
    prices: await loadPriceTable(source.priceSource),
    priceIds: source.priceIds,
  });
}

/** Rewrites `status.json` and its dashboard after an agent launch or finish. */
export async function writeStatus(source: StatusSource): Promise<string> {
  const status = await collectStatus(source);
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
