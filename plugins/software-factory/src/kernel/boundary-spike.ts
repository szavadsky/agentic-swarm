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
  expireHold,
  markProcessed,
  type Steer,
  writeOutbox,
} from "./mailbox.js";
import type { KernelRuntime, State, StepRecord, TaskFile } from "./types.js";

export type SpikeSteerAction = "architect" | "handled" | "skip";

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
