/** Summing groups, iterations, incidents and waste. */

import { addUsage } from "../../harness/usage.js";
import type { StepRecord } from "../types.js";
import { WASTE_REASONS } from "../waste.js";
import type { WasteAccounting } from "../waste.js";
import type {
  AliasMetrics,
  ArchitectMetrics,
  GroupMetrics,
  IncidentCounts,
  IterationMetrics,
  ModelMetrics,
  RoleMetrics,
} from "./types.js";
import { emptyGroup, wallMsOf } from "./record.js";

interface ScriptTotals {
  gateWallMs: number;
  commitWallMs: number;
  gateRuns: number;
  testRuns: number;
}

/** Gate/commit wall and test runs from the script records' own stamps. */
export function scriptTotals(
  all: StepRecord[],
  roles: Record<string, RoleMetrics>,
): ScriptTotals {
  const totals: ScriptTotals = {
    gateWallMs: 0,
    commitWallMs: 0,
    gateRuns: 0,
    testRuns: 0,
  };
  for (const rec of all) {
    if (!rec.endedAt) continue;
    if (rec.step !== "checks" && rec.step !== "merge-checks") {
      if (rec.step === "commit") totals.commitWallMs += wallMsOf(rec);
      continue;
    }
    totals.gateWallMs += wallMsOf(rec);
    totals.gateRuns += 1;
    const runs = rec.testRuns ?? rec.checks?.length ?? 0;
    totals.testRuns += runs;
    const scriptRole = roles["script"] ?? { role: "script", ...emptyGroup() };
    scriptRole.testRuns += runs;
    roles["script"] = scriptRole;
  }
  return totals;
}

/** Priced cost per merged task, null when nothing merged or no cost is known. */
export function costPerTask(
  merged: number,
  cost: number | undefined,
): number | null {
  return merged > 0 && cost !== undefined ? cost / merged : null;
}

/** Adds one iteration's group into the running total for its name. */
function sumGroupInto<T extends GroupMetrics>(
  totals: Record<string, T>,
  name: string,
  entry: T,
  create: (name: string) => T,
): void {
  const total = totals[name] ?? create(name);
  sumGroup(total, entry);
  totals[name] = total;
}

function sumGroup<T extends GroupMetrics>(total: T, entry: GroupMetrics): void {
  total.turns += entry.turns;
  total.usage = addUsage(total.usage, entry.usage);
  total.tokens += entry.tokens;
  total.promptBytes += entry.promptBytes;
  total.unpricedTurns += entry.unpricedTurns;
  total.edits += entry.edits;
  total.addedLines += entry.addedLines;
  total.removedLines += entry.removedLines;
  total.testRuns += entry.testRuns;
  total.launches.glitch += entry.launches.glitch;
  total.launches["change-request"] += entry.launches["change-request"];
  total.launches["qa-finding"] += entry.launches["qa-finding"];
  total.launches.failure += entry.launches.failure;
  total.launches.unknown += entry.launches.unknown;
  for (const reason of WASTE_REASONS) {
    total.waste[reason] += entry.waste[reason];
  }
  total.rebuttedReviews += entry.rebuttedReviews;
}

export function sumIterationGroups(
  iteration: IterationMetrics,
  roles: Record<string, RoleMetrics>,
  aliases: Record<string, AliasMetrics>,
  models: Record<string, ModelMetrics>,
): void {
  for (const entry of Object.values(iteration.roles)) {
    sumGroupInto(roles, entry.role, entry, (role) => ({
      role,
      ...emptyGroup(),
    }));
  }
  for (const entry of Object.values(iteration.aliases)) {
    sumGroupInto(aliases, entry.alias, entry, (alias) => ({
      alias,
      ...emptyGroup(),
    }));
  }
  for (const entry of Object.values(iteration.models ?? {})) {
    sumGroupInto(models, entry.model, entry, (model) => ({
      model,
      ...emptyGroup(),
    }));
  }
}

export function sumIncidents(
  total: IncidentCounts,
  part: IncidentCounts,
): void {
  for (const key of Object.keys(total) as (keyof IncidentCounts)[]) {
    total[key] += part[key];
  }
}

export function sumArchitect(
  total: ArchitectMetrics,
  part: ArchitectMetrics,
): void {
  total.turns += part.turns;
  total.launches += part.launches;
  total.usage = addUsage(total.usage, part.usage);
  total.tokens += part.tokens;
  total.unpricedTurns += part.unpricedTurns;
}

export function sumWaste(total: WasteAccounting, part: WasteAccounting): void {
  total.turns += part.turns;
  for (const reason of WASTE_REASONS) {
    total.counts[reason] += part.counts[reason];
  }
  total.entries.push(...part.entries);
  total.quotaStops.push(...part.quotaStops);
  total.rebuttedReviews.push(...part.rebuttedReviews);
}
