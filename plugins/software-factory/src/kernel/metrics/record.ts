/** Recording turns, launches, models, architects, waste and reviews. */

import type { Stop, TurnAttempt, Usage } from "../../harness/types.js";
import {
  addUsage,
  countOutcomeRepairs,
  zeroUsage,
} from "../../harness/usage.js";
import { qaReportOf } from "../qa.js";
import { pricedRecord } from "../pricing.js";
import type {
  FlowDefinition,
  LaunchKind,
  Outcome,
  StepRecord,
} from "../types.js";
import { emptyWasteCounts } from "../waste.js";
import type { WasteReason } from "../waste.js";
import type {
  AliasMetrics,
  ArchitectMetrics,
  GroupMetrics,
  IncidentCounts,
  LaunchCounts,
  ModelMetrics,
  PlanReviewMarkCounts,
  RoleMetrics,
} from "./types.js";

/** Step id -> prompt (the role) across every configured flow; metrics name roles, not steps. */
export function rolesByStep(
  flows: Record<string, FlowDefinition>,
): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const flow of Object.values(flows)) {
    for (const step of flow.steps) {
      if (step.prompt) roles[step.id] = step.prompt;
    }
  }
  return roles;
}

export const DEFAULT_ROLE_BY_STEP: Record<string, string> = {
  architect: "architect",
  planreturn: "architect",
  subarchitect: "subarchitect",
  pm: "pm",
  digest: "digest",
  implement: "implementer",
  qa: "qa",
  review: "reviewer",
};

/** Known zero stays $0.0000; unknown never does; a partial sum says so. */
export function costText(
  costUsd: number | undefined,
  unpricedTurns: number,
): string {
  const unknown = `${unpricedTurns} unpriced ${unpricedTurns === 1 ? "turn" : "turns"}`;
  if (unpricedTurns === 0) return `$${(costUsd ?? 0).toFixed(4)}`;
  if (costUsd === undefined) return `unknown (${unknown})`;
  return `$${costUsd.toFixed(4)} (partial; ${unknown})`;
}

export function tokenTotal(usage: Usage): number {
  return (
    usage.in +
    usage.cacheRead +
    usage.cacheWrite5m +
    usage.cacheWrite1h +
    usage.out +
    usage.reasoningOut
  );
}

export function emptyArchitect(): ArchitectMetrics {
  return {
    turns: 0,
    launches: 0,
    usage: zeroUsage(),
    tokens: 0,
    costShare: 0,
    tokenShare: 0,
    turnShare: 0,
    unpricedTurns: 0,
  };
}

export function emptyIncidents(): IncidentCounts {
  return {
    infraRetries: 0,
    fallbackHops: 0,
    outcomeRepairs: 0,
    mergeConflicts: 0,
    mergedGateFailures: 0,
    gateFlakes: 0,
    roundLimitParks: 0,
    noProgressParks: 0,
    emptyDiffParks: 0,
    overflowParks: 0,
  };
}

export function width(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function sameModel(
  left: { id: string; effort?: string },
  right: { id: string; effort?: string },
): boolean {
  return left.id === right.id && (left.effort ?? "") === (right.effort ?? "");
}

function addTurn<T extends GroupMetrics>(
  entry: T,
  part: Usage,
  unpriced: number,
  promptBytes: number,
  work: { edits: number; added: number; removed: number } = {
    edits: 0,
    added: 0,
    removed: 0,
  },
  launch: LaunchKind | "unknown" | undefined = undefined,
): void {
  entry.turns += 1;
  entry.unpricedTurns += unpriced;
  entry.usage = addUsage(entry.usage, part);
  entry.tokens += tokenTotal(part);
  entry.promptBytes += promptBytes;
  entry.edits += work.edits;
  entry.addedLines += work.added;
  entry.removedLines += work.removed;
  if (launch) entry.launches[launch] += 1;
}

function emptyLaunches(): LaunchCounts {
  return {
    glitch: 0,
    "change-request": 0,
    "qa-finding": 0,
    failure: 0,
    unknown: 0,
  };
}

export function emptyGroup(): Omit<GroupMetrics, "turns"> & { turns: number } {
  return {
    turns: 0,
    usage: zeroUsage(),
    tokens: 0,
    promptBytes: 0,
    unpricedTurns: 0,
    edits: 0,
    addedLines: 0,
    removedLines: 0,
    testRuns: 0,
    launches: emptyLaunches(),
    waste: emptyWasteCounts(),
    rebuttedReviews: 0,
  };
}

export function wallMsOf(rec: StepRecord): number {
  if (rec.wallMs !== undefined) return Math.max(0, rec.wallMs);
  if (!rec.endedAt) return 0;
  const start = Date.parse(rec.startedAt);
  const end = Date.parse(rec.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

export function isOutsideAct(rec: StepRecord): boolean {
  if (rec.step === "containment" && rec.cause?.kind === "outside-change") {
    return true;
  }
  if (rec.step === "merge" && rec.cause?.kind === "integration-moved") {
    return true;
  }
  return false;
}

/**
 * An infra stop followed by a different model or harness: the tier walk moved
 * on because retries could not cure the stop.
 */
export function hasFallbackHop(
  attempts: readonly TurnAttempt[] | undefined,
): boolean {
  if (!attempts) return false;
  for (let i = 1; i < attempts.length; i += 1) {
    const previous = attempts[i - 1]!;
    const next = attempts[i]!;
    if (previous.stop.kind !== "infra") continue;
    if (
      sameModel(previous.model, next.model) &&
      previous.harness === next.harness
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * The launch kind a turn's own facts give, none for a normal turn. A turn that
 * delivered after a reminder delivered: its repair finding is recorded, so it
 * is no failure. A cancellation is the operator stopping the turn, not the
 * model failing.
 */
export function launchKindOf(rec: {
  stop?: Stop;
  outcome?: Outcome;
  attempts?: readonly TurnAttempt[];
  repairFindings?: readonly string[];
}): LaunchKind | undefined {
  if (rec.stop?.kind === "infra") return "glitch";
  if (hasFallbackHop(rec.attempts)) return "glitch";
  if (rec.outcome?.verdict === "changes") return "change-request";
  if (qaReportOf(rec.outcome ?? undefined)?.verdict === "changes")
    return "qa-finding";
  if (rec.outcome?.status === "failed" || rec.outcome?.status === "blocked") {
    return "failure";
  }
  if (rec.stop?.kind === "cancelled") return undefined;
  if (rec.outcome === undefined && (rec.repairFindings?.length ?? 0) > 0) {
    return "failure";
  }
  return undefined;
}

/**
 * One record's launch kind for the per-agent counts. A stored kind wins; an
 * old incident record without one counts as unknown; a normal turn counts
 * nowhere. Parks are incidents with stored kinds; other script records are not
 * launches.
 */
export function deriveLaunchKind(
  rec: StepRecord,
): LaunchKind | "unknown" | undefined {
  if (rec.launchKind) return rec.launchKind;
  if (rec.actor === "script") {
    return rec.step === "park" && rec.endedAt ? "unknown" : undefined;
  }
  if (!rec.endedAt) return undefined;
  // A launch that left a kind was an incident; an old record never stored it.
  if (launchKindOf(rec)) return "unknown";
  // Older still: a repair turn whose record carries no finding text.
  if (!rec.outcome && countOutcomeRepairs(rec.attempts) > 0) return "unknown";
  return undefined;
}

export function attemptIncidents(
  recs: StepRecord[],
  incidents: IncidentCounts,
): void {
  for (const rec of recs) {
    const attempts = rec.attempts ?? [];
    incidents.outcomeRepairs += countOutcomeRepairs(attempts);
    for (let i = 1; i < attempts.length; i += 1) {
      const previous = attempts[i - 1]!;
      const next = attempts[i]!;
      if (previous.stop.kind !== "infra") continue;
      if (
        sameModel(previous.model, next.model) &&
        previous.harness === next.harness
      ) {
        incidents.infraRetries += 1;
      } else {
        incidents.fallbackHops += 1;
      }
    }
  }
}

/** Counts one park reason; an unknown reason names no incident bucket. */
function countPark(incidents: IncidentCounts, cause: string | undefined): void {
  switch (cause) {
    case "round-limit":
    case "change-requests-exhausted":
      incidents.roundLimitParks += 1;
      break;
    case "no-progress":
      incidents.noProgressParks += 1;
      break;
    // An empty-diff park is a loop signal: the turn consumed budget without
    // producing work. A spike's empty turn is a normal `finish` record, not a
    // park, so it never reaches this count.
    case "empty-diff":
      incidents.emptyDiffParks += 1;
      break;
    case "overflow":
      incidents.overflowParks += 1;
      break;
    default:
      break;
  }
}

export function parkIncidents(
  all: StepRecord[],
  incidents: IncidentCounts,
): void {
  for (const rec of all) {
    if (rec.step === "merge" && rec.cause?.kind === "conflict") {
      incidents.mergeConflicts += 1;
    } else if (rec.step === "merge-checks" && rec.ok === false && !rec.cause) {
      incidents.mergedGateFailures += 1;
    } else if (rec.step === "gate-flake" && rec.endedAt) {
      incidents.gateFlakes += 1;
    } else if (rec.step === "park" && rec.endedAt) {
      countPark(incidents, rec.cause?.kind);
    }
  }
}

/** Work one record committed, as the group totals count it. */
interface WorkSize {
  edits: number;
  added: number;
  removed: number;
}

type Priced = ReturnType<typeof pricedRecord>;

/** Adds one turn's spend and work to its role and alias groups. */
export function recordGroups(
  rec: StepRecord,
  role: string,
  part: Usage,
  unpriced: number,
  promptBytes: number,
  work: WorkSize,
  launch: LaunchKind | "unknown" | undefined,
  roles: Record<string, RoleMetrics>,
  aliases: Record<string, AliasMetrics>,
): void {
  const roleEntry = roles[role] ?? { role, ...emptyGroup() };
  addTurn(roleEntry, part, unpriced, promptBytes, work, launch);
  roles[role] = roleEntry;
  // Records written before aliases existed fall back to the role name, so a
  // spend row always names a grouping the run config can resolve.
  const alias = rec.alias ?? role;
  const aliasEntry = aliases[alias] ?? { alias, ...emptyGroup() };
  addTurn(aliasEntry, part, unpriced, promptBytes, work, launch);
  aliases[alias] = aliasEntry;
}

function addModelTurn(
  model: string,
  part: Usage,
  unpriced: number,
  promptBytes: number,
  work: WorkSize | undefined,
  launch: LaunchKind | "unknown" | undefined,
  models: Record<string, ModelMetrics>,
): void {
  const entry = models[model] ?? { model, ...emptyGroup() };
  addTurn(entry, part, unpriced, promptBytes, work, launch);
  models[model] = entry;
}

/** Adds one record's turn to the model rows, split per served model. */
export function recordModels(
  rec: StepRecord,
  priced: Priced,
  part: Usage,
  unpriced: number,
  promptBytes: number,
  work: WorkSize,
  launch: LaunchKind | "unknown" | undefined,
  models: Record<string, ModelMetrics>,
): void {
  if (!priced.served) {
    addModelTurn(
      rec.model?.id ?? "unknown",
      part,
      unpriced,
      promptBytes,
      work,
      launch,
      models,
    );
    return;
  }
  // A turn that served several models counts once per model it served, but its
  // work and prompt belong to the record: they land on the record's own model
  // row so a native hop does not double-count committed work.
  const ownsWork = priced.served.some(
    (entry) => entry.model.id === rec.model?.id,
  )
    ? rec.model!.id
    : priced.served[0]!.model.id;
  for (const entry of priced.served) {
    const owner = entry.model.id === ownsWork;
    addModelTurn(
      entry.model.id,
      entry.usage,
      entry.costKnown ? 0 : 1,
      owner ? promptBytes : 0,
      owner ? work : undefined,
      owner ? launch : undefined,
      models,
    );
  }
}

/** Adds one record's turn to the architect totals when it was an architect turn. */
export function recordArchitect(
  rec: StepRecord,
  role: string,
  architect: ArchitectMetrics,
  unpriced: number,
  part: Usage,
): void {
  if (role !== "architect" && rec.step !== "architect") return;
  architect.turns += 1;
  architect.launches += 1;
  architect.unpricedTurns += unpriced;
  architect.usage = addUsage(architect.usage, part);
  architect.tokens += tokenTotal(part);
}

/** Slugs of the records a predicate selects, sorted. */
export function sortedSlugs(
  all: StepRecord[],
  predicate: (rec: StepRecord) => boolean,
): string[] {
  return all
    .filter(predicate)
    .map((r) => r.slug!)
    .sort();
}

/** Adds one wasted turn to its role and alias waste counts. */
export function recordWaste(
  roles: Record<string, RoleMetrics>,
  aliases: Record<string, AliasMetrics>,
  entry: { role: string; alias: string; reason: WasteReason },
): void {
  const roleEntry = roles[entry.role] ?? { role: entry.role, ...emptyGroup() };
  roleEntry.waste[entry.reason] += 1;
  roles[entry.role] = roleEntry;
  const aliasEntry = aliases[entry.alias] ?? {
    alias: entry.alias,
    ...emptyGroup(),
  };
  aliasEntry.waste[entry.reason] += 1;
  aliases[entry.alias] = aliasEntry;
}

/** Adds one rebutted review to its role and alias counts. */
export function recordRebutted(
  roles: Record<string, RoleMetrics>,
  aliases: Record<string, AliasMetrics>,
  review: { role: string; alias: string },
): void {
  const roleEntry = roles[review.role] ?? {
    role: review.role,
    ...emptyGroup(),
  };
  roleEntry.rebuttedReviews += 1;
  roles[review.role] = roleEntry;
  const aliasEntry = aliases[review.alias] ?? {
    alias: review.alias,
    ...emptyGroup(),
  };
  aliasEntry.rebuttedReviews += 1;
  aliases[review.alias] = aliasEntry;
}

/** Helpful/unhelpful plan-review marks recorded across the iteration. */
export function planReviewMarkCounts(all: StepRecord[]): PlanReviewMarkCounts {
  const marks: PlanReviewMarkCounts = { helpful: 0, unhelpful: 0 };
  for (const rec of all) {
    for (const mark of rec.outcome?.planReviewMarks ?? []) {
      marks[mark.mark] += 1;
    }
  }
  return marks;
}
