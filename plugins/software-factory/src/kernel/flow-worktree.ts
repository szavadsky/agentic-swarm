/**
 * Opening a task's worktree for any script step: an ensure failure or a failed
 * setup parks with the setup cause, so every caller reads one result shape.
 */
import { makeCause } from "./cause.js";
import { parkTask, taskMeta } from "./flow-meta.js";
import type { Opened } from "./flow-types.js";
import { scriptMeta } from "./record.js";
import type { KernelRuntime, TaskFile, TaskState } from "./types.js";
import { ensureTaskWorktree } from "./worktree.js";

export async function openTaskWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  iteration: number,
): Promise<Opened> {
  const meta = taskMeta(task, state, iteration);
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await parkTask(runtime, meta, makeCause("setup", ensured.error));
    return { result: {} };
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = makeCause("setup", ensured.setup.error ?? "unknown");
    await runtime.store.appendRecord(
      scriptMeta(iteration, "setup", {
        slug: task.slug,
        round: state.round,
        ...(meta.architect ? { architect: meta.architect } : {}),
      }),
      { ok: false, cause },
    );
    await parkTask(runtime, meta, cause);
    return { result: {} };
  }
  return { ensured };
}
