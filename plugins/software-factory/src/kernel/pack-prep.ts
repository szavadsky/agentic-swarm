import fs from "node:fs";
import path from "node:path";
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
  const packPath = path.join(runtime.store.goalDir, opts.packRel);
  fs.mkdirSync(path.dirname(packPath), { recursive: true });
  fs.rmSync(packPath, { force: true });
  const result = await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, PACK_PREP_STEP, opts.iteration),
    cwd: runtime.paths.goalCheckout,
    meta: { iteration: opts.iteration, step: PACK_PREP_STEP, round: 1 },
    vars: {
      iteration: String(opts.iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: path.join(runtime.store.goalDir, "plan.md"),
      context_data_path: path.join(runtime.store.goalDir, opts.dataRel),
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
