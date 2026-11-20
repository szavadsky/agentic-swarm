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
  isStandaloneTask,
} from "./flow-context.js";
import { redGateCause, runTaskGates } from "./flow-gates.js";
import { type TaskMeta, taskMeta } from "./flow-meta.js";
import type { TaskActionResult } from "./flow-state.js";
import { qaReportOf } from "./qa.js";
import { appendDebt, appendPark } from "./record.js";
import { isLastReviewCall } from "./review.js";
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
  await settleGates(
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
  return fallback(results);
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
  if (status === "blocked" || status === "failed" || status === "upscope") {
    await appendPark(runtime.store, meta, parkCause(status, outcome?.summary));
    return true;
  }
  if (step.qa) return qaStepOutcome(runtime, step, state, meta, outcome);
  if (step.review) {
    await reviewStepOutcome(runtime, task, step, state, meta, outcome);
    return true;
  }
  if (step.adjudicate !== undefined) {
    await adjudicateStepOutcome(runtime, task, meta, outcome);
    return true;
  }
  return false;
}

/** Only an accept carries the tree to the reviewer; a missing verdict is a contract breach. */
async function qaStepOutcome(
  runtime: KernelRuntime,
  step: FlowStep,
  state: TaskState,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<boolean> {
  const qa = qaReportOf(outcome);
  if (qa?.verdict === "changes") {
    if (isLastReviewCall(step, state.round)) {
      // The outcome validator refuses this; a delivered record is a contract
      // breach, never a merge.
      await appendPark(
        runtime.store,
        meta,
        makeCause(
          "invalid-outcome",
          `qa changes on the last acceptance call: ${outcome?.summary ?? "no summary"}`,
        ),
      );
    }
    return true;
  }
  if (qa?.verdict !== "accept") return true;
  return false;
}

/** Escalation parks with the status-upscope cause; a standalone task also rewrites the class. */
async function parkUpscope(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  await appendPark(runtime.store, meta, parkCause("upscope", outcome?.summary));
  if (isStandaloneTask(runtime, task)) escalateFrontClassToBigger(runtime);
}

async function reviewStepOutcome(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  state: TaskState,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  if (outcome?.upscope === "yes") {
    await parkUpscope(runtime, task, meta, outcome);
    return;
  }
  const lastCall = isLastReviewCall(step, state.round);
  if (outcome?.verdict === "reject") {
    await appendPark(
      runtime.store,
      meta,
      makeCause("review-rejected", outcome.summary),
    );
  } else if (lastCall && outcome?.verdict === "changes") {
    // The reviewer's outcome validator refuses this; a delivered record is a
    // contract breach, never a merge.
    await appendPark(
      runtime.store,
      meta,
      makeCause(
        "invalid-outcome",
        `changes on the last review call: ${outcome.summary}`,
      ),
    );
  } else if (
    lastCall &&
    outcome?.verdict === "approve" &&
    outcome.concerns.length > 0
  ) {
    await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
  }
  // No `else`: a done review always carries a verdict — outcome repair fails
  // the turn otherwise — so a missing verdict never reaches settle.
}

async function adjudicateStepOutcome(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: TaskMeta,
  outcome: StepRecord["outcome"],
): Promise<void> {
  if (outcome?.upscope === "yes") {
    await parkUpscope(runtime, task, meta, outcome);
    return;
  }
  if (outcome?.verdict === "reject") {
    await appendPark(
      runtime.store,
      meta,
      makeCause("review-rejected", outcome.summary),
    );
  } else if (outcome?.verdict === "approve" && outcome.concerns.length > 0) {
    await appendDebt(
      runtime.store,
      meta,
      outcome.concerns,
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
): Promise<void> {
  if (!checksDue(flow, step.id)) return;
  // QA may accept the very tree the preceding checks judged. Its own edits
  // change the tree, so they still gate before the reviewer reads them.
  const qaJudgedTree =
    step.qa === true &&
    qaReportOf(outcome)?.verdict === "accept" &&
    record.tree !== undefined &&
    record.tree === lastGreenChecksTree(prior, task.slug);
  if (qaJudgedTree) return;
  const checks = await runTaskGates(
    runtime,
    task,
    meta,
    worktree,
    preexisting,
    prior,
  );
  if (step.id === "resolve") {
    // One resolve, then the checks own the verdict: a resolution that breaks a
    // gate parks instead of spending a blind fix loop on a branch already
    // passed review.
    const red = redGateCause(checks, preexisting);
    if (red) await appendPark(runtime.store, meta, red);
  }
}
