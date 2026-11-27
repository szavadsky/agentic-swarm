/**
 * The boundary's second half: the architect's ownership reconcile, steer
 * answers, the task-file guard, the plan review and the PM turn. The saga
 * passes around the top turn live in `boundary-saga.ts`; each stage here either
 * returns the iteration's result or leaves the context ready for the next.
 */
import { missingPlanFinding, snapshotPlan } from "./architect-session.js";
import { reconcileForeignPlans } from "./boundary-consult.js";
import { rungTrace, snapshotDiff, taskSnapshot } from "./boundary-context.js";
import { boundaryResult } from "./boundary-state.js";
import type { BoundaryResult, ConsultContext } from "./boundary-types.js";
import { makeCause } from "./cause.js";
import { openConcernIds } from "./context-pack/misc.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  answerFromStoredRoute,
  expireHold,
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
import {
  epicPmScopes,
  GOAL_PM_SCOPE,
  planBulletEditFindings,
  runScopedPmFlow,
} from "./pm.js";
import { scriptMeta } from "./record.js";
import type { Outcome, StepRecord } from "./types.js";

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
  await answerFromStoredRoute(runtime.store, steer, answer);
}

async function recordSteerPresented(
  context: ConsultContext,
  steer: Steer,
  architect?: string,
): Promise<void> {
  await context.runtime.store.appendRecord(
    scriptMeta(context.iteration, "steer-presented", {
      slug: steer.id,
      ...(architect ? { architect } : {}),
    }),
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
  architect?: string,
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
    scriptMeta(context.iteration, "steer-unanswered", {
      slug: steer.id,
      ...(architect ? { architect } : {}),
    }),
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

/**
 * A steer stays pending when unanswered; the first miss only records it, and
 * the second expires its hold. Returns the steers still waiting, so an epic
 * consult later in the same iteration does not present an answered steer again.
 */
async function answerSteersFor(
  context: ConsultContext,
  steers: readonly Steer[],
  outcome: Outcome | undefined,
  architect?: string,
): Promise<Steer[]> {
  if (steers.length === 0) return [];
  const responses = outcome
    ? steerResponses(
        outcome,
        steers.map((steer) => steer.id),
      )
    : new Map<string, string>();
  const prior = await context.runtime.store.listRecords();
  const presented = recordSlugs(prior, "steer-presented");
  const expired = recordSlugs(prior, "steer-unanswered");
  const remaining: Steer[] = [];
  for (const steer of steers) {
    const answer = responses.get(steer.id);
    if (answer) {
      await deliverSteerAnswer(context, steer, answer);
      continue;
    }
    if (expired.has(steer.id)) continue;
    if (!presented.has(steer.id)) {
      await recordSteerPresented(context, steer, architect);
      remaining.push(steer);
      continue;
    }
    await expireUnansweredSteer(context, steer, architect);
  }
  return remaining;
}

/** The top architect's steers, after its turn closed. */
async function answerSteers(context: ConsultContext): Promise<void> {
  await answerSteersFor(
    context,
    context.forArchitect,
    context.architect?.outcome,
  );
}

/**
 * One epic's waiting steers, after its report or direction consult. The
 * iteration's first consult presents or answers them; later passes skip the
 * epic, so a steer presented in the report is not expired by the direction.
 */
export async function answerEpicSteers(
  context: ConsultContext,
  epic: string,
  outcome: Outcome | undefined,
): Promise<void> {
  const waiting = context.forEpicArchitect.get(epic) ?? [];
  // A later consult may still answer a steer the report pass only presented;
  // that answer is delivered even though this iteration already showed it.
  const answered =
    outcome?.steerAnswers?.some((entry) =>
      waiting.some((steer) => steer.id === entry.steer),
    ) ?? false;
  if (!answered && context.epicSteersAnswered.has(epic)) return;
  context.epicSteersAnswered.add(epic);
  const remaining = await answerSteersFor(context, waiting, outcome, epic);
  context.forEpicArchitect.set(epic, remaining);
}

/**
 * Every plan that changed this consult gets a second reading, then its owner
 * answers. Epic plans review first bottom-to-top; the goal plan reviews last,
 * after the plans it depends on. The two passes can both touch one epic, so a
 * plan reviews once, with any pass's change counting.
 */
export async function reviewChangedPlans(
  context: ConsultContext,
): Promise<void> {
  const changed = new Map<
    string,
    { plan: typeof context.plan; architect?: string }
  >();
  for (const consult of context.consults ?? []) {
    if (!consult.changed) continue;
    const prior = changed.get(consult.plan.rel);
    if (prior) continue;
    changed.set(consult.plan.rel, {
      plan: consult.plan,
      architect: consult.epic,
    });
  }
  const epics = [...changed.values()]
    .filter((entry) => entry.architect !== undefined)
    .sort((a, b) => a.plan.rel.localeCompare(b.plan.rel));
  const goal: Array<{ plan: typeof context.plan; architect?: string }> =
    snapshotPlan(context.plan.path) !== context.planBefore
      ? [{ plan: context.plan }]
      : [];
  const ordered = [...epics, ...goal];
  const policy = context.runtime.configs.process.architecture.architectReturn;
  for (const entry of ordered) {
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
      runScopedPmFlow(
        runtime,
        {
          iteration: context.iteration,
          state: context.state,
          cwd: runtime.paths.goalCheckout,
        },
        [...epicPmScopes(runtime), GOAL_PM_SCOPE],
      ),
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
  const open = openConcernIds(context.records, context.tasks);
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
  pm: Awaited<ReturnType<typeof runScopedPmFlow>>,
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
