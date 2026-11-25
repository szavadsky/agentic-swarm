/**
 * The per-turn record metadata and the two records every step phase writes:
 * a park with the task's revision, and the post-advance tree derive uses as
 * the empty-diff baseline.
 */
import type { TaskMeta } from "./flow-types.js";
import { appendPark, scriptMeta } from "./record.js";
import { taskArchitect } from "./tasks.js";
import type { Cause, KernelRuntime, TaskFile, TaskState } from "./types.js";

export function taskMeta(
  task: TaskFile,
  state: TaskState,
  iteration: number,
): TaskMeta {
  return {
    iteration,
    slug: task.slug,
    round: state.round,
    revision: task.revision,
    architect: taskArchitect(task),
  };
}

export function parkTask(
  runtime: KernelRuntime,
  meta: TaskMeta,
  cause: Cause,
): Promise<void> {
  return appendPark(runtime.store, meta, cause);
}

/** The creation or reused-worktree advance: free, not a turn. */
export async function recordBaseAdvance(
  runtime: KernelRuntime,
  meta: TaskMeta,
  commit: string,
  tree: string,
  headTree?: string,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(meta.iteration, "base-advance", {
      slug: meta.slug,
      round: meta.round,
      ...(meta.architect ? { architect: meta.architect } : {}),
    }),
    { ok: true, commit, tree, ...(headTree !== undefined ? { headTree } : {}) },
  );
}
