// biome-ignore-all lint/complexity: split-flow-dispatch
/**
 * The boundary's first half: task/state init, the plan checker, the digest,
 * steer partitioning and the scripted pack. The architect turn lives in
 * `boundary-architect.ts`; each phase either mutates the shared context or
 * returns the iteration's result.
 */
import fs from "node:fs";
import path from "node:path";
import { recordedBaseGates } from "./baseline.js";
import {
  codeMap,
  expireSelfHolds,
  openRecords,
  ownedPlanText,
  previousSummary,
  previousWaste,
  spikeFindings,
  unavailableAliases,
} from "./boundary-context.js";
import { runSpikeSteer } from "./boundary-spike.js";
import type { BoundaryOptions } from "./boundary-state.js";
import { boundaryResult, type ConsultContext } from "./boundary-state.js";
import { makeCause } from "./cause.js";
import {
  type ContextPackInput,
  forwardedConcerns,
  readyAging,
  recordsForAudience,
  renderContextData,
  renderContextPack,
} from "./context-pack.js";
import { derive, openDebts } from "./derive.js";
import { writeLaunchDigest } from "./digest.js";
import { carryIntentSteers, intentChanges } from "./intent.js";
import { runKeptLand } from "./integrate.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  collectSteerRoutes,
  expireHold,
  formatPmAnswers,
  type Hold,
  markProcessed,
  readHolds,
  type Steer,
  scanInbox,
  writeOutbox,
} from "./mailbox.js";
import { PACK_PREP_STEP, runPackPreparer } from "./pack-prep.js";
import {
  consultGate,
  latestPlanCheck,
  openWork,
  PLAN_CHECK_STEP,
  runPlanCheckRound,
} from "./plan-check.js";
import { goalPlan } from "./plan-file.js";
import { latestPlanReview } from "./plan-review.js";
import { scriptMeta } from "./record.js";
import type { KernelRuntime } from "./types.js";
import { integrationHead } from "./worktree.js";

/** Loads the task/record state a consult starts from and the cross-task hooks. */
export async function prepareBoundary(
  runtime: KernelRuntime,
  opts: BoundaryOptions,
): Promise<ConsultContext> {
  const tasks = await runtime.store.listTasks();
  let records = await runtime.store.listRecords();
  let state = derive(tasks, records, runtime.configs.process.flows);
  const iteration = opts.iteration ?? state.iteration + 1;
  // R10: kept green branches land before the pack renders, so the pack shows
  // the result and the PM plans from landed state. No new task, no agent turn.
  await runKeptLand(runtime, iteration);
  records = await runtime.store.listRecords();
  state = derive(tasks, records, runtime.configs.process.flows);
  // A steer's hold must never gate the task its own route created.
  await expireSelfHolds(runtime, tasks, iteration);
  const plan = goalPlan(runtime.store.goalDir);
  const steers = (await runtime.store) ? await scanInbox(runtime.store) : [];
  return {
    runtime,
    opts,
    tasks,
    records,
    state,
    iteration,
    plan,
    steers,
    seenSteers: [],
    forArchitect: [],
    pmAnswers: [],
  };
}

/** The plan checker runs before the architect; a follow-up skips the consult. */
export async function runChecker(
  context: ConsultContext,
): Promise<ReturnType<typeof boundaryResult> | undefined> {
  const { runtime } = context;
  const gate = consultGate({
    plan: await runtime.store.plans.exists(),
    open: openWork(context.state),
    steerWaiting: context.steers.length > 0,
    records: context.records,
    bound: runtime.limits.planCheckRounds,
  });
  if (gate !== "check") return undefined;
  // `planCheckRounds` bounds the rounds one consult owns, wherever they ran.
  const round =
    context.records.filter(
      (record) =>
        record.iteration === context.iteration &&
        record.actor === "agent" &&
        record.step === PLAN_CHECK_STEP &&
        record.endedAt,
    ).length + 1;
  const checked = await runBoundaryTurn(
    runtime,
    { iteration: context.iteration, step: PLAN_CHECK_STEP },
    () =>
      runPlanCheckRound(runtime, {
        iteration: context.iteration,
        round,
        state: context.state,
      }),
  );
  if (checked.status === "architect") {
    return boundaryResult(context, "continue", {
      cause: `PM ladder routed to the architect: ${checked.findings.join("; ")}`,
    });
  }
  if (checked.continued.length > 0) return boundaryResult(context, "continue");
  return undefined;
}

/** After a checker pass the consult reads the records it wrote. */
export async function refreshAfterChecker(
  context: ConsultContext,
): Promise<void> {
  context.records = await context.runtime.store.listRecords();
  context.state = derive(
    context.tasks,
    context.records,
    context.runtime.configs.process.flows,
  );
}

export async function writeDigest(context: ConsultContext): Promise<void> {
  fs.mkdirSync(context.runtime.paths.sessionsDir, { recursive: true });
  const digestRel =
    (context.opts.digest ?? context.opts.relaunch) && context.records.length > 0
      ? await runBoundaryTurn(
          context.runtime,
          { iteration: context.iteration, step: "digest" },
          () =>
            writeLaunchDigest(
              context.runtime,
              context.iteration,
              context.records,
            ),
        )
      : null;
  context.digestPath = digestRel
    ? context.runtime.store.pathOf({ area: "goal", rel: digestRel })
    : undefined;
  context.packRel =
    context.opts.frontPack ??
    context.runtime.store.iterations.rel(context.iteration, "context-pack.md");
  context.seenSteers = context.steers.map((steer) => steer.id);
}

type SteerAction = "architect" | "handled" | "skip";

/** A PM-handled steer is answered here; only architect/unrouted ones are presented. */
async function steerAction(
  context: ConsultContext,
  routes: ReturnType<typeof collectSteerRoutes>,
  steer: Steer,
): Promise<SteerAction> {
  const { runtime } = context;
  const routed = routes.get(steer.id);
  if (routed?.route === "spike")
    return runSpikeSteer(
      context.runtime,
      context.tasks,
      context.state,
      context.records,
      steer,
    );
  if (routed?.route !== "task") return "architect";
  if (!routed.answer) return "architect";
  // A `task` steer still in the inbox is a crash between the PM's answer and
  // its mark-processed: answer it from the stored route now.
  await writeOutbox(
    runtime.store,
    steer.id,
    `# Steer ${steer.id}\n\n${routed.answer}\n\nSource: ${steer.relPath}`,
  );
  await markProcessed(runtime.store, steer);
  await expireHold(runtime.store, steer.id);
  return "handled";
}

/**
 * Splits the inbox: answered steers leave it, architect/unrouted ones stay.
 * An intent steer is carried here only when the steer PM crashed before its
 * own carry landed; the pack still shows the architect the diff and the steer.
 */
export async function partitionSteers(context: ConsultContext): Promise<void> {
  const routes = collectSteerRoutes(context.records);
  // The steer PM carries an intent steer when it commits the route; this call
  // repairs a route whose turn crashed before its record landed. Either way
  // the pack below shows the architect the diff and the still-pending steer.
  await carryIntentSteers(context.runtime, {
    iteration: context.iteration,
    steers: context.steers,
    routes,
    records: context.records,
  });
  context.records = await context.runtime.store.listRecords();
  context.intentChanges = intentChanges({
    records: context.records,
    steers: context.steers,
    routes,
    recordsDir: context.runtime.store.recordsDir,
  });
  for (const steer of context.steers) {
    const action = await steerAction(context, routes, steer);
    if (action === "architect") context.forArchitect.push(steer);
  }
  context.pmAnswers = formatPmAnswers(routes);
}

/** Holds are advisory input; an unreadable file is logged, never fatal. */
async function readHoldsSafe(context: ConsultContext): Promise<Hold[]> {
  try {
    return (await readHolds(context.runtime.store)).holds;
  } catch (err) {
    console.warn(
      `[factory] pending-steer holds unreadable: ${(err as Error).message}`,
    );
    return [];
  }
}

/** The pack input for one goal consult: every fact its templates render. */
async function packInput(context: ConsultContext): Promise<ContextPackInput> {
  const { runtime } = context;
  const holds = await readHoldsSafe(context);
  const aged = agedReady(context, holds);
  // A debt any active plan owns leaves the register, whichever architect wrote it.
  const planText = await ownedPlanText(runtime);
  return {
    goal: path.basename(runtime.paths.goalDir),
    iteration: context.iteration,
    intentPath: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    planPath: context.plan.path,
    checkout: runtime.paths.goalCheckout,
    integrationBranch: runtime.paths.integrationBranch,
    headHash: await integrationHead(runtime),
    recordsDir: runtime.store.pathOf({ area: "records" }),
    tasksDir: runtime.store.tasks.dir,
    previousSummary: await previousSummary(
      runtime.store,
      context.iteration - 1,
    ),
    previousWaste: await previousWaste(runtime.store, context.iteration - 1),
    digestPath: context.digestPath,
    tasks: context.tasks,
    state: context.state,
    spikeFindings: await spikeFindings(
      runtime.store,
      context.records,
      context.tasks,
    ),
    codeMap: await codeMap(runtime.paths.goalCheckout),
    steers: context.forArchitect,
    holds,
    pmAnswers: context.pmAnswers,
    intentChanges: context.intentChanges,
    ...(await packGovernance(context, planText)),
    agedReady: aged,
  };
}

/** Ready tasks that started no turn in the segment just ended. */
function agedReady(
  context: ConsultContext,
  holds: Hold[],
): ReturnType<typeof readyAging> | undefined {
  if (context.iteration <= 1) return undefined;
  return readyAging({
    tasks: context.tasks,
    state: context.state,
    records: context.records,
    segment: context.iteration - 1,
    pendingSteers: context.steers.map((steer) => steer.id),
    holds,
    unavailableAliases: unavailableAliases(
      context.runtime,
      context.tasks,
      context.state,
      context.records,
      context.iteration,
    ),
  });
}

type PackGovernance = Pick<
  ContextPackInput,
  | "setup"
  | "gates"
  | "baseGates"
  | "forwarded"
  | "debts"
  | "openRecords"
  | "planCheck"
  | "planReview"
  | "runConfigPath"
>;

/** The goal-wide policy and evidence sections the pack templates render. */
async function packGovernance(
  context: ConsultContext,
  planText: string,
): Promise<PackGovernance> {
  const { runtime } = context;
  return {
    setup: runtime.configs.repo.setup,
    gates: runtime.configs.repo.gates,
    baseGates: recordedBaseGates(context.records),
    forwarded: forwardedConcerns(context.records, {
      tasks: context.tasks,
      audience: { kind: "goal" },
    }),
    debts: openDebts(
      recordsForAudience(context.records, context.tasks, { kind: "goal" }),
      planText,
    ),
    runConfigPath: context.opts.runConfigPath,
    openRecords: await openRecords(runtime.store),
    planCheck: latestPlanCheck(context.records),
    planReview: latestPlanReview(context.records),
  };
}

/** Renders the pack: an agent index after iteration 1, the script render on failure. */
export async function writePack(context: ConsultContext): Promise<void> {
  if (context.opts.frontPack) return;
  const { runtime } = context;
  const input = await packInput(context);
  const dataRel = runtime.store.iterations.rel(
    context.iteration,
    "context-data.json",
  );
  await runtime.store.iterations.write(
    context.iteration,
    "context-data.json",
    renderContextData(input),
  );
  const packRel = context.packRel!;
  // After the first iteration a cheap agent turns the full status into the
  // index. The script render is the first iteration's pack and every fallback.
  const prepFailure =
    context.iteration > 1
      ? await runBoundaryTurn(
          runtime,
          { iteration: context.iteration, step: PACK_PREP_STEP },
          () =>
            runPackPreparer(runtime, {
              iteration: context.iteration,
              packRel,
              dataRel,
            }),
        )
      : undefined;
  if (context.iteration === 1 || prepFailure !== undefined) {
    await runtime.store.writeFile(packRel, renderContextPack(input));
    if (prepFailure !== undefined)
      await recordPackFallback(context, prepFailure);
  }
}

async function recordPackFallback(
  context: ConsultContext,
  failure: string,
): Promise<void> {
  await context.runtime.store.appendRecord(
    scriptMeta(context.iteration, "packprep-fallback"),
    {
      ok: false,
      launchKind: "glitch",
      cause: makeCause(
        "invalid-outcome",
        `pack preparer failed: ${failure}; the script render is this iteration's pack`,
      ),
    },
  );
}
