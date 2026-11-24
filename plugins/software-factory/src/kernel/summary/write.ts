/** Writing the iteration summary and backfilling older ones. */

import { recordedBaseGates } from "../baseline.js";
import { derive } from "../derive.js";
import { writeEpicSummaries } from "../epic-summary.js";
import {
  DEFAULT_ROLE_BY_STEP,
  iterationMetrics,
  rolesByStep,
  steerLatency,
  writeMetrics,
} from "../metrics.js";
import type { IterationMetrics, SteerLatency } from "../metrics.js";
import { loadPriceTable } from "../openrouter.js";
import type { ArtifactStore, KernelRuntime, StepRecord } from "../types.js";
import {
  summaryNamedRows,
  summaryRemarkFacts,
  summaryTaskFacts,
} from "./facts.js";
import { writeIntentStatus } from "./intent-status.js";
import { summaryHeadLines, summaryMetricsLines } from "./render.js";
import { baseGateLines, defaultStatus, distanceDebtLines } from "./tables.js";
import type { SummaryInput, SummaryRender, SummaryStatus } from "./types.js";

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
 * The artifact must exist before the summary that reports it, so a crash
 * never leaves a summary whose intent status the dashboard cannot read.
 */
async function writeArchitectIntentStatus(
  store: ArtifactStore,
  iteration: number,
  architect: StepRecord | undefined,
): Promise<void> {
  if (!architect) return;
  await writeIntentStatus(
    store,
    iteration,
    architect.outcome?.intentStatus ?? [],
  );
}

/** The iteration metrics and the mailbox's steer latency, read once. */
async function summaryComputed(
  store: ArtifactStore,
  input: SummaryInput,
  iteration: number,
  status: SummaryStatus,
): Promise<{ computed: IterationMetrics; steers: SteerLatency }> {
  const roleByStep = { ...DEFAULT_ROLE_BY_STEP, ...(input.roleByStep ?? {}) };
  // Park landings and spike kinds read the task files; the summary reports the
  // same facts the metrics write does.
  const tasks = await store.listTasks();
  const steers = await steerLatency(store, input.records);
  const computed = iterationMetrics(
    iteration,
    status,
    input.records,
    roleByStep,
    input.humanInterventions ?? 0,
    input.prices ?? {},
    input.priceIds,
    tasks,
  );
  return { computed, steers };
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
  const { computed, steers } = await summaryComputed(
    store,
    input,
    iteration,
    status,
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
    steers,
    named: summaryNamedRows(computed),
    agentTurns: recs.filter((r) => r.actor === "agent" && r.endedAt).length,
    scriptTurns: recs.filter((r) => r.actor === "script" && r.endedAt).length,
    baseLines: baseGateLines(recordedBaseGates(input.records)),
    distanceDebt: distanceDebtLines(facts.open),
  };
  await writeArchitectIntentStatus(store, iteration, architect);
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
