// biome-ignore-all lint/complexity: split-flow-dispatch
/**
 * The architect phase: one turn (with a de-novo retry after an infra death),
 * its steered-subarchitect lifecycle and the infra boundary check. The rest of
 * the boundary's first half lives in `boundary-stage.ts`.
 */
import type { LiveAgents, SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { resumableSession, snapshotPlan } from "./architect-session.js";
import { infraCause, taskSnapshot } from "./boundary-context.js";
import {
  collectSteered,
  recordSteerFailures,
  steeredHosting,
  type SteeredHosting,
} from "./boundary-steer.js";
import { boundaryResult, type ConsultContext } from "./boundary-state.js";
import {
  boundaryTarget,
  compactSession,
  subarchitectTarget,
} from "./flow-context.js";
import { subarchitectDelivery } from "./hierarchy.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { formatSteers } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { snapshotPlans } from "./pm.js";
import { MAIN_ARCHITECT } from "./tasks.js";

/** The architect's turn with one de-novo retry after an infra death. */
async function architectTurn(
  context: ConsultContext,
  session: SessionRef | undefined,
  steered: SteeredHosting | undefined,
  turn: string,
) {
  return runBoundaryTurn(
    context.runtime,
    { iteration: context.iteration, step: "architect" },
    () =>
      runAgentTurn(context.runtime, {
        // Resolved per attempt: a quota death exhausts the alias.
        target: boundaryTarget(context.runtime, "architect", context.iteration),
        cwd: context.runtime.paths.goalCheckout,
        meta: {
          iteration: context.iteration,
          step: "architect",
          round: 1,
          architect: MAIN_ARCHITECT,
        },
        vars: {
          turn,
          iteration: String(context.iteration),
          intent_path: context.runtime.store.pathOf({
            area: "goal",
            rel: "intent.md",
          }),
          plan_path: context.plan.path,
          checkout: context.runtime.paths.goalCheckout,
          pack_path: context.runtime.store.pathOf({
            area: "goal",
            rel: context.packRel!,
          }),
          digest_path: context.digestPath ?? "",
          steers: formatSteers(context.forArchitect),
          depth: String(context.runtime.configs.process.hierarchy?.depth ?? 1),
          subarchitect_block: steered?.block ?? "",
        },
        expectation: KERNEL_TURN_STEPS.architect,
        session,
        ...(steered
          ? {
              opaque: { agents: steered.agents },
              onLive: (agents: LiveAgents) => steered.start(agents),
            }
          : {}),
        settle: async (_record, outcome, live) => {
          if (!live || outcome?.decision !== "continue") return {};
          const compacted = await compactSession(context.runtime, live);
          if (!compacted) return {};
          return {
            session: compacted.session,
            ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
          };
        },
      }),
  );
}

/**
 * Runs the architect, retrying once de novo after an infra death; a second
 * infra death ends the launch as infra, never blocked-by-user. A resumed
 * session that overflowed already spent the retry and is terminal. Steered
 * children run inside the architect's session and are collected after it closes.
 */
export async function runArchitectStage(
  context: ConsultContext,
): Promise<ReturnType<typeof boundaryResult> | undefined> {
  const { runtime } = context;
  const target = boundaryTarget(runtime, "architect", context.iteration);
  context.tasksBefore = await taskSnapshot(runtime.store);
  context.plansBefore = await snapshotPlans(
    runtime,
    runtime.store.plans.filesOnDisk(),
  );
  context.planBefore = snapshotPlan(context.plan.path);
  const session = await resumableSession(
    runtime,
    context.records,
    (record) => record.step === "architect",
    target,
  );
  const turn = context.records.some((r) => r.step === "architect")
    ? context.opts.relaunch
      ? "relaunch"
      : "boundary"
    : "first";
  // Only a harness advertising `subagents: "steer"` hosts its subarchitects as
  // named children of this session; every other harness gets the written report.
  const depth = runtime.configs.process.hierarchy?.depth ?? 1;
  const delivery =
    depth === 2
      ? await subarchitectDelivery(
          subarchitectTarget(runtime, context.iteration),
        )
      : "report";
  const steered =
    delivery === "steer"
      ? await steeredHosting(runtime, {
          iteration: context.iteration,
          turn,
          packRel: context.packRel!,
          goalPlanFile: context.plan,
          ...(context.digestPath ? { digestPath: context.digestPath } : {}),
          tasks: context.tasks,
          state: context.state,
          records: context.records,
        })
      : undefined;

  let result = await architectTurn(context, session, steered, turn);
  const stop = result.record.stop;
  const overflowTerminal =
    session !== undefined &&
    stop?.kind === "infra" &&
    stop.cause === "overflow";
  const infraDied = stop?.kind === "infra" && !result.outcome?.decision;
  if (!overflowTerminal && infraDied)
    result = await architectTurn(context, undefined, steered, turn);
  context.architect = result;

  // The architect's process has closed, so the live handle is over. Whatever a
  // child delivered is a real subarchitect consult; an epic without one falls
  // through to the written-report turn in the tail.
  await recordSteerFailures(
    runtime,
    context.iteration,
    (await steered?.stop()) ?? [],
  );
  const collected = steered
    ? await collectSteered(runtime, steered, {
        iteration: context.iteration,
        ...(result.record.session ? { parent: result.record.session } : {}),
        ...(result.record.transcript
          ? { transcript: result.record.transcript }
          : {}),
      })
    : undefined;
  if (collected?.failure) {
    return boundaryResult(context, "blocked", {
      cause: collected.failure.cause,
      ...(collected.failure.stop ? { stop: collected.failure.stop } : {}),
      outcome: result.outcome,
    });
  }
  context.steeredDone = collected?.delivered ?? new Map();

  const architectStop = result.record.stop;
  if (architectStop?.kind === "infra" && !result.outcome?.decision) {
    return boundaryResult(context, "blocked", {
      cause: `architect turn stopped on infrastructure: ${infraCause(architectStop)}`,
      stop: { cause: architectStop.cause, details: architectStop.details },
      outcome: result.outcome,
    });
  }
  return undefined;
}
