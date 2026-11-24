/**
 * Session continuity: compaction, the session a follow-up turn resumes, the
 * prior step's commit, and the front-session resume a trivial task depends on.
 */
import path from "node:path";
import {
  type CompactResult,
  portable,
  type SessionRef,
} from "../harness/types.js";
import { makeCause } from "./cause.js";
import { frontTarget, lastFrontRecord } from "./flow-context-front.js";
import { bySeq } from "./flow-context-history.js";
import { findStep, flowOf } from "./flow-context-step.js";
import type { TurnTarget } from "./flow-context-targets.js";
import { scriptMeta } from "./record.js";
import type { PromptLibrary } from "./prompts.js";
import { sessionCacheHot } from "./sessions.js";
import type {
  Cause,
  FlowStep,
  FollowUp,
  KernelRuntime,
  StepRecord,
  TaskFile,
} from "./types.js";

/** The review turn whose ended session is being compacted: step role and 1-based round. */
export interface CompactionReview {
  review: boolean;
  round: number;
}

/** Script record: a follow-up session could not resume, so the turn started de novo. */
export const RESUME_FALLBACK_STEP = "resume-fallback";

/**
 * Compaction is cache hygiene, not a gate; a failure keeps the uncompacted ref.
 * The harness entry decides whether this harness compacts at all, and a review
 * step's `reviewIterations` rule decides which review rounds do; every other
 * step compacts whenever the session is hot.
 */
export async function compactSession(
  runtime: KernelRuntime,
  session: SessionRef,
  review?: CompactionReview,
): Promise<CompactResult | undefined> {
  const policy = runtime.configs?.run.harnesses?.[session.harness]?.compaction;
  if (policy?.enabled === false) return undefined;
  if (
    review?.review &&
    policy?.reviewIterations !== undefined &&
    !policy.reviewIterations.includes(review.round)
  )
    return undefined;
  if (!sessionCacheHot(session)) return undefined;
  const harness = runtime.harnesses.get(session.harness);
  if (!harness?.compact) return undefined;
  try {
    const caps = await harness.caps(session.model);
    if (caps.compact === "none") return undefined;
    return await harness.compact(session);
  } catch {
    return undefined;
  }
}

/** The follow-up a step names; the kernel default continues the same session. */
function followUpOf(step: FlowStep): FollowUp {
  return step.followUp ?? { mode: "same-session" };
}

/**
 * The session a later turn of a step resumes, or undefined when it starts de
 * novo. `same-session` continues the step's own session on its alias;
 * `de-novo` never resumes; `different-model` runs the configured alias and
 * keeps the session across the switch only with `keepSession`, and only when
 * the portability graph admits the prior harness's session. Keyed on the step,
 * so an implementer and a reviewer sharing one alias never resume each other's
 * session. A first turn has no prior and starts de novo silently. A prior that
 * cannot be resumed (alias changed, cwd mismatch, a harness that cannot
 * resume, a non-portable crossing) is a logged kernel error record naming
 * the harness pair, then the turn starts de novo with the rendered prompt and
 * its links. Compaction belongs to the turn that ended the session, so a
 * resumed ref arrives compacted unless that compaction failed.
 */
export async function followUpSession(
  runtime: KernelRuntime,
  task: TaskFile,
  target: TurnTarget,
  stepId: string,
  records: StepRecord[],
  worktree: string,
): Promise<SessionRef | undefined> {
  const followUp = followUpOf(findStep(flowOf(runtime, task), stepId));
  if (followUp.mode === "de-novo") return undefined;
  const keepsAcrossSwitch =
    followUp.mode === "different-model" && followUp.keepSession === true;
  if (followUp.mode === "different-model" && !keepsAcrossSwitch)
    return undefined;

  const priors = resumePriors(records, task.slug, stepId);
  if (priors.length === 0) return undefined;
  const prior = (
    keepsAcrossSwitch ? priors : priors.filter((r) => r.alias === target.alias)
  ).at(-1);
  let fallback: string | undefined;
  if (!prior?.session) {
    const priorAlias = priors.at(-1)?.alias ?? "unknown";
    fallback = `alias changed from "${priorAlias}" to "${target.alias}"`;
  } else {
    const blocker = await resumeBlocker(
      runtime,
      target,
      prior.session,
      worktree,
    );
    if (blocker) fallback = blocker;
  }
  if (fallback !== undefined) {
    console.warn(
      `[factory] follow-up "${task.slug}" step "${stepId}" starts de novo: ` +
        fallback,
    );
    const last = priors.at(-1)!;
    await runtime.store.appendRecord(
      scriptMeta(last.iteration, RESUME_FALLBACK_STEP, {
        slug: task.slug,
        round: last.round,
        revision: task.revision,
      }),
      {
        ok: false,
        cause: makeCause(
          "resume",
          `${fallback}; the "${stepId}" turn of "${task.slug}" starts de novo`,
        ),
      },
    );
    return undefined;
  }
  return prior!.session;
}

/** The step's ended agent sessions for this task, oldest first. */
function resumePriors(
  records: StepRecord[],
  slug: string,
  stepId: string,
): StepRecord[] {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.actor === "agent" &&
        r.endedAt &&
        r.session &&
        r.step === stepId,
    )
    .sort(bySeq);
}

/** Why this target cannot resume the session, or undefined when it can. */
async function resumeBlocker(
  runtime: KernelRuntime,
  target: TurnTarget,
  session: SessionRef,
  worktree: string,
): Promise<string | undefined> {
  if (!(await canResume(target))) {
    return `harness "${target.harness.id}" cannot resume sessions`;
  }
  if (path.resolve(session.cwd) !== path.resolve(worktree)) {
    return `session cwd "${session.cwd}" does not match worktree "${worktree}"`;
  }
  if (
    !portable(
      session.harness,
      target.harness.id,
      runtime.configs.run.portability,
    )
  ) {
    return `harness "${session.harness}" is not portable to "${target.harness.id}"`;
  }
  return undefined;
}

/** A failed capability probe reads as "cannot resume", never as a throw. */
async function canResume(target: TurnTarget): Promise<boolean> {
  try {
    return (await target.harness.caps(target.model)).resume;
  } catch {
    return false;
  }
}

export function priorStepCommit(
  records: StepRecord[],
  slug: string,
  stepId: string,
  revision: number,
): string | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.step === stepId &&
        r.endedAt &&
        r.commit &&
        (r.revision ?? 0) === revision,
    )
    .sort(bySeq)
    .at(-1)?.commit;
}

/** The session a trivial implement turn resumes, or why the task parks instead. */
export type TrivialResume = { session: SessionRef } | { cause: Cause };

/**
 * The front's own session for a trivial implement turn: the front record's
 * session on a first turn, the last session on the front alias on a fix turn.
 * Unlike `followUpSession` there is no worktree-cwd match — the turn resumes
 * with the session's recorded cwd and the prompt names the absolute worktree
 * instead (harness sessions are cwd-bound). A harness whose probe reports no
 * resume, or no session on record, parks with a cause: a trivial turn never
 * starts de novo silently.
 */
export async function trivialResumeSession(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  isFix: boolean,
  iteration: number,
): Promise<TrivialResume> {
  const target = frontTarget(runtime, iteration);
  if (!(await canResume(target))) {
    return {
      cause: makeCause(
        "resume",
        `harness "${target.harness.id}" cannot resume sessions, ` +
          `so trivial task "${task.slug}" cannot implement in the front's session`,
      ),
    };
  }
  return isFix
    ? fixResume(runtime, task, records, target)
    : frontResume(runtime, task, records, target);
}

/** The fix turn's own session on the front alias, else the last front session. */
function fixResume(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  target: TurnTarget,
): TrivialResume {
  const own = records
    .filter(
      (r) =>
        r.slug === task.slug &&
        r.actor === "agent" &&
        r.endedAt &&
        r.session &&
        r.alias === target.alias,
    )
    .sort(bySeq)
    .at(-1)?.session;
  const resumed =
    keptSession(runtime, own, target) ??
    keptSession(runtime, lastFrontRecord(records)?.session, target);
  if (resumed) return { session: resumed };
  return {
    cause: makeCause(
      "resume",
      `trivial task "${task.slug}" has no session to resume ` +
        `on alias "${target.alias}"`,
    ),
  };
}

/** The front's own session; a first trivial turn never starts de novo silently. */
function frontResume(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  target: TurnTarget,
): TrivialResume {
  const front = lastFrontRecord(records)?.session;
  if (!front) {
    return {
      cause: makeCause(
        "resume",
        `trivial task "${task.slug}" has no front session to resume; ` +
          `the front turn left no session record`,
      ),
    };
  }
  if (
    !portable(front.harness, target.harness.id, runtime.configs.run.portability)
  ) {
    return {
      cause: makeCause(
        "resume",
        `trivial task "${task.slug}" cannot resume its front session: ` +
          `harness "${front.harness}" is not the front alias harness "${target.harness.id}"`,
      ),
    };
  }
  return { session: front };
}

/** A prior session is kept only when it is portable to the front harness. */
function keptSession(
  runtime: KernelRuntime,
  ref: SessionRef | undefined,
  target: TurnTarget,
): SessionRef | undefined {
  return ref &&
    portable(ref.harness, target.harness.id, runtime.configs.run.portability)
    ? ref
    : undefined;
}

/** Why a turn is rendered the resume fragment. */
export type ResumeReason = "relaunch" | "fallback" | "trivial";

/** The facts the resume fragment renders; empty strings for the parts a reason does not use. */
export interface ResumeNoteOptions {
  branch?: string;
  worktree?: string;
  sessionCwd?: string;
}

/**
 * The resume fragment a relaunched or fallback turn carries. A relaunch
 * continues the task branch and says to assess status first; a fallback tier
 * continues the same worktree under the same ask; a trivial turn also
 * continues the front's session, so its note names the session cwd and the
 * absolute worktree the tools must use instead. The leading newline separates
 * the fragment from the `worktree:` line it follows.
 */
export function resumeNote(
  prompts: PromptLibrary,
  reason: ResumeReason,
  opts: ResumeNoteOptions = {},
): string {
  const rendered = prompts.render("resume", {
    reason,
    branch: opts.branch ?? "",
    worktree: opts.worktree ?? "",
    session_cwd: opts.sessionCwd ?? "",
  });
  const lines = rendered
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}
