import path from "node:path";
import { runAgentTurn } from "./agent.js";
import { makeCause } from "./cause.js";
import {
  formatPlanFinding,
  numberedPlanFindings,
  type PlanReviewPack,
} from "./context-pack.js";
import { architectureTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import {
  restorePlans,
  restoreTasks,
  restoreTurn,
  snapshotTurn,
  type TurnSnapshot,
} from "./pm.js";
import { type PlanFile, registeredPlans } from "./plan-file.js";
import { outcomeRepairSchemaVar } from "./prompt-schema.js";
import { scriptMeta } from "./record.js";
import { MAIN_ARCHITECT } from "./tasks.js";
import {
  ARCHITECTURE_STEPS,
  type Cause,
  type KernelRuntime,
  type Outcome,
  type PlanReviewFinding,
  type PlanReviewMark,
  type PlanReviewOutcome,
  type StepRecord,
} from "./types.js";

/** Agent step of a plan-review turn; slug-less, so it stays out of the item's turn count. */
export const PLAN_REVIEW_STEP = ARCHITECTURE_STEPS[0];

/** Agent step of the architect's one turn on the review's technical findings. */
export const PLAN_RETURN_STEP = ARCHITECTURE_STEPS[1];

/**
 * The target plan plus every plan the register names, deduplicated. A review
 * or return turn owns one plan; the rest are snapshotted so a foreign write is
 * discarded. Read-only resolution, so a plan not on disk stays a path.
 */
function planSet(runtime: KernelRuntime, target: PlanFile): PlanFile[] {
  const plans = [target];
  const seen = new Set([target.rel]);
  for (const plan of registeredPlans(runtime.store.goalDir)) {
    if (seen.has(plan.rel)) continue;
    seen.add(plan.rel);
    plans.push(plan);
  }
  return plans;
}

/** The reviewers that delivered findings, and what they found. */
export interface PlanReviewRound {
  /** Undefined when no reviewer delivered a findings outcome. */
  findings: PlanReviewOutcome | undefined;
  /** The aliases that delivered a valid findings outcome, in run order. */
  reviewers: string[];
}

/**
 * A completed plan review delivers findings, not a verdict: a bare done hides
 * the technical concerns the architect must see before the PM.
 */
export function validatePlanReviewDelivery(outcome: Outcome): string[] {
  if (outcome.status !== "done") return [];
  const findings: string[] = [];
  if (outcome.verdict !== undefined) {
    findings.push(
      "a plan review has no verdict: deliver `planReview` findings instead",
    );
  }
  if (!outcome.planReview) {
    findings.push(
      "planReview is required on a completed plan review: {technical: [], planNotes: []} when the plan has no findings",
    );
  }
  return findings;
}

/**
 * The architect answers every finding the review delivered: one mark per
 * number 1..N, no duplicate and no number outside the review. A return turn
 * takes no goal decision and no verdict; the consult already decided.
 */
export function validatePlanReturnDelivery(
  findings: PlanReviewOutcome,
  outcome: Outcome,
): string[] {
  if (outcome.status !== "done") return [];
  const problems: string[] = [];
  if (outcome.decision !== undefined) {
    problems.push(
      "a plan-review return takes no decision: the consult already decided continue",
    );
  }
  if (outcome.verdict !== undefined) {
    problems.push("a plan-review return takes no verdict");
  }
  problems.push(...validatePlanReviewMarks(findings, outcome.planReviewMarks));
  return problems;
}

/** Every finding marked exactly once, within 1..N. */
export function validatePlanReviewMarks(
  findings: PlanReviewOutcome,
  marks: readonly PlanReviewMark[] | undefined,
): string[] {
  const total = findings.technical.length + findings.planNotes.length;
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const mark of marks ?? []) {
    if (mark.finding < 1 || mark.finding > total) {
      problems.push(
        `planReviewMarks: finding ${mark.finding} is outside 1..${total}`,
      );
    } else if (seen.has(mark.finding)) {
      problems.push(`planReviewMarks: finding ${mark.finding} is marked twice`);
    } else {
      seen.add(mark.finding);
    }
  }
  for (let number = 1; number <= total; number++) {
    if (!seen.has(number)) {
      problems.push(`planReviewMarks: finding ${number} is unmarked`);
    }
  }
  return problems;
}

async function recordMissing(
  runtime: KernelRuntime,
  iteration: number,
  step: string,
  cause: Cause,
): Promise<void> {
  await runtime.store.appendRecord(scriptMeta(iteration, step, { round: 1 }), {
    ok: false,
    cause,
  });
}

/**
 * One read-only review turn per configured reviewer before the PM: fresh
 * session, goal checkout, writes discarded. Findings are advisory; a failed
 * reviewer is recorded and the round continues with the others, so one dead
 * model cannot hide another reviewer's findings or block the iteration.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one reviewer turn, its read-only reconcile and its missing record
export async function runPlanReview(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    packRel: string;
    /** The plan under review: the goal's or one epic's. */
    plan: PlanFile;
    /** The architect that owns the plan; absent is the main architect. */
    architect?: string;
  },
): Promise<PlanReviewRound> {
  const plan = opts.plan;
  const reviewers = runtime.configs.process.architecture.reviewers;
  const technical: PlanReviewFinding[] = [];
  const planNotes: PlanReviewFinding[] = [];
  const delivered: string[] = [];
  for (const alias of reviewers) {
    const target = architectureTarget(
      runtime,
      "planReview",
      alias,
      opts.iteration,
    );
    const snapshot = await snapshotTurn(runtime, planSet(runtime, plan));
    const result = await runAgentTurn(runtime, {
      target,
      cwd: runtime.paths.goalCheckout,
      meta: {
        iteration: opts.iteration,
        step: PLAN_REVIEW_STEP,
        round: 1,
        ...(opts.architect ? { architect: opts.architect } : {}),
      },
      vars: {
        iteration: String(opts.iteration),
        intent_path: path.join(runtime.store.goalDir, "intent.md"),
        plan_path: plan.path,
        pack_path: path.join(runtime.store.goalDir, opts.packRel),
        worktree: runtime.paths.goalCheckout,
        outcome_schema: outcomeRepairSchemaVar(target.prompt, "any"),
      },
      expectation: KERNEL_TURN_STEPS[PLAN_REVIEW_STEP],
      validate: validatePlanReviewDelivery,
    });
    const restored = await restoreTurn(runtime, snapshot);
    const touched = [...restored.plans, ...restored.tasks].sort();
    if (touched.length > 0) {
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, "plan-review-reconcile", { round: 1 }),
        {
          ok: false,
          cause: makeCause(
            "invalid-outcome",
            `plan reviewer ${alias} writes discarded: ${touched.join(", ")}; the reviewer is read-only`,
          ),
        },
      );
    }
    const stop = result.record.stop;
    if (stop?.kind === "infra") {
      const cause = makeCause(
        "infra",
        `plan review by ${alias} stopped on infrastructure: ${
          stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
        }`,
      );
      await recordMissing(
        runtime,
        opts.iteration,
        "plan-review-missing",
        cause,
      );
      continue;
    }
    const outcome = result.outcome;
    if (outcome?.status === "done" && outcome.planReview) {
      technical.push(...outcome.planReview.technical);
      planNotes.push(...outcome.planReview.planNotes);
      delivered.push(alias);
      continue;
    }
    await recordMissing(
      runtime,
      opts.iteration,
      "plan-review-missing",
      makeCause(
        "invalid-outcome",
        `plan review by ${alias} produced no findings: ${
          outcome?.summary ?? "no outcome"
        }`,
      ),
    );
  }
  return {
    findings: delivered.length > 0 ? { technical, planNotes } : undefined,
    reviewers: delivered,
  };
}

/** The return owns one plan, never a task file or another scope's plan. */
async function discardForeignWrites(
  runtime: KernelRuntime,
  iteration: number,
  snapshot: TurnSnapshot,
  keepRel: string,
): Promise<void> {
  const tasks = await restoreTasks(runtime, snapshot.tasks);
  const plans = await restorePlans(
    snapshot.plans,
    (plan) => plan.rel === keepRel,
  );
  const touched = [...plans, ...tasks.map((slug) => `${slug}.md`)].sort();
  if (touched.length === 0) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, "plan-return-reconcile", { round: 1 }),
    {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        `architect return writes discarded: ${touched.join(", ")}; the return owns ${keepRel} only`,
      ),
    },
  );
}

/**
 * The architect's one turn on the review's technical findings, before the PM
 * derives tasks. It edits the plan and marks every finding; it takes no goal
 * decision. A missing or failed return is recorded and the PM still runs:
 * the review advises, it never blocks the iteration.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one architect turn, its read-only reconcile and its missing record
export async function runArchitectReturn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    packRel: string;
    plan: PlanFile;
    findings: PlanReviewOutcome;
    reviewers: readonly string[];
    /** The architect that owns the plan; absent is the main architect. */
    architect?: string;
  },
): Promise<void> {
  const plan = opts.plan;
  const target = architectureTarget(
    runtime,
    "planReturn",
    runtime.configs.process.boundary.architect.alias,
    opts.iteration,
  );
  const numbered = numberedPlanFindings(opts.findings);
  const lines = (kind: "technical" | "planNote"): string => {
    const matching = numbered.filter((finding) => finding.kind === kind);
    return matching.length === 0
      ? "none"
      : matching.map(formatPlanFinding).join("\n");
  };
  const snapshot = await snapshotTurn(runtime, planSet(runtime, plan));
  const result = await runAgentTurn(runtime, {
    target,
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration: opts.iteration,
      step: PLAN_RETURN_STEP,
      round: 1,
      architect: opts.architect ?? MAIN_ARCHITECT,
    },
    vars: {
      iteration: String(opts.iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: plan.path,
      pack_path: path.join(runtime.store.goalDir, opts.packRel),
      reviewers: opts.reviewers.join(", "),
      technical_findings: lines("technical"),
      plan_notes: lines("planNote"),
      finding_count: String(numbered.length),
      outcome_schema: outcomeRepairSchemaVar(target.prompt, "any"),
    },
    expectation: KERNEL_TURN_STEPS[PLAN_RETURN_STEP],
    validate: (outcome) => validatePlanReturnDelivery(opts.findings, outcome),
  });
  await discardForeignWrites(runtime, opts.iteration, snapshot, plan.rel);
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    const cause = makeCause(
      "infra",
      `architect return stopped on infrastructure: ${
        stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
      }`,
    );
    await recordMissing(runtime, opts.iteration, "plan-return-missing", cause);
    return;
  }
  const outcome = result.outcome;
  if (outcome?.status === "done" && (outcome.planReviewMarks?.length ?? 0) > 0)
    return;
  await recordMissing(
    runtime,
    opts.iteration,
    "plan-return-missing",
    makeCause(
      "invalid-outcome",
      `architect return produced no marks: ${outcome?.summary ?? "no outcome"}`,
    ),
  );
}

/** Whether a return turn in this iteration answered one plan scope's review. */
function reviewAnswered(
  records: readonly StepRecord[],
  iteration: number,
  scope: string,
  lastReview: number,
): boolean {
  return records.some(
    (record) =>
      record.step === PLAN_RETURN_STEP &&
      record.actor === "agent" &&
      record.endedAt &&
      record.iteration === iteration &&
      (record.architect ?? MAIN_ARCHITECT) === scope &&
      record.seq > lastReview &&
      (record.outcome?.planReviewMarks?.length ?? 0) > 0,
  );
}

/**
 * The latest plan-review round the architect has not yet answered. A return
 * turn in the same iteration marks the findings, so they do not reappear in
 * the next pack; without one (policy `never`, or plan notes only) the next
 * architect marks them there. A newer failed attempt hides an older review:
 * the pack must not present stale findings about a plan the architect changed.
 */
export function latestPlanReview(
  records: StepRecord[],
): PlanReviewPack | undefined {
  const attempts = records.filter(
    (record) =>
      record.step === PLAN_REVIEW_STEP &&
      record.actor === "agent" &&
      record.endedAt,
  );
  if (attempts.length === 0) return undefined;
  // The newest round is the newest iteration that ran a review, whether or not
  // any reviewer delivered: a failed round must hide an older round's findings,
  // because the plan may have changed since.
  const iteration = Math.max(...attempts.map((record) => record.iteration));
  // Findings group by plan owner and reviewer alias: one alias reviews every
  // plan, so an alias-only map would keep the last plan's findings, while an
  // owner-only map would append a newer attempt to a stale one. A return
  // answers only its own plan, so an answered epic hides no other plan's
  // findings from the next pack.
  const byAttempt = new Map<
    string,
    { scope: string; alias: string; findings: PlanReviewOutcome }
  >();
  const lastReviewByScope = new Map<string, number>();
  for (const record of attempts
    .filter((entry) => entry.iteration === iteration)
    .sort((a, b) => a.seq - b.seq)) {
    const scope = record.architect ?? MAIN_ARCHITECT;
    lastReviewByScope.set(scope, record.seq);
    if (record.outcome?.status !== "done" || !record.outcome.planReview)
      continue;
    const alias = record.alias ?? "plan-reviewer";
    byAttempt.set(`${scope}\u0000${alias}`, {
      scope,
      alias,
      findings: record.outcome.planReview,
    });
  }
  const unanswered = [...byAttempt.values()].filter(
    (attempt) =>
      !reviewAnswered(
        records,
        iteration,
        attempt.scope,
        lastReviewByScope.get(attempt.scope) ?? 0,
      ),
  );
  if (unanswered.length === 0) return undefined;
  const technical = unanswered.flatMap((entry) => entry.findings.technical);
  const planNotes = unanswered.flatMap((entry) => entry.findings.planNotes);
  if (technical.length + planNotes.length === 0) return undefined;
  return {
    iteration,
    reviewers: [...new Set(unanswered.map((entry) => entry.alias))],
    technical,
    planNotes,
  };
}
