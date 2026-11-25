/**
 * The turn's vars, timeouts, tracked harnesses and post-turn settlement:
 * containment, the resolve or pending merge, the commit, and the timeout reset.
 */
import { isAncestor } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { hasConflictMarkers } from "../core/git/merge.js";
import type { SessionRef } from "../harness/types.js";
import { DEFAULT_TIMEOUTS, runAgentTurn } from "./agent.js";
import { makeCause } from "./cause.js";
import { commitStep } from "./flow-commit.js";
import {
  compactSession,
  firstBase,
  priorStepCommit,
  promptVars,
  revisionBase,
  resumeNote,
} from "./flow-context.js";
import { parkTask, recordBaseAdvance, taskMeta } from "./flow-meta.js";
import { isDecideStep } from "./pending-signal.js";
import type { StepRun, TaskActionResult } from "./flow-state.js";
import { trackHarnessTimeouts } from "./flow-timeouts.js";
import {
  abortMerge,
  mergeConflictAsk,
  mergeHeadSha,
  outsideConflictChanges,
  resolveVars,
  settleMergeTurn,
  unresolvedResolve,
} from "./merge-conflict.js";
import { taskOutcomeSchema } from "./outcome-schemas.js";
import { qaOutcomeSchema } from "./qa.js";
import {
  isAcceptanceStep,
  isLastReviewCall,
  launchCounts,
  reviewRoundLimit,
} from "./review.js";
import { materialHash } from "./task-material.js";
import type { StepRecord } from "./types.js";
import {
  containmentViolation,
  headSha,
  resetWorktreeToCommit,
  treeSha,
} from "./worktree.js";

/** The prompt vars: the step's facts, the resolve ask, the range and the last-call lines. */
export async function buildVars(run: StepRun): Promise<void> {
  const { runtime, task, state, step, flow, ensured } = run;
  const vars = promptVars(
    runtime,
    task,
    ensured.path,
    run.records,
    state.round,
    flow,
    state,
    step.id,
  );
  if (run.resolve) {
    Object.assign(
      vars,
      resolveVars(
        runtime,
        ensured.path,
        ensured.branch,
        run.resolve.head,
        run.resolve.conflicts,
        run.records,
      ),
    );
  }
  await setRangeVars(run, vars);
  setLastCallVars(run, vars);
  setResumeNote(run, vars);
  setResolveAsk(run, vars);
  run.vars = vars;
}

/** The range the turn judges: the revision base, or the prior step's commit on a resumed acceptance. */
async function setRangeVars(run: StepRun, vars: Record<string, string>) {
  const { task, step } = run;
  run.baseHash = run.amendedFirstTurn
    ? run.startPoint
    : (revisionBase(run.records, task.slug, task.revision) ??
      firstBase(run.records, task.slug) ??
      run.startPoint);
  vars.base_hash = run.baseHash;
  vars.head_hash = await headSha(run.ensured.path);
  if (!isAcceptanceStep(step) || !run.session) return;
  // A resumed review already holds the prior rounds: the range carries the
  // delta since the last turn of this step, with the fix dispositions.
  const delta = priorStepCommit(run.records, task.slug, step.id, task.revision);
  if (delta) vars.base_hash = delta;
}

/** The acceptance's round budget and last-call flag, or the gate fix's last call. */
function setLastCallVars(run: StepRun, vars: Record<string, string>): void {
  const { step, state } = run;
  // The decide turn carries no last call: every verdict stays available.
  const acceptance = isAcceptanceStep(step) && !isDecideStep(step);
  run.lastCall =
    acceptance &&
    isLastReviewCall(
      step,
      launchCounts(state.launches, step.id).changeRequests,
    );
  if (acceptance) {
    vars.max_rounds = String(reviewRoundLimit(step));
    vars.last_call = String(run.lastCall);
  } else if (state.gateFix && state.gateLastCall) {
    vars.last_call = "true";
  }
}

/**
 * A trivial turn still works in the front's session cwd, so its note names the
 * absolute worktree; a relaunched turn continues its own worktree and only
 * needs the branch and the assess-first ask.
 */
function setResumeNote(run: StepRun, vars: Record<string, string>): void {
  if (run.trivial && run.session) {
    vars.resume_note = resumeNote(run.runtime.prompts, "trivial", {
      branch: run.ensured.branch,
      worktree: run.ensured.path,
      sessionCwd: run.session.cwd,
    });
  } else if (run.relaunch) {
    vars.resume_note = resumeNote(run.runtime.prompts, "relaunch", {
      branch: run.ensured.branch,
    });
  }
}

function setResolveAsk(run: StepRun, vars: Record<string, string>): void {
  if (!run.pendingResolve) return;
  const ask = mergeConflictAsk(
    run.pendingResolve.head,
    run.pendingResolve.paths,
  );
  vars.findings = vars.findings ? `${ask}\n\n${vars.findings}` : ask;
}

/** The task's wall bound overrides the alias; the run's bound still caps it. */
export function turnTimeouts(run: StepRun): NonNullable<StepRun["timeouts"]> {
  const aliasTimeouts = run.target!.timeouts;
  const aliasWallMs = aliasTimeouts?.wallMs ?? DEFAULT_TIMEOUTS.wallMs;
  const taskWallMs =
    run.task.turnMinutes !== undefined
      ? Math.round(run.task.turnMinutes * 60_000)
      : aliasWallMs;
  const runWallMs =
    run.runtime.limits.turnMinutes !== undefined
      ? Math.round(run.runtime.limits.turnMinutes * 60_000)
      : undefined;
  if (run.task.turnMinutes === undefined && runWallMs === undefined)
    return aliasTimeouts ?? DEFAULT_TIMEOUTS;
  return {
    idleMs: aliasTimeouts?.idleMs ?? DEFAULT_TIMEOUTS.idleMs,
    wallMs:
      runWallMs !== undefined ? Math.min(taskWallMs, runWallMs) : taskWallMs,
  };
}

/** Every tier harness is wrapped in one shared orphan account for the turn. */
export function trackedTarget(run: StepRun) {
  const tracked = trackHarnessTimeouts(
    run.target!.tiers.map((tier) => tier.harness),
  );
  run.tracked = tracked;
  return {
    ...run.target!,
    harness: tracked.harnesses[0]!,
    tiers: run.target!.tiers.map((tier, index) => ({
      ...tier,
      harness: tracked.harnesses[index]!,
    })),
  };
}

/** Containment: a turn may change its own worktree, never a shared checkout. */
async function containmentBreach(run: StepRun): Promise<string | undefined> {
  const { runtime, ensured } = run;
  run.breach = await containmentViolation(
    runtime,
    ensured.path,
    ensured.branch,
    run.contained!,
  );
  return run.breach;
}

/** The resolve turn's merge: its settle hook records the commit and its outside files. */
async function finishResolveMerge(run: StepRun) {
  const { runtime, task, state, ensured, resolve } = run;
  const settled = await settleMergeTurn(
    runtime,
    taskMeta(task, state, run.iteration),
    ensured.path,
    `factory: ${task.slug} merge integration head`,
  );
  if (!settled.commit) return settled;
  const outside = await outsideConflictChanges(
    ensured.path,
    resolve!.snapshot,
    resolve!.conflicts,
    settled.commit,
  );
  return { ...settled, outside };
}

/** Stage a pending merge so edited files leave the unmerged set; markers refuse the commit. */
async function stagePendingMerge(run: StepRun): Promise<boolean> {
  await git(run.ensured.path, ["add", "-A"], { allowFail: true });
  return (await hasConflictMarkers(run.ensured.path)).length === 0;
}

/** The turn's commit, compacted where its session ends. */
async function commitTurn(
  run: StepRun,
  outcome: StepRecord["outcome"],
  live: SessionRef | undefined,
) {
  const { runtime, task, state, step, ensured } = run;
  const settled = await commitStep(
    runtime,
    taskMeta(task, state, run.iteration),
    ensured.path,
    `factory: ${task.slug} ${step.id} r${state.round}`,
  );
  // An infra/refusal stop delivers no outcome; that session is not kept.
  if (!outcome || !live) return settled;
  const compacted = await compactSession(runtime, live, {
    review: step.review === true,
    round: state.round,
  });
  if (!compacted) return settled;
  return {
    ...settled,
    session: compacted.session,
    ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
  };
}

/** The settle hook: containment, the merge or commit, and session compaction. */
function settleTurn(run: StepRun) {
  return async (
    _record: StepRecord,
    outcome: StepRecord["outcome"],
    live: SessionRef | undefined,
  ) => {
    // A timeout commits nothing: the orphan still owns the tree, and `git add
    // -A` would sweep its half-written files into an attributed commit.
    if (run.tracked!.timedOut()) return {};
    const breach = await containmentBreach(run);
    if (breach) return { ok: false, cause: makeCause("containment", breach) };
    if (run.resolve) return finishResolveMerge(run);
    if (run.pendingResolve && !(await stagePendingMerge(run))) return {};
    return commitTurn(run, outcome, live);
  };
}

/** The branch's commits plus uncommitted and untracked edits against `base`. */
async function branchHoldsWork(cwd: string, base: string): Promise<boolean> {
  const diff = await git(cwd, ["diff", "--name-only", base, "--"]);
  if (diff.stdout.trim() !== "") return true;
  const untracked = await git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  return untracked.stdout.trim() !== "";
}

/**
 * The fresh-session ask an implement turn renders when its branch carries work
 * but its reminders delivered no valid outcome: the task, the worktree and the
 * diff range the new session judges.
 */
function rescueAsk(run: StepRun) {
  return async (findings: readonly string[]): Promise<string | null> => {
    if (!(await branchHoldsWork(run.ensured.path, run.baseHash!))) return null;
    return run.runtime.prompts.render("rescue-turn", {
      ...run.vars!,
      role: run.target!.prompt,
      head_hash: await headSha(run.ensured.path),
      outcome_findings: findings.map((finding) => `- ${finding}`).join("\n"),
    });
  };
}

export async function runTurn(
  run: StepRun,
  target: ReturnType<typeof trackedTarget>,
) {
  const { runtime, task, state, step, iteration } = run;
  return runAgentTurn(runtime, {
    target,
    cwd: run.turnCwd!,
    meta: {
      ...taskMeta(task, state, iteration),
      step: step.id,
      base: run.baseHash,
      taskHash: materialHash(task),
    },
    vars: run.vars!,
    expectation: step.qa
      ? "qa"
      : step.review || step.adjudicate !== undefined
        ? "review"
        : "any",
    outcomeSchema: step.qa
      ? qaOutcomeSchema
      : taskOutcomeSchema(task, runtime.configs.process.taskTypes),
    lastCall: run.lastCall,
    session: run.session,
    timeouts: run.timeouts,
    ...(task.repairTurns !== undefined
      ? { repairTurns: task.repairTurns }
      : {}),
    // Only the implement turn's branch carries the task's edits, so only it can
    // be rescued: a reviewer or QA turn has no work of its own to deliver for.
    ...(step.prompt === "implementer" ? { rescue: rescueAsk(run) } : {}),
    settle: settleTurn(run),
  });
}

/** The timeout reset and containment check that precede any merge/commit verdict. */
async function settleTimeout(run: StepRun, startHead: string): Promise<void> {
  if (!run.tracked!.timedOut()) return;
  // The grace lets a cooperative orphan reap its child before the tree resets.
  await run.tracked!.waitSettled();
  await resetWorktreeToCommit(run.ensured.path, startHead);
  run.breach = await containmentViolation(
    run.runtime,
    run.ensured.path,
    run.ensured.branch,
    run.contained!,
  );
}

/** A conflicted resolve turn either settles or aborts; never leave MERGE_HEAD behind. */
async function settleResolveTurn(
  run: StepRun,
  result: Awaited<ReturnType<typeof runTurn>>,
): Promise<TaskActionResult | undefined> {
  const stop = result.record.stop;
  const status = result.outcome?.status;
  if (!status && stop?.kind === "infra") {
    // The merge stays in flight: a retry resumes the partial resolution.
    return {
      infra: {
        cause: stop.cause,
        ...(stop.details ? { details: stop.details } : {}),
      },
    };
  }
  if (!status && stop?.kind === "cancelled") return { cancelled: true };
  if (status === "done") {
    const problem = await unresolvedResolve(
      run.ensured.path,
      run.resolve!.head,
      run.resolve!.conflicts,
    );
    if (problem) {
      await abortMerge(run.ensured.path);
      await parkTask(
        run.runtime,
        taskMeta(run.task, run.state, run.iteration),
        makeCause("conflict", problem),
      );
      return {};
    }
  } else if (status || stop?.kind === "refusal") {
    // The turn reported the conflict unresolvable: never leave the merge in
    // flight for the next turn to inherit.
    await abortMerge(run.ensured.path);
  }
  return undefined;
}

/** The merge the turn completed must have landed and left no conflict behind. */
async function pendingMergeLanded(run: StepRun): Promise<boolean> {
  const flagged = await hasConflictMarkers(run.ensured.path);
  const stillInFlight = await mergeHeadSha(run.ensured.path);
  let contains = false;
  try {
    contains = await isAncestor(
      run.ensured.path,
      run.pendingResolve!.head,
      await headSha(run.ensured.path),
    );
  } catch {
    contains = false;
  }
  if (flagged.length === 0 && !stillInFlight && contains) {
    await recordPendingAdvance(run);
    return true;
  }
  const files = flagged.length > 0 ? flagged : run.pendingResolve!.paths;
  const named = files.join(", ") || "git reported no unmerged paths";
  await abortMerge(run.ensured.path);
  await parkTask(
    run.runtime,
    taskMeta(run.task, run.state, run.iteration),
    makeCause("base-conflict", named),
  );
  return false;
}

async function recordPendingAdvance(run: StepRun): Promise<void> {
  const commit = await headSha(run.ensured.path);
  const tree = await treeSha(run.ensured.path);
  const needsHeadTree =
    run.resolveIsCreation ||
    run.resolveIsFirstTurn ||
    !run.records.some(
      (rec) =>
        rec.slug === run.task.slug &&
        rec.step === "base-advance" &&
        rec.endedAt,
    );
  const headTree = needsHeadTree
    ? (
        await git(run.runtime.paths.repoRoot, [
          "rev-parse",
          `${run.pendingResolve!.head}^{tree}`,
        ])
      ).stdout.trim()
    : undefined;
  await recordBaseAdvance(
    run.runtime,
    taskMeta(run.task, run.state, run.iteration),
    commit,
    tree,
    headTree,
  );
}

/** The pending merge the turn carried: landed with the turn, or parked as a conflict. */
async function settlePendingTurn(
  run: StepRun,
  result: Awaited<ReturnType<typeof runTurn>>,
): Promise<TaskActionResult | undefined> {
  if (run.tracked!.timedOut()) return undefined;
  const stop = result.record.stop;
  const resumable =
    !result.outcome?.status &&
    (stop?.kind === "infra" ||
      stop?.kind === "cancelled" ||
      stop?.kind === "truncated");
  if (resumable) return undefined;
  return (await pendingMergeLanded(run)) ? undefined : {};
}

/** Post-turn: timeout reset, containment breach, then the merge states the turn may have settled. */
export async function settleAfterTurn(
  run: StepRun,
  result: Awaited<ReturnType<typeof runTurn>>,
): Promise<TaskActionResult | undefined> {
  await settleTimeout(run, run.startHead!);
  if (run.breach) {
    if (run.pendingResolve || run.resolve) await abortMerge(run.ensured.path);
    await parkTask(
      run.runtime,
      taskMeta(run.task, run.state, run.iteration),
      makeCause("containment", run.breach),
    );
    return {};
  }
  if (run.resolve && !run.tracked!.timedOut()) {
    const settled = await settleResolveTurn(run, result);
    if (settled) return settled;
  }
  if (run.pendingResolve) return settlePendingTurn(run, result);
  return undefined;
}
