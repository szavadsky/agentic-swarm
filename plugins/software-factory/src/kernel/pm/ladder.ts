import { type AgentTurnResult, runAgentTurn } from "../agent.js";
import { makeCause } from "../cause.js";
import { boundaryTarget, type TurnTarget } from "../flow-context.js";
import { holdsDir } from "../mailbox.js";
import { KERNEL_TURN_STEPS } from "../outcome.js";
import { formatPlanList } from "../plan-file.js";
import { scriptMeta } from "../record.js";
import type {
  AliasConfig,
  KernelRuntime,
  Outcome,
  State,
  StepRecord,
  TaskFile,
} from "../types.js";
import { existingTasks, pmLadderNote } from "./prompts.js";
import { openTaskTexts, storePlanBulletBaseline } from "./plan-bullets.js";
import {
  cancelPlanNamed,
  findingKey,
  graphFindings,
  introducedFindings,
  type PlanSnapshot,
  readTasks,
  restoreTurn,
  snapshotTurn,
  type TurnSnapshot,
  unfixedBaseline,
} from "./reconcile.js";
import type { PmMandate, PmRung, PmRun } from "./types.js";

export interface PmRungStep {
  alias: string;
  mandate: PmMandate;
}

/**
 * The ladder is the alias chain from the PM alias through `escalateTo`, two
 * turns per tier: the first and one de-novo retry. The chain is built once; a
 * cycle is a config error pre-flight rejects.
 */
export function rungSteps(runtime: KernelRuntime): PmRungStep[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let name: string | undefined = boundaryTarget(runtime, "pm").alias;
  while (name) {
    if (seen.has(name)) {
      throw new Error(`PM escalation cycle: ${[...seen, name].join(" -> ")}`);
    }
    seen.add(name);
    const alias: AliasConfig | undefined = runtime.configs.run.aliases[name];
    if (!alias)
      throw new Error(
        `run config has no alias "${name}" (needed by role "pm")`,
      );
    chain.push(name);
    name = alias.escalateTo;
  }
  return chain.flatMap((alias, tier) => {
    const escalated = tier > 0;
    return [
      { alias, mandate: escalated ? "escalated-first" : "first" },
      { alias, mandate: escalated ? "escalated-retry" : "retry" },
    ];
  });
}

function stopText(stop: StepRecord["stop"]): string {
  if (!stop) return "no stop";
  return "cause" in stop ? `${stop.kind}: ${stop.cause}` : stop.kind;
}

/** Why a rung is not usable: its outcome status, concerns, findings or stop. */
export function failureReasons(
  outcome: Outcome | undefined,
  findings: string[],
  record: StepRecord,
): string[] {
  const reasons: string[] = [];
  if (outcome && outcome.status !== "done") {
    reasons.push(`status ${outcome.status}: ${outcome.summary}`);
    for (const concern of outcome.concerns) {
      reasons.push(`${concern.kind}/${concern.calibration}: ${concern.text}`);
    }
  }
  reasons.push(...findings);
  if (!outcome) reasons.push(`no outcome (${stopText(record.stop)})`);
  return reasons;
}

export interface PmTurnSetup {
  snapshot: TurnSnapshot;
  plansBefore: PlanSnapshot[];
  planList: string;
  taskSnapshot: Map<string, string>;
  baseline: string[];
  baselineKeys: Set<string>;
}

/**
 * What every PM ladder takes once, before rung 1: the turn snapshot, the plan
 * list and the untouched graph's baseline findings.
 */
export async function setupPmTurn(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
): Promise<PmTurnSetup> {
  const plans = runtime.store.plans.registered();
  const snapshot = await snapshotTurn(runtime, plans);
  const plansBefore = snapshot.plans;
  const planList = formatPlanList(
    plansBefore.filter((before) => before.exists).map((before) => before.plan),
  );
  const taskSnapshot = snapshot.tasks;
  const baseline = await graphFindings(
    runtime,
    { iteration: opts.iteration, state: opts.state, round: 1 },
    plansBefore,
    taskSnapshot,
  );
  return {
    snapshot,
    plansBefore,
    planList,
    taskSnapshot,
    baseline,
    baselineKeys: new Set(baseline.map(findingKey)),
  };
}

/**
 * PM ladder: each tier gets its first turn and one de-novo retry; a failed rung
 * is rolled back before the next. The next alias in the chain escalates with a
 * broader mandate; an infra stop ends the ladder because a stronger model does
 * not cure quota or crash trouble the fallbacks already absorbed. Only an
 * escalated `blocked` stops with a question, and an exhausted ladder reports
 * every rung as alias, model and failure.
 *
 * The untouched graph is validated once before rung 1: a rung fails only on
 * findings its turn introduced, because a pre-existing finding is not the PM's
 * to derive away. A turn that introduces none while the baseline still stands
 * is kept — its valid writes apply and the plan's cancellations run — and the
 * ladder ends `architect` with the baseline findings for the next consult.
 */
export async function runPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; cwd: string },
): Promise<PmRun> {
  const setup = await setupPmTurn(runtime, opts);
  const rungs: PmRung[] = [];
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const round = index + 1;
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const { tasks } = await readTasks(runtime);
    const result = await runPmTurn(runtime, opts, target, {
      round,
      planList: setup.planList,
      tasks,
      repair: round === 1 ? "" : pmLadderNote(rung, target, failure),
      steers: "none",
      stalls: "none",
      planChecks: "none",
    });
    const findings = await graphFindings(
      runtime,
      { iteration: opts.iteration, state: opts.state, round },
      setup.plansBefore,
      setup.taskSnapshot,
    );
    const introduced = introducedFindings(findings, setup.baselineKeys);
    const outcome = result.outcome;
    if (outcome?.status === "done" && introduced.length === 0) {
      return acceptPmTurn(
        runtime,
        opts,
        setup.plansBefore,
        setup.taskSnapshot,
        setup.baseline,
        findings,
        outcome,
        rungs,
      );
    }
    const reasons = failureReasons(outcome, introduced, result.record);
    const exit = await endFailedRung(
      runtime,
      opts,
      setup.snapshot,
      target,
      rung,
      round,
      reasons,
      result,
      rungs,
    );
    if (exit) return exit;
    failure = reasons;
  }

  return { status: "exhausted", rungs };
}

/**
 * Records the failed rung and returns the ladder's exit when one is due:
 * refusal and missing or invalid outcomes climb; an infra stop does not,
 * because the alias's tiers already absorbed the infrastructure trouble.
 */
async function endFailedRung(
  runtime: KernelRuntime,
  opts: { iteration: number },
  snapshot: TurnSnapshot,
  target: TurnTarget,
  rung: PmRungStep,
  round: number,
  reasons: string[],
  result: AgentTurnResult,
  rungs: PmRung[],
): Promise<PmRun | undefined> {
  await rejectPmRung(runtime, opts, snapshot, target, round, reasons, rungs);
  if (result.record.stop?.kind === "infra") {
    return { status: "infra", stop: result.record.stop, rungs };
  }
  if (
    result.outcome?.status === "blocked" &&
    rung.mandate.startsWith("escalated")
  ) {
    return { status: "asked", outcome: result.outcome, rungs };
  }
  return undefined;
}

/**
 * The turn's writes are usable: keep them and run every plan's cancellations.
 * Only a finding the turn did not introduce remains, and no rung can fix it.
 * The accepted derive turn stores the plan bullets it wrote task files from,
 * so the next plan return can report an edit to an open bullet.
 */
async function acceptPmTurn(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
  baseline: string[],
  findings: string[],
  outcome: Outcome,
  rungs: PmRung[],
): Promise<PmRun> {
  await cancelPlanNamed(runtime, opts.state, plansBefore, opts.iteration);
  await storePlanBulletBaseline(
    runtime,
    opts.iteration,
    plansBefore
      .filter((before) => before.exists)
      .map((before) => ({ rel: before.plan.rel, text: before.text })),
    openTaskTexts(taskSnapshot, opts.state),
  );
  const remaining = unfixedBaseline(baseline, findings);
  if (remaining.length > 0) {
    return { status: "architect", findings: remaining, rungs };
  }
  return { status: "done", outcome, rungs };
}

/** Records the failed rung and rolls its writes back before the next one. */
async function rejectPmRung(
  runtime: KernelRuntime,
  opts: { iteration: number },
  snapshot: TurnSnapshot,
  target: TurnTarget,
  round: number,
  reasons: string[],
  rungs: PmRung[],
): Promise<void> {
  rungs.push({
    round,
    alias: target.alias,
    model: target.model.id,
    failure: reasons.join("; "),
  });
  await recordPmRejection(runtime, opts.iteration, round, reasons, snapshot);
}

/** The failed-turn record every PM route writes before its rollback. */
export async function recordPmRejection(
  runtime: KernelRuntime,
  iteration: number,
  round: number,
  reasons: string[],
  snapshot: TurnSnapshot,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(iteration, "pm-validate", { round }),
    { ok: false, cause: makeCause("invalid-outcome", reasons.join("; ")) },
  );
  await restoreTurn(runtime, snapshot);
}

interface PmTurnInput {
  round: number;
  planList: string;
  tasks: TaskFile[];
  repair: string;
  steers: string;
  stalls: string;
  planChecks: string;
}

/** Runs one PM rung on the shared prompt contract every route uses. */
export async function runPmTurn(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; cwd: string },
  target: TurnTarget,
  input: PmTurnInput,
): Promise<AgentTurnResult> {
  return runAgentTurn(runtime, {
    target,
    cwd: opts.cwd,
    meta: { iteration: opts.iteration, step: "pm", round: input.round },
    vars: {
      iteration: String(opts.iteration),
      intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
      plans: input.planList,
      tasks_dir: runtime.store.tasks.dir,
      existing_tasks: existingTasks(opts.state, input.tasks),
      repair: input.repair,
      steers: input.steers,
      holds_dir: holdsDir(runtime.store),
      stalls: input.stalls,
      plan_checks: input.planChecks,
    },
    expectation: KERNEL_TURN_STEPS.pm,
  });
}
