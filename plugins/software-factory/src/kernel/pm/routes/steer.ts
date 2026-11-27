import type { AgentTurnResult } from "../../agent.js";
import { makeCause } from "../../cause.js";
import { boundaryTarget, type TurnTarget } from "../../flow-context.js";
import { carryIntentSteers } from "../../intent.js";
import {
  answerFromStoredRoute,
  formatSteerRoute,
  formatSteerTurn,
  isArchitectRoute,
  type Steer,
} from "../../mailbox.js";
import { scriptMeta } from "../../record.js";
import type { LiveSteerSessions } from "../../sessions.js";
import type { KernelRuntime, Outcome, State, TaskFile } from "../../types.js";
import { ensureSteerHold } from "../holds.js";
import {
  failureReasons,
  NO_TURN_INPUTS,
  recordPmRejection,
  rungSteps,
  runPmTurn,
  setupPmTurn,
} from "../ladder.js";
import { steerLadderNote } from "../prompts.js";
import {
  introducedFindings,
  readTasks,
  restoreTurn,
  unfixedBaseline,
} from "../reconcile.js";
import {
  GOAL_PM_SCOPE,
  pmScopeKey,
  scopeEpic,
  steerScopeOf,
} from "../scope.js";
import type {
  PmRungStep,
  PmScope,
  PmTurnSetup,
  SteerPmRun,
  TurnSnapshot,
} from "../types.js";
import { SteerClaim } from "./steer-claim.js";
import { validateSteerTurn } from "./steer-validate.js";

/** One steer PM run: the claimed batch, the snapshot's state and its cwd. */
interface SteerPmOpts {
  iteration: number;
  state: State;
  tasks: TaskFile[];
  steers: Steer[];
  cwd: string;
  /** The epic whose PM routes this batch; absent is the goal's top PM. */
  scope?: PmScope;
  /** The dispatch watch's live session; the boundary has none and queues. */
  liveSteers?: LiveSteerSessions;
  /** The run's seen set learns a steer injected mid-turn. */
  onClaim?: (steer: Steer) => void;
}

/**
 * PM ladder for steers dropped mid-iteration. Each claimed steer gets one
 * route: `task` amends a pending task or writes a rework task and is answered
 * in the outbox now; `spike` writes a standalone task answered when it lands;
 * `architect` waits for the next boundary with its hold; `stall` drains the
 * goal with `goal: true` and waits for the architect. The record uses the PM
 * step, so it stays out of the item's turn count and prices into iteration spend.
 *
 * Accepted routes commit to a `steer-routes` script record; a failed rung's
 * routes die with its rollback, so the boundary never reads them. A legacy
 * turn with no `steerRoutes` keeps the old contract: any write is restored and
 * the steer reaches the architect. An exhausted ladder falls back the
 * same way, so a steer turn never blocks dispatch; an infra stop commits a
 * route set that validated and keeps the steer with its consumer. Findings the graph
 * already raised before the first rung do not fail a rung: they come back as
 * `architect`. With no plan every claimed steer is the architect's, who takes
 * it into the whole plan.
 *
 * A steer arriving while a rung is live is injected into that session when the
 * harness offers `steerSession` and the steer belongs to this PM's scope: it
 * joins this turn's claim and is routed by the same outcome, so no second PM
 * starts. A steer of another scope stays queued and the watch wakes the loop
 * for its own PM turn. Without `steerSession`, or at the boundary's PM where
 * no watch runs, the steer stays queued for its next PM turn.
 */
export async function runSteerPm(
  runtime: KernelRuntime,
  opts: SteerPmOpts,
): Promise<SteerPmRun> {
  if (!(await runtime.store.plans.exists())) {
    return { status: "architect", routes: [], findings: [] };
  }
  const setup = await setupPmTurn(runtime, opts);
  const scope = opts.scope ?? GOAL_PM_SCOPE;
  const claim = new SteerClaim(
    opts.steers,
    (steer) => pmScopeKey(steerScopeOf(runtime, steer)) === pmScopeKey(scope),
    runtime.prompts,
    opts.onClaim,
  );
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const round = index + 1;
    const target = boundaryTarget(runtime, "pm", rung.alias);
    const result = await runSteerTurn(
      runtime,
      opts,
      target,
      rung,
      round,
      setup,
      failure,
      claim,
    );
    const settled = await settleSteerRung(
      runtime,
      opts,
      claim,
      setup,
      result,
      round,
    );
    if ("run" in settled) return settled.run;
    failure = settled.failure;
  }
  return steerExhausted(failure);
}

type RungSettlement = { run: SteerPmRun } | { failure: string[] };

/**
 * What one finished rung means: a finished run, or the reasons that send the
 * ladder to its next alias with the claim intact.
 */
async function settleSteerRung(
  runtime: KernelRuntime,
  opts: SteerPmOpts,
  claim: SteerClaim,
  setup: PmTurnSetup,
  result: AgentTurnResult,
  round: number,
): Promise<RungSettlement> {
  const outcome = result.outcome;
  if (outcome?.steerRoutes === undefined) {
    return {
      run: await steerWithoutRoutes(runtime, setup.snapshot, opts.iteration),
    };
  }
  const findings = await validateSteerTurn(
    runtime,
    { ...opts, round, claim: claim.all() },
    setup.plansBefore,
    setup.taskSnapshot,
    outcome,
  );
  const introduced = introducedFindings(findings, setup.baselineKeys);
  const stop = result.record.stop;
  if (
    introduced.length === 0 &&
    (outcome.status === "done" || stop?.kind === "infra")
  ) {
    return {
      run: await routedRung(
        runtime,
        opts,
        claim,
        setup,
        outcome.steerRoutes,
        findings,
        round,
        stop?.kind === "infra" ? stop : undefined,
      ),
    };
  }
  const reasons = failureReasons(outcome, introduced, result.record);
  const exit = await rejectSteerRung(
    runtime,
    opts,
    round,
    reasons,
    setup.snapshot,
    result,
  );
  return exit ? { run: exit } : { failure: reasons };
}

/**
 * A validated route set: accepted normally, or committed when the harness
 * stops on infrastructure. A committed set keeps the steer with the consumer
 * its route names instead of dropping it for the next launch to claim again;
 * the intent carry waits for a boundary, which repairs that route's edit.
 */
async function routedRung(
  runtime: KernelRuntime,
  opts: SteerPmOpts,
  claim: SteerClaim,
  setup: PmTurnSetup,
  routes: NonNullable<Outcome["steerRoutes"]>,
  findings: string[],
  round: number,
  infra: Extract<SteerPmRun, { status: "infra" }>["stop"] | undefined,
): Promise<SteerPmRun> {
  if (infra === undefined) {
    return acceptSteerRoutes(
      runtime,
      opts,
      claim.byId(),
      routes,
      setup.baseline,
      findings,
      round,
    );
  }
  await commitSteerRoutes(
    runtime,
    opts.iteration,
    opts.scope,
    claim.byId(),
    routes,
    round,
  );
  return { status: "infra", stop: infra };
}

/** An exhausted ladder sends its last findings, or the bare exhaustion, out. */
function steerExhausted(failure: string[]): SteerPmRun {
  return {
    status: "architect",
    routes: [],
    findings:
      failure.length > 0
        ? failure
        : ["the steer ladder exhausted without a route"],
  };
}

/** Records a failed rung; an infra stop still ends the ladder. */
async function rejectSteerRung(
  runtime: KernelRuntime,
  opts: { iteration: number; scope?: PmScope },
  round: number,
  reasons: string[],
  snapshot: TurnSnapshot,
  result: AgentTurnResult,
): Promise<SteerPmRun | undefined> {
  await recordPmRejection(
    runtime,
    opts.iteration,
    round,
    reasons,
    snapshot,
    scopeEpic(opts.scope ?? { kind: "goal" }),
  );
  if (result.record.stop?.kind === "infra") {
    return { status: "infra", stop: result.record.stop };
  }
  return undefined;
}

/** Runs one steer rung on the shared PM prompt contract. */
async function runSteerTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    cwd: string;
    scope?: PmScope;
    liveSteers?: LiveSteerSessions;
  },
  target: TurnTarget,
  rung: PmRungStep,
  round: number,
  setup: PmTurnSetup,
  failure: string[],
  claim: SteerClaim,
): Promise<AgentTurnResult> {
  const { tasks } = await readTasks(runtime);
  try {
    return await runPmTurn(runtime, opts, target, {
      round,
      planList: setup.planList,
      tasks,
      repair:
        round === 1
          ? ""
          : steerLadderNote(runtime.prompts, rung, target, failure),
      ...NO_TURN_INPUTS,
      steers: formatSteerTurn(claim.all()),
      onLive: (agents) => claim.attach(agents, opts.liveSteers),
    });
  } finally {
    claim.detach();
  }
}

/** A legacy steer turn routes nothing: any write is rolled back. */
async function steerWithoutRoutes(
  runtime: KernelRuntime,
  snapshot: TurnSnapshot,
  iteration: number,
): Promise<SteerPmRun> {
  const restored = await restoreTurn(runtime, snapshot);
  const files = [
    ...restored.plans,
    ...restored.tasks.map((slug) => `tasks/${slug}.md`),
  ];
  if (files.length > 0) {
    await runtime.store.appendRecord(scriptMeta(iteration, "steer-reconcile"), {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        `steer turn changed ${files.join(", ")}; restored: a steer structures holds and writes no task file or plan`,
      ),
    });
  }
  return {
    status: "architect",
    routes: [],
    findings: [
      "the steer turn produced no steerRoutes; the steers reach the architect",
    ],
  };
}

/**
 * Carries every accepted intent steer into the goal's intent before anything
 * else reads it: the edit lands now, and the next boundary shows the architect
 * the diff and the steer. The boundary retries only a route that crashed
 * between its commit and this turn.
 */
async function carryAcceptedIntents(
  runtime: KernelRuntime,
  iteration: number,
  claim: ReadonlyMap<string, Steer>,
  accepted: NonNullable<Outcome["steerRoutes"]>,
): Promise<void> {
  const intentRoutes = accepted.filter((entry) => entry.route === "intent");
  if (intentRoutes.length === 0) return;
  await carryIntentSteers(runtime, {
    iteration,
    steers: intentRoutes.flatMap((entry) => {
      const steer = claim.get(entry.steer);
      return steer ? [steer] : [];
    }),
    routes: new Map(
      intentRoutes.map((entry) => [entry.steer, { route: entry.route }]),
    ),
    records: await runtime.store.listRecords(),
  });
}

/**
 * Commits a validated route set: one script record, then each route's answer
 * or hold. The boundary reads routes from this record only, never from the
 * agent rung outcomes: a failed rung's routes die with its rollback.
 */
async function commitSteerRoutes(
  runtime: KernelRuntime,
  iteration: number,
  scope: PmScope | undefined,
  claim: ReadonlyMap<string, Steer>,
  routes: NonNullable<Outcome["steerRoutes"]>,
  round: number,
): Promise<NonNullable<Outcome["steerRoutes"]>> {
  const accepted = [...routes].sort((a, b) => a.steer.localeCompare(b.steer));
  const architect = scopeEpic(scope ?? { kind: "goal" });
  await runtime.store.appendRecord(
    scriptMeta(iteration, "steer-routes", {
      round,
      ...(architect ? { architect } : {}),
    }),
    {
      ok: true,
      outcome: {
        status: "done",
        summary: `steer routes: ${accepted.map((entry) => `${entry.steer}=${formatSteerRoute(entry.route)}`).join(", ")}`,
        concerns: [],
        forward: [],
        steerRoutes: accepted,
      },
    },
  );
  for (const entry of routes) {
    const steer = claim.get(entry.steer);
    if (!steer) continue;
    if (entry.route === "task") {
      await answerFromStoredRoute(
        runtime.store,
        steer,
        entry.answer?.trim() ?? "",
      );
    } else {
      await ensureSteerHold(runtime, steer.id, entry.route);
    }
  }
  return accepted;
}

/** Commits the accepted routes, carries their intent edits, and exits. */
async function acceptSteerRoutes(
  runtime: KernelRuntime,
  opts: { iteration: number; scope?: PmScope },
  claim: ReadonlyMap<string, Steer>,
  routes: NonNullable<Outcome["steerRoutes"]>,
  baseline: string[],
  findings: string[],
  round: number,
): Promise<SteerPmRun> {
  const accepted = await commitSteerRoutes(
    runtime,
    opts.iteration,
    opts.scope,
    claim,
    routes,
    round,
  );
  await carryAcceptedIntents(runtime, opts.iteration, claim, accepted);
  const remaining = unfixedBaseline(baseline, findings);
  // `stall` drains the goal and an intent steer still needs its next consult;
  // both are the same outlet as architect, so the caller runs the boundary.
  const architectRoute = accepted.some(
    (entry) =>
      entry.route === "intent" ||
      isArchitectRoute(entry.route) ||
      entry.route === "stall",
  );
  return architectRoute || remaining.length > 0
    ? { status: "architect", routes: accepted, findings: remaining }
    : { status: "routed", routes: accepted };
}
