import fs from "node:fs";
import path from "node:path";
import { Repo } from "../core/git/repo.js";
import { acquireRunLock, type RunLockHandle } from "../cli/lock.js";
import { derive } from "./derive.js";
import { runDispatch, type DispatchResult } from "./dispatch.js";
import { loadConfigs, resolveGoalPaths, toLimits } from "./config.js";
import { loadPrompts } from "./prompts.js";
import { createFolderStore } from "./store.js";
import { runBoundary, type BoundaryResult } from "./boundary.js";
import { runFront } from "./front.js";
import { writeIterationSummary } from "./summary.js";
import { rolesByStep, writeMetrics } from "./metrics.js";
import { preflight, type ModelCatalog } from "./preflight.js";
import { recoverLaunch } from "./recovery.js";
import { BaseFollowConflictError } from "./worktree.js";
import { createLaunchSessions } from "./sessions.js";
import { createDrainController, type DrainController, type DrainSignal } from "./signals.js";
import type { Harness, ModelRef } from "../harness/types.js";
import type { GoalDecision, KernelRuntime, State } from "./types.js";

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
}

export type HarnessFactory = (
  context: HarnessFactoryContext
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
}

export type LaunchStop = "done" | "blocked" | "iteration-limit" | "interrupted" | "infra";

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

/** The classified cause plus the scrubbed error tail, as the boundary reports it. */
function infraCause(stop: { cause: string; details?: string }): string {
  return stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
}

async function writeIterationFacts(
  runtime: KernelRuntime,
  iteration: number,
  status: "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt",
  humanInterventions: number,
  cause?: string
): Promise<string> {
  const records = await runtime.store.listRecords();
  const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
  const roleByStep = rolesByStep(runtime.configs.process.flows);
  const prices = runtime.configs.run.prices;
  await writeMetrics(runtime.store, {
    iteration,
    status,
    records,
    state,
    roleByStep,
    prices,
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
  });
}

async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  humanInterventions: number,
  cause?: string
): Promise<void> {
  try {
    await writeIterationFacts(runtime, iteration, "stopped-with-debt", humanInterventions, cause);
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

  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  await store.ensureLayout();
  const sessions = await createLaunchSessions(paths.sessionsDir, opts.goal, configs.run.sessions.keepRuns, {
    repo: repoRoot,
  });

  let harnesses: Record<string, Harness> = opts.harnesses ?? {};
  if (!opts.harnesses && opts.harnessFactory) {
    harnesses = await opts.harnessFactory({
      sessionDir: sessions.dir,
      scouts: configs.run.scouts
        ? { id: configs.run.scouts.model, ...(configs.run.scouts.effort ? { effort: configs.run.scouts.effort } : {}) }
        : undefined,
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
    prompts: loadPrompts(configs.process, repoRoot),
    limits: toLimits(configs),
  };

  const signals = opts.signals ?? createDrainController();
  const uninstall = opts.signals ? undefined : signals.install();
  const lock: RunLockHandle | null = acquireRunLock(repoRoot, `goal-${opts.goal}`, {
    runtimeDir: path.join(paths.worktreeRoot, ".factory-runtime"),
  });
  if (!lock) {
    uninstall?.();
    throw new LaunchError(`goal "${opts.goal}" is already running in another process`);
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
    const interrupted = (await store.listRecords()).filter((r) => !r.endedAt).length;
    let recoveredRecords: number;
    try {
      recoveredRecords = await recoverLaunch(runtime);
    } catch (err) {
      if (!(err instanceof BaseFollowConflictError)) throw err;
      console.warn(`[factory] ${err.message}`);
      return {
        goal: opts.goal,
        iterations: 0,
        state: derive(await store.listTasks(), await store.listRecords(), runtime.configs.process.flows),
        stop: "infra",
        cause: err.message,
        recoveredRecords: interrupted,
      };
    }
    const relaunch = (await store.listRecords()).some((r) => r.iteration > 0);
    let iterations = 0;
    let lastSummary: string | undefined;
    let ended: "infra" | "cancelled" | undefined;
    let stopCause: string | undefined;
    /** A front-classified trivial/task goal has no architect decision; its landed tasks decide. */
    let frontStop: LaunchStop | undefined;

    for (let i = 0; i < runtime.limits.iterations; i++) {
      if (signals.shouldStop()) break;
      const before = derive(await store.listTasks(), await store.listRecords(), runtime.configs.process.flows);
      if (before.terminal) break;

      let iteration = before.iteration + 1;
      let humanInterventions = 0;
      try {
        const processedBefore = await processedSteers(store);
        const front = await runFront(runtime, { iteration });
        if (front.action === "blocked") {
          const cause = `front turn ended the launch as blocked: ${
            front.cause ?? "unknown cause"
          }`;
          lastSummary = await writeIterationFacts(runtime, iteration, "blocked-by-user", 0, cause);
          stopCause = cause;
          frontStop = "blocked";
          break;
        }
        if (front.action === "infra") {
          const cause = `front turn ended the launch as infra: ${
            front.cause ?? "unknown cause"
          }; relaunch to retry`;
          lastSummary = await writeIterationFacts(runtime, iteration, "stopped-with-debt", 0, cause);
          ended = "infra";
          stopCause = cause;
          break;
        }

        let boundary: BoundaryResult | undefined;
        let decision: GoalDecision = "continue";
        if (front.action === "boundary") {
          boundary = await runBoundary(runtime, {
            relaunch: relaunch && i === 0,
            iteration,
            frontPack: front.packPath,
          });
          iteration = boundary.iteration;
          decision = boundary.decision;
          if (boundary.stop) {
            ended = "infra";
            stopCause = `infrastructure stop during iteration ${iteration}: ${infraCause(boundary.stop)}; relaunch to retry`;
          }
        }
        iterations += 1;

        let dispatchCause: string | undefined;
        let dispatched: DispatchResult | undefined;
        if (decision === "continue" && ended === undefined && !signals.shouldStop()) {
          dispatched = await runDispatch(runtime, { iteration });
          dispatchCause = dispatched.cause;
          if (dispatched.reason === "infra" || dispatched.reason === "cancelled") {
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
        humanInterventions = Math.max(0, (await processedSteers(store)) - processedBefore);

        const after = derive(
          await store.listTasks(),
          await store.listRecords(),
          runtime.configs.process.flows
        );
        const landed =
          Object.keys(after.tasks).length > 0 &&
          Object.values(after.tasks).every(
            (task) => task.status === "merged" || task.status === "finished"
          );
        const frontFinished = front.action === "dispatch" && dispatched?.reason === "boundary";
        const status =
          decision === "done"
            ? "goal-met"
            : ended === "infra"
              ? "stopped-with-debt"
              : decision === "blocked"
                ? "blocked-by-user"
                : signals.shouldStop() || stopped
                  ? "stopped-with-debt"
                  : frontFinished && landed
                    ? "goal-met"
                    : frontFinished
                      ? "stopped-with-debt"
                      : "in-progress";
        lastSummary = await writeIterationFacts(
          runtime,
          iteration,
          status,
          humanInterventions,
          boundary?.cause ?? dispatchCause
        );
        if (decision !== "continue" || stopped || signals.shouldStop()) break;
        if (frontFinished) {
          frontStop = landed ? "done" : "blocked";
          break;
        }
      } catch (err) {
        await safeSummary(runtime, Math.max(1, iteration), humanInterventions, (err as Error).message);
        throw err;
      }
    }

    const state = derive(await store.listTasks(), await store.listRecords(), runtime.configs.process.flows);
    const stop: LaunchStop =
      signals.interruptedBy || ended === "cancelled"
        ? "interrupted"
        : frontStop !== undefined
          ? frontStop
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
