/**
 * The launch loop: bounded iterations that hand one `IterationRun` through the
 * phase helpers, and the derived result the launch stops with. Setup lives in
 * `launch-setup.ts`; the phases in `launch-phases.ts`.
 */

import { writeArtifactLsp } from "./artifact-lsp.js";
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { safeSummary } from "./launch-facts.js";
import { prepareIteration, runIteration } from "./launch-phases.js";
import { steersWaiting } from "./launch-resume.js";
import type { GoalRun } from "./launch-run.js";
import { prepareLaunch, recoverOrInfra } from "./launch-setup.js";
import { landStoreCommits } from "./store-backend.js";
import type { LaunchResult, RunGoalOptions } from "./launch-types.js";
import type { State } from "./types.js";

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
  if (state.goal === "done") return "done";
  if (state.goal === "blocked") return "blocked";
  return run.ended === "infra" ? "infra" : "iteration-limit";
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
  const { setup, store, runtime, signals, uninstall, lock } =
    await prepareLaunch(opts);

  try {
    const interrupted = (await store.listRecords()).filter(
      (r) => !r.endedAt,
    ).length;
    const recovered = await recoverOrInfra(runtime, opts, interrupted);
    if (recovered) return recovered;
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
    // The run's last writes settle on the goal branch too, not just the
    // checkout the next launch reads; a crash before this leaves them for
    // recovery to land.
    await landStoreCommits(setup.paths);
    return await launchResult(opts, run);
  } finally {
    lock.release();
    uninstall?.();
  }
}
