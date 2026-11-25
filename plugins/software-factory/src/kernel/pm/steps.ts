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
import { GOAL_PM_SCOPE, scopeEpic, scopePlanFile } from "./scope.js";
import type { PmFlowRun, PmRun, PmScope } from "./types.js";

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
  opts: {
    iteration: number;
    state: State;
    cwd: string;
    scope?: PmScope;
  },
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
  opts: {
    iteration: number;
    state: State;
    cwd: string;
    scope?: PmScope;
  },
  step: PmFlowStep,
): Promise<PmFlowRun | undefined> {
  const scope = opts.scope ?? GOAL_PM_SCOPE;
  const owned = scopePlanFile(runtime, scope);
  const plansBefore = await snapshotPlans(runtime, [owned]);
  const previous = await previousPlanBaseline(runtime, opts.iteration);
  const previousScope = previous?.plans.filter(
    (plan) => plan.rel === owned.rel,
  );
  const { tasks } = await readTasks(runtime);
  const epic = scopeEpic(scope);
  const result = await runAgentTurn(runtime, {
    target: {
      ...resolveTurn(runtime, step.prompt!, step.alias!, undefined),
      ...repairFields(step),
    },
    cwd: opts.cwd,
    meta: {
      iteration: opts.iteration,
      step: step.id,
      round: 1,
      ...(epic ? { architect: epic } : {}),
    },
    vars: pmTurnVars(runtime, opts, {
      planList: formatPlanList(
        plansBefore
          .filter((before) => before.exists)
          .map((before) => before.plan),
      ),
      planDiff: planDiffPrompt(plansBefore, previousScope ?? null),
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

/**
 * One saga's PM stage: every epic's own PM, then the top PM. The top runs last
 * so it sees the epic tasks and can wire the cross-epic DAG; a scope that
 * blocks the consult ends the stage there, and an `architect` exit from any
 * scope carries every unfixed finding to the boundary.
 */
export async function runScopedPmFlow(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; cwd: string },
  scopes: readonly PmScope[],
): Promise<PmFlowRun> {
  const findings: string[] = [];
  const rungs: PmRun["rungs"] = [];
  let lastDone: Extract<PmRun, { status: "done" }> | undefined;
  for (const scope of scopes) {
    const run = await runPmFlow(runtime, { ...opts, scope });
    if (run.status === "done") {
      lastDone = run;
      rungs.push(...run.rungs);
      continue;
    }
    if (run.status === "architect") {
      findings.push(...run.findings);
      rungs.push(...run.rungs);
      continue;
    }
    return run;
  }
  if (findings.length > 0) {
    return { status: "architect", findings: [...new Set(findings)], rungs };
  }
  if (!lastDone) {
    throw new Error("the PM stage ran no scope");
  }
  return { status: "done", outcome: lastDone.outcome, rungs };
}
