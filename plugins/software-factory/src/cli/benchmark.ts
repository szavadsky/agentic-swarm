import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { loadConfigs, resolveGoalPaths } from "../kernel/config.js";
import {
  costText,
  type GoalMetrics,
  type IncidentCounts,
  type MetricsTotals,
} from "../kernel/metrics.js";
import { createFolderStore } from "../kernel/store.js";
import type { StepRecord } from "../kernel/types.js";

export interface BenchmarkRow {
  metric: string;
  value: string;
  unit: string;
}

export interface BenchmarkReport {
  goal: string;
  goalDir: string;
  iterations: number;
  rows: BenchmarkRow[];
  /** Non-zero classes behind the `loop incidents` row, in a fixed order. */
  incidents: Array<{ label: string; count: number }>;
}

/** The incident classes `loopIncidents` counts; the row and its breakdown share them. */
const LOOP_INCIDENT_LABELS: Array<[keyof IncidentCounts, string]> = [
  ["noProgressParks", "no-progress parks"],
  ["emptyDiffParks", "empty-diff parks"],
];

function mtok(tokens: number): string {
  return (tokens / 1_000_000).toFixed(2);
}

function unpricedText(count: number): string {
  return `${count} unpriced ${count === 1 ? "turn" : "turns"}`;
}

function architectShare(totals: MetricsTotals): string {
  if (totals.usage.costUsd === undefined) return "unknown";
  const value = `${(totals.architect.costShare * 100).toFixed(1)}%`;
  return totals.unpricedTurns > 0 ? `${value} (partial)` : value;
}

function costPerMerged(totals: MetricsTotals): string {
  if (totals.merged.length === 0) return "n/a (no merged tasks)";
  if (totals.costPerMergedTask === null)
    return `unknown (${unpricedText(totals.unpricedTurns)})`;
  const value = `$${totals.costPerMergedTask.toFixed(4)}`;
  return totals.unpricedTurns > 0 ? `${value} (partial)` : value;
}

/** Goal wall clock: first record start to the last start or end on disk. */
function wallMs(records: StepRecord[]): number | undefined {
  let first: number | undefined;
  let last: number | undefined;
  for (const rec of records) {
    const start = Date.parse(rec.startedAt);
    const end = Date.parse(rec.endedAt ?? rec.startedAt);
    if (!Number.isNaN(start))
      first = first === undefined ? start : Math.min(first, start);
    if (!Number.isNaN(end))
      last = last === undefined ? end : Math.max(last, end);
  }
  if (first === undefined || last === undefined) return undefined;
  return Math.max(0, last - first);
}

function wallText(ms: number | undefined): string {
  if (ms === undefined) return "n/a (no records)";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} m` : `${minutes} m`;
}

function readMetrics(text: string, metricsPath: string): GoalMetrics {
  let parsed: GoalMetrics;
  try {
    parsed = yaml.parse(text) as GoalMetrics;
  } catch (err) {
    throw new Error(
      `metrics.yaml at ${metricsPath} is not valid YAML: ${(err as Error).message}`,
    );
  }
  if (!parsed || !Array.isArray(parsed.iterations) || !parsed.totals?.usage) {
    throw new Error(
      `metrics.yaml at ${metricsPath} is not a factory metrics file`,
    );
  }
  if (!parsed.totals.incidents) {
    throw new Error(
      `metrics.yaml at ${metricsPath} has no incident counts; re-run the goal to regenerate it`,
    );
  }
  return parsed;
}

/**
 * Reads one goal's `metrics.yaml` (written by `writeMetrics`) and its records
 * (the only artifact carrying wall clock), then shapes the rows of
 * `bootstrap/context/benchmark.md` §1 so a v2 column can sit beside them.
 */
export async function benchmarkGoal(
  repo: string,
  goal: string,
): Promise<BenchmarkReport> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  const metricsPath = path.join(paths.goalDir, "metrics.yaml");
  const text = await store.readFile("metrics.yaml");
  if (text === null) {
    throw new Error(
      `goal "${goal}" has no metrics.yaml at ${metricsPath}; run the goal first`,
    );
  }
  const metrics = readMetrics(text, metricsPath);
  const totals = metrics.totals;
  const records = await store.listRecords();

  const rows: BenchmarkRow[] = [
    { metric: "launches", value: String(totals.turns), unit: "launches" },
    {
      metric: "architect launches",
      value: String(totals.architect.launches),
      unit: "launches",
    },
    {
      metric: "tokens in/out",
      value: `${mtok(totals.usage.in)} / ${mtok(totals.usage.out)}`,
      unit: "Mtok",
    },
    {
      metric: "cost",
      value: costText(totals.usage.costUsd, totals.unpricedTurns),
      unit: "USD",
    },
    {
      metric: "list cost",
      value: costText(totals.usage.listCostUsd, totals.unpricedTurns),
      unit: "USD",
    },
    {
      metric: "architect share",
      value: architectShare(totals),
      unit: "% of cost",
    },
    {
      metric: "cost per merged",
      value: costPerMerged(totals),
      unit: "USD/merged task",
    },
    {
      metric: "work",
      value: `${totals.edits ?? 0} files, ${totals.testRuns ?? 0} test runs`,
      unit: "files, runs",
    },
    {
      metric: "loop incidents",
      value: String(totals.loopIncidents),
      unit: "events",
    },
    {
      metric: "human interventions",
      value: String(totals.humanInterventions),
      unit: "events",
    },
    {
      metric: "operator acts",
      value: String(totals.operatorActs ?? totals.humanInterventions),
      unit: "events",
    },
    { metric: "wall", value: wallText(wallMs(records)), unit: "h m" },
    {
      metric: "merged/parked",
      value: `${totals.merged.length} / ${totals.parked.length}`,
      unit: "tasks",
    },
  ];

  return {
    goal,
    goalDir: paths.goalDir,
    iterations: metrics.iterations.length,
    rows,
    incidents: LOOP_INCIDENT_LABELS.map(([key, label]) => ({
      label,
      count: totals.incidents[key],
    })).filter((entry) => entry.count > 0),
  };
}

export function formatBenchmark(report: BenchmarkReport): string {
  const breakdown = report.incidents
    .map((entry) => `${entry.label} ${entry.count}`)
    .join(", ");
  return [
    `goal ${report.goal}: ${report.iterations} iteration(s), artifacts ${report.goalDir}`,
    "",
    "| metric | value | unit |",
    "| --- | --- | --- |",
    ...report.rows.map(
      (row) => `| ${row.metric} | ${row.value} | ${row.unit} |`,
    ),
    "",
    `loop incidents: ${breakdown || "none"}`,
    "launches count settled agent turns (one harness launch each); human interventions count steers moved from the inbox; cost-derived rows cover priced turns only.",
  ].join("\n");
}
