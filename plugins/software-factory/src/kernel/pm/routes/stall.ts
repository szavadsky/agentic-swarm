import type { AgentTurnResult } from "../../agent.js";
import { makeCause } from "../../cause.js";
import { DEFAULT_PARK_AMENDS } from "../../config.js";
import { boundaryTarget } from "../../flow-context.js";
import type { ForwardedConcern } from "../../context-pack/types.js";
import { readHolds, stallProvenance } from "../../mailbox.js";
import { scriptMeta } from "../../record.js";
import type {
  KernelRuntime,
  Outcome,
  StallDecision,
  StallRouteEntry,
  State,
  TaskFile,
} from "../../types.js";
import {
  failureReasons,
  type PmTurnSetup,
  recordPmRejection,
  runPmTurn,
  rungSteps,
  setupPmTurn,
} from "../ladder.js";
import { openConcernBrief, stallBrief, stallLadderNote } from "../prompts.js";
import {
  introducedFindings,
  type PlanSnapshot,
  readTasks,
  reconcileTurn,
} from "../reconcile.js";
import {
  concernHoldProblem,
  concernsToJudge,
  expireConcernHolds,
  markPassedConcerns,
} from "../holds.js";
import { STALL_ROUTES_STEP } from "../steps.js";
import { amendsUsed, cancelRoutes, decisionFindings } from "../validation.js";

/** The open concerns no wave-end turn has marked yet, read once before the ladder. */
async function unmarkedConcerns(
  runtime: KernelRuntime,
): Promise<ForwardedConcern[]> {
  const records = await runtime.store.listRecords();
  const judged = new Set(
    (await readHolds(runtime.store)).holds.map((hold) => hold.steer),
  );
  return concernsToJudge(records, judged);
}

/**
 * Which parked slugs a stall turn resumed (amend, replace, split); a leave
 * stays parked with its reason and a cancel spends the slug.
 */
export interface StallResult {
  continued: string[];
  left: string[];
}

async function validateStallTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    round: number;
    slugs: string[];
  },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
  concerns: readonly ForwardedConcern[],
): Promise<string[]> {
  const { findings, texts, tasks, parseFindings } = await reconcileTurn(
    runtime,
    opts,
    plansBefore,
    taskSnapshot,
  );
  for (const concern of concerns) {
    const problem = await concernHoldProblem(runtime, concern, tasks);
    if (problem) findings.push(problem);
  }
  const used = amendsUsed(await runtime.store.listRecords(), opts.iteration);

  const routes = outcome?.stallRoutes;
  if (!routes) {
    findings.push(
      `stall turn lists no stallRoutes; route each parked slug (${opts.slugs.join(", ")}) as amend|cancel|replace|split|leave`,
    );
    return [...new Set(findings)];
  }
  const scan = scanStallRoutes(routes, opts.slugs, texts);
  findings.push(...scan.findings);
  if (parseFindings.length === 0) {
    findings.push(
      ...stallDecisionFindings(
        runtime,
        opts,
        taskSnapshot,
        texts,
        tasks,
        scan.actionOf,
        used,
      ),
    );
  }
  return [...new Set(findings)];
}

/** Each parked slug is routed once, with a reason, and survives the turn. */
function scanStallRoutes(
  routes: readonly StallRouteEntry[],
  slugs: readonly string[],
  texts: ReadonlyMap<string, string>,
): { actionOf: Map<string, StallDecision>; findings: string[] } {
  const claimed = new Set(slugs);
  const seen = new Set<string>();
  const actionOf = new Map<string, StallDecision>();
  const findings: string[] = [];
  for (const entry of routes) {
    if (seen.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is routed twice; route each parked slug once`,
      );
      continue;
    }
    seen.add(entry.slug);
    actionOf.set(entry.slug, entry.action);
    if (!claimed.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is not in this stall; route only ${slugs.join(", ")}`,
      );
    }
    if (!entry.reason.trim()) {
      findings.push(
        `slug "${entry.slug}" needs a reason; say what happens to the parked work`,
      );
    }
  }
  for (const slug of slugs) {
    if (!seen.has(slug)) {
      findings.push(
        `slug "${slug}" has no route; route each parked slug as amend|cancel|replace|split|leave`,
      );
    }
    if (!texts.has(slug)) {
      findings.push(
        `parked task "${slug}" was deleted; the stall set must survive the turn`,
      );
    }
  }
  return { actionOf, findings };
}

/** Provenance and decision checks over the task files the turn wrote. */
function stallDecisionFindings(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; slugs: string[] },
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
  tasks: readonly TaskFile[],
  actionOf: ReadonlyMap<string, StallDecision>,
  used: ReadonlyMap<string, number>,
): string[] {
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
  const findings = stallProvenanceFindings(created, bySlug, opts.iteration);
  findings.push(
    ...decisionFindings({
      turn: "stall",
      slugs: opts.slugs,
      decisionOf: actionOf,
      state: opts.state,
      before: taskSnapshot,
      texts,
      bySlug,
      taskTypes: runtime.configs.process.taskTypes,
      created: created
        .map((slug) => bySlug.get(slug))
        .filter((task): task is TaskFile => task !== undefined),
      credits: new Map(),
      fixed: new Set(),
      amendsUsed: used,
      parkAmends: runtime.limits.parkAmends ?? DEFAULT_PARK_AMENDS,
    }),
  );
  return findings;
}

function stallProvenanceFindings(
  created: readonly string[],
  bySlug: ReadonlyMap<string, TaskFile>,
  iteration: number,
): string[] {
  const findings: string[] = [];
  for (const slug of created) {
    const task = bySlug.get(slug);
    if (!task) continue;
    if (stallProvenance(task.source) !== String(iteration)) {
      findings.push(
        `new task "${slug}" has no provenance stall: ${iteration}; a stall turn creates tasks only with source stall: ${iteration}`,
      );
    }
  }
  return findings;
}

/**
 * PM ladder for the parks dispatch leaves undecided mid-iteration, whether
 * or not that wave merged anything. Each park gets one route: `amend`
 * rewrites its own file and bumps its revision, so dispatch resumes the slug
 * on its kept branch (bounded per slug and iteration by `limits.parkAmends`);
 * `replace` writes one task under a new slug with `base:` naming the parked
 * one (a fresh task when the kept branch conflicts with the head); `split`
 * writes one per separable outcome, each with `base:` and its own done-when;
 * `cancel` spends the slug; `leave` keeps it parked with a reason the next
 * boundary sees. Amend, replace and split resume dispatch in the same
 * iteration. The record uses the PM
 * step, so it stays out of the item's turn count and prices into the
 * iteration's spend like every other PM turn.
 *
 * Accepted routes commit to a `stall-routes` script record; the cancels are
 * kernel records, not task writes, so they precede it. A failed rung's routes
 * die with its rollback. A turn that exhausts the ladder or stops on infra
 * falls back to the boundary as today: the writes are rolled back, the
 * attempt is recorded so dispatch does not retry it, and the stall still
 * reaches the architect. Findings the graph already raised before the first
 * rung do not fail a rung: deciding a park is independent of a plan the PM
 * cannot derive.
 */
export async function runStallPm(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    slugs: string[];
    cwd: string;
  },
): Promise<StallResult> {
  const left = [...opts.slugs].sort();
  const setup = await setupPmTurn(runtime, opts);
  const concerns = await unmarkedConcerns(runtime);
  const brief = await stallBrief(runtime, opts);
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const round = index + 1;
    const target = boundaryTarget(runtime, "pm", rung.alias);
    const { tasks } = await readTasks(runtime);
    const result = await runPmTurn(runtime, opts, target, {
      round,
      planList: setup.planList,
      tasks,
      repair: round === 1 ? "" : stallLadderNote(rung, target, failure),
      steers: "none",
      stalls: brief,
      planChecks: "none",
      concerns: openConcernBrief(concerns),
    });
    const outcome = result.outcome;
    const findings = introducedFindings(
      await validateStallTurn(
        runtime,
        { ...opts, round },
        setup.plansBefore,
        setup.taskSnapshot,
        outcome,
        concerns,
      ),
      setup.baselineKeys,
    );
    if (outcome?.status === "done" && findings.length === 0) {
      await markPassedConcerns(runtime, concerns);
      return acceptStallRoutes(runtime, opts, outcome.stallRoutes ?? [], round);
    }
    const reasons = failureReasons(outcome, findings, result.record);
    const exit = await rejectStallRung(
      runtime,
      opts,
      round,
      reasons,
      setup,
      result,
      concerns,
    );
    if (exit) return exit;
    failure = reasons;
  }
  await recordStallFailure(runtime, opts.iteration, failure.join("; "));
  return { continued: [], left };
}

/**
 * Records a failed rung; an infra stop still ends the ladder. The rung's
 * concern marks are dropped with it, so a rejected decision holds nothing.
 */
async function rejectStallRung(
  runtime: KernelRuntime,
  opts: { iteration: number; slugs: string[] },
  round: number,
  reasons: string[],
  setup: PmTurnSetup,
  result: AgentTurnResult,
  concerns: readonly ForwardedConcern[],
): Promise<StallResult | undefined> {
  await expireConcernHolds(runtime, concerns);
  await recordPmRejection(
    runtime,
    opts.iteration,
    round,
    reasons,
    setup.snapshot,
  );
  if (result.record.stop?.kind !== "infra") return undefined;
  await recordStallFailure(runtime, opts.iteration, reasons.join("; "), round);
  return { continued: [], left: [...opts.slugs].sort() };
}

/** Commits the accepted routes and returns what dispatch resumes or leaves. */
async function acceptStallRoutes(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
  routes: readonly StallRouteEntry[],
  round: number,
): Promise<StallResult> {
  const accepted = [...routes].sort((a, b) => a.slug.localeCompare(b.slug));
  // A cancelled park is spent by a kernel record, not a task write.
  await cancelRoutes(
    runtime,
    opts.iteration,
    opts.state,
    accepted
      .filter((entry) => entry.action === "cancel")
      .map((entry) => ({ slug: entry.slug, cause: entry.reason })),
  );
  // The boundary reads routes from this record only, never from the agent
  // rung outcomes: a failed rung's routes die with its rollback.
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, STALL_ROUTES_STEP, { round }),
    {
      ok: true,
      outcome: {
        status: "done",
        summary: `stall routes: ${accepted.map((entry) => `${entry.slug}=${entry.action}`).join(", ")}`,
        concerns: [],
        forward: [],
        stallRoutes: accepted,
      },
    },
  );
  return {
    continued: accepted
      .filter(
        (entry) =>
          entry.action === "amend" ||
          entry.action === "replace" ||
          entry.action === "split",
      )
      .map((entry) => entry.slug),
    left: accepted
      .filter((entry) => entry.action === "leave" || entry.action === "cancel")
      .map((entry) => entry.slug),
  };
}

/** Records a rung or ladder failure under the stall-routes step. */
async function recordStallFailure(
  runtime: KernelRuntime,
  iteration: number,
  failure: string,
  round?: number,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(
      iteration,
      STALL_ROUTES_STEP,
      round === undefined ? {} : { round },
    ),
    {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        failure || "stall PM ladder exhausted",
      ),
    },
  );
}
