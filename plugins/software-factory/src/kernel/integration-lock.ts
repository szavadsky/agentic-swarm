import { KeyedMutex } from "../core/mutex.js";
import { scriptMeta } from "./record.js";
import { makeCause } from "./cause.js";
import type { KernelRuntime } from "./types.js";
import { containmentSnapshot, containmentViolation } from "./worktree.js";

/**
 * One queue per goal for the integration checkout. A merge resets and cleans
 * that checkout, so no turn that runs in it may overlap one; both sides hold
 * this same lock for their whole run.
 */
const integrationQueues = new KeyedMutex();

/** Serializes work that reads or moves the goal's integration checkout. */
export async function integrationExclusive<T>(
  runtime: KernelRuntime,
  work: () => Promise<T>,
): Promise<T> {
  return integrationQueues.runExclusive(runtime.paths.goalDir, work);
}

export interface BoundaryTurnMeta {
  iteration: number;
  /** The boundary step a containment incident names, e.g. `architect`. */
  step: string;
}

/**
 * Runs one boundary role's work in the integration checkout under the merge
 * lock and checks the checkout before and after, like a task turn. The goal
 * artifacts are the boundary's deliverable (the plan, the tasks, the digest),
 * so a change there is not the turn's breach; the checkout is.
 */
export async function runBoundaryTurn<T>(
  runtime: KernelRuntime,
  meta: BoundaryTurnMeta,
  turn: () => Promise<T>,
): Promise<T> {
  return integrationExclusive(runtime, async () => {
    const containment = { mode: "boundary" } as const;
    const snapshot = await containmentSnapshot(
      runtime,
      runtime.paths.goalCheckout,
      containment,
    );
    const result = await turn();
    const breach = await containmentViolation(
      runtime,
      runtime.paths.goalCheckout,
      runtime.paths.integrationBranch,
      snapshot,
      containment,
    );
    if (breach) {
      await runtime.store.appendRecord(
        scriptMeta(meta.iteration, "containment"),
        {
          ok: false,
          cause: makeCause(
            "containment",
            `boundary-write: ${meta.step}: ${breach}`,
          ),
        },
      );
    }
    return result;
  });
}
