import { Liquid } from "liquidjs";
import { DASHBOARD_TEMPLATE } from "./dashboard-template.js";
import type {
  StatusCost,
  StatusDocument,
  StatusTask,
  StatusWork,
} from "./status.js";

/** Goal-relative path of the static dashboard written beside status.json. */
export const DASHBOARD_REL_PATH = "dashboard.html";

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

/**
 * The dashboard's derived view: Liquid stays a template language, so counts,
 * percentages, money and number formatting are settled here and tested as
 * values rather than re-derived inside markup.
 */
interface DashboardSummary {
  done: number;
  live: number;
  percent: number;
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

function summaryOf(status: StatusDocument): DashboardSummary {
  const done = status.tasks.merged.length + status.tasks.finished.length;
  const live = done + status.tasks.open.length + status.tasks.parked.length;
  const tokens = Object.values(status.cost.byRole).reduce(
    (sum, row) => sum + row.tokens,
    0,
  );
  return {
    done,
    live,
    percent: live === 0 ? 0 : Math.round((done / live) * 100),
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
