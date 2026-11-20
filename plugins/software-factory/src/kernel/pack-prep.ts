import fs from "node:fs";
import { runAgentTurn } from "./agent.js";
import { boundaryTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import type { KernelRuntime } from "./types.js";

/** Agent step of the pack-preparer boundary turn; slug-less, outside task turn counts. */
export const PACK_PREP_STEP = "packprep";

/**
 * One pack-preparer turn: the cheap agent reads the script's derived status
 * data and writes the iteration's index pack. The pack is removed first, so a
 * present, non-empty file proves this turn wrote it. Every failure returns its
 * cause; the boundary then records the glitch and renders the script pack.
 */
export async function runPackPreparer(
  runtime: KernelRuntime,
  opts: { iteration: number; packRel: string; dataRel: string },
): Promise<string | undefined> {
  const packPath = await runtime.store.localPath({
    area: "goal",
    rel: opts.packRel,
  });
  fs.rmSync(packPath, { force: true });
  const result = await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, PACK_PREP_STEP, opts.iteration),
    cwd: runtime.paths.goalCheckout,
    meta: { iteration: opts.iteration, step: PACK_PREP_STEP, round: 1 },
    vars: {
      iteration: String(opts.iteration),
      intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
      plan_path: runtime.store.plans.path,
      context_data_path: runtime.store.pathOf({
        area: "goal",
        rel: opts.dataRel,
      }),
      pack_path: packPath,
      checkout: runtime.paths.goalCheckout,
    },
    expectation: KERNEL_TURN_STEPS[PACK_PREP_STEP],
  });
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    return `turn stopped on infrastructure: ${
      stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
    }`;
  }
  const outcome = result.outcome;
  if (!outcome) return "turn produced no outcome";
  if (outcome.status !== "done")
    return `turn declared ${outcome.status}: ${outcome.summary}`;
  if (!fs.existsSync(packPath)) return "turn wrote no pack";
  if (fs.statSync(packPath).size === 0) return "turn wrote an empty pack";
  return undefined;
}
