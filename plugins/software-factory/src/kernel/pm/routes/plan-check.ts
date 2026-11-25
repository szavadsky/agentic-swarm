import type { AgentTurnResult } from "../../agent.js";
import { makeCause } from "../../cause.js";
import { DEFAULT_PARK_AMENDS } from "../../config.js";
import { boundaryTarget } from "../../flow-context.js";
import { planCheckProvenance } from "../../mailbox.js";
import { scriptMeta } from "../../record.js";
import type {
  KernelRuntime,
  Outcome,
  PlanCheckFollowUp,
  PlanCheckRouteEntry,
  StallDecision,
  State,
  TaskFile,
} from "../../types.js";
import {
  failureReasons,
  NO_TURN_INPUTS,
  type PmTurnSetup,
  recordPmRejection,
  rungSteps,
  runPmTurn,
  setupPmTurn,
} from "../ladder.js";
import { planCheckLadderNote, planCheckPmBrief } from "../prompts.js";
import {
  introducedFindings,
  type PlanSnapshot,
  readTasks,
  reconcileTurn,
  scopeWriteFindings,
  unfixedBaseline,
} from "../reconcile.js";
import { scopeEpic } from "../scope.js";
import { PLAN_CHECK_ROUTES_STEP } from "../steps.js";
import type { PmScope } from "../types.js";
import {
  amendsUsed,
  cancelRoutes,
  decisionFindings,
  planCheckDecision,
} from "../validation.js";
import {
  addCredit,
  depFixFindings,
  depRewriteFindings,
} from "./plan-check-deps.js";

/**
 * Which follow-up slugs a plan-check turn resumed; a cancel spends its slug
 * and a leave keeps it for the architect. `architect` is the exit for a clean
 * turn the graph still contradicts: its routes are committed, and the findings
 * no rung introduced travel to the architect like the other PM ladders.
 */
export type PlanCheckPmResult =
  | { status: "routed"; continued: string[]; left: string[] }
  | {
      status: "architect";
      continued: string[];
      left: string[];
      findings: string[];
    }
  /** A rung ended on an infra stop; the writes are rolled back for the boundary. */
  | { status: "infra"; continued: []; left: string[] }
  /** Every tier failed both of its turns; the boundary reads the attempts. */
  | { status: "exhausted"; continued: []; left: string[] };

async function validatePlanCheckTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    round: number;
    followUps: PlanCheckFollowUp[];
    scope?: PmScope;
  },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const { findings, texts, tasks, parseFindings } = await reconcileTurn(
    runtime,
    opts,
    plansBefore,
    taskSnapshot,
  );
  const used = amendsUsed(await runtime.store.listRecords(), opts.iteration);
  findings.push(
    ...scopeWriteFindings(
      opts.scope ?? { kind: "goal" },
      taskSnapshot,
      texts,
      tasks,
    ),
  );

  const routes = outcome?.planCheckRoutes;
  const slugs = [...new Set(opts.followUps.map((item) => item.slug))].sort();
  const followUpOf = new Map(opts.followUps.map((item) => [item.slug, item]));
  if (!routes) {
    findings.push(
      `plan-check turn lists no planCheckRoutes; route each follow-up (${slugs.join(", ")}) as continue|leave`,
    );
    return [...new Set(findings)];
  }
  const scan = scanPlanCheckRoutes(routes, slugs, texts);
  findings.push(...scan.findings);
  if (parseFindings.length === 0) {
    findings.push(
      ...planCheckWriteFindings(
        runtime,
        opts,
        taskSnapshot,
        texts,
        tasks,
        followUpOf,
        scan.actionOf,
        used,
      ),
    );
  }
  return [...new Set(findings)];
}

/** Each follow-up slug is routed once with a reason and survives the turn. */
function scanPlanCheckRoutes(
  routes: readonly PlanCheckRouteEntry[],
  slugs: readonly string[],
  texts: ReadonlyMap<string, string>,
): {
  actionOf: Map<string, PlanCheckRouteEntry["action"]>;
  findings: string[];
} {
  const claimed = new Set(slugs);
  const seen = new Set<string>();
  const actionOf = new Map<string, PlanCheckRouteEntry["action"]>();
  const findings: string[] = [];
  for (const entry of routes) {
    if (seen.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is routed twice; route each follow-up once`,
      );
      continue;
    }
    seen.add(entry.slug);
    actionOf.set(entry.slug, entry.action);
    if (!claimed.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is not in this plan-check; route only ${slugs.join(", ")}`,
      );
    }
    if (!entry.reason.trim()) {
      findings.push(
        `slug "${entry.slug}" needs a reason; say why it continues or stays for the architect`,
      );
    }
  }
  for (const slug of slugs) {
    if (!seen.has(slug)) {
      findings.push(
        `slug "${slug}" has no route; route each follow-up as continue|leave`,
      );
    }
    if (!texts.has(slug)) {
      findings.push(
        `follow-up task "${slug}" was deleted; the follow-up set must survive the turn`,
      );
    }
  }
  return { actionOf, findings };
}

/** Provenance and decision checks over the task files the turn wrote. */
function planCheckWriteFindings(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; followUps: PlanCheckFollowUp[] },
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
  tasks: readonly TaskFile[],
  followUpOf: ReadonlyMap<string, PlanCheckFollowUp>,
  actionOf: ReadonlyMap<string, PlanCheckRouteEntry["action"]>,
  used: ReadonlyMap<string, number>,
): string[] {
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  const depFix = depFixFindings(runtime, opts, taskSnapshot, texts, followUpOf);
  const decisionOf = planCheckDecisionOf(opts.followUps, actionOf);
  const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
  const credits = new Map<string, string[]>();
  for (const slug of depFix.depFixed) addCredit(credits, slug, "dep fix");
  const rewrite = depRewriteFindings(
    created,
    opts.followUps,
    actionOf,
    credits,
  );
  return [
    ...depFix.findings,
    ...rewrite.findings,
    ...planCheckProvenanceFindings(created, bySlug, opts.iteration),
    ...decisionFindings({
      turn: "plan-check",
      slugs: [...new Set(opts.followUps.map((item) => item.slug))].sort(),
      decisionOf,
      state: opts.state,
      before: taskSnapshot,
      texts,
      bySlug,
      taskTypes: runtime.configs.process.taskTypes,
      created: created
        .filter((slug) => !rewrite.depRewrites.has(slug))
        .map((slug) => bySlug.get(slug))
        .filter((task): task is TaskFile => task !== undefined),
      credits,
      fixed: depFix.depFixed,
      amendsUsed: used,
      parkAmends: runtime.limits.parkAmends ?? DEFAULT_PARK_AMENDS,
    }),
  ];
}

function planCheckDecisionOf(
  followUps: readonly PlanCheckFollowUp[],
  actionOf: ReadonlyMap<string, PlanCheckRouteEntry["action"]>,
): Map<string, StallDecision> {
  const decisionOf = new Map<string, StallDecision>();
  for (const item of followUps) {
    decisionOf.set(
      item.slug,
      actionOf.get(item.slug) === "leave"
        ? "leave"
        : planCheckDecision(item.kind),
    );
  }
  return decisionOf;
}

function planCheckProvenanceFindings(
  created: readonly string[],
  bySlug: ReadonlyMap<string, TaskFile>,
  iteration: number,
): string[] {
  const findings: string[] = [];
  for (const slug of created) {
    const task = bySlug.get(slug);
    if (!task) continue;
    if (planCheckProvenance(task.source) !== String(iteration)) {
      findings.push(
        `new task "${slug}" has no provenance plan-check: ${iteration}; a plan-check turn creates follow-ups only with source plan-check: ${iteration}`,
      );
    }
  }
  return findings;
}

/**
 * PM ladder for a plan-checker's follow-ups at dispatch exhaustion. Each
 * follow-up slug gets one route; `continue` carries out the checker's kind:
 * an `amend` rewrites the parked file and bumps its revision, so dispatch
 * resumes the slug on its kept branch; a `cancel` becomes a kernel cancel
 * record; a `replace` writes one task under a new slug with `base:` naming the
 * parked one (a fresh task when the kept branch conflicts with the head); a
 * `split` writes one per separable outcome, each with `base:` and its own
 * done-when; `missing-dep` drops the dead dep or rewrites it as a task; an
 * `unmerged` park continues as a task. `leave` keeps the slug for the
 * architect with a reason. The record uses the PM step, so it stays out of the
 * item's turn count and prices into the iteration's spend like every other PM
 * turn.
 *
 * Accepted routes commit to a `plan-check-routes` script record after their
 * cancels; a failed rung's routes die with its rollback. A turn that exhausts
 * the ladder or stops on infra falls back to the boundary as today: the writes
 * are rolled back, the attempt is recorded so the round counts once, and the
 * evidence still reaches the architect through the pack.
 *
 * The untouched graph is validated once before rung 1: a rung fails only on
 * findings its turn introduced, because a pre-existing finding is not the PM's
 * to derive away. A turn that introduces none while the baseline still stands
 * is kept — its valid routes and cancels apply — and the ladder ends
 * `architect` with the baseline findings for the next consult.
 */
export async function runPlanCheckPm(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    followUps: PlanCheckFollowUp[];
    cwd: string;
    scope?: PmScope;
  },
): Promise<PlanCheckPmResult> {
  const slugs = [...new Set(opts.followUps.map((item) => item.slug))].sort();
  const left = [...slugs];
  const setup = await setupPmTurn(runtime, opts);
  const brief = await planCheckPmBrief(runtime, opts);
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const round = index + 1;
    const target = boundaryTarget(runtime, "pm", rung.alias);
    const { tasks } = await readTasks(runtime);
    const result = await runPmTurn(runtime, opts, target, {
      round,
      planList: setup.planList,
      tasks,
      repair: round === 1 ? "" : planCheckLadderNote(rung, target, failure),
      ...NO_TURN_INPUTS,
      planChecks: brief,
    });
    const outcome = result.outcome;
    const findings = await validatePlanCheckTurn(
      runtime,
      { ...opts, round },
      setup.plansBefore,
      setup.taskSnapshot,
      outcome,
    );
    const introduced = introducedFindings(findings, setup.baselineKeys);
    if (outcome?.status === "done" && introduced.length === 0) {
      return acceptPlanCheckRoutes(
        runtime,
        opts,
        outcome.planCheckRoutes ?? [],
        setup.baseline,
        findings,
        round,
      );
    }
    const reasons = failureReasons(outcome, introduced, result.record);
    const exit = await rejectPlanCheckRung(
      runtime,
      opts,
      round,
      reasons,
      setup,
      result,
    );
    if (exit) return exit;
    failure = reasons;
  }
  await recordPlanCheckFailure(runtime, opts.iteration, failure.join("; "));
  return { status: "exhausted", continued: [], left };
}

/** Records a failed rung; an infra stop still ends the ladder. */
async function rejectPlanCheckRung(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    followUps: PlanCheckFollowUp[];
    scope?: PmScope;
  },
  round: number,
  reasons: string[],
  setup: PmTurnSetup,
  result: AgentTurnResult,
): Promise<PlanCheckPmResult | undefined> {
  await recordPmRejection(
    runtime,
    opts.iteration,
    round,
    reasons,
    setup.snapshot,
    scopeEpic(opts.scope ?? { kind: "goal" }),
  );
  if (result.record.stop?.kind !== "infra") return undefined;
  await recordPlanCheckFailure(
    runtime,
    opts.iteration,
    reasons.join("; "),
    round,
  );
  const left = [...new Set(opts.followUps.map((item) => item.slug))].sort();
  return { status: "infra", continued: [], left };
}

/** Commits the accepted routes and returns what dispatch resumes or leaves. */
async function acceptPlanCheckRoutes(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; followUps: PlanCheckFollowUp[] },
  routes: readonly PlanCheckRouteEntry[],
  baseline: string[],
  findings: string[],
  round: number,
): Promise<PlanCheckPmResult> {
  const accepted = [...routes].sort((a, b) => a.slug.localeCompare(b.slug));
  const kindOf = new Map(opts.followUps.map((item) => [item.slug, item.kind]));
  await cancelRoutes(
    runtime,
    opts.iteration,
    opts.state,
    accepted
      .filter(
        (entry) =>
          entry.action === "continue" && kindOf.get(entry.slug) === "cancel",
      )
      .map((entry) => ({ slug: entry.slug, cause: entry.reason })),
  );
  // The boundary reads routes from this record only, never from the agent
  // rung outcomes: a failed rung's routes die with its rollback.
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, PLAN_CHECK_ROUTES_STEP, { round }),
    {
      ok: true,
      outcome: {
        status: "done",
        summary: `plan-check routes: ${accepted.map((entry) => `${entry.slug}=${entry.action}`).join(", ")}`,
        concerns: [],
        forward: [],
        planCheckRoutes: accepted,
      },
    },
  );
  const continued = accepted
    .filter(
      (entry) =>
        entry.action === "continue" && kindOf.get(entry.slug) !== "cancel",
    )
    .map((entry) => entry.slug);
  const left = accepted
    .filter((entry) => entry.action === "leave")
    .map((entry) => entry.slug);
  const remaining = unfixedBaseline(baseline, findings);
  return remaining.length > 0
    ? {
        status: "architect",
        continued,
        left,
        findings: remaining,
      }
    : { status: "routed", continued, left };
}

/** Records a rung or ladder failure under the plan-check-routes step. */
async function recordPlanCheckFailure(
  runtime: KernelRuntime,
  iteration: number,
  failure: string,
  round?: number,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(
      iteration,
      PLAN_CHECK_ROUTES_STEP,
      round === undefined ? {} : { round },
    ),
    {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        failure || "plan-check PM ladder exhausted",
      ),
    },
  );
}
