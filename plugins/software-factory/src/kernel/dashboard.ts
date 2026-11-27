import fs from "node:fs";
import path from "node:path";
import { Liquid } from "liquidjs";
import { DASHBOARD_TEMPLATE } from "./dashboard-template.js";
import { formatSteerRoute } from "./mailbox/routes.js";
import type {
  StatusCost,
  StatusDocument,
  StatusOpenConcern,
  StatusSteer,
  StatusStop,
  StatusTask,
  StatusWork,
  SteerState,
} from "./status.js";
import type { IntentStatusArtifact } from "./summary/types.js";
import type { ArtifactStore, IntentStatusEntry } from "./types.js";
import type { DashboardAsset } from "./dashboard-types.js";

/** Goal-relative path of the static dashboard written beside status.json. */
export const DASHBOARD_REL_PATH = "dashboard.html";

/**
 * The page's only external loads. Both are MIT-licensed browser bundles kept in
 * the factory's vendor directory; the goal directory gets its own copies so it
 * opens from disk, survives a moved artifact folder, and never hits a network.
 */
export const DASHBOARD_ASSETS: readonly DashboardAsset[] = [
  { rel: "vendor/pico.min.css", source: "vendor/pico.min.css" },
  { rel: "vendor/chart.umd.min.js", source: "vendor/chart.umd.min.js" },
];

const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");

/** Copies each vendored asset; byte-identical files are left untouched. */
export async function writeDashboardAssets(
  store: ArtifactStore,
): Promise<void> {
  for (const asset of DASHBOARD_ASSETS) {
    const text = await fs.promises.readFile(
      path.join(PLUGIN_ROOT, asset.source),
      "utf8",
    );
    if ((await store.readFile(asset.rel)) === text) continue;
    await store.writeFile(asset.rel, text);
  }
}

interface CostRow {
  name: string;
  turns: string;
  tokens: string;
  harnessCost: string;
  listCost: string;
  unpricedTurns: string;
}

interface WorkRow {
  name: string;
  turns: string;
  edits: string;
  addedLines: string;
  removedLines: string;
  testRuns: string;
}

type WorkTotals = Omit<WorkRow, "name">;

interface IntentRow {
  slug: string;
  section: string | null;
  /** Enum value, also the badge modifier. */
  status: IntentStatusEntry["status"];
  /** Display wording: `not-built` reads as "not built". */
  label: string;
  note: string | null;
}

/**
 * The intent view derives only from the architect's artifact. `known` stays
 * false for a missing artifact and for an artifact that lists no sections;
 * neither case falls back to a task count.
 */
interface IntentView {
  hasArtifact: boolean;
  known: boolean;
  iteration: number | null;
  works: number;
  notBuilt: number;
  friction: number;
  total: number;
  rows: IntentRow[];
  /** JSON for the chart script; `<` is escaped so a section name cannot close the tag. */
  chartJson: string;
}

/** The lead paragraph plus who wrote it, so the page never presents a guess as a PM summary. */
interface StatusView {
  text: string;
  attribution: string;
  record: string | null;
}

/** One open concern row; a missing record renders as a dash, never a broken link. */
interface OpenConcernRow {
  id: string | null;
  kind: string;
  calibration: string;
  text: string;
  evidence: string | null;
  source: string;
  record: string | null;
}

/** One steer row: state, the PM's route and the answer it carries. */
interface SteerRow {
  id: string;
  state: SteerState;
  route: string | null;
  answer: string | null;
  record: string | null;
}

/** The stop badge the header shows, with the cause the launch printed. */
interface StopView {
  reason: string;
  label: string;
  detail: string | null;
  /** Done and blocked already read from the goal badge; only the others add a badge. */
  shows: boolean;
}

/**
 * The dashboard's derived view: Liquid stays a template language, so counts,
 * percentages, money, number formatting and chart JSON are settled here and
 * tested as values rather than re-derived inside markup.
 */
interface DashboardSummary {
  status: StatusView;
  intent: IntentView;
  tasks: StatusTask[];
  spend: {
    harnessCost: string;
    listCost: string;
    tokens: string;
    unpricedTurns: string;
    harnessPerMergedTask: string;
    listPerMergedTask: string;
  };
  costRoles: CostRow[];
  costModels: CostRow[];
  work: WorkTotals;
  workRoles: WorkRow[];
  workModels: WorkRow[];
  epics: { name: string; tasks: string[] }[];
  openConcerns: OpenConcernRow[];
  concerns: { open: number; recorded: number; debt: number };
  steers: {
    total: number;
    waiting: number;
    routed: number;
    answered: number;
    processed: number;
    rows: SteerRow[];
  };
  stop: StopView | null;
}

const INT = new Intl.NumberFormat("en-US");
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const INTENT_LABEL: Record<IntentStatusEntry["status"], string> = {
  works: "works",
  "not-built": "not built",
  friction: "friction",
};

const STOP_LABEL: Record<string, string> = {
  done: "done",
  blocked: "blocked",
  "iteration-limit": "iteration limit",
  promote: "awaiting promotion",
  interrupted: "interrupted",
  infra: "infrastructure stop",
};

function count(value: number): string {
  return INT.format(value);
}

/** Null means the price table had no entry: the dashboard says so, never $0.00. */
function money(value: number | null): string {
  if (value === null) return "n/a";
  const tiny = value !== 0 && Math.abs(value) < 0.01;
  return (tiny ? USD_PRECISE : USD).format(value);
}

function costRows(groups: Record<string, StatusCost>): CostRow[] {
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, row]) => ({
      name,
      turns: count(row.turns),
      tokens: count(row.tokens),
      harnessCost: money(row.harnessCostUsd),
      listCost: money(row.listCostUsd),
      unpricedTurns: count(row.unpricedTurns),
    }));
}

function workRows(groups: Record<string, StatusWork>): WorkRow[] {
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, row]) => ({
      name,
      turns: count(row.turns),
      edits: count(row.edits),
      addedLines: count(row.addedLines),
      removedLines: count(row.removedLines),
      testRuns: count(row.testRuns),
    }));
}

function workTotals(work: StatusDocument["work"]): WorkTotals {
  return {
    turns: count(work.turns),
    edits: count(work.edits),
    addedLines: count(work.addedLines),
    removedLines: count(work.removedLines),
    testRuns: count(work.testRuns),
  };
}

function statusView(summary: StatusDocument["summary"]): StatusView {
  return {
    text: summary.text,
    attribution:
      summary.source === "pm"
        ? `PM summary, iteration ${summary.iteration}`
        : "kernel-derived mechanical status",
    record: summary.record ?? null,
  };
}

function intentView(artifact: IntentStatusArtifact | undefined): IntentView {
  const rows: IntentRow[] = (artifact?.sections ?? []).map((entry) => ({
    slug: entry.slug ?? entry.section ?? "",
    section: entry.slug === undefined ? null : (entry.section ?? null),
    status: entry.status,
    label: INTENT_LABEL[entry.status],
    note: entry.note ?? null,
  }));
  const works = rows.filter((row) => row.status === "works").length;
  const notBuilt = rows.filter((row) => row.status === "not-built").length;
  const friction = rows.filter((row) => row.status === "friction").length;
  const chartJson = JSON.stringify({
    labels: ["Works", "Not built", "Friction"],
    counts: [works, notBuilt, friction],
  }).replace(/</g, "\\u003c");
  return {
    hasArtifact: artifact !== undefined,
    known: rows.length > 0,
    iteration: artifact?.iteration ?? null,
    works,
    notBuilt,
    friction,
    total: rows.length,
    rows,
    chartJson,
  };
}

function summaryOf(status: StatusDocument): DashboardSummary {
  const tokens = Object.values(status.cost.byRole).reduce(
    (sum, row) => sum + row.tokens,
    0,
  );
  const steers = status.steers ?? [];
  return {
    status: statusView(status.summary),
    intent: intentView(status.intentStatus),
    tasks: [
      ...status.tasks.open,
      ...status.tasks.merged,
      ...status.tasks.finished,
      ...status.tasks.parked,
      ...status.tasks.cancelled,
    ],
    spend: {
      harnessCost: money(status.cost.harnessCostUsd),
      listCost: money(status.cost.listCostUsd),
      tokens: count(tokens),
      unpricedTurns: count(status.cost.unpricedTurns),
      harnessPerMergedTask: money(status.cost.harnessCostPerMergedTask),
      listPerMergedTask: money(status.cost.listCostPerMergedTask),
    },
    costRoles: costRows(status.cost.byRole),
    costModels: costRows(status.cost.byModel),
    work: workTotals(status.work),
    workRoles: workRows(status.work.byRole),
    workModels: workRows(status.work.byModel),
    epics: Object.entries(status.epics ?? {}).map(([name, tasks]) => ({
      name,
      tasks,
    })),
    openConcerns: status.openConcerns.map((concern) => concernRow(concern)),
    concerns: {
      open: status.openConcerns.length,
      recorded: status.concerns.length,
      debt: status.distance.openDebt.length,
    },
    steers: {
      total: steers.length,
      waiting: steers.filter((steer) => steer.state === "waiting").length,
      routed: steers.filter((steer) => steer.state === "routed").length,
      answered: steers.filter((steer) => steer.state === "answered").length,
      processed: steers.filter((steer) => steer.state === "processed").length,
      rows: steers.map(steerRow),
    },
    stop: stopView(status.stop),
  };
}

function concernRow(concern: StatusOpenConcern): OpenConcernRow {
  return {
    id: concern.id ?? null,
    kind: concern.kind,
    calibration: concern.calibration,
    text: concern.text,
    evidence: concern.evidence ?? null,
    source: concern.source,
    record: concern.record ?? null,
  };
}

function steerRow(steer: StatusSteer): SteerRow {
  return {
    id: steer.id,
    state: steer.state,
    route: steer.route ? formatSteerRoute(steer.route) : null,
    answer: steer.answer ?? null,
    record: steer.record ?? null,
  };
}

function stopView(stop: StatusStop | undefined): StopView | null {
  if (!stop) return null;
  return {
    reason: stop.reason,
    label: `stopped: ${STOP_LABEL[stop.reason] ?? stop.reason}`,
    detail:
      stop.cause ??
      (stop.interruptedBy ? `signal ${stop.interruptedBy}` : null),
    shows: stop.reason !== "done" && stop.reason !== "blocked",
  };
}

const engine = new Liquid({ strictFilters: true });
const template = engine.parse(DASHBOARD_TEMPLATE);

/** Renders the single-file dashboard from one snapshot; no server, no network. */
export function renderDashboard(status: StatusDocument): string {
  const html = engine.renderSync(template, {
    doc: status,
    summary: summaryOf(status),
  });
  return `${String(html).trimEnd()}\n`;
}
