/**
 * The saga passes around the top architect's turn: the bottom-up report pass
 * before it, the top-down direction pass after it for the subset the top chose,
 * and each epic's pack and consult. The first iteration is top-down only; the
 * goal's last iteration reports upward and takes no direction.
 */
import fs from "node:fs";
import {
  type ConsultFailure,
  type EpicConsult,
  runEpicConsult,
  writeEpicPack,
} from "./boundary-consult.js";
import {
  boundaryPassPlan,
  epicJobDone,
  epicPlan,
  ownedPlanText,
  parseRegister,
} from "./boundary-context.js";
import {
  type BoundaryResult,
  boundaryResult,
  type ConsultContext,
} from "./boundary-state.js";
import { writePack } from "./boundary-stage.js";
import { derive } from "./derive.js";
import { type EpicRow, subarchitectRows } from "./register.js";
import type { StepRecord } from "./types.js";

type ConsultStep = { result: BoundaryResult } | { consult: EpicConsult };

/** One epic's pack and consult; its failure belongs to the whole iteration. */
async function consultEpic(
  context: ConsultContext,
  epic: string,
  records: readonly StepRecord[],
  planText: string,
  pass: "report" | "direction",
): Promise<ConsultStep> {
  const { runtime } = context;
  const prior = records.some(
    (record) =>
      record.step === "subarchitect" &&
      record.architect === epic &&
      record.endedAt,
  );
  const epicTurn = !prior
    ? "first"
    : context.opts.relaunch
      ? "relaunch"
      : "boundary";
  const packRel = await writeEpicPack(runtime, {
    iteration: context.iteration,
    epic,
    goalPlanFile: context.plan,
    records,
    turn: epicTurn,
    pass,
    tasks: context.tasks,
    state: context.state,
    planText,
    ...(context.opts.runConfigPath
      ? { runConfigPath: context.opts.runConfigPath }
      : {}),
  });
  const consult = await runEpicConsult(runtime, {
    iteration: context.iteration,
    epic,
    packRel,
    goalPlanFile: context.plan,
    ...(context.digestPath ? { digestPath: context.digestPath } : {}),
    records,
    turn: epicTurn,
    pass,
  });
  if (consult.failure)
    return { result: consultFailureResult(context, consult.failure) };
  return { consult: consult.consult! };
}

function consultFailureResult(
  context: ConsultContext,
  failure: ConsultFailure,
): BoundaryResult {
  return boundaryResult(context, "blocked", {
    cause: failure.cause,
    ...(failure.stop ? { stop: failure.stop } : {}),
    outcome: context.architect?.outcome,
  });
}

/** Reloads the facts a pass changed: its records, tasks and derived state. */
async function reloadConsultFacts(context: ConsultContext): Promise<void> {
  const { runtime } = context;
  context.records = await runtime.store.listRecords();
  context.tasks = await runtime.store.listTasks();
  context.state = derive(
    context.tasks,
    context.records,
    runtime.configs.process.flows,
  );
}

/**
 * The bottom-up report pass, before the top turn: every active epic that still
 * owes work reports upward, and the top pack is re-rendered so those briefs and
 * concerns reach the top architect. The first iteration has nothing to report,
 * so it runs the top-down direction pass only.
 */
export async function runReportPass(
  context: ConsultContext,
): Promise<BoundaryResult | undefined> {
  const { runtime } = context;
  const passPlan = boundaryPassPlan({
    plan: context.plan,
    depth: runtime.configs.process.hierarchy?.depth ?? 1,
    tasks: context.tasks,
    state: context.state,
    records: context.records,
  });
  if (passPlan.reportEpics.length === 0) return undefined;
  const records = await runtime.store.listRecords();
  const planText = await ownedPlanText(runtime);
  const consults: EpicConsult[] = [];
  for (const row of passPlan.reportEpics) {
    const step = await consultEpic(
      context,
      row.epic,
      records,
      planText,
      "report",
    );
    if ("result" in step) return step.result;
    consults.push(step.consult);
  }
  context.consults = [...(context.consults ?? []), ...consults];
  await reloadConsultFacts(context);
  await writePack(context, { prepare: false });
  return undefined;
}

/** The direction subset the top named, or the finding for an inactive epic. */
function directionSubset(
  context: ConsultContext,
  active: EpicRow[],
): { epics: EpicRow[] } | { result: BoundaryResult } {
  const chosen = context.architect?.outcome?.epicConsults;
  const unknown =
    chosen?.filter((epic) => !active.some((row) => row.epic === epic)) ?? [];
  if (unknown.length > 0) {
    return {
      result: boundaryResult(context, "blocked", {
        cause: `architect named epic(s) outside the active register: ${unknown.join(", ")}`,
        outcome: context.architect?.outcome,
      }),
    };
  }
  return {
    epics:
      chosen === undefined
        ? active
        : active.filter((row) => chosen.includes(row.epic)),
  };
}

/** The blocked result when a chosen epic's plan never appeared. */
function missingEpicPlanResult(
  context: ConsultContext,
  selected: readonly EpicRow[],
): BoundaryResult | undefined {
  const missing = selected.find(
    (row) =>
      !fs.existsSync(epicPlan(context.runtime.store.goalDir, row.epic).path),
  );
  if (!missing) return undefined;
  const epic = epicPlan(context.runtime.store.goalDir, missing.epic);
  return boundaryResult(context, "blocked", {
    cause: `epic "${missing.epic}" plan "${epic.rel}" does not exist after its consult; the subarchitect creates it`,
    outcome: context.architect?.outcome,
  });
}

/**
 * Every live child delivered a consult, so each plan it changed is reviewed
 * even when the top did not name it; the chosen subset only adds a written
 * turn for an epic whose child did not deliver.
 */
async function consultDirectionRows(
  context: ConsultContext,
  selected: readonly EpicRow[],
  records: readonly StepRecord[],
  planText: string,
): Promise<{ consults: EpicConsult[] } | { result: BoundaryResult }> {
  const consults: EpicConsult[] = [...(context.consults ?? [])];
  const deliveredEpics = new Set<string>();
  for (const delivered of context.steeredDone?.values() ?? []) {
    if (deliveredEpics.has(delivered.epic)) continue;
    consults.push(delivered);
    deliveredEpics.add(delivered.epic);
  }
  for (const row of selected) {
    // A steered child already ran this epic's consult inside the architect's
    // session; its record is on disk and its plan edit is the consult's.
    if (context.steeredDone?.has(row.epic)) continue;
    if (epicJobDone(context.state, row.epic)) continue;
    const step = await consultEpic(
      context,
      row.epic,
      records,
      planText,
      "direction",
    );
    if ("result" in step) return { result: step.result };
    consults.push(step.consult);
  }
  return { consults };
}

/**
 * Depth 2: the top-down direction pass after the top turn. The top architect
 * names the epics it wants consulted (`epicConsults`); absent keeps every
 * active epic. A live child's delivery is a consult whether or not it was
 * named; a named epic whose child did not deliver gets a written turn. A named
 * epic outside the active register is a finding, never a silent skip.
 */
export async function runConsults(
  context: ConsultContext,
): Promise<BoundaryResult | undefined> {
  const { runtime } = context;
  const depth = runtime.configs.process.hierarchy?.depth ?? 1;
  const register = parseRegister(
    context.plan,
    depth,
    context.tasks,
    context.state,
  );
  if (register.findings.length > 0) {
    return boundaryResult(context, "blocked", {
      cause: `architect register: ${register.findings.join("; ")}`,
      outcome: context.architect?.outcome,
    });
  }
  const subset = directionSubset(context, subarchitectRows(register.epics));
  if ("result" in subset) return subset.result;
  const records = await runtime.store.listRecords();
  const planText = await ownedPlanText(runtime);
  const consulted = await consultDirectionRows(
    context,
    subset.epics,
    records,
    planText,
  );
  if ("result" in consulted) return consulted.result;
  const missing = missingEpicPlanResult(context, subset.epics);
  if (missing) return missing;
  context.consults = consulted.consults;
  return undefined;
}
