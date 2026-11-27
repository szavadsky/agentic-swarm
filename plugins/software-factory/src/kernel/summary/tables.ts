/** One-line tables: spend, launches, incidents, concerns, remarks and budget. */

import path from "node:path";
import type { Usage } from "../../harness/types.js";
import { recordedBaseGates } from "../baseline.js";
import { formatCause } from "../cause.js";
import { indexDismissals, isConcernDismissed } from "../concern-dismissal.js";
import { costText, medianMs, worstMs } from "../metrics.js";
import type { QaCatchSource, QaCatches } from "../qa.js";
import type {
  AskRecoveryCounts,
  FrictionEntry,
  GroupMetrics,
  IncidentCounts,
  ParkMetrics,
  PlanReviewMarkCounts,
  SteerLatency,
  SteerLeg,
  ZeroEditCounts,
  ZeroEditParkMetrics,
} from "../metrics.js";
import type {
  ArtifactStore,
  CauseKind,
  Concern,
  GoalDecision,
  ReportDebt,
  StepRecord,
} from "../types.js";
import type { SummaryInput, SummaryStatus } from "./types.js";

export function defaultStatus(
  decision: GoalDecision | undefined,
): SummaryStatus {
  if (decision === "done") return "goal-met";
  if (decision === "blocked") return "blocked-by-user";
  return "in-progress";
}

function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

/** A cell's own figure, never a false $0: absent with no unpriced turn is n/a. */
function tableCostText(
  costUsd: number | undefined,
  unpricedTurns: number,
): string {
  if (costUsd === undefined) return unpricedTurns > 0 ? "unknown" : "n/a";
  return unpricedTurns > 0
    ? `$${costUsd.toFixed(4)} (partial)`
    : `$${costUsd.toFixed(4)}`;
}

export function spendTable(
  label: string,
  rows: Array<{ name: string } & GroupMetrics>,
): string[] {
  if (rows.length === 0) return ["- none"];
  return [
    `| ${label} | turns | tokens | harness-reported | list-price estimate | unpriced | prompt bytes |`,
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.turns} | ${row.tokens} | ${tableCostText(row.usage.harnessCostUsd, row.unpricedTurns)} | ${tableCostText(row.usage.listCostUsd, row.unpricedTurns)} | ${row.unpricedTurns} | ${row.promptBytes} |`,
    ),
  ];
}

export function launchTable(
  label: string,
  rows: Array<{ name: string } & GroupMetrics>,
): string[] {
  if (rows.length === 0) return ["- none"];
  return [
    `| ${label} | glitch | change-request | qa-finding | failure | unknown |`,
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.launches.glitch} | ${row.launches["change-request"]} | ${row.launches["qa-finding"]} | ${row.launches.failure} | ${row.launches.unknown} |`,
    ),
  ];
}

export function incidentLines(
  incidents: IncidentCounts,
  loopIncidents: number,
): string[] {
  return [
    `- infra retries: ${incidents.infraRetries}`,
    `- fallback hops: ${incidents.fallbackHops}`,
    `- outcome-repair turns: ${incidents.outcomeRepairs}`,
    `- merge conflicts: ${incidents.mergeConflicts}`,
    `- merged-gate failures: ${incidents.mergedGateFailures}`,
    `- gate flakes: ${incidents.gateFlakes}`,
    `- round-limit parks: ${incidents.roundLimitParks}`,
    `- no-progress parks: ${incidents.noProgressParks}`,
    `- empty-diff parks: ${incidents.emptyDiffParks}`,
    `- overflow parks: ${incidents.overflowParks}`,
    `- loop incidents: ${loopIncidents}`,
  ];
}

/** One park cause's records and its rate per merged task. */
function parkCauseText(kind: string, count: number, merged: number): string {
  const rate = merged > 0 ? `${(count / merged).toFixed(2)}/merged` : "n/a";
  return `${kind} ${count} (${rate})`;
}

/** Park records by cause beside the merged tasks they took, and landings. */
export function parkLines(parks: ParkMetrics): string[] {
  const causes = Object.entries(parks.byCause)
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([kind, count]) => parkCauseText(kind, count, parks.mergedSlugs));
  const perTask =
    parks.perMergedTask === null ? "n/a" : parks.perMergedTask.toFixed(2);
  return [
    `- park records: ${parks.records} over ${parks.distinctSlugs} slugs; ${parks.mergedSlugs} merged tasks; ${perTask} park records per merged task`,
    `- by cause: ${causes.length > 0 ? causes.join("; ") : "none"}`,
    `- landed unchanged: ${parks.landedUnchanged}; amended first: ${parks.landedAmended}; unknown: ${parks.landedUnknown}`,
  ];
}

/** A steer leg's median and worst in minutes, or n/a when no steer is timed. */
function steerLegText(label: string, leg: SteerLeg): string {
  const minutes = (ms: number | undefined): string =>
    ms === undefined ? "n/a" : `${(ms / 60_000).toFixed(1)} min`;
  const timed = `${leg.samplesMs.length} ${leg.samplesMs.length === 1 ? "steer" : "steers"}`;
  return `- ${label}: median ${minutes(medianMs(leg.samplesMs))}, worst ${minutes(worstMs(leg.samplesMs))} over ${timed}; unknown ${leg.unknown}`;
}

/** The mailbox's steers: how long the two legs took and how many still wait. */
export function steerLines(steers: SteerLatency): string[] {
  return [
    `- steers: ${steers.steers}; unanswered: ${steers.unanswered}`,
    steerLegText("drop to PM route", steers.route),
    steerLegText("drop to final answer", steers.answer),
  ];
}

/** The iteration's friction events, each with the record that proves it and its cost. */
export function frictionLines(entries: readonly FrictionEntry[]): string[] {
  if (entries.length === 0) return ["- none"];
  return entries.map(
    (entry) =>
      `- ${entry.kind}: ${entry.record} — ${entry.detail}; cost ${sourceCostText(entry.costUsd, entry.unpricedTurns)}`,
  );
}

/** Zero-edit turns split by what the turn owed. */
export function zeroEditLine(zeroEdit: ZeroEditCounts): string {
  const total = zeroEdit.reply + zeroEdit.finding + zeroEdit.noop;
  return `- zero-edit turns: ${total} (reply ${zeroEdit.reply}, finding ${zeroEdit.finding}, no-op ${zeroEdit.noop})`;
}

/** Parks after a zero-edit implement turn, over implement turns, split by cause. */
export function zeroEditParkLine(parks: ZeroEditParkMetrics): string {
  const rate =
    parks.rate === null ? "n/a" : `${(parks.rate * 100).toFixed(1)}%`;
  return `- zero-edit parks: ${parks.parks} of ${parks.implementTurns} implement turns (${rate}); failed ${parks.byCause.failed}, invalid outcome ${parks.byCause["invalid-outcome"]}, empty-diff ${parks.byCause["empty-diff"]}`;
}

/** Turns the unfinished ask and the rescue each recovered. */
export function askRecoveryLine(recoveries: AskRecoveryCounts): string {
  return `- ask recoveries: unfinished ${recoveries.unfinished}, rescue ${recoveries.rescue}`;
}

/** One concern line, prefixed by its record's slug when it has one. */
function concernLine(rec: StepRecord, concern: Concern, prefix = ""): string {
  return `- ${prefix}${rec.slug ? `${rec.slug}: ` : ""}${concern.text}${
    concern.evidence ? ` (${concern.evidence})` : ""
  }`;
}

export function concernLines(recs: StepRecord[], kind?: string): string[] {
  const dismissals = indexDismissals(recs);
  return recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter(
        (concern) =>
          (!kind || concern.kind === kind) &&
          !isConcernDismissed(dismissals, rec, concern),
      )
      .map((concern) => concernLine(rec, concern)),
  );
}

/** Parked tasks grouped by root-cause kind; rewording a detail never splits a group. */
export function summaryParkedByKind(
  recs: StepRecord[],
): Map<CauseKind, { slug: string; detail: string }[]> {
  const parkedByKind = new Map<CauseKind, { slug: string; detail: string }[]>();
  for (const rec of recs) {
    if (rec.step !== "park" || !rec.endedAt || !rec.slug) continue;
    const kind = rec.cause?.kind ?? "unknown";
    const detail = rec.cause?.detail ?? "no recorded cause";
    parkedByKind.set(kind, [
      ...(parkedByKind.get(kind) ?? []),
      { slug: rec.slug, detail },
    ]);
  }
  return parkedByKind;
}

export function ownerRemarkableLines(recs: StepRecord[]): string[] {
  const dismissals = indexDismissals(recs);
  return recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter(
        (concern) =>
          concern.calibration === "owner" &&
          !isConcernDismissed(dismissals, rec, concern),
      )
      .map((concern) => concernLine(rec, concern, `[${concern.kind}] `)),
  );
}

export async function unansweredSteerLines(
  store: ArtifactStore,
): Promise<string[]> {
  const inbox = await store.mailbox.files("inbox");
  return inbox.map(
    (file) =>
      `- steer ${path.basename(file, path.extname(file))} is still in mailbox/inbox/${file}`,
  );
}

/** Boundary, architect and script remarks, minus the facts with their own lines. */
export function summaryRemarks(
  input: SummaryInput,
  architect: StepRecord | undefined,
  recs: StepRecord[],
  budgetStop: string | undefined,
): string[] {
  const remarks: string[] = [];
  if (input.cause && !budgetStop) {
    remarks.push(`boundary: ${formatCause(input.cause)}`);
  }
  if (architect?.outcome) {
    remarks.push(`architect: ${architect.outcome.summary}`);
    for (const forward of architect.outcome.forward) {
      if (/^steer\s/i.test(forward) || /^debt closed:/i.test(forward)) continue;
      remarks.push(forward);
    }
  }
  for (const rec of recs) {
    if (rec.actor === "script" && rec.ok === false && rec.cause) {
      remarks.push(`${rec.step}: ${formatCause(rec.cause)}`);
    }
  }
  return remarks;
}

export function closedDebtLines(recs: StepRecord[]): string[] {
  return recs.flatMap((rec) => [
    ...(rec.outcome?.forward ?? [])
      .map((forward) => /^debt closed:\s*(.+)$/i.exec(forward)?.[1]?.trim())
      .filter((text): text is string => Boolean(text))
      .map((text) => `- ${text}`),
    ...(rec.outcome?.debtClosed ?? []).map(
      (entry) => `- ${entry.id}: ${entry.reason.trim()}`,
    ),
  ]);
}

export function baseGateLines(
  base: ReturnType<typeof recordedBaseGates>,
): string[] {
  if (!base) return ["- not recorded"];
  if (base.ok) return [`- ${shortHash(base.commit)}: green`];
  return [
    `- ${shortHash(base.commit)} was red before any task (pre-existing; not attributed to tasks):`,
    ...base.checks
      .filter((c) => !c.ok)
      .map((c) => `  - ${c.name}: ${c.summary}`),
  ];
}

export function distanceDebtLines(open: readonly ReportDebt[]): string[] {
  if (open.length === 0) return ["- open debt (0): none"];
  return [
    `- open debt (${open.length}):`,
    ...open.map(
      (debt) =>
        `  - ${debt.id ? `${debt.id} ` : ""}${debt.source}: ${debt.text}${debt.evidence ? ` (${debt.evidence})` : ""}`,
    ),
  ];
}

export function parkedCauseLines(
  parkedByKind: ReadonlyMap<CauseKind, { slug: string; detail: string }[]>,
): string[] {
  if (parkedByKind.size === 0) return ["- none"];
  return [...parkedByKind.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([kind, parks]) => [
      `- ${kind}`,
      ...parks.map((park) =>
        park.detail ? `  - ${park.slug}: ${park.detail}` : `  - ${park.slug}`,
      ),
    ]);
}

/** A source's own figure; absent stays absent, never a false $0. */
export function sourceCostText(
  costUsd: number | undefined,
  unpricedTurns: number,
): string {
  if (costUsd === undefined && unpricedTurns === 0) return "n/a";
  return costText(costUsd, unpricedTurns);
}

export function costByRoleLines(
  roleNames: readonly { name: string; usage: Usage; unpricedTurns: number }[],
): string[] {
  if (roleNames.length === 0)
    return [
      "- harness-reported cost by role: none",
      "- list-price estimate by role: none",
    ];
  const rows = (pick: (usage: Usage) => number | undefined): string =>
    roleNames
      .map(
        (entry) =>
          `${entry.name} ${sourceCostText(pick(entry.usage), entry.unpricedTurns)}`,
      )
      .join("; ");
  return [
    `- harness-reported cost by role: ${rows((usage) => usage.harnessCostUsd)}`,
    `- list-price estimate by role: ${rows((usage) => usage.listCostUsd)}`,
  ];
}

const QA_CATCH_SOURCE: Record<QaCatchSource, string> = {
  none: "QA only",
  gate: "also a gate failure",
  reviewer: "also an earlier reviewer finding",
  "reviewer-after": "repeated by the reviewer after QA",
};

/**
 * The QA-only count with its per-task split, then one line per sampled catch
 * naming its record and who else carried the finding.
 */
export function qaCatchLines(catches: QaCatches): string[] {
  const perTask = Object.entries(catches.byTask).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const detail =
    perTask.length > 0
      ? ` (${perTask.map(([task, count]) => `${task}: ${count}`).join(", ")})`
      : "";
  const head = `- QA-only catches: ${catches.count} of ${catches.total} QA findings${detail}`;
  if (catches.sample.length === 0) return [head];
  const sampleHead =
    catches.sample.length < catches.total
      ? `- QA catch sample: first ${catches.sample.length} of ${catches.total}`
      : "- QA catch sample:";
  return [
    head,
    sampleHead,
    ...catches.sample.map(
      (entry) =>
        `  - ${entry.task} ${entry.record}: ${entry.finding} (${QA_CATCH_SOURCE[entry.alsoCaughtBy]})`,
    ),
  ];
}

export function perMergedCost(
  cost: number | null,
  unpricedTurns: number,
): string {
  if (cost === null) return "n/a";
  return `$${cost.toFixed(4)}${unpricedTurns > 0 ? " (partial)" : ""}`;
}

export function budgetLines(
  budgetStop: string | undefined,
  unpricedTurns: number,
): string[] {
  if (!budgetStop) return [];
  return [
    `- budget: ${budgetStop}; brake blind for ${unpricedTurns} unpriced ${
      unpricedTurns === 1 ? "turn" : "turns"
    }`,
  ];
}

/** A one-line list, `none` when empty. */
export function listLine(label: string, items: readonly string[]): string {
  return `- ${label}: ${items.length > 0 ? items.join(", ") : "none"}`;
}

/** The entries, or the `- none` placeholder every summary section uses. */
export function orNone(entries: string[]): string[] {
  return entries.length > 0 ? entries : ["- none"];
}

export function decisionLines(decision: string | undefined): string[] {
  return decision ? [`decision: ${decision}`] : [];
}

export function architectLines(
  architect: StepRecord | undefined,
  planReviewMarks: PlanReviewMarkCounts,
): string[] {
  return [
    "## Architect",
    ...(architect?.outcome
      ? [`- summary: ${architect.outcome.summary}`]
      : ["- no architect outcome recorded"]),
    `- plan-review marks: ${planReviewMarks.helpful} helpful, ${planReviewMarks.unhelpful} unhelpful`,
  ];
}
