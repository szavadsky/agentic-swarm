/** Accumulating goal totals and the summary lists. */

import type { Usage } from "../../harness/types.js";
import { addUsage, zeroUsage } from "../../harness/usage.js";
import { emptyWasteAccounting } from "../waste.js";
import type { WasteAccounting } from "../waste.js";
import type {
  AliasMetrics,
  ArchitectMetrics,
  IncidentCounts,
  IterationMetrics,
  MetricsTotals,
  ModelMetrics,
  PlanReviewMarkCounts,
  RoleMetrics,
} from "./types.js";
import { emptyArchitect, emptyIncidents, width } from "./record.js";
import {
  costPerTask,
  sumArchitect,
  sumIncidents,
  sumIterationGroups,
  sumWaste,
} from "./totals.js";

/** The running totals every iteration accumulates into. */
interface TotalsAccumulator {
  usage: Usage;
  tokens: number;
  turns: number;
  merged: number;
  parked: number;
  loopIncidents: number;
  humanInterventions: number;
  operatorActs: number;
  gateWallMs: number;
  commitWallMs: number;
  gateRuns: number;
  testRuns: number;
  edits: number;
  addedLines: number;
  removedLines: number;
  unpricedTurns: number;
  roles: Record<string, RoleMetrics>;
  aliases: Record<string, AliasMetrics>;
  models: Record<string, ModelMetrics>;
  incidents: IncidentCounts;
  architect: ArchitectMetrics;
  planReviewMarks: PlanReviewMarkCounts;
  waste: WasteAccounting;
}

/** The empty accumulator a totals run starts from. */
function emptyTotals(): TotalsAccumulator {
  return {
    usage: zeroUsage(),
    tokens: 0,
    turns: 0,
    merged: 0,
    parked: 0,
    loopIncidents: 0,
    humanInterventions: 0,
    operatorActs: 0,
    gateWallMs: 0,
    commitWallMs: 0,
    gateRuns: 0,
    testRuns: 0,
    edits: 0,
    addedLines: 0,
    removedLines: 0,
    unpricedTurns: 0,
    roles: {},
    aliases: {},
    models: {},
    incidents: emptyIncidents(),
    architect: emptyArchitect(),
    planReviewMarks: { helpful: 0, unhelpful: 0 },
    waste: emptyWasteAccounting(),
  };
}

/** Folds every iteration's metrics into the running totals. */
function sumIterations(
  iterations: IterationMetrics[],
  totals: TotalsAccumulator,
): void {
  for (const iteration of iterations) {
    totals.usage = addUsage(totals.usage, iteration.usage);
    totals.tokens += iteration.tokens;
    totals.turns += iteration.turns;
    totals.merged += iteration.merged.length;
    totals.parked += iteration.parked.length;
    totals.loopIncidents += iteration.loopIncidents;
    totals.humanInterventions += iteration.humanInterventions;
    totals.operatorActs += iteration.operatorActs;
    totals.gateWallMs += iteration.gateWallMs;
    totals.commitWallMs += iteration.commitWallMs;
    totals.gateRuns += iteration.gateRuns;
    totals.testRuns += iteration.testRuns;
    totals.edits += iteration.edits;
    totals.addedLines += iteration.addedLines;
    totals.removedLines += iteration.removedLines;
    totals.unpricedTurns += iteration.unpricedTurns;
    sumIterationGroups(iteration, totals.roles, totals.aliases, totals.models);
    sumIncidents(totals.incidents, iteration.incidents);
    sumArchitect(totals.architect, iteration.architect);
    totals.planReviewMarks.helpful += iteration.planReviewMarks?.helpful ?? 0;
    totals.planReviewMarks.unhelpful +=
      iteration.planReviewMarks?.unhelpful ?? 0;
    sumWaste(totals.waste, iteration.waste);
  }
}

/** Assembles the totals object from the accumulated fields. */
function totalsResult(
  iterations: IterationMetrics[],
  totals: TotalsAccumulator,
): MetricsTotals {
  totals.architect.costShare = width(
    totals.architect.usage.costUsd ?? 0,
    totals.usage.costUsd ?? 0,
  );
  totals.architect.tokenShare = width(totals.architect.tokens, totals.tokens);
  return {
    iterations: iterations.length,
    turns: totals.turns,
    merged: mergedList(iterations),
    parked: parkedList(iterations),
    quarantined: quarantinedList(iterations),
    usage: totals.usage,
    tokens: totals.tokens,
    costPerMergedTask: costPerTask(totals.merged, totals.usage.costUsd),
    listCostPerMergedTask: costPerTask(totals.merged, totals.usage.listCostUsd),
    roles: totals.roles,
    aliases: totals.aliases,
    models: totals.models,
    architect: totals.architect,
    planReviewMarks: totals.planReviewMarks,
    unpricedTurns: totals.unpricedTurns,
    waste: totals.waste,
    incidents: totals.incidents,
    loopIncidents: totals.loopIncidents,
    humanInterventions: totals.humanInterventions,
    operatorActs: totals.operatorActs,
    gateWallMs: totals.gateWallMs,
    commitWallMs: totals.commitWallMs,
    gateRuns: totals.gateRuns,
    testRuns: totals.testRuns,
    edits: totals.edits,
    addedLines: totals.addedLines,
    removedLines: totals.removedLines,
  };
}

export function totalsOf(iterations: IterationMetrics[]): MetricsTotals {
  const totals = emptyTotals();
  sumIterations(iterations, totals);
  return totalsResult(iterations, totals);
}

function mergedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.merged).sort();
}

function parkedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.parked).sort();
}

function quarantinedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.quarantined).sort();
}
