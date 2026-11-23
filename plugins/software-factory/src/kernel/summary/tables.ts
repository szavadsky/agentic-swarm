/** One-line tables: spend, launches, incidents, concerns, remarks and budget. */

import path from "node:path";
import type { Usage } from "../../harness/types.js";
import { recordedBaseGates } from "../baseline.js";
import { formatCause } from "../cause.js";
import { materialOpenDebts } from "../derive.js";
import { costText } from "../metrics.js";
import type {
  GroupMetrics,
  IncidentCounts,
  PlanReviewMarkCounts,
} from "../metrics.js";
import type {
  ArtifactStore,
  CauseKind,
  GoalDecision,
  StepRecord,
} from "../types.js";
import type { SummaryInput, SummaryStatus, SummaryTaskLists } from "./types.js";

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

export function spendTable(
  label: string,
  rows: Array<{ name: string } & GroupMetrics>,
): string[] {
  if (rows.length === 0) return ["- none"];
  return [
    `| ${label} | turns | tokens | cost | prompt bytes |`,
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.turns} | ${row.tokens} | ${costText(row.usage.costUsd, row.unpricedTurns)} | ${row.promptBytes} |`,
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

export function concernLines(recs: StepRecord[], kind?: string): string[] {
  return recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter((concern) => !kind || concern.kind === kind)
      .map(
        (concern) =>
          `- ${rec.slug ? `${rec.slug}: ` : ""}${concern.text}${
            concern.evidence ? ` (${concern.evidence})` : ""
          }`,
      ),
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

export function summaryTaskLists(
  state: SummaryInput["state"],
): SummaryTaskLists {
  const pending: string[] = [];
  const parked: string[] = [];
  const cancelled: string[] = [];
  for (const slug of Object.keys(state.tasks).sort()) {
    const status = state.tasks[slug]!.status;
    if (status === "parked" && state.tasks[slug]!.supersededBy === undefined) {
      parked.push(slug);
    } else if (status === "pending" || status === "ready") {
      pending.push(slug);
    } else if (status === "cancelled") {
      cancelled.push(slug);
    }
  }
  return { pending, parked, cancelled };
}

export function ownerRemarkableLines(recs: StepRecord[]): string[] {
  return recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter((concern) => concern.calibration === "owner")
      .map(
        (concern) =>
          `- [${concern.kind}] ${rec.slug ? `${rec.slug}: ` : ""}${concern.text}${
            concern.evidence ? ` (${concern.evidence})` : ""
          }`,
      ),
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

export function distanceDebtLines(
  open: ReturnType<typeof materialOpenDebts>,
): string[] {
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

export function costByRoleLine(
  roleNames: readonly { name: string; usage: Usage; unpricedTurns: number }[],
): string {
  if (roleNames.length === 0) return "- cost by role: none";
  const rows = roleNames
    .map(
      (entry) =>
        `${entry.name} ${costText(entry.usage.costUsd, entry.unpricedTurns)}`,
    )
    .join("; ");
  return `- cost by role: ${rows}`;
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
