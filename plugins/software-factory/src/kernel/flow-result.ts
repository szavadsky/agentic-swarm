/**
 * What a finished turn means for its task: infra/cancelled stops, the step
 * kind's contract (QA, review, adjudicator), the park routes, and the gates a
 * productive turn earns. `handleStepResult` is the composition.
 */
import { makeCause } from "./cause.js";
import { parkCause } from "./flow-commit.js";
import {
  checksDue,
  escalateFrontClassToBigger,
  readFrontClass,
} from "./flow-context.js";
import { redGateCause, runTaskGates } from "./flow-gates.js";
import { taskMeta } from "./flow-meta.js";
import type { TaskActionResult } from "./flow-state.js";
import type { TaskMeta } from "./flow-types.js";
import { isDecideStep } from "./pending-signal.js";
import { qaReportOf } from "./qa.js";
import { appendDebt, appendPark } from "./record.js";
import { isLastReviewCall, launchCounts } from "./review.js";
import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

/** The last green task-checks tree before this turn, the baseline QA may already have judged. */
function lastGreenChecksTree(
  records: readonly StepRecord[],
  slug: string,
): string | undefined {
  return records
    .filter(
      (record) =>
        record.slug === slug &&
        record.step === "checks" &&
        record.endedAt &&
        record.ok === true &&
        record.tree !== undefined,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1)?.tree;
}

interface StopResults {
  infra?: TaskActionResult;
  cancelled?: TaskActionResult;
}

function stopResults(stop: StepRecord["stop"]): StopResults {
  return {
    ...(stop?.kind === "infra"
      ? {
          infra: {
            infra: {
              cause: stop.cause,
              ...(stop.details ? { details: stop.details } : {}),
            },
          },
        }
      : {}),
    ...(stop?.kind === "cancelled" ? { cancelled: { cancelled: true } } : {}),
  };
}

function fallback(results: StopResults): TaskActionResult {
  return results.infra ?? results.cancelled ?? {};
}

/**
 * A valid outcome is kept even when the turn stopped on infra or was
 * cancelled: the record still carries the outcome and derive advances on it.
 * Only a turn with no outcome is a pure infra/cancelled stop.
 */
export async function handleStepResult(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  state: TaskState,
  flow: FlowDefinition,
  iteration: number,
  worktree: string,
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
  record: StepRecord,
  stop: StepRecord["stop"],
  outcome: StepRecord["outcome"],
): Promise<TaskActionResult> {
  const meta = taskMeta(task, state, iteration);
  const results = stopResults(stop);
  if (results.infra && !outcome) return results.infra;
  if (results.cancelled && !outcome) return results.cancelled;
  if (stop?.kind === "truncated") return {};
  if (stop?.kind === "refusal") {
    await appendPark(
      runtime.store,
      meta,
      makeCause("refused", stop.details ?? "no details"),
    );
    return fallback(results);
  }
  if (await settleOutcome(runtime, task, step, state, meta, outcome))
    return fallback(results);
  const gated = await settleGates(
    runtime,
    task,
    step,
    flow,
    meta,
    worktree,
    preexisting,
    prior,
    record,
    outcome,
  );
  const base = fallback(results);
  return base.infra || base.cancelled ? base : gated;
}

/** True when the step kind settled the record itself (park, debt, or a waited verdict). */
async function settleOutcome(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  state: TaskState,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<boolean> {
  const status = outcome?.status;
  if (status === "upscope" || outcome?.upscope === "yes") {
    await parkUpscope(runtime, task, meta, outcome);
    return true;
  }
  if (status === "blocked" || status === "failed") {
    await appendPark(runtime.store, meta, parkCause(status, outcome?.summary));
    return true;
  }
  // The decide turn's verdict is read by derive against its signal, never
  // parked or debited here.
  if (isDecideStep(step)) return false;
  if (step.qa) return qaStepOutcome(outcome);
  if (step.review) {
    await reviewStepOutcome(runtime, step, state, meta, outcome);
    return true;
  }
  if (step.adjudicate !== undefined) {
    await adjudicateStepOutcome(runtime, meta, outcome);
    return true;
  }
  return false;
}

/** Only an accept carries the tree to the reviewer; a missing verdict is a contract breach. */
function qaStepOutcome(outcome: StepRecord["outcome"]): boolean {
  // A last-call change request is refused by the outcome validator; a record
  // that carries one still reaches derive, which raises the signal the
  // decider answers.
  return qaReportOf(outcome)?.verdict !== "accept";
}

// The summary leads and the why follows.
function upscopeDetail(summary: string | undefined, why: string): string {
  return summary ? `${summary}; ${why}` : why;
}

/**
 * Escalation parks with the status-upscope cause; a standalone task also
 * rewrites the class. The task is not relaunchable by dispatch — the next
 * launch's front reads the bigger class and runs the architect. A missing
 * class.yaml records why and parks without rewriting; admission refuses an
 * invalid one and containment reports a mid-turn edit, so this read cannot
 * throw.
 */
async function parkUpscope(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  const cls = readFrontClass(runtime);
  const standalone =
    cls !== null && cls.class !== "bigger" && cls.slug === task.slug;
  if (standalone) escalateFrontClassToBigger(runtime);
  await appendPark(
    runtime.store,
    meta,
    parkCause(
      "upscope",
      cls === null
        ? upscopeDetail(
            outcome?.summary,
            "no class.yaml: no bigger class to escalate to",
          )
        : outcome?.summary,
    ),
  );
}

async function reviewStepOutcome(
  runtime: KernelRuntime,
  step: FlowStep,
  state: TaskState,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  const lastCall = isLastReviewCall(
    step,
    launchCounts(state.launches, step.id).changeRequests,
  );
  if (outcome?.verdict === "reject") {
    await appendPark(
      runtime.store,
      meta,
      makeCause("review-rejected", outcome.summary),
    );
  } else if (
    lastCall &&
    outcome?.verdict === "approve" &&
    outcome.concerns.some((c) => c.dismiss !== "immaterial")
  ) {
    await appendDebt(
      runtime.store,
      meta,
      outcome.concerns.filter((c) => c.dismiss !== "immaterial"),
      outcome.summary,
    );
  }
  // No `else`: a done review always carries a verdict — outcome repair fails
  // the turn otherwise — so a missing verdict never reaches settle.
}

async function adjudicateStepOutcome(
  runtime: KernelRuntime,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  if (outcome?.verdict === "reject") {
    await appendPark(
      runtime.store,
      meta,
      makeCause("review-rejected", outcome.summary),
    );
  } else if (
    outcome?.verdict === "approve" &&
    outcome.concerns.some((c) => c.dismiss !== "immaterial")
  ) {
    await appendDebt(
      runtime.store,
      meta,
      outcome.concerns.filter((c) => c.dismiss !== "immaterial"),
      outcome.summary,
      "adjudicated review concerns recorded as debt",
    );
  }
}

/** Gates run after a productive turn; QA may already have judged the same tree. */
async function settleGates(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  flow: FlowDefinition,
  meta: TaskMeta,
  worktree: string,
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
  record: StepRecord,
  outcome: StepRecord["outcome"],
): Promise<TaskActionResult> {
  if (!checksDue(flow, step.id)) return {};
  // QA may accept the very tree the preceding checks judged. Its own edits
  // change the tree, so they still gate before the reviewer reads them.
  const qaJudgedTree =
    step.qa === true &&
    qaReportOf(outcome)?.verdict === "accept" &&
    record.tree !== undefined &&
    record.tree === lastGreenChecksTree(prior, task.slug);
  if (qaJudgedTree) return {};
  const gated = await runTaskGates(
    runtime,
    task,
    meta,
    worktree,
    preexisting,
    prior,
  );
  if (gated.infra) return { infra: gated.infra };
  if (gated.cancelled) return { cancelled: true };
  if (step.id === "resolve") {
    // One resolve, then the checks own the verdict: a resolution that breaks a
    // gate parks instead of spending a blind fix loop on a branch already
    // passed review.
    const red = redGateCause(gated.checks, preexisting);
    if (red) await appendPark(runtime.store, meta, red);
  }
  return {};
}
