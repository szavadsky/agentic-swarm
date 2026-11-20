import path from "node:path";
import type { Usage } from "../harness/types.js";
import { recordedBaseGates } from "./baseline.js";
import { formatCause } from "./cause.js";
import { derive, materialOpenDebts } from "./derive.js";
import { writeEpicSummaries } from "./epic-summary.js";
import {
  costText,
  DEFAULT_ROLE_BY_STEP,
  type GroupMetrics,
  type IncidentCounts,
  type IterationMetrics,
  iterationMetrics,
  type PlanReviewMarkCounts,
  rolesByStep,
  writeMetrics,
} from "./metrics.js";
import { loadPriceTable } from "./openrouter.js";
import type { PriceTable } from "./pricing.js";
import type {
  ArtifactStore,
  Cause,
  CauseKind,
  GoalDecision,
  KernelRuntime,
  State,
  StepRecord,
} from "./types.js";
import { wasteLines } from "./waste-summary.js";

export type SummaryStatus =
  | "goal-met"
  | "in-progress"
  | "blocked-by-user"
  | "stopped-with-debt";

export interface SummaryInput {
  iteration: number;
  state: State;
  records: StepRecord[];
  decision?: GoalDecision;
  /** Boundary/launch cause shown as a remarkable (PM ladder, crash). */
  cause?: Cause;
  /** Launch result; wins over `decision`, which is display-only. */
  status?: SummaryStatus;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table, loaded once per write. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  /** Steers moved to processed; feeds the operator-act counter. */
  humanInterventions?: number;
}

function defaultStatus(decision: GoalDecision | undefined): SummaryStatus {
  if (decision === "done") return "goal-met";
  if (decision === "blocked") return "blocked-by-user";
  return "in-progress";
}

function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

function spendTable(
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

function launchTable(
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

function incidentLines(
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

function concernLines(recs: StepRecord[], kind?: string): string[] {
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
function summaryParkedByKind(
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

interface SummaryTaskLists {
  pending: string[];
  parked: string[];
  cancelled: string[];
}

function summaryTaskLists(state: SummaryInput["state"]): SummaryTaskLists {
  const pending: string[] = [];
  const parked: string[] = [];
  const cancelled: string[] = [];
  for (const slug of Object.keys(state.tasks).sort()) {
    const status = state.tasks[slug]!.status;
    if (status === "parked") {
      parked.push(slug);
    } else if (status === "pending" || status === "ready") {
      pending.push(slug);
    } else if (status === "cancelled") {
      cancelled.push(slug);
    }
  }
  return { pending, parked, cancelled };
}

function ownerRemarkableLines(recs: StepRecord[]): string[] {
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

async function unansweredSteerLines(store: ArtifactStore): Promise<string[]> {
  const inbox = await store.mailbox.files("inbox");
  return inbox.map(
    (file) =>
      `- steer ${path.basename(file, path.extname(file))} is still in mailbox/inbox/${file}`,
  );
}

/** Boundary, architect and script remarks, minus the facts with their own lines. */
function summaryRemarks(
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

function closedDebtLines(recs: StepRecord[]): string[] {
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

function baseGateLines(base: ReturnType<typeof recordedBaseGates>): string[] {
  if (!base) return ["- not recorded"];
  if (base.ok) return [`- ${shortHash(base.commit)}: green`];
  return [
    `- ${shortHash(base.commit)} was red before any task (pre-existing; not attributed to tasks):`,
    ...base.checks
      .filter((c) => !c.ok)
      .map((c) => `  - ${c.name}: ${c.summary}`),
  ];
}

function distanceDebtLines(
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

function parkedCauseLines(
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

function costByRoleLine(
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

function perMergedCost(cost: number | null, unpricedTurns: number): string {
  if (cost === null) return "n/a";
  return `$${cost.toFixed(4)}${unpricedTurns > 0 ? " (partial)" : ""}`;
}

function budgetLines(
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
function listLine(label: string, items: readonly string[]): string {
  return `- ${label}: ${items.length > 0 ? items.join(", ") : "none"}`;
}

/** The entries, or the `- none` placeholder every summary section uses. */
function orNone(entries: string[]): string[] {
  return entries.length > 0 ? entries : ["- none"];
}

function decisionLines(decision: string | undefined): string[] {
  return decision ? [`decision: ${decision}`] : [];
}

function architectLines(
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

/** The task/slug facts one summary renders. */
interface SummaryTaskFacts {
  merged: string[];
  finished: string[];
  parkedByKind: Map<CauseKind, { slug: string; detail: string }[]>;
  pending: string[];
  parkedAll: string[];
  cancelled: string[];
  open: ReturnType<typeof materialOpenDebts>;
}

/** Collects the iteration's slug lists and open material debt. */
function summaryTaskFacts(
  recs: StepRecord[],
  state: State,
  allRecords: StepRecord[],
): SummaryTaskFacts {
  const merged = recs
    .filter((r) => r.step === "merge" && r.ok === true)
    .map((r) => r.slug!);
  const finished = recs
    .filter((r) => r.step === "finish" && r.ok === true)
    .map((r) => r.slug!);
  // Root causes group by kind: rewording a park's detail never splits a group.
  const parkedByKind = summaryParkedByKind(recs);
  const { pending, parked: parkedAll, cancelled } = summaryTaskLists(state);
  // Distance counts what still blocks the goal: material debt left open after
  // every recorded closure, not fyi notes and not debts already retired.
  const open = materialOpenDebts(allRecords);
  return {
    merged,
    finished,
    parkedByKind,
    pending,
    parkedAll,
    cancelled,
    open,
  };
}

/** The remark/assumption/debt lines one summary renders. */
interface SummaryRemarkFacts {
  ownerRemarkable: string[];
  unanswered: string[];
  remarks: string[];
  assumed: string[];
  debtOpened: string[];
  debtClosed: string[];
}

/** Collects the summary's remark lines from outcomes, mailbox and debt. */
async function summaryRemarkFacts(
  store: ArtifactStore,
  input: SummaryInput,
  architect: StepRecord | undefined,
  recs: StepRecord[],
  budgetStop: string | undefined,
): Promise<SummaryRemarkFacts> {
  const ownerRemarkable = ownerRemarkableLines(recs);
  const unanswered = await unansweredSteerLines(store);
  const remarks = summaryRemarks(input, architect, recs, budgetStop);
  const assumed = concernLines(
    recs.filter((r) => r.step === "architect"),
    "choice",
  );
  const debtOpened = concernLines(recs, "debt");
  const debtClosed = closedDebtLines(recs);
  return {
    ownerRemarkable,
    unanswered,
    remarks,
    assumed,
    debtOpened,
    debtClosed,
  };
}

/** The metric rows named for launch/spend tables, sorted by name. */
function summaryNamedRows(computed: IterationMetrics) {
  return {
    roleNames: Object.values(computed.roles)
      .map((entry) => ({ name: entry.role, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    aliasNames: Object.values(computed.aliases)
      .map((entry) => ({ name: entry.alias, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    modelNames: Object.values(computed.models)
      .map((entry) => ({ name: entry.model, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Everything the summary's line builders read. */
interface SummaryRender {
  iteration: number;
  status: SummaryStatus;
  decision: SummaryInput["decision"];
  budgetStop: string | undefined;
  architect: StepRecord | undefined;
  facts: SummaryTaskFacts;
  remarks: SummaryRemarkFacts;
  computed: IterationMetrics;
  named: ReturnType<typeof summaryNamedRows>;
  agentTurns: number;
  scriptTurns: number;
  baseLines: string[];
  distanceDebt: string[];
}

/** The summary's distance through remarkable sections. */
function summaryHeadLines(render: SummaryRender): string[] {
  const { facts, remarks, computed } = render;
  return [
    `# Iteration ${render.iteration} summary`,
    "",
    `status: ${render.status}`,
    ...decisionLines(render.decision),
    "",
    "## Distance",
    listLine(`pending (${facts.pending.length})`, facts.pending),
    listLine(`parks (${facts.parkedAll.length})`, facts.parkedAll),
    ...render.distanceDebt,
    "",
    ...architectLines(render.architect, computed.planReviewMarks),
    "",
    "## Assumptions",
    ...(remarks.assumed.length ? remarks.assumed : ["- none recorded"]),
    "",
    "## Outcome",
    listLine("merged", facts.merged),
    listLine("spikes finished", facts.finished),
    listLine("pending", facts.pending),
    listLine("cancelled", facts.cancelled),
    listLine("quarantined", computed.quarantined),
    "",
    "## Base gates",
    ...render.baseLines,
    "",
    "## Parked by root cause",
    ...parkedCauseLines(facts.parkedByKind),
    "",
    "## Debt opened",
    ...orNone(remarks.debtOpened),
    "",
    "## Debt closed",
    ...orNone(remarks.debtClosed),
    "",
    "## Owner attention",
    ...orNone([...remarks.ownerRemarkable, ...remarks.unanswered]),
    "",
    "## Remarkable",
    ...orNone(remarks.remarks.map((r) => `- ${r}`)),
    "",
  ];
}

/** The summary's metrics, incidents, waste and launch/spend tables. */
function summaryMetricsLines(render: SummaryRender): string[] {
  const computed = render.computed;
  const { usage, unpricedTurns, incidents, loopIncidents } = computed;
  return [
    "## Metrics",
    `- turns: ${render.agentTurns} agent, ${render.scriptTurns} script`,
    `- tokens: input ${usage.in}, cached ${usage.cacheRead}, output ${usage.out}, reasoning ${usage.reasoningOut}`,
    `- cost: ${costText(usage.costUsd, unpricedTurns)}`,
    `- list cost: ${costText(usage.listCostUsd, unpricedTurns)}`,
    costByRoleLine(render.named.roleNames),
    `- cost per merged task: ${perMergedCost(computed.costPerMergedTask, unpricedTurns)}; list ${perMergedCost(computed.listCostPerMergedTask, unpricedTurns)}`,
    `- work: ${computed.edits} files (+${computed.addedLines}/-${computed.removedLines}), ${computed.testRuns} test runs in ${computed.gateRuns} gate runs`,
    `- gate wall: ${(computed.gateWallMs / 1000).toFixed(1)}s gates, ${(computed.commitWallMs / 1000).toFixed(1)}s commits`,
    `- operator acts: ${computed.operatorActs} (${computed.humanInterventions} steers)`,
    ...budgetLines(render.budgetStop, unpricedTurns),
    `- merged: ${render.facts.merged.length}; parked: ${[...render.facts.parkedByKind.values()].flat().length}; pending: ${render.facts.pending.length}`,
    "",
    "## Incidents",
    ...incidentLines(incidents, loopIncidents),
    "",
    "## Waste",
    ...wasteLines(
      computed.waste,
      render.agentTurns,
      render.named.roleNames,
      render.named.aliasNames,
    ),
    "",
    "## Launches by role",
    ...launchTable("role", render.named.roleNames),
    "",
    "## Launches by alias",
    ...launchTable("alias", render.named.aliasNames),
    "",
    "## Spend by role",
    ...spendTable("role", render.named.roleNames),
    "",
    "## Spend by alias",
    ...spendTable("alias", render.named.aliasNames),
    "",
    "## Spend by model",
    ...spendTable("model", render.named.modelNames),
    "",
  ];
}

/** Writes the summary and its outbox notice, returning the summary path. */
async function writeSummaryFile(
  store: ArtifactStore,
  iteration: number,
  lines: string[],
): Promise<string> {
  const rel = store.iterations.rel(iteration, "summary.md");
  await store.iterations.write(iteration, "summary.md", lines.join("\n"));
  // The outbox notifies the owner; the summary itself has one copy above.
  await store.mailbox.write(
    "outbox",
    `iteration-${iteration}-summary.md`,
    `${rel}\n`,
  );
  return rel;
}

/**
 * The guaranteed remarkable: exactly one summary per iteration, written even
 * when the iteration crashed. Everything here is derived from records and
 * task files, so a recovery run produces the same facts.
 */
export async function writeIterationSummary(
  store: ArtifactStore,
  input: SummaryInput,
): Promise<string> {
  const { iteration } = input;
  const recs = input.records.filter((r) => r.iteration === iteration);
  const architect = recs
    .filter((r) => r.step === "architect" && r.outcome)
    .at(-1);
  const status = input.status ?? defaultStatus(input.decision);
  // Dispatch marks a drain from the USD brake with a `budget` cause; it is a
  // spend fact, so it gets its own metrics line instead of the boundary remark.
  const budgetStop =
    input.cause?.kind === "budget" ? input.cause.detail : undefined;
  const facts = summaryTaskFacts(recs, input.state, input.records);
  const remarks = await summaryRemarkFacts(
    store,
    input,
    architect,
    recs,
    budgetStop,
  );
  const roleByStep = { ...DEFAULT_ROLE_BY_STEP, ...(input.roleByStep ?? {}) };
  const computed = iterationMetrics(
    iteration,
    status,
    input.records,
    roleByStep,
    input.humanInterventions ?? 0,
    input.prices ?? {},
    input.priceIds,
  );
  const render: SummaryRender = {
    iteration,
    status,
    decision: input.decision,
    budgetStop,
    architect,
    facts,
    remarks,
    computed,
    named: summaryNamedRows(computed),
    agentTurns: recs.filter((r) => r.actor === "agent" && r.endedAt).length,
    scriptTurns: recs.filter((r) => r.actor === "script" && r.endedAt).length,
    baseLines: baseGateLines(recordedBaseGates(input.records)),
    distanceDebt: distanceDebtLines(facts.open),
  };
  const lines = [...summaryHeadLines(render), ...summaryMetricsLines(render)];
  return await writeSummaryFile(store, iteration, lines);
}

/**
 * A killed launch leaves records without a summary. Backfill one per missing
 * iteration before the next boundary, so every iteration is reported exactly
 * once even across crash recovery.
 */
export async function backfillSummaries(runtime: KernelRuntime): Promise<void> {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const status =
    state.goal === "done"
      ? "goal-met"
      : state.goal === "blocked"
        ? "blocked-by-user"
        : "stopped-with-debt";
  const roleByStep = rolesByStep(runtime.configs.process.flows);
  const prices = await loadPriceTable(runtime.priceSource);
  const priceIds = runtime.configs.run.priceIds;
  for (let n = 1; n <= state.iteration; n++) {
    if (await runtime.store.iterations.read(n, "summary.md")) continue;
    await writeIterationSummary(runtime.store, {
      iteration: n,
      state,
      records,
      status,
      roleByStep,
      prices,
      priceIds,
    });
    await writeEpicSummaries(runtime.store, {
      iteration: n,
      state,
      records,
    });
    await writeMetrics(runtime.store, {
      iteration: n,
      status,
      records,
      state,
      roleByStep,
      prices,
      priceIds,
    });
  }
}
