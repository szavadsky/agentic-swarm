import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { planOwnerSelector, resumableSession } from "./architect-session.js";
import { makeCause } from "./cause.js";
import {
  formatPlanFinding,
  numberedPlanFindings,
  type PlanReviewPack,
} from "./context-pack.js";
import { architectureTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import type { PlanFile } from "./plan-file.js";
import {
  type PlanReviewRound,
  validatePlanReturnDelivery,
  validatePlanReviewDelivery,
  validatePlanReviewMarks,
} from "./plan-review-interface.js";
import {
  restorePlans,
  restoreTasks,
  restoreTurn,
  snapshotTurn,
  type TurnSnapshot,
} from "./pm.js";
import { outcomeExampleVar } from "./outcome-example.js";
import { scriptMeta } from "./record.js";
import { MAIN_ARCHITECT } from "./tasks.js";
import {
  ARCHITECTURE_STEPS,
  type Cause,
  type KernelRuntime,
  type Outcome,
  type PlanReviewFinding,
  type PlanReviewOutcome,
  type StepRecord,
} from "./types.js";

export {
  type PlanReviewRound,
  validatePlanReturnDelivery,
  validatePlanReviewDelivery,
  validatePlanReviewMarks,
};

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
  for (const plan of runtime.store.plans.registered()) {
    if (seen.has(plan.rel)) continue;
    seen.add(plan.rel);
    plans.push(plan);
  }
  return plans;
}

/** The reviewers that delivered findings, and what they found. */
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

/** The inputs of one plan-review round. */
interface PlanReviewOptions {
  iteration: number;
  packRel: string;
  /** The plan under review: the goal's or one epic's. */
  plan: PlanFile;
  /** The architect that owns the plan; absent is the main architect. */
  architect?: string;
}

/** One reviewer's findings, or the cause that kept it from delivering. */
interface ReviewerOutcome {
  technical: PlanReviewFinding[];
  planNotes: PlanReviewFinding[];
  delivered: boolean;
  missing: Cause | undefined;
}

/** The template variables one plan reviewer reads. */
function planReviewVars(
  runtime: KernelRuntime,
  opts: PlanReviewOptions,
  plan: PlanFile,
  target: ReturnType<typeof architectureTarget>,
): Record<string, string> {
  return {
    iteration: String(opts.iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plan_path: plan.path,
    pack_path: runtime.store.pathOf({ area: "goal", rel: opts.packRel }),
    worktree: runtime.paths.goalCheckout,
    outcome_schema: outcomeExampleVar(target.prompt, "any"),
  };
}

/** Records a reviewer's writes after restoring them. */
async function recordReviewerWrites(
  runtime: KernelRuntime,
  opts: PlanReviewOptions,
  alias: string,
  restored: Awaited<ReturnType<typeof restoreTurn>>,
): Promise<void> {
  const touched = [...restored.plans, ...restored.tasks].sort();
  if (touched.length === 0) return;
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

/** A reviewer outcome that delivered nothing, with the recorded cause. */
function reviewerMissing(cause: Cause): ReviewerOutcome {
  return {
    technical: [],
    planNotes: [],
    delivered: false,
    missing: cause,
  };
}

/** Runs one read-only reviewer over the plan and classifies its delivery. */
async function runPlanReviewer(
  runtime: KernelRuntime,
  opts: PlanReviewOptions,
  alias: string,
): Promise<ReviewerOutcome> {
  const plan = opts.plan;
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
    vars: planReviewVars(runtime, opts, plan, target),
    expectation: KERNEL_TURN_STEPS[PLAN_REVIEW_STEP],
    validate: validatePlanReviewDelivery,
  });
  await recordReviewerWrites(
    runtime,
    opts,
    alias,
    await restoreTurn(runtime, snapshot),
  );
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    return reviewerMissing(
      makeCause(
        "infra",
        `plan review by ${alias} stopped on infrastructure: ${
          stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
        }`,
      ),
    );
  }
  const outcome = result.outcome;
  if (outcome?.status === "done" && outcome.planReview) {
    return {
      technical: outcome.planReview.technical,
      planNotes: outcome.planReview.planNotes,
      delivered: true,
      missing: undefined,
    };
  }
  return reviewerMissing(
    makeCause(
      "invalid-outcome",
      `plan review by ${alias} produced no findings: ${
        outcome?.summary ?? "no outcome"
      }`,
    ),
  );
}

/**
 * One read-only review turn per configured reviewer before the PM: fresh
 * session, goal checkout, writes discarded. Findings are advisory; a failed
 * reviewer is recorded and the round continues with the others, so one dead
 * model cannot hide another reviewer's findings or block the iteration.
 */
export async function runPlanReview(
  runtime: KernelRuntime,
  opts: PlanReviewOptions,
): Promise<PlanReviewRound> {
  const technical: PlanReviewFinding[] = [];
  const planNotes: PlanReviewFinding[] = [];
  const delivered: string[] = [];
  for (const alias of runtime.configs.process.architecture.reviewers) {
    const review = await runPlanReviewer(runtime, opts, alias);
    if (review.missing) {
      await recordMissing(
        runtime,
        opts.iteration,
        "plan-review-missing",
        review.missing,
      );
      continue;
    }
    technical.push(...review.technical);
    planNotes.push(...review.planNotes);
    delivered.push(alias);
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
    runtime,
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
 * decision. It continues its plan owner's compacted session, so the return
 * reads the plan it wrote instead of rebuilding that context. A missing or
 * failed return is recorded and the PM still runs: the review advises, it
 * never blocks the iteration.
 */
/** The inputs of one architect return turn. */
interface PlanReturnOptions {
  iteration: number;
  packRel: string;
  plan: PlanFile;
  findings: PlanReviewOutcome;
  reviewers: readonly string[];
  /** The architect that owns the plan; absent is the main architect. */
  architect?: string;
}

/** Formats the numbered findings of one kind for the return prompt. */
function findingsOfKind(
  numbered: ReturnType<typeof numberedPlanFindings>,
  kind: "technical" | "planNote",
): string {
  const matching = numbered.filter((finding) => finding.kind === kind);
  return matching.length === 0
    ? "none"
    : matching.map(formatPlanFinding).join("\n");
}

/** The template variables one architect return turn reads. */
function planReturnVars(
  runtime: KernelRuntime,
  opts: PlanReturnOptions,
  plan: PlanFile,
  target: ReturnType<typeof architectureTarget>,
  numbered: ReturnType<typeof numberedPlanFindings>,
): Record<string, string> {
  return {
    iteration: String(opts.iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plan_path: plan.path,
    pack_path: runtime.store.pathOf({ area: "goal", rel: opts.packRel }),
    reviewers: opts.reviewers.join(", "),
    technical_findings: findingsOfKind(numbered, "technical"),
    plan_notes: findingsOfKind(numbered, "planNote"),
    finding_count: String(numbered.length),
    outcome_schema: outcomeExampleVar(target.prompt, "any"),
  };
}

/**
 * The session the return continues: the compacted one its plan owner recorded,
 * re-derived from disk because that owner's turn may have just written it.
 */
async function planReturnSession(
  runtime: KernelRuntime,
  plan: PlanFile,
  architect: string,
  target: ReturnType<typeof architectureTarget>,
): Promise<SessionRef | undefined> {
  return resumableSession(
    runtime,
    await runtime.store.listRecords(),
    planOwnerSelector(architect),
    target,
    `the plan return for "${plan.rel}"`,
  );
}

export async function runArchitectReturn(
  runtime: KernelRuntime,
  opts: PlanReturnOptions,
): Promise<void> {
  const plan = opts.plan;
  const target = architectureTarget(
    runtime,
    "planReturn",
    runtime.configs.process.boundary.architect.alias,
    opts.iteration,
  );
  const numbered = numberedPlanFindings(opts.findings);
  const architect = opts.architect ?? MAIN_ARCHITECT;
  const session = await planReturnSession(runtime, plan, architect, target);
  const snapshot = await snapshotTurn(runtime, planSet(runtime, plan));
  const result = await runAgentTurn(runtime, {
    target,
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration: opts.iteration,
      step: PLAN_RETURN_STEP,
      round: 1,
      architect,
    },
    vars: planReturnVars(runtime, opts, plan, target, numbered),
    expectation: KERNEL_TURN_STEPS[PLAN_RETURN_STEP],
    session,
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
