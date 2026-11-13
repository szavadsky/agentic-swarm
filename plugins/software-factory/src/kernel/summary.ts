import path from "node:path";
import { recordedBaseGates } from "./baseline.js";
import { derive } from "./derive.js";
import {
  DEFAULT_ROLE_BY_STEP,
  costText,
  iterationMetrics,
  rolesByStep,
  writeMetrics,
  type GroupMetrics,
  type IncidentCounts,
} from "./metrics.js";
import type { PriceTable } from "./pricing.js";
import type { ArtifactStore, GoalDecision, KernelRuntime, State, StepRecord } from "./types.js";

export type SummaryStatus = "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt";

export interface SummaryInput {
  iteration: number;
  state: State;
  records: StepRecord[];
  decision?: GoalDecision;
  /** Boundary/launch cause shown as a remarkable (PM validation, crash). */
  cause?: string;
  /** Crash or drain override; the architect decision wins when present. */
  status?: SummaryStatus;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  /** Model id -> USD per Mtok, from the run config. */
  prices?: PriceTable;
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
  rows: Array<{ name: string } & GroupMetrics>
): string[] {
  if (rows.length === 0) return ["- none"];
  return [
    `| ${label} | turns | tokens | cost | prompt bytes |`,
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.turns} | ${row.tokens} | ${costText(row.usage.costUsd, row.unpricedTurns)} | ${row.promptBytes} |`
    ),
  ];
}

function incidentLines(incidents: IncidentCounts): string[] {
  return [
    `- infra retries: ${incidents.infraRetries}`,
    `- fallback hops: ${incidents.fallbackHops}`,
    `- outcome-repair turns: ${incidents.outcomeRepairs}`,
    `- merge conflicts: ${incidents.mergeConflicts}`,
    `- merged-gate failures: ${incidents.mergedGateFailures}`,
    `- round-limit parks: ${incidents.roundLimitParks}`,
    `- no-progress parks: ${incidents.noProgressParks}`,
    `- budget parks: ${incidents.budgetParks}`,
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
          }`
      )
  );
}

/**
 * The guaranteed remarkable: exactly one summary per iteration, written even
 * when the iteration crashed. Everything here is derived from records and
 * task files, so a recovery run produces the same facts.
 */
export async function writeIterationSummary(
  store: ArtifactStore,
  input: SummaryInput
): Promise<string> {
  const { iteration } = input;
  const recs = input.records.filter((r) => r.iteration === iteration);
  const architect = recs.filter((r) => r.step === "architect" && r.outcome).at(-1);
  const status = input.decision
    ? defaultStatus(input.decision)
    : (input.status ?? defaultStatus(undefined));
  // Dispatch marks a drain from the USD brake with a `budget:` cause; it is a
  // spend fact, so it gets its own metrics line instead of the boundary remark.
  const budgetStop = input.cause ? /^budget:\s*(.+)$/i.exec(input.cause)?.[1]?.trim() : undefined;

  const merged = recs.filter((r) => r.step === "merge" && r.ok === true).map((r) => r.slug!);
  const finished = recs.filter((r) => r.step === "finish" && r.ok === true).map((r) => r.slug!);
  const parkedByCause = new Map<string, string[]>();
  const pending: string[] = [];
  const cancelled: string[] = [];
  for (const slug of Object.keys(input.state.tasks).sort()) {
    const task = input.state.tasks[slug]!;
    if (task.status === "parked") {
      const cause = task.cause ?? "no recorded cause";
      parkedByCause.set(cause, [...(parkedByCause.get(cause) ?? []), slug]);
    } else if (task.status === "pending" || task.status === "ready") {
      pending.push(slug);
    } else if (task.status === "cancelled") {
      cancelled.push(slug);
    }
  }

  const ownerRemarkable = recs.flatMap((rec) =>
    (rec.outcome?.concerns ?? [])
      .filter((concern) => concern.calibration === "owner")
      .map(
        (concern) =>
          `- [${concern.kind}] ${rec.slug ? `${rec.slug}: ` : ""}${concern.text}${
            concern.evidence ? ` (${concern.evidence})` : ""
          }`
      )
  );
  const inbox = (await store.listDir("mailbox/inbox")).filter((name) => !name.startsWith("."));
  const unanswered = inbox.map(
    (file) =>
      `- steer ${path.basename(file, path.extname(file))} is still in mailbox/inbox/${file}`
  );

  const remarks: string[] = [];
  if (input.cause && !budgetStop) remarks.push(`boundary: ${input.cause}`);
  if (architect?.outcome) {
    remarks.push(`architect: ${architect.outcome.summary}`);
    for (const forward of architect.outcome.forward) {
      if (/^steer\s/i.test(forward) || /^debt closed:/i.test(forward)) continue;
      remarks.push(forward);
    }
  }
  for (const rec of recs) {
    if (rec.actor === "script" && rec.ok === false && rec.cause) {
      remarks.push(`${rec.step}: ${rec.cause}`);
    }
  }

  const assumed = concernLines(recs.filter((r) => r.step === "architect"), "choice");
  const debtOpened = concernLines(recs, "debt");
  const debtClosed = recs.flatMap((rec) =>
    (rec.outcome?.forward ?? [])
      .map((forward) => /^debt closed:\s*(.+)$/i.exec(forward)?.[1]?.trim())
      .filter((text): text is string => Boolean(text))
      .map((text) => `- ${text}`)
  );

  const roleByStep = { ...DEFAULT_ROLE_BY_STEP, ...(input.roleByStep ?? {}) };
  const computed = iterationMetrics(iteration, status, input.records, roleByStep, 0, input.prices ?? {});
  const { usage, unpricedTurns, roles: roleCosts, aliases, incidents } = computed;
  const roleNames = Object.values(roleCosts)
    .map((entry) => ({ name: entry.role, ...entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const aliasNames = Object.values(aliases)
    .map((entry) => ({ name: entry.alias, ...entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const agentTurns = recs.filter((r) => r.actor === "agent" && r.endedAt).length;
  const scriptTurns = recs.filter((r) => r.actor === "script" && r.endedAt).length;
  const base = recordedBaseGates(input.records);
  const baseLines = !base
    ? ["- not recorded"]
    : base.ok
      ? [`- ${shortHash(base.commit)}: green`]
      : [
          `- ${shortHash(base.commit)} was red before any task (pre-existing; not attributed to tasks):`,
          ...base.checks.filter((c) => !c.ok).map((c) => `  - ${c.name}: ${c.summary}`),
        ];

  const lines = [
    `# Iteration ${iteration} summary`,
    "",
    `status: ${status}`,
    ...(input.decision ? [`decision: ${input.decision}`] : []),
    "",
    "## Architect",
    ...(architect?.outcome
      ? [`- summary: ${architect.outcome.summary}`]
      : ["- no architect outcome recorded"]),
    "",
    "## Assumptions",
    ...(assumed.length ? assumed : ["- none recorded"]),
    "",
    "## Outcome",
    `- merged: ${merged.length ? merged.join(", ") : "none"}`,
    `- spikes finished: ${finished.length ? finished.join(", ") : "none"}`,
    `- pending: ${pending.length ? pending.join(", ") : "none"}`,
    `- cancelled: ${cancelled.length ? cancelled.join(", ") : "none"}`,
    "",
    "## Base gates",
    ...baseLines,
    "",
    "## Parked by root cause",
    ...(parkedByCause.size
      ? [...parkedByCause.entries()].flatMap(([cause, slugs]) => [`- ${cause}`, `  - ${slugs.join(", ")}`])
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
    `- cost by role: ${
      roleNames.length
        ? roleNames
            .map((entry) => `${entry.name} ${costText(entry.usage.costUsd, entry.unpricedTurns)}`)
            .join("; ")
        : "none"
    }`,
    ...(budgetStop
      ? [
          `- budget: ${budgetStop}; brake blind for ${unpricedTurns} unpriced ${
            unpricedTurns === 1 ? "turn" : "turns"
          }`,
        ]
      : []),
    `- merged: ${merged.length}; parked: ${[...parkedByCause.values()].flat().length}; pending: ${pending.length}`,
    "",
    "## Incidents",
    ...incidentLines(incidents),
    "",
    "## Spend by role",
    ...spendTable("role", roleNames),
    "",
    "## Spend by alias",
    ...spendTable("alias", aliasNames),
    "",
  ];
  const rel = `iterations/${iteration}/summary.md`;
  const text = lines.join("\n");
  await store.writeFile(rel, text);
  // The outbox is how the owner sees the guaranteed remarkable without reading the goal dir.
  await store.writeFile(`mailbox/outbox/iteration-${iteration}-summary.md`, text);
  return rel;
}

/**
 * A killed launch leaves records without a summary. Backfill one per missing
 * iteration before the next boundary, so every iteration is reported exactly
 * once even across crash recovery.
 */
export async function backfillSummaries(runtime: KernelRuntime): Promise<void> {
  const records = await runtime.store.listRecords();
  const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
  const status =
    state.goal === "done" ? "goal-met" : state.goal === "blocked" ? "blocked-by-user" : "stopped-with-debt";
  const roleByStep = rolesByStep(runtime.configs.process.flows);
  for (let n = 1; n <= state.iteration; n++) {
    if (await runtime.store.readFile(`iterations/${n}/summary.md`)) continue;
    await writeIterationSummary(runtime.store, {
      iteration: n,
      state,
      records,
      status,
      roleByStep,
      prices: runtime.configs.run.prices,
    });
    await writeMetrics(runtime.store, {
      iteration: n,
      status,
      records,
      state,
      roleByStep,
      prices: runtime.configs.run.prices,
    });
  }
}