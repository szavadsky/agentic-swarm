/**
 * The boundary's first half: task/state init, the digest, steer partitioning
 * and the scripted pack. The plan-checker pass lives in `boundary-checker.ts`,
 * the architect turn in `boundary-architect.ts`, and the saga passes in
 * `boundary-saga.ts`; each phase either mutates the shared context or returns
 * the iteration's result.
 */
import fs from "node:fs";
import path from "node:path";
import { recordedBaseGates } from "./baseline.js";
import {
  expireSelfHolds,
  openRecords,
  ownedPlanText,
  previousSummary,
  previousWaste,
  recordedPackHashes,
  spikeFindings,
  unavailableAliases,
} from "./boundary-context.js";
import { runSpikeSteer } from "./boundary-spike.js";
import type { BoundaryOptions, ConsultContext } from "./boundary-types.js";
import { makeCause } from "./cause.js";
import {
  type ContextPackInput,
  contextDataRelPath,
  forwardedConcerns,
  goalDebtRecords,
  type PlanReviewPack,
  readyAging,
  renderContextData,
  renderContextPack,
} from "./context-pack.js";
import { derive, openDebts } from "./derive.js";
import { writeLaunchDigest } from "./digest.js";
import { packGates } from "./infra.js";
import { contextCodeMap } from "./ingestion.js";
import { runKeptLand } from "./integrate.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { carryIntentSteers, intentChanges } from "./intent.js";
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
import {
  DEFAULT_WASTE_SPIKE_THRESHOLD,
  readWasteMetrics,
  wasteSpikeProposals,
} from "./metrics/recurring.js";
import { PACK_PREP_STEP, runPackPreparer } from "./pack-prep.js";
import { latestPlanCheck } from "./plan-check.js";
import { goalPlan } from "./plan-file.js";
import { latestPlanReview } from "./plan-review.js";
import {
  planBulletEditFindings,
  runSteerPm,
  steerEpicOf,
  steerScopeGroups,
} from "./pm.js";
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
    forEpicArchitect: new Map(),
    epicSteersAnswered: new Set(),
    pmAnswers: [],
  };
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

/** Steer ids an earlier boundary already put before the architect. */
function presentedSteers(records: ConsultContext["records"]): Set<string> {
  return new Set(
    records
      .filter((record) => record.step === "steer-presented" && record.slug)
      .map((record) => record.slug as string),
  );
}

/**
 * An idle-arriving steer has no committed route, so before the architect's
 * turn it takes the same PM steer-routing rung dispatch runs mid-iteration:
 * the PM may answer it, carry it into the intent, or route it to the
 * architect. `intent` and `architect` routes stay pending, so the pack below
 * still shows the steer; a route that fails leaves it for the architect.
 * Before the first plan there is no PM turn: the steer goes to the architect.
 *
 * A steer an earlier boundary already presented is left alone: the PM has had
 * its one chance and the architect is the owner's consumer. An urgent steer is
 * the owner's exception, exactly as dispatch treats it: no PM turn.
 */
export async function routeUnroutedSteers(
  context: ConsultContext,
): Promise<void> {
  const routed = collectSteerRoutes(context.records);
  const presented = presentedSteers(context.records);
  const claim = context.steers.filter(
    (steer) =>
      !steer.urgent && !routed.has(steer.id) && !presented.has(steer.id),
  );
  if (claim.length === 0) return;
  await runBoundaryTurn(
    context.runtime,
    { iteration: context.iteration, step: "pm" },
    async () => {
      for (const group of steerScopeGroups(context.runtime, claim)) {
        await runSteerPm(context.runtime, {
          iteration: context.iteration,
          state: context.state,
          tasks: context.tasks,
          steers: group.steers,
          scope: group.scope,
          cwd: context.runtime.paths.goalCheckout,
        });
      }
      return undefined;
    },
  );
  // A routed task or spike writes files the pack and the architect must see.
  context.records = await context.runtime.store.listRecords();
  context.tasks = await context.runtime.store.listTasks();
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
  const epicOf = steerEpicOf(context.runtime, context.steers);
  for (const steer of context.steers) {
    const action = await steerAction(context, routes, steer);
    if (action !== "architect") continue;
    const epic = epicOf.get(steer.id);
    if (epic === undefined) {
      context.forArchitect.push(steer);
      continue;
    }
    const waiting = context.forEpicArchitect.get(epic) ?? [];
    waiting.push(steer);
    context.forEpicArchitect.set(epic, waiting);
  }
  // The top pack reads the goal's own steer answers; an epic's answer is its
  // architect's business, never the top's.
  const goalAnswers = new Map(
    [...routes].filter(([, route]) => route.architect === undefined),
  );
  context.pmAnswers = formatPmAnswers(goalAnswers);
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
  const hashes = await recordedPackHashes(
    runtime.store,
    context.records,
    context.iteration,
  );
  return {
    goal: path.basename(runtime.paths.goalDir),
    iteration: context.iteration,
    intentPath: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    planPath: context.plan.path,
    checkout: runtime.paths.goalCheckout,
    integrationBranch: runtime.paths.integrationBranch,
    headHash: await integrationHead(runtime),
    ...hashes,
    recordsDir: runtime.store.pathOf({ area: "records" }),
    tasksDir: runtime.store.tasks.dir,
    previousSummary: await previousSummary(
      runtime.store,
      context.iteration - 1,
    ),
    previousWaste: await previousWaste(runtime.store, context.iteration - 1),
    dataPath: runtime.store.pathOf({
      area: "goal",
      rel: contextDataRelPath(context.iteration),
    }),
    spikeProposals: wasteSpikeProposals(
      await readWasteMetrics(runtime.store),
      runtime.configs.process.wasteSpikeThreshold ??
        DEFAULT_WASTE_SPIKE_THRESHOLD,
    ),
    digestPath: context.digestPath,
    tasks: context.tasks,
    state: context.state,
    spikeFindings: await spikeFindings(
      runtime.store,
      context.records,
      context.tasks,
    ),
    codeMap: await contextCodeMap(runtime),
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
    gates: packGates(runtime.store.goalDir, runtime.configs.repo.gates),
    baseGates: recordedBaseGates(context.records),
    forwarded: forwardedConcerns(context.records, {
      tasks: context.tasks,
      audience: { kind: "goal" },
    }),
    debts: openDebts(
      goalDebtRecords(context.records, context.tasks, context.state.epics),
      planText,
    ),
    runConfigPath: context.opts.runConfigPath,
    openRecords: await openRecords(runtime.store),
    planCheck: latestPlanCheck(context.records),
    planReview: await planReviewWithKernel(context),
  };
}

/**
 * The latest reviewer findings plus the kernel's open-bullet edits. A plan
 * return answers the reviewer findings; an edit no reviewer raised still has
 * to reach the architect, and a config without a return turn reads it here.
 */
async function planReviewWithKernel(
  context: ConsultContext,
): Promise<PlanReviewPack | undefined> {
  const review = latestPlanReview(context.records);
  const kernel = await planBulletEditFindings(
    context.runtime,
    context.tasks,
    context.state,
  );
  if (!review && kernel.length === 0) return undefined;
  return {
    iteration: review?.iteration ?? context.iteration,
    reviewers: review?.reviewers ?? [],
    technical: [...(review?.technical ?? []), ...kernel],
    planNotes: review?.planNotes ?? [],
  };
}

/**
 * Renders the pack: one script render, briefed where the preparer decided. A
 * refresh after the bottom-up report pass skips the preparer: its one turn
 * already ran on the pre-report pack, and the reports must reach the top
 * architect before its turn, not spend a second prep turn.
 */
export async function writePack(
  context: ConsultContext,
  opts: { prepare?: boolean } = {},
): Promise<void> {
  if (context.opts.frontPack) return;
  const { runtime } = context;
  const input = await packInput(context);
  const dataRel = contextDataRelPath(context.iteration);
  await runtime.store.iterations.write(
    context.iteration,
    "context-data.json",
    renderContextData(input),
  );
  // After the first iteration a cheap agent reads the full status and returns
  // the sections it judges better as a pointer and one line. The script
  // renders the single index either way; the preparer never authors it.
  const preparer =
    opts.prepare !== false && context.iteration > 1
      ? await runBoundaryTurn(
          runtime,
          { iteration: context.iteration, step: PACK_PREP_STEP },
          () =>
            runPackPreparer(runtime, {
              iteration: context.iteration,
              dataRel,
            }),
        )
      : undefined;
  const briefs =
    opts.prepare === false
      ? context.packBriefs
      : preparer && "briefs" in preparer
        ? preparer.briefs
        : undefined;
  if (opts.prepare !== false && preparer && "briefs" in preparer)
    context.packBriefs = preparer.briefs;
  await runtime.store.writeFile(
    context.packRel!,
    renderContextPack({ ...input, ...(briefs ? { briefs } : {}) }),
  );
  if (preparer !== undefined && "failure" in preparer)
    await recordPackFallback(context, preparer.failure);
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
