import type { Hold } from "./mailbox.js";
import { PLAN_CHECK_STEP } from "./plan-check.js";
import {
  KERNEL_STEPS,
  type Limits,
  type State,
  type StepRecord,
} from "./types.js";

/** Script record: one resume attempt of an iteration. */
export const RESUME_STEP = "resume";
/** Script record: a relaunch into an interrupted iteration that did not resume it. */
export const RESUME_REFUSED_STEP = "resume-refused";

const DEFAULT_RESUME_ATTEMPTS = 2;

const kernelSteps: ReadonlySet<string> = new Set(KERNEL_STEPS);

/** A task turn: an agent turn on a task slug outside the boundary roles. */
function isTaskTurn(record: StepRecord): boolean {
  return (
    record.actor === "agent" &&
    record.slug !== undefined &&
    !kernelSteps.has(record.step)
  );
}

/**
 * What a resume can leave behind as progress: a task turn, or the boundary's
 * architect ruling. A resume that only ruled still moved the goal, so the next
 * relaunch may resume the iteration instead of refusing it as idle.
 */
function isProgress(record: StepRecord): boolean {
  return (
    isTaskTurn(record) ||
    (record.actor === "agent" && record.step === "architect")
  );
}

/**
 * Whether a relaunch may resume the interrupted iteration. A resume is a
 * standing predicate the resumed pass itself keeps true, so each refusal is a
 * condition that a resume cannot change. Its progress is a task turn or the
 * boundary's architect ruling; the boundary resolves the rest.
 */
export function resumeVerdict(
  state: State,
  records: StepRecord[],
  holds: Hold[],
  pendingSteers: ReadonlySet<string>,
  limits: Limits,
): { resume: boolean; cause?: string } {
  const iteration = state.iteration;
  const inIteration = records.filter((r) => r.iteration === iteration);
  const resumes = inIteration.filter((r) => r.step === RESUME_STEP);
  const limit = limits.resumeAttempts ?? DEFAULT_RESUME_ATTEMPTS;

  if (resumes.length >= limit) {
    return {
      resume: false,
      cause: `resume attempts of iteration ${iteration} reached the limit ${limit}`,
    };
  }

  const lastResumeSeq = Math.max(0, ...resumes.map((r) => r.seq));
  if (
    resumes.length > 0 &&
    !inIteration.some((r) => r.seq > lastResumeSeq && isProgress(r))
  ) {
    return {
      resume: false,
      cause: `the previous resume of iteration ${iteration} started no task turn or architect ruling`,
    };
  }

  // A plan-check turn that reports no verdict counts as architect: that is
  // how dispatch reads it.
  const latestPlanCheck = inIteration
    .filter((r) => r.step === PLAN_CHECK_STEP && r.actor === "agent")
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (
    latestPlanCheck &&
    (latestPlanCheck.outcome?.planCheck?.verdict ?? "architect") === "architect"
  ) {
    return {
      resume: false,
      cause: `the latest plan-check of iteration ${iteration} summons the architect`,
    };
  }

  const ready = Object.entries(state.tasks)
    .filter(([, task]) => task.status === "ready")
    .map(([slug]) => slug);
  if (
    ready.length > 0 &&
    ready.every((slug) =>
      holds.some((h) => h.slugs.includes(slug) && pendingSteers.has(h.steer)),
    )
  ) {
    return {
      resume: false,
      cause: "every ready task is held by a pending steer",
    };
  }

  return { resume: true };
}
