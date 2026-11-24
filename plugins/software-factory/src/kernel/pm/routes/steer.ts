import type { AgentTurnResult } from "../../agent.js";
import { makeCause } from "../../cause.js";
import { boundaryTarget, type TurnTarget } from "../../flow-context.js";
import { carryIntentSteers } from "../../intent.js";
import {
  expireHold,
  formatSteerRoute,
  formatSteerTurn,
  isArchitectRoute,
  markProcessed,
  type Steer,
  writeOutbox,
} from "../../mailbox.js";
import { scriptMeta } from "../../record.js";
import { LiveSteerSessions } from "../../sessions.js";
import type {
  KernelRuntime,
  Outcome,
  State,
  SteerRoute,
  TaskFile,
} from "../../types.js";
import {
  architectHoldProblem,
  ensureSteerHold,
  selfHoldProblem,
  stallHoldProblem,
} from "../holds.js";
import {
  failureReasons,
  NO_TURN_INPUTS,
  type PmRungStep,
  type PmTurnSetup,
  recordPmRejection,
  rungSteps,
  runPmTurn,
  setupPmTurn,
} from "../ladder.js";
import { steerLadderNote } from "../prompts.js";
import {
  introducedFindings,
  type PlanSnapshot,
  readTasks,
  reconcileTurn,
  restoreTurn,
  type TurnSnapshot,
  unfixedBaseline,
} from "../reconcile.js";
import type { PmInfraStop, SteerRouteEntry } from "../types.js";
import { SteerClaim } from "./steer-claim.js";
import { steerWriteFindings } from "./steer-writes.js";

/**
 * A steer turn's result. `architect` is the outlet for anything the PM cannot
 * decide: a claimed steer routed there, a graph finding no rung can derive
 * away, or a ladder that exhausted with no route at all. The boundary is the
 * only consumer of those, so the caller runs it before dispatch.
 */
export type SteerPmRun =
  | { status: "routed"; routes: NonNullable<Outcome["steerRoutes"]> }
  | {
      status: "architect";
      routes: NonNullable<Outcome["steerRoutes"]>;
      findings: string[];
    }
  | { status: "infra"; stop: PmInfraStop };

async function validateSteerTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    round: number;
    claim: Steer[];
  },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const { findings, texts, tasks, parseFindings } = await reconcileTurn(
    runtime,
    opts,
    plansBefore,
    taskSnapshot,
  );
  const routes = outcome?.steerRoutes ?? [];
  const claimed = new Set(opts.claim.map((steer) => steer.id));
  const scan = scanSteerRoutes(routes, claimed);
  findings.push(...scan.findings);
  findings.push(...unroutedSteerFindings(opts.claim, scan.routeOf));
  findings.push(
    ...(await steerRouteDetailFindings(runtime, routes, claimed, tasks)),
  );
  if (parseFindings.length === 0) {
    findings.push(
      ...steerWriteFindings(
        routes,
        claimed,
        scan.routeOf,
        taskSnapshot,
        texts,
        tasks,
      ),
    );
  }
  return [...new Set(findings)];
}

/** Each claimed steer is routed once, and only claimed steers are routed. */
function scanSteerRoutes(
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
): { routeOf: Map<string, SteerRoute>; findings: string[] } {
  const seen = new Set<string>();
  const routeOf = new Map<string, SteerRoute>();
  const findings: string[] = [];
  for (const entry of routes) {
    if (seen.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" is routed twice; route each claimed steer once`,
      );
      continue;
    }
    seen.add(entry.steer);
    routeOf.set(entry.steer, entry.route);
    if (!claimed.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" was not claimed this turn; route only the pending steers from this turn`,
      );
    }
  }
  return { routeOf, findings };
}

function unroutedSteerFindings(
  claim: readonly Steer[],
  routeOf: ReadonlyMap<string, SteerRoute>,
): string[] {
  const findings: string[] = [];
  for (const steer of claim) {
    if (!routeOf.has(steer.id)) {
      findings.push(
        `steer "${steer.id}" has no route; route each claimed steer as task|spike|intent|architect|stall or {architect: id}`,
      );
    }
  }
  return findings;
}

/** The answer and hold each route must carry, and the self-hold guard. */
async function steerRouteDetailFindings(
  runtime: KernelRuntime,
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
  tasks: readonly TaskFile[],
): Promise<string[]> {
  const findings: string[] = [];
  for (const entry of routes) {
    if (!claimed.has(entry.steer)) continue;
    findings.push(...steerAnswerFindings(entry));
    findings.push(...(await steerHoldFindings(runtime, entry, tasks)));
  }
  return findings;
}

/** Only a task route answers now; every other route carries no answer. */
function steerAnswerFindings(entry: SteerRouteEntry): string[] {
  const answer = entry.answer?.trim() ?? "";
  if (entry.route === "task") {
    return answer
      ? []
      : [
          `steer "${entry.steer}" routed task needs an answer; the PM answers a task steer in the outbox now`,
        ];
  }
  return answer
    ? [
        `steer "${entry.steer}" routed ${formatSteerRoute(entry.route)} must not carry an answer; only task answers now`,
      ]
    : [];
}

async function steerHoldFindings(
  runtime: KernelRuntime,
  entry: SteerRouteEntry,
  tasks: readonly TaskFile[],
): Promise<string[]> {
  const findings: string[] = [];
  if (entry.route === "stall") {
    const problem = await stallHoldProblem(runtime, entry.steer);
    if (problem) findings.push(problem);
  }
  if (entry.route === "intent" || isArchitectRoute(entry.route)) {
    const label = entry.route === "intent" ? "intent" : "architect";
    const problem = await architectHoldProblem(runtime, entry.steer, label);
    if (problem) findings.push(problem);
  }
  const selfHeld = await selfHoldProblem(runtime, entry.steer, tasks);
  if (selfHeld) findings.push(selfHeld);
  return findings;
}

/** One steer PM run: the claimed batch, the snapshot's state and its cwd. */
interface SteerPmOpts {
  iteration: number;
  state: State;
  tasks: TaskFile[];
  steers: Steer[];
  cwd: string;
  /** The dispatch watch's live session; the boundary has none and queues. */
  liveSteers?: LiveSteerSessions;
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
 * the steer reaches the architect. An exhausted or infra-stopped ladder falls
 * back the same way, so a steer turn never blocks dispatch. Findings the graph
 * already raised before the first rung do not fail a rung: they come back as
 * `architect`. With no plan every claimed steer is the architect's, who takes
 * it into the whole plan.
 *
 * A steer arriving while a rung is live is injected into that session when the
 * harness offers `steerSession`; it joins this turn's claim and is routed by
 * the same outcome, so no second PM starts. Without it, or at the boundary's
 * PM where no watch runs, the steer stays queued for its next PM turn.
 */
export async function runSteerPm(
  runtime: KernelRuntime,
  opts: SteerPmOpts,
): Promise<SteerPmRun> {
  if (!(await runtime.store.plans.exists())) {
    return { status: "architect", routes: [], findings: [] };
  }
  const setup = await setupPmTurn(runtime, opts);
  const claim = new SteerClaim(opts.steers);
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const round = index + 1;
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
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
  if (outcome.status === "done" && introduced.length === 0) {
    return {
      run: await acceptSteerRoutes(
        runtime,
        opts,
        claim.byId(),
        outcome.steerRoutes,
        setup.baseline,
        findings,
        round,
      ),
    };
  }
  const reasons = failureReasons(outcome, introduced, result.record);
  const exit = await rejectSteerRung(
    runtime,
    opts.iteration,
    round,
    reasons,
    setup.snapshot,
    result,
  );
  return exit ? { run: exit } : { failure: reasons };
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
  iteration: number,
  round: number,
  reasons: string[],
  snapshot: TurnSnapshot,
  result: AgentTurnResult,
): Promise<SteerPmRun | undefined> {
  await recordPmRejection(runtime, iteration, round, reasons, snapshot);
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
      repair: round === 1 ? "" : steerLadderNote(rung, target, failure),
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

/** Commits the accepted routes, applies their holds or answers, and exits. */
async function acceptSteerRoutes(
  runtime: KernelRuntime,
  opts: { iteration: number },
  claim: ReadonlyMap<string, Steer>,
  routes: NonNullable<Outcome["steerRoutes"]>,
  baseline: string[],
  findings: string[],
  round: number,
): Promise<SteerPmRun> {
  const accepted = [...routes].sort((a, b) => a.steer.localeCompare(b.steer));
  // The boundary reads routes from this record only, never from the agent
  // rung outcomes: a failed rung's routes die with its rollback.
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, "steer-routes", { round }),
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
      const answer = entry.answer?.trim() ?? "";
      await writeOutbox(
        runtime.store,
        steer.id,
        `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
      );
      await markProcessed(runtime.store, steer);
      await expireHold(runtime.store, steer.id);
    } else {
      await ensureSteerHold(runtime, steer.id, entry.route);
    }
  }
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
