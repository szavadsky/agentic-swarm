import { git } from "../core/git/exec.js";
import { unmergedFiles } from "../core/git/merge.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { makeCause } from "./cause.js";
import { worktreeClean } from "./flow-commit.js";
import {
  followUpSession,
  isFixTurn,
  isRelaunchStep,
  isTrivialImplementTurn,
  stepTarget,
  trivialResumeSession,
} from "./flow-context.js";
import { finishCleanResolve } from "./flow-gates.js";
import { parkTask, recordBaseAdvance, taskMeta } from "./flow-meta.js";
import { handleStepResult } from "./flow-result.js";
import type { StepRun, TaskActionResult } from "./flow-state.js";
import {
  buildVars,
  runTurn,
  settleAfterTurn,
  trackedTarget,
  turnTimeouts,
} from "./flow-turn.js";
import { openTaskWorktree } from "./flow-worktree.js";
import { abortMerge, mergeHeadSha, prepareResolve } from "./merge-conflict.js";
import { isAcceptanceStep, isVerdictStep } from "./review.js";
import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "./types.js";
import {
  containmentSnapshot,
  headSha,
  integrationHead,
  mergeRef,
  treeSha,
} from "./worktree.js";

interface StepDeps {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  step: FlowStep;
  flow: FlowDefinition;
  iteration: number;
}

async function openStep(deps: StepDeps): Promise<StepRun | TaskActionResult> {
  const { runtime, task, state, iteration, step, flow } = deps;
  const records = await runtime.store.listRecords();
  const opened = await openTaskWorktree(runtime, task, state, iteration);
  if ("result" in opened) return opened.result;
  const fix = isFixTurn(flow, state, step.id);
  const amendedFirstTurn = task.revision > 0 && state.turns === 0 && !fix;
  const relaunch = isRelaunchStep(records, task.slug, step.id, task.revision);
  return {
    runtime,
    task,
    state,
    iteration,
    step,
    flow,
    records,
    ensured: opened.ensured,
    fix,
    resolveStep: step.id === "resolve",
    amendedFirstTurn,
    relaunch,
    /** The kept branch may trail the head: a continuation or an amended slug. */
    keptBranch: task.base !== undefined || amendedFirstTurn,
    pendingResolve: null,
    resolveIsCreation: false,
    resolveIsFirstTurn: false,
    startPoint: opened.ensured.startPoint,
    preexisting: new Set(),
    trivial: false,
    lastCall: false,
  };
}

/**
 * A first-turn `base:` conflict resolves in the turn instead of parking: the
 * merge stays in progress and the ask rides the counted turn. Fix turns and
 * verdict turns keep the park; a resumed MERGE_HEAD always resumes so partial
 * work is not lost.
 */
async function initialConflict(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  const conflict = run.ensured.mergeConflict;
  if (run.resolveStep || !conflict) return undefined;
  if (isVerdictStep(run.step) || run.fix) {
    const named = conflict.paths.join(", ") || "git reported no unmerged paths";
    await abortMerge(run.ensured.path);
    await parkTask(
      run.runtime,
      taskMeta(run.task, run.state, run.iteration),
      makeCause("base-conflict", named),
    );
    return {};
  }
  run.pendingResolve = { head: conflict.head, paths: conflict.paths };
  run.resolveIsCreation = true;
  run.resolveIsFirstTurn = true;
  return undefined;
}

/** The creation merge moved the branch without the agent; derive needs its tree. */
async function creationAdvance(run: StepRun): Promise<void> {
  // The merge-conflict path above already owns this turn's baseline.
  if (run.pendingResolve) return;
  if (!(run.task.base && run.ensured.created)) return;
  const commit = await headSha(run.ensured.path);
  const tree = await treeSha(run.ensured.path);
  const headTree = (
    await git(run.runtime.paths.repoRoot, [
      "rev-parse",
      `${run.ensured.startPoint}^{tree}`,
    ])
  ).stdout.trim();
  await recordBaseAdvance(
    run.runtime,
    taskMeta(run.task, run.state, run.iteration),
    commit,
    tree,
    headTree,
  );
}

/** A reused kept branch advances to the current integration head before the turn (B6). */
async function advanceKeptBranch(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  const { ensured, task, fix, step } = run;
  if (
    run.resolveStep ||
    run.pendingResolve ||
    !run.keptBranch ||
    (ensured.created && task.base !== undefined) ||
    isVerdictStep(step) ||
    !(await worktreeClean(ensured.path))
  )
    return undefined;
  const head = await integrationHead(run.runtime);
  const before = await headSha(ensured.path);
  const attempt = await mergeRef(
    ensured.path,
    head,
    run.runtime.repo.identityEnv(),
    {
      leaveConflict: true,
    },
  );
  if (!attempt.ok) {
    if (fix) {
      const named =
        attempt.paths.join(", ") || "git reported no unmerged paths";
      await abortMerge(ensured.path);
      await parkTask(
        run.runtime,
        taskMeta(task, run.state, run.iteration),
        makeCause("base-conflict", named),
      );
      return {};
    }
    run.pendingResolve = { head, paths: attempt.paths };
    run.resolveIsFirstTurn = run.amendedFirstTurn;
    run.startPoint = head;
    return undefined;
  }
  run.startPoint = head;
  const moved = (await headSha(ensured.path)) !== before;
  // The branch moved without the agent, or this is the revision's first turn:
  // record the post-advance tree and the head's, so derive can tell kept work
  // from a no-progress turn even when the advance moved nothing.
  if (moved || run.state.turns === 0) {
    const headTree = (
      await git(run.runtime.paths.repoRoot, ["rev-parse", `${head}^{tree}`])
    ).stdout.trim();
    await recordBaseAdvance(
      run.runtime,
      taskMeta(task, run.state, run.iteration),
      await headSha(ensured.path),
      await treeSha(ensured.path),
      headTree,
    );
  }
  return undefined;
}

/** A crash mid-resolve leaves MERGE_HEAD: resume it rather than start over. */
async function resumeInFlight(run: StepRun): Promise<void> {
  if (
    run.resolveStep ||
    run.pendingResolve ||
    !run.keptBranch ||
    isVerdictStep(run.step)
  )
    return;
  const inFlight = await mergeHeadSha(run.ensured.path);
  if (!inFlight) return;
  let paths = await unmergedFiles(run.ensured.path);
  if (paths.length === 0) {
    const diff = await git(
      run.ensured.path,
      ["diff", "--name-only", "HEAD", inFlight],
      { allowFail: true },
    );
    paths = diff.stdout
      .split("\n")
      .map((path) => path.trim())
      .filter(Boolean)
      .sort();
  }
  run.pendingResolve = { head: inFlight, paths };
}

/** A verdict turn never resolves a merge: the conflict parks. */
async function verdictMergeGuard(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  if (!(run.keptBranch && isVerdictStep(run.step))) return undefined;
  if (!(await mergeHeadSha(run.ensured.path))) return undefined;
  const named =
    (await unmergedFiles(run.ensured.path)).join(", ") ||
    "git reported no unmerged paths";
  await abortMerge(run.ensured.path);
  await parkTask(
    run.runtime,
    taskMeta(run.task, run.state, run.iteration),
    makeCause("base-conflict", named),
  );
  return {};
}

async function prepareBase(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  const conflict = await initialConflict(run);
  if (conflict) return conflict;
  await creationAdvance(run);
  const advanced = await advanceKeptBranch(run);
  if (advanced) return advanced;
  await resumeInFlight(run);
  return verdictMergeGuard(run);
}

/** A clean head resolve commits and gates without a turn; a conflicted one becomes the turn's job. */
async function prepareResolveStage(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  run.preexisting = preexistingRed(recordedBaseGates(run.records));
  if (!run.resolveStep) return undefined;
  const prepared = await prepareResolve(
    run.runtime,
    run.ensured.path,
    run.ensured.mergeConflict,
  );
  if (prepared.kind === "error") {
    await parkTask(
      run.runtime,
      taskMeta(run.task, run.state, run.iteration),
      makeCause("conflict", prepared.cause),
    );
    return {};
  }
  if (prepared.kind === "clean") {
    return finishCleanResolve(
      run.runtime,
      run.task,
      taskMeta(run.task, run.state, run.iteration),
      run.ensured.path,
      run.preexisting,
      run.records,
    );
  }
  run.resolve = prepared;
  return undefined;
}

/**
 * A trivial goal implements in the front's own session; a review turn and a
 * fix turn resume their own step's session. Everything else starts de novo.
 */
async function chooseSession(
  run: StepRun,
): Promise<TaskActionResult | undefined> {
  const { runtime, task, state, step, iteration, ensured } = run;
  run.target = stepTarget(
    runtime,
    task,
    state,
    step.id,
    iteration,
    run.records,
  );
  run.trivial = isTrivialImplementTurn(runtime, task, state, step.id);
  run.turnCwd = ensured.path;
  run.session =
    isAcceptanceStep(step) ||
    (run.relaunch && !run.trivial) ||
    (run.fix && !run.trivial)
      ? await followUpSession(
          runtime,
          task,
          run.target,
          step.id,
          run.records,
          ensured.path,
        )
      : undefined;
  if (!run.trivial) return undefined;
  const resumed = await trivialResumeSession(
    runtime,
    task,
    run.records,
    run.fix,
    iteration,
  );
  if ("cause" in resumed) {
    await parkTask(runtime, taskMeta(task, state, iteration), resumed.cause);
    return {};
  }
  run.session = resumed.session;
  run.turnCwd = run.session.cwd;
  return undefined;
}

/** One agent step: prepare, turn, settle, then the record's step contract. */
export async function runStep(deps: StepDeps): Promise<TaskActionResult> {
  const opened = await openStep(deps);
  if (!("ensured" in opened)) return opened;
  const run = opened;
  const conflict = await prepareBase(run);
  if (conflict) return conflict;
  const resolve = await prepareResolveStage(run);
  if (resolve) return resolve;
  const session = await chooseSession(run);
  if (session) return session;
  await buildVars(run);
  run.contained = await containmentSnapshot(run.runtime, run.ensured.path);
  run.timeouts = turnTimeouts(run);
  run.startHead = await headSha(run.ensured.path);
  const target = trackedTarget(run);
  const result = await runTurn(run, target);
  const settled = await settleAfterTurn(run, result);
  if (settled) return settled;
  return handleStepResult(
    run.runtime,
    run.task,
    run.step,
    run.state,
    run.flow,
    run.iteration,
    run.ensured.path,
    run.preexisting,
    run.records,
    result.record,
    result.record.stop,
    result.outcome,
  );
}
