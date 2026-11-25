/** The PM flow: its configured steps and the runner that walks them. */
import { runAgentTurn } from "../agent.js";
import { resolveTurn } from "../flow-context.js";
import { repairFields } from "../flow-context-targets.js";
import { formatPlanList } from "../plan-file.js";
import type { KernelRuntime, PmFlowStep, State } from "../types.js";
import { DEFAULT_PM_FLOW_STEPS } from "../types.js";
import { NO_TURN_INPUTS, runPm } from "./ladder.js";
import { previousPlanBaseline } from "./plan-bullets.js";
import { planDiffPrompt, pmTurnVars } from "./prompts.js";
import { readTasks, snapshotPlans } from "./reconcile.js";
import type { PmFlowRun, PmRun } from "./types.js";

/** Script step committing a stall turn's routes; one record per park-decision turn. */
export const STALL_ROUTES_STEP = "stall-routes";

/** Script step committing a plan-check turn's routes; one record per checker round. */
export const PLAN_CHECK_ROUTES_STEP = "plan-check-routes";

/** The built-in PM flow step that runs the PM ladder. */
const DERIVE_STEP = "derive";

/** The configured PM steps; a config that names none runs the derive turn alone. */
export function pmFlowSteps(runtime: KernelRuntime): readonly PmFlowStep[] {
  return runtime.configs.process.pm?.steps ?? DEFAULT_PM_FLOW_STEPS;
}

/**
 * The PM stage as its configured step list: the `derive` step runs the PM
 * ladder, and every other id runs one PM-role agent turn on its own prompt and
 * alias. Steps run in list order, so a config adds an agent before or after the
 * derive turn without a kernel change.
 *
 * A derive result that already blocks the consult (`asked`, `infra`,
 * `exhausted`) ends the flow there; a custom step that dies on infrastructure
 * blocks it too, naming the step. Every other result keeps walking.
 */
export async function runPmFlow(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; cwd: string },
): Promise<PmFlowRun> {
  let derived: PmRun | undefined;
  for (const step of pmFlowSteps(runtime)) {
    if (step.id === DERIVE_STEP) {
      const pm = await runPm(runtime, opts);
      if (pm.status !== "done" && pm.status !== "architect") return pm;
      derived = pm;
      continue;
    }
    const blocked = await runPmFlowStep(runtime, opts, step);
    if (blocked) return blocked;
  }
  if (!derived) {
    throw new Error(
      `the PM flow names no "${DERIVE_STEP}" step to derive tasks`,
    );
  }
  return derived;
}

/**
 * One config-only PM step: an ordinary PM-role turn whose prompt reads the
 * same plan and task facts the derive turn reads. Only an infrastructure stop
 * is the flow's problem; any delivered outcome is the step's own record.
 */
async function runPmFlowStep(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; cwd: string },
  step: PmFlowStep,
): Promise<PmFlowRun | undefined> {
  const plansBefore = await snapshotPlans(
    runtime,
    runtime.store.plans.registered(),
  );
  const previous = await previousPlanBaseline(runtime, opts.iteration);
  const { tasks } = await readTasks(runtime);
  const result = await runAgentTurn(runtime, {
    target: {
      ...resolveTurn(
        runtime,
        step.prompt!,
        step.alias!,
        undefined,
        opts.iteration,
      ),
      ...repairFields(step),
    },
    cwd: opts.cwd,
    meta: { iteration: opts.iteration, step: step.id, round: 1 },
    vars: pmTurnVars(runtime, opts, {
      planList: formatPlanList(
        plansBefore
          .filter((before) => before.exists)
          .map((before) => before.plan),
      ),
      planDiff: planDiffPrompt(plansBefore, previous?.plans ?? null),
      tasks,
      repair: "",
      ...NO_TURN_INPUTS,
    }),
    expectation: "any",
  });
  const stop = result.record.stop;
  if (stop?.kind === "infra" && !result.outcome) {
    return { status: "step-infra", step: step.id, stop };
  }
  return undefined;
}
