import fs from "node:fs";
import path from "node:path";
import { acquireRunLock, type RunLockHandle } from "../cli/lock.js";
import { Repo } from "../core/git/repo.js";
import type { Harness, ModelRef } from "../harness/types.js";
import { type BoundaryResult, runBoundary } from "./boundary.js";
import { artifactLspConfigPath, writeArtifactLsp } from "./artifact-lsp.js";
import { loadConfigs, resolveGoalPaths, toLimits } from "./config.js";
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
import { type Hold, type Steer, readHolds, scanInbox } from "./mailbox.js";
import { rolesByStep, writeMetrics } from "./metrics.js";
import type { PriceSource } from "./openrouter.js";
import { loadPriceTable } from "./openrouter.js";
import { runSteerPm } from "./pm.js";
import { type ModelCatalog, preflight } from "./preflight.js";
import { loadPrompts } from "./prompts.js";
import { scriptMeta } from "./record.js";
import { recoverLaunch } from "./recovery.js";
import { createLaunchSessions } from "./sessions.js";
import {
  createDrainController,
  type DrainController,
  type DrainSignal,
} from "./signals.js";
import { createFolderStore } from "./store.js";
import { writeIterationSummary } from "./summary.js";
import type {
  GoalDecision,
  HarnessConfig,
  KernelRuntime,
  State,
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

async function processedSteers(store: KernelRuntime["store"]): Promise<number> {
  const files = await store.listDir("mailbox/processed");
  return files.filter((f) => !f.startsWith(".")).length;
}

/**
 * A blocked goal is not final while a steer is waiting: the architect boundary
 * is the only steer consumer, so the next launch must resume instead of
 * stopping on the goal decision that ended the previous one.
 */
async function steersWaiting(store: KernelRuntime["store"]): Promise<boolean> {
  return (await scanInbox(store)).length > 0;
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
  cause?: string,
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
  return writeIterationSummary(runtime.store, {
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
}

async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  humanInterventions: number,
  cause?: string,
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
  const intentPath = path.join(paths.goalDir, "intent.md");
  if (!fs.existsSync(intentPath)) {
    throw new LaunchError(`goal "${opts.goal}" has no intent: ${intentPath}`);
  }

  const store = createFolderStore(
    paths.goalDir,
    path.dirname(paths.goalDir),
    configs.process.taskTypes,
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
      ...(configs.run.lsp
        ? { lsp: { config: artifactLspConfigPath(paths.goalDir) } }
        : {}),
    });
  }

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
    exhaustedPools: new Set(),
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
    await preflight({
      configs,
      paths,
      store,
      harnesses: runtime.harnesses,
      binaries: opts.binaries,
      catalog: opts.modelCatalog,
      baseGates: opts.baseGates,
    });
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
    let lastSummary: string | undefined;
    let ended: "infra" | "cancelled" | undefined;
    let stopCause: string | undefined;

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
      let resume = before.interrupted && i === 0;
      let resumeHolds: Hold[] = [];
      if (resume) {
        try {
          resumeHolds = await readHolds(store, {
            iteration: Math.max(1, before.iteration),
            knownSlugs: Object.keys(before.tasks),
          });
        } catch {
          // A hold file that cannot be read decides what may run, so the
          // boundary (and dispatch's infra stop) owns it — never a silent resume.
          resume = false;
        }
      }
      if (resume) {
        const pendingSteers = new Set(
          (await scanInbox(store)).map((s) => s.id),
        );
        const goalHoldActive = resumeHolds.some(
          (h) => h.goal === true && pendingSteers.has(h.steer),
        );
        if (goalHoldActive) resume = false;
        if (runtime.limits.iterationTurns !== undefined) {
          const used = settledTurns(recordsBefore, before.iteration);
          if (used >= runtime.limits.iterationTurns) resume = false;
        }
        if (runtime.limits.iterationUsd !== undefined) {
          const spent = iterationSpend(
            recordsBefore,
            before.iteration,
            await loadPriceTable(runtime.priceSource),
            runtime.configs.run.priceIds,
          );
          if (spent >= runtime.limits.iterationUsd) resume = false;
        }
        if (runtime.limits.iterationWallMs !== undefined) {
          const elapsed =
            Date.now() - iterationStart(recordsBefore, before.iteration);
          if (elapsed >= runtime.limits.iterationWallMs) resume = false;
        }
      }
      let iteration = resume ? before.iteration : before.iteration + 1;
      let humanInterventions = 0;
      let digestSteer: Steer | null = null;
      try {
        // A resume skips the architect turn but not the digest: the digest is
        // delivered to the PM as a steer, and that one turn routes the evidence
        // and any repair it warrants before dispatch.
        if (resume) {
          digestSteer = await postLaunchDigest(
            runtime,
            iteration,
            await store.listRecords(),
          );
          if (digestSteer) {
            const tasks = await store.listTasks();
            await runSteerPm(runtime, {
              iteration,
              state: derive(
                tasks,
                await store.listRecords(),
                runtime.configs.process.flows,
              ),
              tasks,
              steers: [digestSteer],
              cwd: runtime.paths.goalCheckout,
            });
          }
        }
        const processedBefore = await processedSteers(store);
        let front: Awaited<ReturnType<typeof runFront>>;
        if (resume) {
          front = { action: "dispatch" };
        } else {
          front = await runFront(runtime, { iteration });
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
              cause,
            );
            stopCause = cause;
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
              cause,
            );
            ended = "infra";
            stopCause = cause;
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
            relaunch: relaunch && i === 0,
            iteration,
            frontPack: front.packPath,
            runConfigPath: runtime.configs.files?.run,
          });
          iteration = boundary.iteration;
          decision = boundary.decision;
          seenSteers = boundary.seenSteers;
          if (boundary.stop) {
            ended = "infra";
            stopCause = `infrastructure stop during iteration ${iteration}: ${infraCause(boundary.stop)}; relaunch to retry`;
          }
        }
        iterations += 1;

        let dispatchCause: string | undefined;
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
              dispatchCause = `infrastructure stop during iteration ${iteration}: ${
                dispatched.cause ?? "unknown cause"
              }; relaunch to retry`;
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
            ? `resumed iteration ${iteration}: nothing dispatchable, non-terminal work remains: ${open.join(", ")}`
            : undefined;
        lastSummary = await writeIterationFacts(
          runtime,
          iteration,
          status,
          humanInterventions,
          boundary?.cause ?? dispatchCause ?? stuckCause,
        );
        if (decision !== "continue" || stopped || signals.shouldStop()) break;
        if (frontFinished) break;
      } catch (err) {
        await safeSummary(
          runtime,
          Math.max(1, iteration),
          humanInterventions,
          (err as Error).message,
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
      cause: stopCause,
      interruptedBy: signals.interruptedBy,
      recoveredRecords,
    };
  } finally {
    lock.release();
    uninstall?.();
  }
}
