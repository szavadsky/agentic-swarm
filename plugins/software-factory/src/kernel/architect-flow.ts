/**
 * The architect consult as a configured step list: one flow per launch
 * reason, selected from `process.architecture.flows`. Built-in ids run the
 * kernel's architect, plan-review and PM stages; any other id runs one agent
 * turn with the prompt and alias it names.
 */
import { runAgentTurn } from "./agent.js";
import { runArchitectStage } from "./boundary-architect.js";
import { infraCause } from "./boundary-context.js";
import {
  boundaryResult,
  type BoundaryResult,
  type ConsultContext,
} from "./boundary-state.js";
import {
  reviewChangedPlans,
  runConsults,
  runPmStage,
  settleArchitectStage,
} from "./boundary-tail.js";
import { resolveTurn } from "./flow-context.js";
import { repairFields } from "./flow-context-targets.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { formatSteers } from "./mailbox.js";
import { MAIN_ARCHITECT } from "./tasks.js";
import type {
  ArchitectReason,
  ArchitectureFlow,
  ArchitectureFlowStep,
  KernelRuntime,
} from "./types.js";
import { DEFAULT_ARCHITECTURE_FLOWS } from "./types.js";

/** Non-FYI concerns the previous iteration recorded. */
function previousConcerns(context: ConsultContext): boolean {
  return context.records.some(
    (record) =>
      record.iteration === context.iteration - 1 &&
      record.endedAt !== undefined &&
      (record.outcome?.concerns ?? []).some(
        (concern) => concern.calibration !== "fyi",
      ),
  );
}

/** Why this consult ran, read from this launch's own inputs. */
function architectureReason(context: ConsultContext): ArchitectReason {
  if (context.opts.launchReason) return context.opts.launchReason;
  if (context.forArchitect.length > 0) return "steer";
  if (context.opts.relaunch) return "relaunch";
  if (previousConcerns(context)) return "concerns";
  const priorIteration = context.records.some(
    (record) =>
      record.iteration < context.iteration && record.endedAt !== undefined,
  );
  return priorIteration ? "iteration-done" : "initial";
}

/**
 * The flow a reason selects. A reason no flow names runs the `initial` flow;
 * a config with no flow naming initial runs the shipped default consult.
 */
export function architectureFlowForReason(
  process: KernelRuntime["configs"]["process"],
  reason: ArchitectReason,
): ArchitectureFlow {
  const flows = process.architecture.flows ?? [];
  const selected =
    flows.find((flow) => flow.when.includes(reason)) ??
    flows.find((flow) => flow.when.includes("initial")) ??
    DEFAULT_ARCHITECTURE_FLOWS[0]!;
  return selected;
}

/** One custom step's variables: the same boundary facts the architect reads. */
function customStepVars(context: ConsultContext): Record<string, string> {
  const { runtime } = context;
  return {
    turn: "boundary",
    iteration: String(context.iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plan_path: context.plan.path,
    checkout: runtime.paths.goalCheckout,
    pack_path: runtime.store.pathOf({
      area: "goal",
      rel: context.packRel!,
    }),
    digest_path: context.digestPath ?? "",
    steers: formatSteers(context.forArchitect),
    depth: String(runtime.configs.process.hierarchy?.depth ?? 1),
    subarchitect_block: "",
  };
}

/** The blocked result when a custom step dies on infrastructure. */
function customStepInfraBlocked(
  context: ConsultContext,
  step: ArchitectureFlowStep,
  stop: { cause: string; details?: string },
): BoundaryResult {
  return boundaryResult(context, "blocked", {
    cause: `${step.id} turn stopped on infrastructure: ${infraCause(stop)}`,
    stop: { cause: stop.cause, details: stop.details },
  });
}

/** Runs one non-built-in step as an ordinary agent turn. */
async function runCustomStep(
  context: ConsultContext,
  step: ArchitectureFlowStep,
): Promise<BoundaryResult | undefined> {
  const { runtime } = context;
  const result = await runBoundaryTurn(
    runtime,
    { iteration: context.iteration, step: step.id },
    () =>
      runAgentTurn(runtime, {
        target: {
          ...resolveTurn(
            runtime,
            step.prompt!,
            step.alias!,
            undefined,
            context.iteration,
          ),
          ...repairFields(step),
        },
        cwd: runtime.paths.goalCheckout,
        meta: {
          iteration: context.iteration,
          step: step.id,
          round: 1,
          architect: MAIN_ARCHITECT,
        },
        vars: customStepVars(context),
        expectation: "any",
      }),
  );
  const stop = result.record.stop;
  if (stop?.kind === "infra" && !result.outcome) {
    return customStepInfraBlocked(context, step, stop);
  }
  return undefined;
}

/** Runs the architect's post-turn ownership checks and epic consults. */
async function runArchitectAndTail(
  context: ConsultContext,
): Promise<BoundaryResult | undefined> {
  const architect = await runArchitectStage(context);
  if (architect) return architect;
  const settled = await settleArchitectStage(context);
  if (settled) return settled;
  return runConsults(context);
}

/**
 * Runs the selected flow in list order. The PM is the flow's last step, so its
 * result ends the consult; a flow without a PM leaves the iteration continuing
 * on whatever the earlier steps wrote.
 */
export async function runArchitectureFlow(
  context: ConsultContext,
): Promise<BoundaryResult> {
  const flow = architectureFlowForReason(
    context.runtime.configs.process,
    architectureReason(context),
  );
  for (const step of flow.steps) {
    if (step.id === "architect") {
      const result = await runArchitectAndTail(context);
      if (result) return result;
      continue;
    }
    if (step.id === "planreview") {
      await reviewChangedPlans(context);
      continue;
    }
    if (step.id === "pm") return runPmStage(context);
    const result = await runCustomStep(context, step);
    if (result) return result;
  }
  return boundaryResult(context, "continue", {
    ...(context.architect?.outcome
      ? { outcome: context.architect.outcome }
      : {}),
  });
}
