import fs from "node:fs";
import { runAgentTurn } from "./agent.js";
import { boundaryTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import type { KernelRuntime } from "./types.js";

/** Agent step of the pack-preparer boundary turn; slug-less, outside task turn counts. */
export const PACK_PREP_STEP = "packprep";

/**
 * Resolves the configured alias and its fallback alias chain from run config.
 */
export function packPreparerAliases(
  runtime: KernelRuntime,
  rootAlias: string,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  const walk = (aliasName: string) => {
    if (seen.has(aliasName)) return;
    seen.add(aliasName);
    chain.push(aliasName);
    const aliasConfig = runtime.configs.run.aliases[aliasName];
    if (!aliasConfig) return;
    for (const fallback of aliasConfig.fallbacks ?? []) {
      if ("alias" in fallback) {
        walk(fallback.alias);
      }
    }
  };
  walk(rootAlias);
  return chain;
}

function evaluatePreparerResult(
  result: Awaited<ReturnType<typeof runAgentTurn>>,
  packPath: string,
): string | undefined {
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    return `turn stopped on infrastructure: ${
      stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
    }`;
  }
  const outcome = result.outcome;
  if (!outcome) {
    return "turn produced no outcome";
  }
  if (outcome.status !== "done") {
    return `turn declared ${outcome.status}: ${outcome.summary}`;
  }
  if (!fs.existsSync(packPath)) {
    return "turn wrote no pack";
  }
  if (fs.statSync(packPath).size === 0) {
    return "turn wrote an empty pack";
  }
  return undefined;
}

async function runPreparerAlias(
  runtime: KernelRuntime,
  opts: { iteration: number; packRel: string; dataRel: string },
  alias: string,
  round: number,
  packPath: string,
): Promise<string | undefined> {
  fs.rmSync(packPath, { force: true });
  const target = boundaryTarget(runtime, PACK_PREP_STEP, opts.iteration, alias);
  const result = await runAgentTurn(runtime, {
    target,
    cwd: runtime.paths.goalCheckout,
    meta: { iteration: opts.iteration, step: PACK_PREP_STEP, round },
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
  return evaluatePreparerResult(result, packPath);
}

/**
 * One pack-preparer turn: the cheap agent reads the script's derived status
 * data and writes the iteration's index pack. The preparer tries its alias
 * fallback chain from run config; every failure advances to the next alias.
 * If all fail, the cause is returned so the boundary can record the glitch
 * and render the bounded script pack.
 */
export async function runPackPreparer(
  runtime: KernelRuntime,
  opts: { iteration: number; packRel: string; dataRel: string },
): Promise<string | undefined> {
  const packPath = await runtime.store.localPath({
    area: "goal",
    rel: opts.packRel,
  });
  const rootTarget = boundaryTarget(runtime, PACK_PREP_STEP, opts.iteration);
  const aliases = packPreparerAliases(runtime, rootTarget.alias);
  let lastFailure: string | undefined;

  for (let i = 0; i < aliases.length; i++) {
    const failure = await runPreparerAlias(
      runtime,
      opts,
      aliases[i]!,
      i + 1,
      packPath,
    );
    if (!failure) return undefined;
    lastFailure = failure;
  }
  return lastFailure ?? "turn wrote no pack";
}
