/**
 * A spike steer's routing: once its linked tasks are terminal, their outcomes
 * answer it; while one is in flight the steer stays pending but out of the
 * architect's pack; a steer with no linked task is the architect's.
 */

import {
  spikeAnswer,
  spikeLinkedTasks,
  spikeTerminal,
} from "./boundary-context.js";
import {
  collectSteerRoutes,
  expireHold,
  markProcessed,
  type Steer,
  writeOutbox,
} from "./mailbox.js";
import type { SpikeSteerAction } from "./boundary-types.js";
import type { KernelRuntime, State, StepRecord, TaskFile } from "./types.js";

export async function runSpikeSteer(
  runtime: KernelRuntime,
  tasks: TaskFile[],
  state: State,
  records: StepRecord[],
  steer: Steer,
): Promise<SpikeSteerAction> {
  const linked = spikeLinkedTasks(tasks, steer.id);
  if (linked.length === 0) return "architect";
  if (!spikeTerminal(state, linked)) return "skip";
  const answer = await spikeAnswer(runtime.store, records, state, linked);
  await writeOutbox(
    runtime.store,
    steer.id,
    `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
  );
  await markProcessed(runtime.store, steer);
  await expireHold(runtime.store, steer.id);
  return "handled";
}

/**
 * Answers the spike-routed steers whose linked tasks have settled. Dispatch
 * calls this after its passes, so a spike that finishes mid-iteration is
 * answered there: a goal made terminal by that finish never opens a boundary.
 * Returns the ids it answered.
 */
export async function answerSettledSpikeSteers(
  runtime: KernelRuntime,
  tasks: TaskFile[],
  state: State,
  records: StepRecord[],
  steers: Steer[],
): Promise<Set<string>> {
  const routes = collectSteerRoutes(records);
  const answered = new Set<string>();
  for (const steer of steers) {
    if (routes.get(steer.id)?.route !== "spike") continue;
    if (
      (await runSpikeSteer(runtime, tasks, state, records, steer)) === "handled"
    ) {
      answered.add(steer.id);
    }
  }
  return answered;
}
