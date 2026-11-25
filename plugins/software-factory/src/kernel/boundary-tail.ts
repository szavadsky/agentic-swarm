/**
 * The boundary's second half: the architect's ownership reconcile, steer
 * answers, the task-file guard, the epic consults, the plan review and the PM
 * turn. Each stage either returns the iteration's result or leaves the context
 * ready for the next.
 */
import fs from "node:fs";
import { missingPlanFinding, snapshotPlan } from "./architect-session.js";
import {
  type ConsultFailure,
  type EpicConsult,
  reconcileForeignPlans,
  runEpicConsult,
  writeEpicPack,
} from "./boundary-consult.js";
import {
  epicJobDone,
  epicPlan,
  ownedPlanText,
  parseRegister,
  rungTrace,
  snapshotDiff,
  taskSnapshot,
} from "./boundary-context.js";
import {
  type BoundaryResult,
  boundaryResult,
  type ConsultContext,
} from "./boundary-state.js";
import { makeCause } from "./cause.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { openConcernIds } from "./context-pack/misc.js";
import {
  expireHold,
  markProcessed,
  readHolds,
  type Steer,
  steerResponses,
  writeOutbox,
} from "./mailbox.js";
import {
  PLAN_RETURN_STEP,
  PLAN_REVIEW_STEP,
  runArchitectReturn,
  runPlanReview,
} from "./plan-review.js";
import { planBulletEditFindings, runPmFlow } from "./pm.js";
import { scriptMeta } from "./record.js";
import type { StepRecord } from "./types.js";

/** The architect's post-turn checks: ownership, steer answers, task files, decision, plan. */
export async function settleArchitectStage(
  context: ConsultContext,
): Promise<BoundaryResult | undefined> {
  const result = context.architect!;
  await reconcileForeignPlans(
    context.runtime,
    context.plansBefore ?? [],
    [
      context.plan.rel,
      ...[...(context.steeredDone?.values() ?? [])].map(
        (consult) => consult.plan.rel,
      ),
    ],
    context.iteration,
    "architect-reconcile",
    "architect",
    undefined,
    1,
  );
  await answerSteers(context);
  const touched = snapshotDiff(
    context.tasksBefore ?? new Map(),
    await taskSnapshot(context.runtime.store),
  );
  if (touched) {
    return boundaryResult(context, "blocked", {
      cause: `architect modified task file ${touched}; only the PM writes tasks`,
      outcome: result.outcome,
    });
  }
  const decision = result.outcome?.decision;
  if (!decision) {
    return boundaryResult(context, "blocked", {
      cause: `architect turn produced no decision: ${result.outcome?.summary ?? "no outcome"}`,
      outcome: result.outcome,
    });
  }
  if (decision !== "continue") {
    return boundaryResult(context, decision, { outcome: result.outcome });
  }
  const planFinding = missingPlanFinding(
    context.plan.path,
    decision,
    context.planBefore ?? null,
  );
  if (planFinding) {
    return boundaryResult(context, "blocked", {
      cause: planFinding,
      outcome: result.outcome,
    });
  }
  return undefined;
}

/** The steer ids one record step names, via their record slug. */
function recordSlugs(records: StepRecord[], step: string): Set<string> {
  return new Set(
    records
      .filter((record) => record.step === step && record.slug)
      .map((record) => record.slug as string),
  );
}

async function deliverSteerAnswer(
  context: ConsultContext,
  steer: Steer,
  answer: string,
): Promise<void> {
  const { runtime } = context;
  await writeOutbox(
    runtime.store,
    steer.id,
    `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
  );
  await markProcessed(runtime.store, steer);
  await expireHold(runtime.store, steer.id);
}

async function recordSteerPresented(
  context: ConsultContext,
  steer: Steer,
): Promise<void> {
  await context.runtime.store.appendRecord(
    scriptMeta(context.iteration, "steer-presented", { slug: steer.id }),
    {
      ok: false,
      cause: makeCause(
        "steer",
        `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; the next boundary presents it again before its hold expires`,
      ),
    },
  );
}

/** The second unanswered boundary expires the hold and reports the steer. */
async function expireUnansweredSteer(
  context: ConsultContext,
  steer: Steer,
): Promise<void> {
  const { runtime } = context;
  await expireHold(runtime.store, steer.id);
  const reason = `steer ${steer.id} was left unanswered at two boundaries; its hold expired`;
  await writeOutbox(
    runtime.store,
    steer.id,
    `# Steer ${steer.id}\n\n${reason}\n\nSource: ${steer.relPath}`,
  );
  await runtime.store.appendRecord(
    scriptMeta(context.iteration, "steer-unanswered", { slug: steer.id }),
    {
      ok: false,
      cause: makeCause(
        "steer",
        `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; hold expired after one boundary`,
      ),
      outcome: {
        status: "done",
        summary: reason,
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: `steer ${steer.id} is unanswered after a second boundary; its hold expired and held work resumed`,
            evidence: steer.relPath,
          },
        ],
        forward: [],
      },
    },
  );
}

/** A steer stays pending when unanswered; the first miss only records it. */
async function answerSteers(context: ConsultContext): Promise<void> {
  const result = context.architect!;
  const responses = result.outcome
    ? steerResponses(
        result.outcome,
        context.forArchitect.map((steer) => steer.id),
      )
    : new Map<string, string>();
  const prior = await context.runtime.store.listRecords();
  const presented = recordSlugs(prior, "steer-presented");
  const expired = recordSlugs(prior, "steer-unanswered");
  for (const steer of context.forArchitect) {
    const answer = responses.get(steer.id);
    if (answer) {
      await deliverSteerAnswer(context, steer, answer);
      continue;
    }
    if (expired.has(steer.id)) continue;
    if (!presented.has(steer.id)) {
      await recordSteerPresented(context, steer);
      continue;
    }
    await expireUnansweredSteer(context, steer);
  }
}

type ConsultStep = { result: BoundaryResult } | { consult: EpicConsult };

/** One epic's pack and consult; its failure belongs to the whole iteration. */
async function consultEpic(
  context: ConsultContext,
  epic: string,
  records: StepRecord[],
  planText: string,
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

/** Depth 2: one subarchitect consult per active epic, then every epic plan must exist. */
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
  const active = register.epics
    .filter(
      (row) => row.closed === undefined && row.architect === "subarchitect",
    )
    .sort((a, b) => a.epic.localeCompare(b.epic));
  const records = await runtime.store.listRecords();
  const planText = await ownedPlanText(runtime);
  const consults: EpicConsult[] = [];
  for (const row of active) {
    // A steered child already ran this epic's consult inside the architect's
    // session; its record is on disk and its plan edit is the consult's.
    const delivered = context.steeredDone?.get(row.epic);
    if (delivered) {
      consults.push(delivered);
      continue;
    }
    if (epicJobDone(context.state, row.epic)) continue;
    const step = await consultEpic(context, row.epic, records, planText);
    if ("result" in step) return step.result;
    consults.push(step.consult);
  }
  const missing = active.find(
    (row) => !fs.existsSync(epicPlan(runtime.store.goalDir, row.epic).path),
  );
  if (missing) {
    const epic = epicPlan(runtime.store.goalDir, missing.epic);
    return boundaryResult(context, "blocked", {
      cause: `epic "${missing.epic}" plan "${epic.rel}" does not exist after its consult; the subarchitect creates it`,
      outcome: context.architect?.outcome,
    });
  }
  context.consults = consults;
  return undefined;
}

/** Every plan that changed this consult gets a second reading, then its owner answers. */
export async function reviewChangedPlans(
  context: ConsultContext,
): Promise<void> {
  const changed: Array<{ plan: typeof context.plan; architect?: string }> = [];
  if (snapshotPlan(context.plan.path) !== context.planBefore)
    changed.push({ plan: context.plan });
  for (const consult of context.consults ?? []) {
    if (consult.changed)
      changed.push({ plan: consult.plan, architect: consult.epic });
  }
  const policy = context.runtime.configs.process.architecture.architectReturn;
  for (const entry of changed) {
    const review = await runBoundaryTurn(
      context.runtime,
      { iteration: context.iteration, step: PLAN_REVIEW_STEP },
      () =>
        runPlanReview(context.runtime, {
          iteration: context.iteration,
          packRel: context.packRel!,
          plan: entry.plan,
          ...(entry.architect ? { architect: entry.architect } : {}),
        }),
    );
    const kernel = await planBulletEditFindings(
      context.runtime,
      context.tasks,
      context.state,
      entry.plan.rel,
    );
    const findings = {
      technical: [...(review.findings?.technical ?? []), ...kernel],
      planNotes: review.findings?.planNotes ?? [],
    };
    if (findings.technical.length > 0 && policy === "on-technical-concerns") {
      await runBoundaryTurn(
        context.runtime,
        { iteration: context.iteration, step: PLAN_RETURN_STEP },
        () =>
          runArchitectReturn(context.runtime, {
            iteration: context.iteration,
            packRel: context.packRel!,
            plan: entry.plan,
            findings,
            reviewers: review.reviewers,
            ...(entry.architect ? { architect: entry.architect } : {}),
          }),
      );
    }
  }
}

/** The PM turn and the result each of its statuses produces. */
export async function runPmStage(
  context: ConsultContext,
): Promise<BoundaryResult> {
  const { runtime } = context;
  await releaseConcernMarks(context);
  const pm = await runBoundaryTurn(
    runtime,
    { iteration: context.iteration, step: "pm" },
    () =>
      runPmFlow(runtime, {
        iteration: context.iteration,
        state: context.state,
        cwd: runtime.paths.goalCheckout,
      }),
  );
  return pmResult(context, pm);
}

/**
 * A blocking concern's mark decides the wave it was written in, not every
 * later one: the architect's consult read the mark in its pack and ruled on
 * the concern, so the next iteration's dispatch is not withheld by a mark
 * nobody revisits. A passed-on concern's empty mark stays — it is the "judged"
 * record that keeps the concern off later wave-end briefs. Resolution tracking
 * narrows the blocking release later; until then the consult is the release.
 * A hold directory that cannot be read is dispatch's infra finding, not the
 * boundary's.
 */
async function releaseConcernMarks(context: ConsultContext): Promise<void> {
  const open = openConcernIds(context.records);
  if (open.size === 0) return;
  let holds: Awaited<ReturnType<typeof readHolds>>["holds"];
  try {
    ({ holds } = await readHolds(context.runtime.store));
  } catch (err) {
    console.warn(
      `[factory] holds unreadable for concern-mark release: ${(err as Error).message}`,
    );
    return;
  }
  for (const hold of holds) {
    if (!open.has(hold.steer) || hold.slugs.length === 0) continue;
    await expireHold(context.runtime.store, hold.steer);
  }
}

function pmResult(
  context: ConsultContext,
  pm: Awaited<ReturnType<typeof runPmFlow>>,
): BoundaryResult {
  const outcome = context.architect?.outcome;
  if (pm.status === "asked") {
    return boundaryResult(context, "blocked", {
      cause: `PM escalated and asked: ${pm.outcome.summary}`,
      outcome,
    });
  }
  if (pm.status === "architect") {
    // The PM's usable writes stay and dispatch may start them; the findings
    // no rung can fix travel as this iteration's cause.
    return boundaryResult(context, "continue", {
      cause: `PM ladder routed to the architect: ${pm.findings.join("; ")}`,
      outcome,
    });
  }
  if (pm.status === "infra") {
    const rung = pm.rungs.at(-1);
    const where = rung
      ? ` at rung ${rung.round} ${rung.alias} (${rung.model})`
      : "";
    return boundaryResult(context, "blocked", {
      cause: `PM ladder stopped on infrastructure${where}: ${infraCause(pm.stop)}`,
      stop: { cause: pm.stop.cause, details: pm.stop.details },
      outcome,
    });
  }
  if (pm.status === "step-infra") {
    return boundaryResult(context, "blocked", {
      cause: `PM step "${pm.step}" stopped on infrastructure: ${infraCause(pm.stop)}`,
      stop: { cause: pm.stop.cause, details: pm.stop.details },
      outcome,
    });
  }
  if (pm.status === "exhausted") {
    return boundaryResult(context, "blocked", {
      cause: `PM ladder exhausted: ${rungTrace(pm.rungs)}`,
      outcome,
    });
  }
  return boundaryResult(context, "continue", { outcome });
}

import { infraCause } from "./boundary-context.js";
