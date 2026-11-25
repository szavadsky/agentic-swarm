/**
 * The launch loop: bounded iterations that hand one `IterationRun` through the
 * phase helpers, and the derived result the launch stops with. Setup lives in
 * `launch-setup.ts`; the phases in `launch-phases.ts`.
 */

import { writeArtifactLsp } from "./artifact-lsp.js";
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { runInSandbox } from "../core/sandbox.js";
import { safeSummary } from "./launch-facts.js";
import { prepareIteration, runIteration } from "./launch-phases.js";
import { steersWaiting } from "./launch-resume.js";
import type { GoalRun } from "./launch-run.js";
import { prepareLaunch, recoverOrInfra } from "./launch-setup.js";
import type { PreparedLaunch } from "./launch-setup.js";
import { drainHeldNotes } from "./mailbox.js";
import { landStoreCommits } from "./store-backend.js";
import { statusSource, writeStatus } from "./status.js";
import type { StatusStop } from "./status.js";
import type { LaunchResult, RunGoalOptions } from "./launch-types.js";
import type { State } from "./types.js";
import { sweepWorktrees } from "./worktree.js";

async function runIterations(run: GoalRun): Promise<void> {
  while (run.loopIndex < run.runtime.limits.iterations) {
    if (run.signals.shouldStop()) return;
    const before = derive(
      await run.store.listTasks(),
      await run.store.listRecords(),
      run.runtime.configs.process.flows,
    );
    if (
      before.terminal &&
      !(before.goal === "blocked" && (await steersWaiting(run.store)))
    )
      return;
    const it = await prepareIteration(run, before);
    let outcome: "continue" | "stop" | "giveBack";
    try {
      outcome = await runIteration(it);
    } catch (err) {
      await safeSummary(
        run.runtime,
        Math.max(1, it.iteration),
        it.humanInterventions,
        makeCause("error", (err as Error).message),
      );
      throw err;
    }
    if (outcome === "stop") return;
    if (outcome === "giveBack") run.iterations -= 1;
    else run.loopIndex += 1;
  }
}

function launchStop(run: GoalRun, state: State): LaunchResult["stop"] {
  if (run.signals.interruptedBy || run.ended === "cancelled")
    return "interrupted";
  // The promote barrier outranks the derived goal: the launch stopped for the
  // operator even when the promote task was the last open work.
  if (run.ended === "promote") return "promote";
  if (state.goal === "done") return "done";
  if (state.goal === "blocked") return "blocked";
  return run.ended === "infra" ? "infra" : "iteration-limit";
}

/** The snapshot field that makes the dashboard badge follow this launch's stop. */
function statusStop(result: LaunchResult): StatusStop {
  return {
    reason: result.stop,
    ...(result.cause ? { cause: result.cause } : {}),
    ...(result.interruptedBy ? { interruptedBy: result.interruptedBy } : {}),
  };
}

async function launchResult(
  opts: RunGoalOptions,
  run: GoalRun,
): Promise<LaunchResult> {
  const state = derive(
    await run.store.listTasks(),
    await run.store.listRecords(),
    run.runtime.configs.process.flows,
  );
  return {
    goal: opts.goal,
    iterations: run.iterations,
    state,
    lastSummary: run.lastSummary,
    stop: launchStop(run, state),
    cause: run.stopCause ? formatCause(run.stopCause) : undefined,
    interruptedBy: run.signals.interruptedBy,
    recoveredRecords: run.recoveredRecords,
  };
}

/**
 * One launch: configs, pre-flight, goal lock, crash recovery, bounded
 * iterations, one metrics file + one summary per iteration. State is always
 * derived; relaunching after a kill runs the same code path.
 */
export async function runGoal(opts: RunGoalOptions): Promise<LaunchResult> {
  const prepared = await prepareLaunch(opts);
  return runInSandbox(prepared.setup.configs.run.sandbox, () =>
    runPreparedLaunch(opts, prepared),
  );
}

/** The launch body; every child it starts inherits the configured wrapper. */
async function runPreparedLaunch(
  opts: RunGoalOptions,
  prepared: PreparedLaunch,
): Promise<LaunchResult> {
  const { setup, store, runtime, signals, uninstall, lock, closeRunLog } =
    prepared;

  try {
    const interrupted = (await store.listRecords()).filter(
      (r) => !r.endedAt,
    ).length;
    const recovered = await recoverOrInfra(runtime, opts, interrupted);
    if (recovered) {
      await drainHeldNotes(store);
      // This launch stopped before its first turn; the stored snapshot must
      // name that stop too, and settle on the goal branch like any other.
      await writeStatus(statusSource(runtime), statusStop(recovered));
      await landStoreCommits(setup.paths);
      return recovered;
    }
    // The artifact folder carries the schemas and one LSP config for editors
    // and any harness rooted there; it is written before the first turn
    // snapshots goal artifacts, so containment never sees a launch write.
    await writeArtifactLsp(setup.paths.goalDir);
    const relaunch = (await store.listRecords()).some(
      (r) => r.iteration > 0 && r.step !== "task-quarantine",
    );
    const run: GoalRun = {
      runtime,
      signals,
      store,
      relaunch,
      iterations: 0,
      loopIndex: 0,
      resumeForcedOff: false,
      recoveredRecords: interrupted,
    };
    await runIterations(run);
    await drainHeldNotes(store);
    const result = await launchResult(opts, run);
    // The dashboard reads the stored snapshot, so the final stop is written
    // before the launch's writes settle on the goal branch.
    await writeStatus(statusSource(runtime), statusStop(result));
    await landStoreCommits(setup.paths);
    // Every end sweeps: an interrupted or bounded launch must not leave the
    // terminal trees the next launch would only clear after its pre-flight.
    await sweepWorktrees(runtime);
    return result;
  } finally {
    closeRunLog();
    lock.release();
    uninstall?.();
  }
}
