/** Accumulating one iteration's metrics. */

import type { Usage } from "../../harness/types.js";
import { addUsage, zeroUsage } from "../../harness/usage.js";
import { pricedRecord } from "../pricing.js";
import type { PriceTable } from "../pricing.js";
import { qaOnlyCatches, type QaOnlyCatches } from "../qa.js";
import type { SummaryStatus } from "../summary.js";
import type { StepRecord } from "../types.js";
import { wasteAccounting } from "../waste.js";
import type { WasteAccounting } from "../waste.js";
import type {
  AliasMetrics,
  ArchitectMetrics,
  IncidentCounts,
  IterationMetrics,
  ModelMetrics,
  PlanReviewMarkCounts,
  RoleMetrics,
} from "./types.js";
import {
  DEFAULT_ROLE_BY_STEP,
  attemptIncidents,
  deriveLaunchKind,
  emptyArchitect,
  emptyIncidents,
  isOutsideAct,
  parkIncidents,
  planReviewMarkCounts,
  recordArchitect,
  recordGroups,
  recordModels,
  recordRebutted,
  recordWaste,
  sortedSlugs,
  tokenTotal,
  width,
} from "./record.js";
import { costPerTask, scriptTotals } from "./totals.js";

/** The running totals one iteration's agent turns accumulate into. */
interface TurnAccumulator {
  usage: Usage;
  unpricedTurns: number;
  edits: number;
  addedLines: number;
  removedLines: number;
  roles: Record<string, RoleMetrics>;
  aliases: Record<string, AliasMetrics>;
  models: Record<string, ModelMetrics>;
  architect: ArchitectMetrics;
}

/** Adds one agent turn's usage, work and group rows to the accumulator. */
function accumulateTurn(
  acc: TurnAccumulator,
  rec: StepRecord,
  roleByStep: Record<string, string>,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): void {
  const priced = pricedRecord(rec, prices, priceIds);
  const part = priced.usage;
  const unpriced = priced.costKnown ? 0 : 1;
  const promptBytes = rec.promptBytes ?? 0;
  const work = {
    edits: rec.edits?.files ?? 0,
    added: rec.edits?.added ?? 0,
    removed: rec.edits?.removed ?? 0,
  };
  acc.usage = addUsage(acc.usage, part);
  acc.unpricedTurns += unpriced;
  acc.edits += work.edits;
  acc.addedLines += work.added;
  acc.removedLines += work.removed;

  const role =
    roleByStep[rec.step] ?? DEFAULT_ROLE_BY_STEP[rec.step] ?? rec.step;
  const launch = deriveLaunchKind(rec);
  recordGroups(
    rec,
    role,
    part,
    unpriced,
    promptBytes,
    work,
    launch,
    acc.roles,
    acc.aliases,
  );
  recordModels(
    rec,
    priced,
    part,
    unpriced,
    promptBytes,
    work,
    launch,
    acc.models,
  );
  recordArchitect(rec, role, acc.architect, unpriced, part);
}

/** Accumulates every agent turn of the iteration. */
function accumulateTurns(
  recs: StepRecord[],
  roleByStep: Record<string, string>,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): TurnAccumulator {
  const acc: TurnAccumulator = {
    usage: zeroUsage(),
    unpricedTurns: 0,
    edits: 0,
    addedLines: 0,
    removedLines: 0,
    roles: {},
    aliases: {},
    models: {},
    architect: emptyArchitect(),
  };
  for (const rec of recs)
    accumulateTurn(acc, rec, roleByStep, prices, priceIds);
  return acc;
}

/** The iteration's waste, incidents and review marks. */
function iterationIncidents(
  all: StepRecord[],
  recs: StepRecord[],
  roleByStep: Record<string, string>,
  roles: Record<string, RoleMetrics>,
  aliases: Record<string, AliasMetrics>,
): {
  incidents: IncidentCounts;
  waste: WasteAccounting;
  planReviewMarks: PlanReviewMarkCounts;
} {
  const incidents = emptyIncidents();
  attemptIncidents(recs, incidents);
  parkIncidents(all, incidents);
  const waste = wasteAccounting({
    records: all,
    roleOf: (step) => roleByStep[step] ?? DEFAULT_ROLE_BY_STEP[step] ?? step,
  });
  for (const entry of waste.entries) recordWaste(roles, aliases, entry);
  for (const review of waste.rebuttedReviews) {
    recordRebutted(roles, aliases, review);
  }
  return { incidents, waste, planReviewMarks: planReviewMarkCounts(all) };
}

/** The slug lists a single iteration's records name. */
function iterationSlugs(all: StepRecord[]): {
  merged: string[];
  parked: string[];
  quarantined: string[];
} {
  return {
    merged: sortedSlugs(all, (r) => r.step === "merge" && r.ok === true),
    parked: sortedSlugs(
      all,
      (r) => r.step === "park" && r.endedAt !== undefined,
    ),
    quarantined: sortedSlugs(
      all,
      (r) => r.step === "task-quarantine" && r.endedAt !== undefined,
    ),
  };
}

/** The inputs one iteration's final metrics object is built from. */
interface IterationMetricsParts {
  n: number;
  status: SummaryStatus;
  recs: StepRecord[];
  all: StepRecord[];
  acc: TurnAccumulator;
  slugs: ReturnType<typeof iterationSlugs>;
  humanInterventions: number;
  incidents: IncidentCounts;
  waste: WasteAccounting;
  planReviewMarks: PlanReviewMarkCounts;
  qaOnlyCatches: QaOnlyCatches;
}

/** Assembles one iteration's metrics from its accumulated parts. */
function iterationMetricsResult(
  parts: IterationMetricsParts,
): IterationMetrics {
  const { acc, slugs, incidents, humanInterventions, all, recs } = parts;
  const { usage, unpricedTurns, edits, addedLines, removedLines } = acc;
  // Gate/commit wall and test runs come from the script records' own stamps;
  // a gate's test runs are the script's work, not the agent turn it verifies.
  const { gateWallMs, commitWallMs, gateRuns, testRuns } = scriptTotals(
    all,
    acc.roles,
  );
  const operatorActs = humanInterventions + all.filter(isOutsideAct).length;
  const tokens = tokenTotal(usage);
  acc.architect.costShare = width(
    acc.architect.usage.costUsd ?? 0,
    usage.costUsd ?? 0,
  );
  acc.architect.tokenShare = width(acc.architect.tokens, tokens);
  acc.architect.turnShare = width(acc.architect.turns, recs.length);
  return {
    n: parts.n,
    status: parts.status,
    turns: recs.length,
    merged: slugs.merged,
    parked: slugs.parked,
    quarantined: slugs.quarantined,
    usage,
    tokens,
    costPerMergedTask: costPerTask(slugs.merged.length, usage.costUsd),
    listCostPerMergedTask: costPerTask(slugs.merged.length, usage.listCostUsd),
    harnessCostPerMergedTask: costPerTask(
      slugs.merged.length,
      usage.harnessCostUsd,
    ),
    roles: acc.roles,
    aliases: acc.aliases,
    models: acc.models,
    architect: acc.architect,
    planReviewMarks: parts.planReviewMarks,
    qaOnlyCatches: parts.qaOnlyCatches,
    unpricedTurns,
    waste: parts.waste,
    incidents,
    loopIncidents: incidents.noProgressParks + incidents.emptyDiffParks,
    humanInterventions,
    operatorActs,
    gateWallMs,
    commitWallMs,
    gateRuns,
    testRuns,
    edits,
    addedLines,
    removedLines,
  };
}

/** One iteration's spend and incidents, shared by `metrics.yaml` and its summary. */
export function iterationMetrics(
  n: number,
  status: SummaryStatus,
  records: StepRecord[],
  roleByStep: Record<string, string>,
  humanInterventions: number,
  prices: PriceTable,
  priceIds?: Record<string, string>,
): IterationMetrics {
  const recs = records.filter(
    (r) => r.iteration === n && r.endedAt && r.actor === "agent",
  );
  const acc = accumulateTurns(recs, roleByStep, prices, priceIds);
  const all = records.filter((r) => r.iteration === n);
  const qaOnly = qaOnlyCatches(all);
  const { incidents, waste, planReviewMarks } = iterationIncidents(
    all,
    recs,
    roleByStep,
    acc.roles,
    acc.aliases,
  );
  return iterationMetricsResult({
    n,
    status,
    recs,
    all,
    acc,
    slugs: iterationSlugs(all),
    humanInterventions,
    incidents,
    waste,
    planReviewMarks,
    qaOnlyCatches: qaOnly,
  });
}
