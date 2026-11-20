// biome-ignore-all lint/complexity: split-flow-dispatch
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRunLock, type RunLockHandle } from "../cli/lock.js";
import { Repo } from "../core/git/repo.js";
import type { Harness, ModelRef } from "../harness/types.js";
import { type BoundaryResult, runBoundary } from "./boundary.js";
import { artifactLspConfigPath, writeArtifactLsp } from "./artifact-lsp.js";
import { formatCause, makeCause } from "./cause.js";
import {
  configFilePaths,
  loadConfigs,
  resolveGoalPaths,
  toLimits,
} from "./config.js";
import { derive, FRONT_STOP_STEP } from "./derive.js";
import { postLaunchDigest } from "./digest.js";
import { readFrontClass } from "./flow-context.js";
import {
  type DispatchResult,
  iterationSpend,
  iterationStart,
  runDispatch,
  settledTurns,
} from "./dispatch.js";
import { runFront } from "./front.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  type Hold,
  type Steer,
  collectSteerRoutes,
  isArchitectRoute,
  readHolds,
  scanInbox,
  sweepHolds,
} from "./mailbox.js";
import { rolesByStep, writeMetrics } from "./metrics.js";
import type { PriceSource } from "./openrouter.js";
import { loadPriceTable } from "./openrouter.js";
import { runSteerPm, type SteerPmRun } from "./pm.js";
import {
  acpxOptionFindings,
  DEFAULT_MIN_TMP_FREE_BYTES,
  type ModelCatalog,
  PreflightError,
  preflight,
  tmpHeadroom,
} from "./preflight.js";
import { loadPrompts } from "./prompts.js";
import { loadPoolResets } from "./quota-pools.js";
import { scriptMeta } from "./record.js";
import { recoverLaunch } from "./recovery.js";
import { RESUME_REFUSED_STEP, RESUME_STEP, resumeVerdict } from "./resume.js";
import { createLaunchSessions } from "./sessions.js";
import {
  createDrainController,
  type DrainController,
  type DrainSignal,
} from "./signals.js";
import { statusSource, writeStatus } from "./status.js";
import { createFolderStore } from "./store.js";
import { writeEpicSummaries } from "./epic-summary.js";
import { writeIterationSummary } from "./summary.js";
import type {
  Cause,
  GoalDecision,
  HarnessConfig,
  KernelRuntime,
  State,
  StepRecord,
} from "./types.js";
import { BaseFollowConflictError } from "./worktree.js";

export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchError";
  }
}

export interface HarnessFactoryContext {
  /** Per-launch store: `<sessions.dir>/<goal>/<launch-id>/`. */
  sessionDir: string;
  scouts?: ModelRef;
  /** Run-config harness entries; each acpx entry binds one harness id. */
  harnesses?: Record<string, HarnessConfig>;
  /** Provider cache window from `sessions.retention`; omp overlay and session stamp share it. */
  retention?: "short" | "long";
  /** Run-config `envAllowlist`: names a harness child inherits on top of the base set. */
  envAllowlist?: readonly string[];
  /** Artifact LSP enabled by the run config: the canonical config each omp turn installs. */
  lsp?: { config: string };
}

export type HarnessFactory = (
  context: HarnessFactoryContext,
) => Record<string, Harness> | Promise<Record<string, Harness>>;

export interface RunGoalOptions {
  repo: string;
  goal: string;
  iterations?: number;
  runConfigPath?: string;
  /** Inject ready harnesses (fake harness in tests); skips the factory. */
  harnesses?: Record<string, Harness>;
  harnessFactory?: HarnessFactory;
  modelCatalog?: ModelCatalog;
  binaries?: Record<string, string | undefined>;
  signals?: DrainController;
  baseGates?: boolean;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}

export type LaunchStop =
  | "done"
  | "blocked"
  | "iteration-limit"
  | "interrupted"
  | "infra";

export interface LaunchResult {
  goal: string;
  iterations: number;
  state: State;
  lastSummary?: string;
  stop: LaunchStop;
  /** Why the launch stopped: the pre-iteration failure, or the infrastructure stop that ended it. */
  cause?: string;
  interruptedBy?: DrainSignal;
  recoveredRecords: number;
}

/**
 * Why a relaunch into an interrupted iteration must not resume it, or
 * undefined when it may. Hold reads that fail refuse resume: the holds
 * decide which ready work is runnable. Brakes follow the drain that stopped
 * the previous run; the boundary is their only resolver.
 */
async function resumeGate(
  runtime: KernelRuntime,
  before: State,
  records: StepRecord[],
): Promise<{ holds: Hold[]; refusal?: string }> {
  const { store, limits } = runtime;
  let holds: Hold[];
  try {
    const read = await readHolds(store, {
      knownSlugs: Object.keys(before.tasks),
    });
    holds = read.holds;
    const malformed = read.findings.filter((f) => f.kind === "malformed");
    if (malformed.length > 0) {
      return {
        holds,
        refusal: `unreadable hold file: ${malformed.map((f) => `${f.file} (${f.reason})`).join("; ")}`,
      };
    }
  } catch (err) {
    return {
      holds: [],
      refusal: `holds could not be read: ${(err as Error).message}`,
    };
  }
  const pendingSteers = new Set((await scanInbox(store)).map((s) => s.id));
  const verdict = resumeVerdict(before, records, holds, pendingSteers, limits);
  if (!verdict.resume) return { holds, refusal: verdict.cause };
  if (holds.some((h) => h.goal === true && pendingSteers.has(h.steer))) {
    return { holds, refusal: "a pending steer holds the goal" };
  }
  if (limits.iterationTurns !== undefined) {
    const used = settledTurns(records, before.iteration);
    if (used >= limits.iterationTurns) {
      return {
        holds,
        refusal: `iteration turn budget spent (${used} of ${limits.iterationTurns})`,
      };
    }
  }
  if (limits.iterationUsd !== undefined) {
    const spent = iterationSpend(
      records,
      before.iteration,
      await loadPriceTable(runtime.priceSource),
      runtime.configs.run.priceIds,
    );
    if (spent >= limits.iterationUsd) {
      return {
        holds,
        refusal: `iteration USD budget spent (${spent} of ${limits.iterationUsd})`,
      };
    }
  }
  if (limits.iterationWallMs !== undefined) {
    const elapsed = Date.now() - iterationStart(records, before.iteration);
    if (elapsed >= limits.iterationWallMs) {
      return {
        holds,
        refusal: `iteration wall budget spent (${elapsed}ms of ${limits.iterationWallMs}ms)`,
      };
    }
  }
  return { holds };
}

async function processedSteers(store: KernelRuntime["store"]): Promise<number> {
  return (await store.mailbox.files("processed")).length;
}

/**
 * A blocked goal is not final while a steer is waiting: the architect boundary
 * is the only steer consumer, so the next launch must resume instead of
 * stopping on the goal decision that ended the previous one.
 */
async function steersWaiting(store: KernelRuntime["store"]): Promise<boolean> {
  return (await scanInbox(store)).length > 0;
}

/**
 * A pending steer a PM turn already routed to the architect (directly or via a
 * stall) has no other consumer. A resumed pass never runs a front turn, so
 * without the boundary that route would wait for a consult the launch does not
 * reach.
 */
async function architectRouteWaiting(
  store: KernelRuntime["store"],
): Promise<boolean> {
  const pending = await scanInbox(store);
  if (pending.length === 0) return false;
  const routes = collectSteerRoutes(await store.listRecords());
  return pending.some((steer) => {
    const route = routes.get(steer.id)?.route;
    return (
      route !== undefined && (isArchitectRoute(route) || route === "stall")
    );
  });
}

/** Tasks a front path dispatched that did not land, as `slug status`. */
function unfinishedTasks(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(
      ([, task]) => task.status !== "merged" && task.status !== "finished",
    )
    .map(([slug, task]) => `${slug} ${task.status}`);
}

/** Non-terminal tasks, as `slug status`: work the goal still owes. */
function openTasks(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => task.status === "pending" || task.status === "ready")
    .map(([slug, task]) => `${slug} ${task.status}`)
    .sort();
}

/**
 * A front trivial/task goal has no architect turn, so the front path's stop is
 * the recorded goal decision: `derive` reads it as the one source of truth.
 */
async function recordFrontStop(
  store: KernelRuntime["store"],
  iteration: number,
  decision: GoalDecision,
  summary: string,
): Promise<void> {
  await store.appendRecord(scriptMeta(iteration, FRONT_STOP_STEP), {
    ok: true,
    outcome: {
      status: decision === "done" ? "done" : "blocked",
      summary,
      concerns: [],
      forward: [],
      decision,
    },
  });
}

/** The classified cause plus the scrubbed error tail, as the boundary reports it. */
function infraCause(stop: { cause: string; details?: string }): string {
  return stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
}

/**
 * The iteration status follows the launch result, not the architect's claim.
 * A done refused for open debt (derive stays active) reports in-progress, so
 * the summary's distance explains why the goal continues. Infra and signal
 * stops win over any decision; a front-path blocked stop (unfinished tasks,
 * not a user block) reports stopped-with-debt.
 */
export function statusForIteration(opts: {
  decision: GoalDecision;
  ended: "infra" | "cancelled" | undefined;
  stopped: boolean;
  signalsStopped: boolean;
  goal: State["goal"];
}): "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt" {
  if (opts.ended === "infra") return "stopped-with-debt";
  if (opts.signalsStopped || opts.stopped) return "stopped-with-debt";
  if (opts.decision === "done")
    return opts.goal === "done" ? "goal-met" : "in-progress";
  if (opts.decision === "blocked") return "blocked-by-user";
  if (opts.goal === "done") return "goal-met";
  if (opts.goal === "blocked") return "stopped-with-debt";
  return "in-progress";
}

async function writeIterationFacts(
  runtime: KernelRuntime,
  iteration: number,
  status: "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt",
  humanInterventions: number,
  cause?: Cause,
): Promise<string> {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  const roleByStep = rolesByStep(runtime.configs.process.flows);
  const prices = await loadPriceTable(runtime.priceSource);
  const priceIds = runtime.configs.run.priceIds;
  await writeMetrics(runtime.store, {
    iteration,
    status,
    records,
    state,
    roleByStep,
    prices,
    priceIds,
    humanInterventions,
  });
  const summary = await writeIterationSummary(runtime.store, {
    iteration,
    state,
    records,
    status,
    cause,
    roleByStep,
    prices,
    priceIds,
    humanInterventions,
  });
  await writeEpicSummaries(runtime.store, { iteration, state, records });
  await writeStatus(statusSource(runtime));
  return summary;
}

async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  humanInterventions: number,
  cause?: Cause,
): Promise<void> {
  try {
    await writeIterationFacts(
      runtime,
      iteration,
      "stopped-with-debt",
      humanInterventions,
      cause,
    );
  } catch {
    // The launch error is the useful one; a broken store cannot report.
  }
}

/**
 * One launch: configs, pre-flight, goal lock, crash recovery, bounded
 * iterations, one metrics file + one summary per iteration. State is always
 * derived; relaunching after a kill runs the same code path.
 */
export async function runGoal(opts: RunGoalOptions): Promise<LaunchResult> {
  const repoRoot = path.resolve(opts.repo);
  const configs = loadConfigs(repoRoot, {
    iterations: opts.iterations,
    runConfigPath: opts.runConfigPath,
  });
  const paths = resolveGoalPaths(configs, repoRoot, opts.goal);
  // First: everything below writes to disk, and a full tmp filesystem must
  // read as infrastructure loss, not as a failure of the work.
  const headroom = tmpHeadroom(
    os.tmpdir(),
    fs.statfsSync,
    toLimits(configs).minTmpFreeBytes ?? DEFAULT_MIN_TMP_FREE_BYTES,
  );
  if (!headroom.ok) throw new LaunchError(headroom.cause);
  const intentPath = path.join(paths.goalDir, "intent.md");
  if (!fs.existsSync(intentPath)) {
    throw new LaunchError(`goal "${opts.goal}" has no intent: ${intentPath}`);
  }

  const taskTypes = configs.process.taskTypes;
  const store = createFolderStore(
    paths.goalDir,
    path.dirname(paths.goalDir),
    taskTypes,
  );
  await store.ensureLayout();
  const sessions = await createLaunchSessions(
    paths.sessionsDir,
    opts.goal,
    configs.run.sessions.keepRuns,
    {
      repo: repoRoot,
    },
  );

  let harnesses: Record<string, Harness> = opts.harnesses ?? {};
  if (!opts.harnesses && opts.harnessFactory) {
    // The acpx adapter refuses a malformed `args`/`env` when constructed, and
    // that happens before pre-flight; report the same shape as a finding so the
    // operator sees the config key instead of a constructor stack.
    const optionFindings = acpxOptionFindings(
      configs.run.harnesses,
      (configs.files ?? configFilePaths(repoRoot)).run,
    );
    if (optionFindings.length > 0) throw new PreflightError(optionFindings);
    harnesses = await opts.harnessFactory({
      sessionDir: sessions.dir,
      scouts: configs.run.scouts
        ? {
            id: configs.run.scouts.model,
            ...(configs.run.scouts.effort
              ? { effort: configs.run.scouts.effort }
              : {}),
          }
        : undefined,
      harnesses: configs.run.harnesses,
      retention: configs.run.sessions.retention,
      envAllowlist: configs.run.envAllowlist,
      ...(configs.run.lsp
        ? { lsp: { config: artifactLspConfigPath(paths.goalDir) } }
        : {}),
    });
  }

  await preflight({
    configs,
    paths,
    store,
    harnesses: new Map(Object.entries(harnesses)),
    binaries: opts.binaries,
    catalog: opts.modelCatalog,
    baseGates: opts.baseGates,
  });

  const runtime: KernelRuntime = {
    paths,
    configs,
    repo: new Repo({
      mainRoot: repoRoot,
      worktreeRoot: paths.worktreeRoot,
      identity: configs.repo.identity,
    }),
    store,
    harnesses: new Map(Object.entries(harnesses)),
    prompts: loadPrompts(configs.process, repoRoot, {
      aliases: configs.run.aliases,
      run: configs.run,
    }),
    limits: toLimits(configs),
    exhaustedPools: await loadPoolResets(paths),
    priceSource: opts.priceSource,
  };

  const signals = opts.signals ?? createDrainController();
  const uninstall = opts.signals ? undefined : signals.install();
  const lock: RunLockHandle | null = acquireRunLock(
    repoRoot,
    `goal-${opts.goal}`,
    {
      runtimeDir: path.join(paths.worktreeRoot, ".factory-runtime"),
    },
  );
  if (!lock) {
    uninstall?.();
    throw new LaunchError(
      `goal "${opts.goal}" is already running in another process`,
    );
  }

  try {
    const interrupted = (await store.listRecords()).filter(
      (r) => !r.endedAt,
    ).length;
    let recoveredRecords: number;
    try {
      recoveredRecords = await recoverLaunch(runtime);
    } catch (err) {
      if (!(err instanceof BaseFollowConflictError)) throw err;
      console.warn(`[factory] ${err.message}`);
      return {
        goal: opts.goal,
        iterations: 0,
        state: derive(
          await store.listTasks(),
          await store.listRecords(),
          runtime.configs.process.flows,
        ),
        stop: "infra",
        cause: err.message,
        recoveredRecords: interrupted,
      };
    }
    // The artifact folder carries the schemas and one LSP config for editors
    // and any harness rooted there; it is written before the first turn
    // snapshots goal artifacts, so containment never sees a launch write.
    await writeArtifactLsp(paths.goalDir);
    const relaunch = (await store.listRecords()).some(
      (r) => r.iteration > 0 && r.step !== "task-quarantine",
    );
    let iterations = 0;
    // Set once a resumed pass made no progress: the boundary must run next.
    let resumeForcedOff = false;
    let lastSummary: string | undefined;
    let ended: "infra" | "cancelled" | undefined;
    let stopCause: Cause | undefined;

    for (let i = 0; i < runtime.limits.iterations; i++) {
      if (signals.shouldStop()) break;
      const before = derive(
        await store.listTasks(),
        await store.listRecords(),
        runtime.configs.process.flows,
      );
      if (
        before.terminal &&
        !(before.goal === "blocked" && (await steersWaiting(store)))
      )
        break;

      // A relaunch that lands in an interrupted iteration finishes that
      // iteration: same iteration number, no front turn, no architect record.
      // Resume only applies on the first launch iteration, and only when the
      // drain that stopped the previous run is gone: a persistent drain (goal
      // hold, exhausted turn/budget/wall budget) has the boundary as its only
      // resolver, so resuming would dispatch nothing and loop forever.
      const recordsBefore = await store.listRecords();
      let resume = before.interrupted && i === 0 && !resumeForcedOff;
      let resumeHolds: Hold[] = [];

      if (resume) {
        const gate = await resumeGate(runtime, before, recordsBefore);
        resumeHolds = gate.holds;
        if (gate.refusal !== undefined) {
          resume = false;
          await store.appendRecord(
            scriptMeta(before.iteration, RESUME_REFUSED_STEP),
            { ok: false, cause: makeCause("resume", gate.refusal) },
          );
        }
      }
      let iteration = resume ? before.iteration : before.iteration + 1;
      if (resume) {
        const attempt =
          recordsBefore.filter(
            (r) => r.iteration === iteration && r.step === RESUME_STEP,
          ).length + 1;
        await store.appendRecord(scriptMeta(iteration, RESUME_STEP), {
          ok: true,
          outcome: {
            status: "done",
            summary: `resume attempt ${attempt} of iteration ${iteration}`,
            concerns: [],
            forward: [],
          },
        });
      }
      await store.sweepTasks(iteration);
      await sweepHolds(store, iteration, Object.keys(before.tasks));
      let humanInterventions = 0;
      let digestSteer: Steer | null = null;
      let resumeSteerPm: SteerPmRun | undefined;
      try {
        // A resume skips the architect turn but not the digest: the digest is
        // delivered to the PM as a steer, and that one turn routes the evidence
        // and any repair it warrants before dispatch.
        if (resume) {
          digestSteer = await runBoundaryTurn(
            runtime,
            { iteration, step: "digest" },
            async () =>
              postLaunchDigest(runtime, iteration, await store.listRecords()),
          );
          if (digestSteer) {
            const steer = digestSteer;
            const tasks = await store.listTasks();
            resumeSteerPm = await runBoundaryTurn(
              runtime,
              { iteration, step: "pm" },
              async () =>
                runSteerPm(runtime, {
                  iteration,
                  state: derive(
                    tasks,
                    await store.listRecords(),
                    runtime.configs.process.flows,
                  ),
                  tasks,
                  steers: [steer],
                  cwd: runtime.paths.goalCheckout,
                }),
            );
          }
        }
        const processedBefore = await processedSteers(store);
        let front: Awaited<ReturnType<typeof runFront>>;
        if (resume) {
          // A resume has no front turn. The architect is the only consumer of
          // an architect route or an underivable finding, so that is the one
          // case where dispatch must not be forced: the boundary runs first in
          // the same iteration.
          const boundaryWaiting =
            resumeSteerPm?.status === "architect" ||
            (await architectRouteWaiting(store));
          front = { action: boundaryWaiting ? "boundary" : "dispatch" };
        } else {
          front = await runBoundaryTurn(
            runtime,
            { iteration, step: "front" },
            () => runFront(runtime, { iteration, state: before }),
          );
          if (front.action === "blocked") {
            const cause = `front turn ended the launch as blocked: ${
              front.cause ?? "unknown cause"
            }`;
            await recordFrontStop(store, iteration, "blocked", cause);
            lastSummary = await writeIterationFacts(
              runtime,
              iteration,
              "blocked-by-user",
              0,
              makeCause("boundary", cause),
            );
            stopCause = makeCause("boundary", cause);
            break;
          }
          if (front.action === "infra") {
            const cause = `front turn ended the launch as infra: ${
              front.cause ?? "unknown cause"
            }; relaunch to retry`;
            lastSummary = await writeIterationFacts(
              runtime,
              iteration,
              "stopped-with-debt",
              0,
              makeCause("boundary", cause),
            );
            ended = "infra";
            stopCause = makeCause("boundary", cause);
            break;
          }
        }

        let boundary: BoundaryResult | undefined;
        let decision: GoalDecision = "continue";
        let seenSteers: string[] = [];
        if (resume) {
          // Only steers the dying pass already claimed stay seen: architect-seen
          // (a presented/unanswered record) or PM-claimed (a hold file). Anything
          // else in the inbox never reached either consumer, so dispatch must
          // give it its PM steer turn instead of dropping it as already read.
          const inbox = await scanInbox(store);
          const holdSteers = new Set(resumeHolds.map((h) => h.steer));
          const presented = new Set<string>();
          for (const rec of recordsBefore) {
            if (
              (rec.step === "steer-presented" ||
                rec.step === "steer-unanswered") &&
              rec.slug
            ) {
              presented.add(rec.slug);
            }
          }
          seenSteers = inbox
            .filter((s) => holdSteers.has(s.id) || presented.has(s.id))
            .map((s) => s.id);
          // The digest steer was just claimed by the resume PM turn; dispatch
          // must not hand it a second PM turn.
          if (digestSteer) seenSteers.push(digestSteer.id);
        }
        if (front.action === "boundary") {
          boundary = await runBoundary(runtime, {
            relaunch: relaunch && i === 0 && !resumeForcedOff,
            // The resume path already wrote this iteration's digest and posted
            // it as a steer; a second scout turn would duplicate that evidence.
            ...(resume ? { digest: false } : {}),
            iteration,
            frontPack: front.packPath,
            runConfigPath: runtime.configs.files?.run,
          });
          iteration = boundary.iteration;
          decision = boundary.decision;
          seenSteers = boundary.seenSteers;
          if (boundary.stop) {
            ended = "infra";
            stopCause = makeCause(
              "boundary",
              `infrastructure stop during iteration ${iteration}: ${infraCause(boundary.stop)}; relaunch to retry`,
            );
          }
        }
        iterations += 1;

        let dispatchCause: Cause | undefined;
        let dispatched: DispatchResult | undefined;
        if (
          decision === "continue" &&
          ended === undefined &&
          !signals.shouldStop()
        ) {
          dispatched = await runDispatch(runtime, {
            iteration,
            seenSteers,
            signals,
          });
          dispatchCause = dispatched.cause;
          if (
            dispatched.reason === "infra" ||
            dispatched.reason === "cancelled"
          ) {
            ended = dispatched.reason;
            if (dispatched.reason === "infra") {
              dispatchCause = makeCause(
                "boundary",
                `infrastructure stop during iteration ${iteration}: ${
                  dispatched.cause
                    ? formatCause(dispatched.cause)
                    : "unknown cause"
                }; relaunch to retry`,
              );
              stopCause = dispatchCause;
            }
          }
        }
        const stopped = ended !== undefined;
        humanInterventions = Math.max(
          0,
          (await processedSteers(store)) - processedBefore,
        );

        const frontFinished =
          !resume &&
          front.action === "dispatch" &&
          dispatched?.reason === "boundary";
        if (frontFinished) {
          let escalated = false;
          try {
            escalated = readFrontClass(runtime)?.class === "bigger";
          } catch {
            escalated = false;
          }
          // An upscope escalation rewrote the class mid-dispatch: the goal stays
          // active so the next launch runs the architect instead of stopping here.
          if (!escalated) {
            const afterDispatch = derive(
              await store.listTasks(),
              await store.listRecords(),
              runtime.configs.process.flows,
            );
            const unfinished = unfinishedTasks(afterDispatch);
            const landed =
              Object.keys(afterDispatch.tasks).length > 0 &&
              unfinished.length === 0;
            await recordFrontStop(
              store,
              iteration,
              landed ? "done" : "blocked",
              landed
                ? `front path landed every task in iteration ${iteration}`
                : `front path stopped with ${unfinished.join(", ")} in iteration ${iteration}`,
            );
          }
        }
        const afterStop = derive(
          await store.listTasks(),
          await store.listRecords(),
          runtime.configs.process.flows,
        );
        const status = statusForIteration({
          decision,
          ended,
          stopped,
          signalsStopped: signals.shouldStop(),
          goal: afterStop.goal,
        });
        // A resumed iteration that ends at the boundary has no architect turn
        // to hand the stuck state to in this iteration; the cause travels in
        // the summary the next iteration's architect reads in its pack.
        const open = resume ? openTasks(afterStop) : [];
        const stuckCause =
          dispatched?.reason === "boundary" && open.length > 0
            ? makeCause(
                "stuck",
                `resumed iteration ${iteration}: nothing dispatchable, non-terminal work remains: ${open.join(", ")}`,
              )
            : undefined;
        lastSummary = await writeIterationFacts(
          runtime,
          iteration,
          status,
          humanInterventions,
          boundary?.cause
            ? makeCause("boundary", boundary.cause)
            : (dispatchCause ?? stuckCause),
        );
        if (decision !== "continue" || stopped || signals.shouldStop()) break;
        if (frontFinished) break;
        // A resume that ended with nothing left open has no work to hand the
        // next dispatch: the boundary must run, and the resumed pass is not a
        // pass. The checker can no longer summon the boundary on its own when
        // nothing is open, so the terminal state itself is the signal.
        const settledResume =
          dispatched?.reason === "boundary" &&
          Object.values(afterStop.tasks).every(
            (task) =>
              task.status === "merged" ||
              task.status === "finished" ||
              task.status === "cancelled",
          );
        if (
          resume &&
          boundary === undefined &&
          dispatched !== undefined &&
          (dispatched.taskTurnsStarted === 0 ||
            dispatched.planCheck === "architect" ||
            settledResume)
        ) {
          // An empty, architect-summoning, or fully landed resume that ran no
          // boundary is not a pass: give the budget back and go straight to the
          // boundary. A resume that did rule already made this iteration's
          // progress, so it keeps the pass and never loops back into a consult.
          resumeForcedOff = true;
          iterations -= 1;
          i -= 1;
        }
      } catch (err) {
        await safeSummary(
          runtime,
          Math.max(1, iteration),
          humanInterventions,
          makeCause("error", (err as Error).message),
        );
        throw err;
      }
    }

    const state = derive(
      await store.listTasks(),
      await store.listRecords(),
      runtime.configs.process.flows,
    );
    const stop: LaunchStop =
      signals.interruptedBy || ended === "cancelled"
        ? "interrupted"
        : state.goal === "done"
          ? "done"
          : state.goal === "blocked"
            ? "blocked"
            : ended === "infra"
              ? "infra"
              : "iteration-limit";
    return {
      goal: opts.goal,
      iterations,
      state,
      lastSummary,
      stop,
      cause: stopCause ? formatCause(stopCause) : undefined,
      interruptedBy: signals.interruptedBy,
      recoveredRecords,
    };
  } finally {
    lock.release();
    uninstall?.();
  }
}
