/**
 * The `checks` action: open the task worktree, refuse a conflicted or
 * still-merging branch, record a recreated continuation's baseline, then run
 * the task gates. It never turns an agent.
 */

import { unmergedFiles } from "../core/git/merge.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { makeCause } from "./cause.js";
import { runTaskGates } from "./flow-gates.js";
import { parkTask, recordBaseAdvance, taskMeta } from "./flow-meta.js";
import type { TaskActionResult } from "./flow-state.js";
import { openTaskWorktree } from "./flow-worktree.js";
import { abortMerge, mergeHeadSha } from "./merge-conflict.js";
import type { KernelRuntime, TaskFile, TaskState } from "./types.js";
import { headSha, treeSha } from "./worktree.js";

async function parkBaseConflict(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  iteration: number,
  worktree: string,
  paths: string[],
): Promise<TaskActionResult> {
  const named = paths.join(", ") || "git reported no unmerged paths";
  await abortMerge(worktree);
  await parkTask(
    runtime,
    taskMeta(task, state, iteration),
    makeCause("base-conflict", named),
  );
  return {};
}

export async function runChecks(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  iteration: number,
): Promise<TaskActionResult> {
  const opened = await openTaskWorktree(runtime, task, state, iteration);
  if ("result" in opened) return opened.result;
  const ensured = opened.ensured;
  if (ensured.mergeConflict) {
    return parkBaseConflict(
      runtime,
      task,
      state,
      iteration,
      ensured.path,
      ensured.mergeConflict.paths,
    );
  }
  if (task.base && (await mergeHeadSha(ensured.path))) {
    return parkBaseConflict(
      runtime,
      task,
      state,
      iteration,
      ensured.path,
      await unmergedFiles(ensured.path),
    );
  }
  if (task.base && ensured.created) {
    // A recreated continuation worktree re-merged the head (see flow-step);
    // the next fix turn still needs the post-advance baseline.
    await recordBaseAdvance(
      runtime,
      taskMeta(task, state, iteration),
      await headSha(ensured.path),
      await treeSha(ensured.path),
    );
  }
  const prior = await runtime.store.listRecords();
  const preexisting = preexistingRed(recordedBaseGates(prior));
  const gated = await runTaskGates(
    runtime,
    task,
    taskMeta(task, state, iteration),
    ensured.path,
    preexisting,
    prior,
  );
  if (gated.infra) return { infra: gated.infra };
  if (gated.cancelled) return { cancelled: true };
  return {};
}
