// biome-ignore-all lint/complexity: split-rest
import path from "node:path";
import { recordedBaseGates } from "./baseline.js";
import { formatCause } from "./cause.js";
import { summaryRelPath } from "./context-pack.js";
import { derive, materialOpenDebts } from "./derive.js";
import { writeEpicSummaries } from "./epic-summary.js";
import {
  costText,
  DEFAULT_ROLE_BY_STEP,
  type GroupMetrics,
  type IncidentCounts,
  iterationMetrics,
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

  const merged = recs
    .filter((r) => r.step === "merge" && r.ok === true)
    .map((r) => r.slug!);
  const finished = recs
    .filter((r) => r.step === "finish" && r.ok === true)
    .map((r) => r.slug!);
  // Root causes group by kind: rewording a park's detail never splits a group.
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
  const pending: string[] = [];
  const parkedAll: string[] = [];
  const cancelled: string[] = [];
  for (const slug of Object.keys(input.state.tasks).sort()) {
    const task = input.state.tasks[slug]!;
    if (task.status === "parked") {
      parkedAll.push(slug);
    } else if (task.status === "pending" || task.status === "ready") {
      pending.push(slug);
    } else if (task.status === "cancelled") {
      cancelled.push(slug);
    }
  }
  // Distance counts what still blocks the goal: material debt left open after
  // every recorded closure, not fyi notes and not debts already retired.
  const open = materialOpenDebts(input.records);

  const ownerRemarkable = recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter((concern) => concern.calibration === "owner")
      .map(
        (concern) =>
          `- [${concern.kind}] ${rec.slug ? `${rec.slug}: ` : ""}${concern.text}${
            concern.evidence ? ` (${concern.evidence})` : ""
          }`,
      ),
  );
  const inbox = (await store.listDir("mailbox/inbox")).filter(
    (name) => !name.startsWith("."),
  );
  const unanswered = inbox.map(
    (file) =>
      `- steer ${path.basename(file, path.extname(file))} is still in mailbox/inbox/${file}`,
  );

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

  const assumed = concernLines(
    recs.filter((r) => r.step === "architect"),
    "choice",
  );
  const debtOpened = concernLines(recs, "debt");
  const debtClosed = recs.flatMap((rec) => [
    ...(rec.outcome?.forward ?? [])
      .map((forward) => /^debt closed:\s*(.+)$/i.exec(forward)?.[1]?.trim())
      .filter((text): text is string => Boolean(text))
      .map((text) => `- ${text}`),
    ...(rec.outcome?.debtClosed ?? []).map(
      (entry) => `- ${entry.id}: ${entry.reason.trim()}`,
    ),
  ]);

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
  const {
    usage,
    unpricedTurns,
    quarantined,
    roles: roleCosts,
    aliases,
    models,
    incidents,
    loopIncidents,
    costPerMergedTask,
    listCostPerMergedTask,
    gateWallMs,
    commitWallMs,
    gateRuns,
    testRuns,
    edits,
    addedLines,
    removedLines,
    operatorActs,
    humanInterventions,
    planReviewMarks,
    waste,
  } = computed;
  const roleNames = Object.values(roleCosts)
    .map((entry) => ({ name: entry.role, ...entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const aliasNames = Object.values(aliases)
    .map((entry) => ({ name: entry.alias, ...entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const modelNames = Object.values(models)
    .map((entry) => ({ name: entry.model, ...entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const agentTurns = recs.filter(
    (r) => r.actor === "agent" && r.endedAt,
  ).length;
  const scriptTurns = recs.filter(
    (r) => r.actor === "script" && r.endedAt,
  ).length;
  const base = recordedBaseGates(input.records);
  const baseLines = !base
    ? ["- not recorded"]
    : base.ok
      ? [`- ${shortHash(base.commit)}: green`]
      : [
          `- ${shortHash(base.commit)} was red before any task (pre-existing; not attributed to tasks):`,
          ...base.checks
            .filter((c) => !c.ok)
            .map((c) => `  - ${c.name}: ${c.summary}`),
        ];

  const distanceDebt =
    open.length === 0
      ? ["- open debt (0): none"]
      : [
          `- open debt (${open.length}):`,
          ...open.map(
            (debt) =>
              `  - ${debt.id ? `${debt.id} ` : ""}${debt.source}: ${debt.text}${debt.evidence ? ` (${debt.evidence})` : ""}`,
          ),
        ];
  const lines = [
    `# Iteration ${iteration} summary`,
    "",
    `status: ${status}`,
    ...(input.decision ? [`decision: ${input.decision}`] : []),
    "",
    "## Distance",
    `- pending (${pending.length}): ${pending.length ? pending.join(", ") : "none"}`,
    `- parks (${parkedAll.length}): ${parkedAll.length ? parkedAll.join(", ") : "none"}`,
    ...distanceDebt,
    "",
    "## Architect",
    ...(architect?.outcome
      ? [`- summary: ${architect.outcome.summary}`]
      : ["- no architect outcome recorded"]),
    `- plan-review marks: ${planReviewMarks.helpful} helpful, ${planReviewMarks.unhelpful} unhelpful`,
    "",
    "## Assumptions",
    ...(assumed.length ? assumed : ["- none recorded"]),
    "",
    "## Outcome",
    `- merged: ${merged.length ? merged.join(", ") : "none"}`,
    `- spikes finished: ${finished.length ? finished.join(", ") : "none"}`,
    `- pending: ${pending.length ? pending.join(", ") : "none"}`,
    `- cancelled: ${cancelled.length ? cancelled.join(", ") : "none"}`,
    `- quarantined: ${quarantined.length ? quarantined.join(", ") : "none"}`,
    "",
    "## Base gates",
    ...baseLines,
    "",
    "## Parked by root cause",
    ...(parkedByKind.size
      ? [...parkedByKind.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([kind, parks]) => [
            `- ${kind}`,
            ...parks.map((park) =>
              park.detail
                ? `  - ${park.slug}: ${park.detail}`
                : `  - ${park.slug}`,
            ),
          ])
      : ["- none"]),
    "",
    "## Debt opened",
    ...(debtOpened.length ? debtOpened : ["- none"]),
    "",
    "## Debt closed",
    ...(debtClosed.length ? debtClosed : ["- none"]),
    "",
    "## Owner attention",
    ...(ownerRemarkable.length || unanswered.length
      ? [...ownerRemarkable, ...unanswered]
      : ["- none"]),
    "",
    "## Remarkable",
    ...(remarks.length ? remarks.map((r) => `- ${r}`) : ["- none"]),
    "",
    "## Metrics",
    `- turns: ${agentTurns} agent, ${scriptTurns} script`,
    `- tokens: input ${usage.in}, cached ${usage.cacheRead}, output ${usage.out}, reasoning ${usage.reasoningOut}`,
    `- cost: ${costText(usage.costUsd, unpricedTurns)}`,
    `- list cost: ${costText(usage.listCostUsd, unpricedTurns)}`,
    `- cost by role: ${
      roleNames.length
        ? roleNames
            .map(
              (entry) =>
                `${entry.name} ${costText(entry.usage.costUsd, entry.unpricedTurns)}`,
            )
            .join("; ")
        : "none"
    }`,
    `- cost per merged task: ${
      costPerMergedTask === null
        ? "n/a"
        : `$${costPerMergedTask.toFixed(4)}${unpricedTurns > 0 ? " (partial)" : ""}`
    }; list ${
      listCostPerMergedTask === null
        ? "n/a"
        : `$${listCostPerMergedTask.toFixed(4)}${unpricedTurns > 0 ? " (partial)" : ""}`
    }`,
    `- work: ${edits} files (+${addedLines}/-${removedLines}), ${testRuns} test runs in ${gateRuns} gate runs`,
    `- gate wall: ${(gateWallMs / 1000).toFixed(1)}s gates, ${(commitWallMs / 1000).toFixed(1)}s commits`,
    `- operator acts: ${operatorActs} (${humanInterventions} steers)`,
    ...(budgetStop
      ? [
          `- budget: ${budgetStop}; brake blind for ${unpricedTurns} unpriced ${
            unpricedTurns === 1 ? "turn" : "turns"
          }`,
        ]
      : []),
    `- merged: ${merged.length}; parked: ${[...parkedByKind.values()].flat().length}; pending: ${pending.length}`,
    "",
    "## Incidents",
    ...incidentLines(incidents, loopIncidents),
    "",
    "## Waste",
    ...wasteLines(waste, agentTurns, roleNames, aliasNames),
    "",
    "## Launches by role",
    ...launchTable("role", roleNames),
    "",
    "## Launches by alias",
    ...launchTable("alias", aliasNames),
    "",
    "## Spend by role",
    ...spendTable("role", roleNames),
    "",
    "## Spend by alias",
    ...spendTable("alias", aliasNames),
    "",
    "## Spend by model",
    ...spendTable("model", modelNames),
    "",
  ];
  const rel = summaryRelPath(iteration);
  const text = lines.join("\n");
  await store.writeFile(rel, text);
  // The outbox notifies the owner; the summary itself has one copy above.
  await store.writeFile(
    `mailbox/outbox/iteration-${iteration}-summary.md`,
    `${rel}\n`,
  );
  return rel;
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
    if (await runtime.store.readFile(summaryRelPath(n))) continue;
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
