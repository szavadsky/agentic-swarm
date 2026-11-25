import { z } from "zod";
import { runAgentTurn } from "./agent.js";
import type { PackBrief } from "./context-pack/types.js";
import { packBriefSchema } from "./context-pack/sections.js";
import { boundaryTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { outcomeExampleVar } from "./outcome-example.js";
import type { KernelRuntime, Outcome } from "./types.js";
import { outcomeSchema } from "./types.js";
import type { PackPreparerReport } from "./pack-prep-types.js";

/** Agent step of the pack-preparer boundary turn; slug-less, outside task turn counts. */
export const PACK_PREP_STEP = "packprep";

/**
 * The pack-preparer's outcome: the kernel shape plus the sections it judged
 * better as a pointer and one line. The script renders the pack from these
 * briefs; the turn writes no pack.
 */
export const packPreparerOutcomeSchema = outcomeSchema.extend({
  packBriefs: z
    .array(packBriefSchema)
    .optional()
    .describe(
      "one entry per index section to name with a pointer and this one-line summary; a section you omit renders whole",
    ),
});

/** The `outcome_schema` example for a pack-preparer turn, including its `packBriefs`. */
export function packPreparerOutcomeSchemaVar(): string {
  return outcomeExampleVar("pack-preparer", "any", packPreparerOutcomeSchema);
}

/** The preparer's briefs; the agent's outcome was parsed with the extended schema. */
function briefsOf(outcome: Outcome): PackBrief[] {
  return (outcome as Outcome & { packBriefs?: PackBrief[] }).packBriefs ?? [];
}

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
): PackPreparerReport {
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    return {
      failure: `turn stopped on infrastructure: ${
        stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
      }`,
    };
  }
  const outcome = result.outcome;
  if (!outcome) {
    return { failure: "turn produced no outcome" };
  }
  if (outcome.status !== "done") {
    return { failure: `turn declared ${outcome.status}: ${outcome.summary}` };
  }
  return { briefs: briefsOf(outcome) };
}

async function runPreparerAlias(
  runtime: KernelRuntime,
  opts: { iteration: number; dataRel: string },
  alias: string,
  round: number,
): Promise<PackPreparerReport> {
  const target = boundaryTarget(runtime, PACK_PREP_STEP, alias);
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
      checkout: runtime.paths.goalCheckout,
      outcome_schema: packPreparerOutcomeSchemaVar(),
    },
    expectation: KERNEL_TURN_STEPS[PACK_PREP_STEP],
    outcomeSchema: packPreparerOutcomeSchema,
  });
  return evaluatePreparerResult(result);
}

/**
 * One pack-preparer turn: the cheap agent reads the script's derived status
 * data and returns the sections it judges better as a pointer and one line.
 * The preparer tries its alias fallback chain from run config; every failure
 * advances to the next alias. If all fail, the failure is returned so the
 * boundary can record the glitch and render every section whole.
 */
export async function runPackPreparer(
  runtime: KernelRuntime,
  opts: { iteration: number; dataRel: string },
): Promise<PackPreparerReport> {
  const rootTarget = boundaryTarget(runtime, PACK_PREP_STEP);
  const aliases = packPreparerAliases(runtime, rootTarget.alias);
  let lastFailure = "turn produced no outcome";

  for (let i = 0; i < aliases.length; i++) {
    const report = await runPreparerAlias(runtime, opts, aliases[i]!, i + 1);
    if ("briefs" in report) return report;
    lastFailure = report.failure;
  }
  return { failure: lastFailure };
}
