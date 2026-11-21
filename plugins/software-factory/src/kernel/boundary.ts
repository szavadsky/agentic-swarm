/**
 * One architect consult: the plan checker, digest, steer partition, pack, the
 * architect turn, its ownership/steer/decision checks, the epic consults, the
 * plan review and the PM turn. The phases live in `boundary-stage.ts`,
 * `boundary-architect.ts` and `boundary-tail.ts`; this module is the ordered
 * composition and the public result/option types.
 */
export type { BoundaryOptions, BoundaryResult } from "./boundary-state.js";

import { runArchitectStage } from "./boundary-architect.js";
import {
  partitionSteers,
  prepareBoundary,
  refreshAfterChecker,
  routeUnroutedSteers,
  runChecker,
  writeDigest,
  writePack,
} from "./boundary-stage.js";
import type { BoundaryOptions, BoundaryResult } from "./boundary-state.js";
import {
  reviewChangedPlans,
  runConsults,
  runPmStage,
  settleArchitectStage,
} from "./boundary-tail.js";
import type { KernelRuntime } from "./types.js";

/**
 * Called at every iteration start, never mid-iteration. A boundary with open
 * work runs the plan checker first and returns `continue` when its follow-ups
 * resume dispatch, so a consult is not unconditional.
 */
export async function runBoundary(
  runtime: KernelRuntime,
  opts: BoundaryOptions,
): Promise<BoundaryResult> {
  const context = await prepareBoundary(runtime, opts);
  const checked = await runChecker(context);
  if (checked) return checked;
  await refreshAfterChecker(context);
  await writeDigest(context);
  await routeUnroutedSteers(context);
  await partitionSteers(context);
  await writePack(context);
  const architect = await runArchitectStage(context);
  if (architect) return architect;
  const settled = await settleArchitectStage(context);
  if (settled) return settled;
  const consulted = await runConsults(context);
  if (consulted) return consulted;
  await reviewChangedPlans(context);
  return runPmStage(context);
}
