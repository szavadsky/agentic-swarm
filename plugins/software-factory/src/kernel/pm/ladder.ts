import type { LiveAgents, SessionRef } from "../../harness/types.js";
import { type AgentTurnResult, runAgentTurn } from "../agent.js";
import { formatStop, makeCause } from "../cause.js";
import {
  boundaryTarget,
  compactSession,
  type TurnTarget,
} from "../flow-context.js";
import { KERNEL_TURN_STEPS } from "../outcome.js";
import { formatPlanList } from "../plan-file.js";
import { scriptMeta } from "../record.js";
import { resumableRef } from "../sessions.js";
import type {
  AliasConfig,
  KernelRuntime,
  Outcome,
  State,
  StepRecord,
  TaskFile,
} from "../types.js";
import {
  openTaskTexts,
  previousPlanBaseline,
  storePlanBulletBaseline,
} from "./plan-bullets.js";
import { planDiffPrompt, pmLadderNote, pmTurnVars } from "./prompts.js";
import {
  cancelPlanNamed,
  findingKey,
  graphFindings,
  introducedFindings,
  type PlanSnapshot,
  readTasks,
  restoreTurn,
  scopeWriteFindings,
  snapshotPlans,
  snapshotTurn,
  type TurnSnapshot,
  unfixedBaseline,
} from "./reconcile.js";
import { pmScopeKey, scopeEpic, scopePlanFile } from "./scope.js";
import type { PmMandate, PmRun, PmRung, PmScope } from "./types.js";

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
  if (!outcome) reasons.push(`no outcome (${formatStop(record.stop)})`);
  return reasons;
}

export interface PmTurnSetup {
  snapshot: TurnSnapshot;
  /** Every plan on disk: the ownership snapshot a turn is rolled back against. */
  plansBefore: PlanSnapshot[];
  /** The plan(s) this PM owns: the goal plan, or one epic's plan. */
  scopePlans: PlanSnapshot[];
  scope: PmScope;
  planList: string;
  planDiff: string;
  /** The current derive iteration; its own baseline is the previous one on a re-derive. */
  iteration: number;
  /** That scope's compacted session, resumed when the target can. */
  priorSession?: SessionRef;
  taskSnapshot: Map<string, string>;
  baseline: string[];
  baselineKeys: Set<string>;
}

/**
 * What every PM ladder takes once, before rung 1: the turn snapshot, the plan
 * list and the untouched graph's baseline findings. A saga's epic PM sees only
 * its own plan and resume its own session; the top PM still sees the goal.
 */
export async function setupPmTurn(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; scope?: PmScope },
): Promise<PmTurnSetup> {
  const scope = opts.scope ?? { kind: "goal" };
  const snapshot = await snapshotTurn(
    runtime,
    runtime.store.plans.filesOnDisk(),
  );
  const owned = scopePlanFile(runtime, scope);
  const scopePlans = snapshot.plans.some(
    (before) => before.plan.rel === owned.rel,
  )
    ? snapshot.plans.filter((before) => before.plan.rel === owned.rel)
    : await snapshotPlans(runtime, [owned]);
  const planList = formatPlanList(
    scopePlans.filter((before) => before.exists).map((before) => before.plan),
  );
  const previous = await previousPlanBaseline(runtime, opts.iteration);
  const previousScope = previous?.plans.filter((plan) =>
    scopePlans.some((before) => before.plan.rel === plan.rel),
  );
  const planDiff = planDiffPrompt(scopePlans, previousScope ?? null);
  const taskSnapshot = snapshot.tasks;
  const baseline = await graphFindings(
    runtime,
    { iteration: opts.iteration, state: opts.state, round: 1 },
    snapshot.plans,
    taskSnapshot,
  );
  const priorSession =
    previous?.sessions?.[pmScopeKey(scope)] ??
    (scope.kind === "goal" ? previous?.session : undefined);
  return {
    snapshot,
    plansBefore: snapshot.plans,
    scopePlans,
    scope,
    planList,
    planDiff,
    iteration: opts.iteration,
    ...(priorSession ? { priorSession } : {}),
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
  opts: {
    iteration: number;
    state: State;
    cwd: string;
    scope?: PmScope;
  },
): Promise<PmRun> {
  const setup = await setupPmTurn(runtime, opts);
  const rungs: PmRung[] = [];
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const result = await runPmTurn(
      runtime,
      opts,
      target,
      await rungTurnInput(runtime, setup, target, {
        round: index + 1,
        rung,
        failure,
      }),
    );
    const findings = await rungFindings(runtime, opts, setup, index + 1);
    const introduced = introducedFindings(findings, setup.baselineKeys);
    const outcome = result.outcome;
    if (outcome?.status === "done" && introduced.length === 0) {
      return acceptPmTurn(
        runtime,
        opts,
        setup,
        findings,
        outcome,
        result.record.session,
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
      index + 1,
      reasons,
      result,
      rungs,
    );
    if (exit) return exit;
    failure = reasons;
  }

  return { status: "exhausted", rungs };
}

/** The graph findings after one rung, plus the scope's own task-write check. */
async function rungFindings(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
  setup: PmTurnSetup,
  round: number,
): Promise<string[]> {
  return [
    ...(await graphFindings(
      runtime,
      { iteration: opts.iteration, state: opts.state, round },
      setup.plansBefore,
      setup.taskSnapshot,
    )),
    ...scopeWriteFindings(
      setup.scope,
      setup.taskSnapshot,
      await runtime.store.tasks.texts(),
      (await readTasks(runtime)).tasks,
    ),
  ];
}

/** One rung's prompt inputs: its plan diff, task files and de-novo retry note. */
async function rungTurnInput(
  runtime: KernelRuntime,
  setup: PmTurnSetup,
  target: TurnTarget,
  opts: { round: number; rung: PmRungStep; failure: string[] },
): Promise<PmTurnInput> {
  const { tasks } = await readTasks(runtime);
  const session =
    opts.round === 1 ? await priorPmSession(runtime, setup, target) : undefined;
  return {
    round: opts.round,
    planList: setup.planList,
    planDiff: setup.planDiff,
    tasks,
    repair:
      opts.round === 1 ? "" : pmLadderNote(opts.rung, target, opts.failure),
    ...(session ? { session } : {}),
    compact: true,
    ...NO_TURN_INPUTS,
  };
}

/**
 * The first derive turn of an iteration continues the accepted session of the
 * last derived plan, compacted at that turn's acceptance. Retries start de
 * novo, and a harness that cannot resume the recorded session starts de novo
 * with the plan diff.
 */
async function priorPmSession(
  runtime: KernelRuntime,
  setup: PmTurnSetup,
  target: TurnTarget,
): Promise<SessionRef | undefined> {
  if (!setup.priorSession) {
    return undefined;
  }
  return resumableRef(
    runtime,
    setup.priorSession,
    target,
    `the PM derive turn for iteration ${setup.iteration}`,
  );
}

/**
 * Records the failed rung and returns the ladder's exit when one is due:
 * refusal and missing or invalid outcomes climb; an infra stop does not,
 * because the alias's tiers already absorbed the infrastructure trouble.
 */
async function endFailedRung(
  runtime: KernelRuntime,
  opts: { iteration: number; scope?: PmScope },
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
  opts: { iteration: number; state: State; scope?: PmScope },
  setup: PmTurnSetup,
  findings: string[],
  outcome: Outcome,
  live: SessionRef | undefined,
  rungs: PmRung[],
): Promise<PmRun> {
  await cancelPlanNamed(runtime, opts.state, setup.scopePlans, opts.iteration);
  await storePlanBulletBaseline(
    runtime,
    opts.iteration,
    setup.scopePlans
      .filter((before) => before.exists)
      .map((before) => ({ rel: before.plan.rel, text: before.text })),
    openTaskTexts(setup.taskSnapshot, opts.state),
    live,
    setup.scope,
  );
  const remaining = unfixedBaseline(setup.baseline, findings);
  if (remaining.length > 0) {
    return { status: "architect", findings: remaining, rungs };
  }
  return { status: "done", outcome, rungs };
}

/** Records the failed rung and rolls its writes back before the next one. */
async function rejectPmRung(
  runtime: KernelRuntime,
  opts: { iteration: number; scope?: PmScope },
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
  await recordPmRejection(
    runtime,
    opts.iteration,
    round,
    reasons,
    snapshot,
    scopeEpic(opts.scope ?? { kind: "goal" }),
  );
}

/** The failed-turn record every PM route writes before its rollback. */
export async function recordPmRejection(
  runtime: KernelRuntime,
  iteration: number,
  round: number,
  reasons: string[],
  snapshot: TurnSnapshot,
  architect?: string,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(iteration, "pm-validate", {
      round,
      ...(architect ? { architect } : {}),
    }),
    { ok: false, cause: makeCause("invalid-outcome", reasons.join("; ")) },
  );
  await restoreTurn(runtime, snapshot);
}

/** A rung handles one kind of turn; every list it does not handle is `none`. */
export const NO_TURN_INPUTS = {
  steers: "none",
  stalls: "none",
  planChecks: "none",
  concerns: "none",
} as const;

interface PmTurnInput {
  round: number;
  planList: string;
  /** A derive rung's plan diff; every route that has no plan baseline passes none. */
  planDiff?: string;
  tasks: TaskFile[];
  repair: string;
  steers: string;
  stalls: string;
  planChecks: string;
  concerns: string;
  /** The session this turn continues; a first derive turn resumes the last accepted one. */
  session?: SessionRef;
  /** A derive rung compacts its ended session for the next derive to resume. */
  compact?: boolean;
  /** A steer turn only: the live session handle, for injecting a late steer. */
  onLive?: (agents: LiveAgents) => void;
}

/** A delivered derive turn compacts its session, usage included in its record. */
async function compactPmTurn(
  runtime: KernelRuntime,
  outcome: Outcome | undefined,
  live: SessionRef | undefined,
) {
  if (!live || outcome?.status !== "done") return {};
  const compacted = await compactSession(runtime, live);
  if (!compacted) return {};
  return {
    session: compacted.session,
    ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
  };
}

/** Runs one PM rung on the shared prompt contract every route uses. */
export async function runPmTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    cwd: string;
    scope?: PmScope;
  },
  target: TurnTarget,
  input: PmTurnInput,
): Promise<AgentTurnResult> {
  const epic = scopeEpic(opts.scope ?? { kind: "goal" });
  return runAgentTurn(runtime, {
    target,
    cwd: opts.cwd,
    meta: {
      iteration: opts.iteration,
      step: "pm",
      round: input.round,
      ...(epic ? { architect: epic } : {}),
    },
    vars: pmTurnVars(runtime, opts, input),
    expectation: KERNEL_TURN_STEPS.pm,
    ...(input.session ? { session: input.session } : {}),
    ...(input.onLive ? { onLive: input.onLive } : {}),
    ...(input.compact
      ? {
          settle: (_record, outcome, live) =>
            compactPmTurn(runtime, outcome, live),
        }
      : {}),
  });
}
