import fs from "node:fs";
import path from "node:path";
import { Repo } from "../core/git/repo.js";
import { acquireRunLock, type RunLockHandle } from "../cli/lock.js";
import { derive } from "./derive.js";
import { next } from "./next.js";
import { executeTaskAction } from "./flow.js";
import { loadConfigs, resolveGoalPaths, toLimits } from "./config.js";
import { loadPrompts } from "./prompts.js";
import { createFolderStore } from "./store.js";
import { runBoundary } from "./boundary.js";
import { writeIterationSummary } from "./summary.js";
import { writeMetrics } from "./metrics.js";
import { preflight, type ModelCatalog } from "./preflight.js";
import { recoverLaunch } from "./recovery.js";
import { createLaunchSessions } from "./sessions.js";
import { createDrainController, type DrainController, type DrainSignal } from "./signals.js";
import type { Harness, ModelRef } from "../harness/types.js";
import type { Action, KernelRuntime, State } from "./types.js";

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

export type LaunchStop = "done" | "blocked" | "iteration-limit" | "interrupted";

export interface LaunchResult {
  goal: string;
  iterations: number;
  state: State;
  lastSummary?: string;
  stop: LaunchStop;
  interruptedBy?: DrainSignal;
  recoveredRecords: number;
}

function workActions(actions: Action[]): Action[] {
  return actions.filter((a) => a.kind !== "boundary" && a.kind !== "exit");
}

/** Step id -> role, from every configured flow; metrics use it to name roles. */
export function roleByStep(configs: KernelRuntime["configs"]): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const flow of Object.values(configs.process.flows)) {
    for (const step of flow.steps) roles[step.id] = step.role;
  }
  return roles;
}

/**
 * Dispatches until `next` reports the boundary. Serial in kernel-0: S2 adds
 * concurrency and the merge queue. A drain request takes effect between
 * actions; the in-flight action is always awaited.
 */
async function drain(runtime: KernelRuntime, signals: DrainController): Promise<void> {
  for (;;) {
    if (signals.shouldStop()) return;
    const tasks = await runtime.store.listTasks();
    const records = await runtime.store.listRecords();
    const state = derive(tasks, records);
    const action = workActions(next(state, runtime.limits, new Set()))[0];
    if (!action || action.kind === "boundary" || action.kind === "exit") return;
    if (!("slug" in action)) return;
    const task = tasks.find((t) => t.slug === action.slug);
    if (!task) throw new LaunchError(`action names unknown task "${action.slug}"`);
    const lastSeq = records.at(-1)?.seq ?? 0;
    await executeTaskAction(runtime, task, action, state.iteration, state.tasks[action.slug]!);
    const created = (await runtime.store.listRecords()).filter((r) => r.seq > lastSeq);
    const infra = created.find((r) => r.stop?.kind === "infra");
    if (infra) {
      const label = action.kind === "step" ? action.step : action.kind;
      throw new LaunchError(
        `infrastructure stop on ${action.slug} ${label} (${JSON.stringify(infra.stop)}); relaunch to retry`
      );
    }
  }
}

async function processedSteers(store: KernelRuntime["store"]): Promise<number> {
  const files = await store.listDir("mailbox/processed");
  return files.filter((f) => !f.startsWith(".")).length;
}

async function writeIterationFacts(
  runtime: KernelRuntime,
  iteration: number,
  status: "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt",
  humanInterventions: number
): Promise<string> {
  const records = await runtime.store.listRecords();
  const state = derive(await runtime.store.listTasks(), records);
  await writeMetrics(runtime.store, {
    iteration,
    status,
    records,
    state,
    roleByStep: roleByStep(runtime.configs),
    humanInterventions,
  });
  return writeIterationSummary(runtime.store, { iteration, state, records, status });
}

async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  humanInterventions: number
): Promise<void> {
  try {
    await writeIterationFacts(runtime, iteration, "stopped-with-debt", humanInterventions);
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

  const store = createFolderStore(paths.goalDir);
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
    const recoveredRecords = await recoverLaunch(runtime);
    const relaunch = (await store.listRecords()).some((r) => r.iteration > 0);
    let iterations = 0;
    let lastSummary: string | undefined;

    for (let i = 0; i < runtime.limits.iterations; i++) {
      if (signals.shouldStop()) break;
      const before = derive(await store.listTasks(), await store.listRecords());
      if (before.terminal) break;

      let iteration = before.iteration + 1;
      let humanInterventions = 0;
      try {
        const processedBefore = await processedSteers(store);
        const boundary = await runBoundary(runtime, { relaunch: relaunch && i === 0 });
        iteration = boundary.iteration;
        iterations += 1;
        humanInterventions = Math.max(0, (await processedSteers(store)) - processedBefore);
        if (boundary.decision === "continue" && !signals.shouldStop()) await drain(runtime, signals);

        const status =
          boundary.decision === "done"
            ? "goal-met"
            : boundary.decision === "blocked"
              ? "blocked-by-user"
              : signals.shouldStop()
                ? "stopped-with-debt"
                : "in-progress";
        lastSummary = await writeIterationFacts(runtime, iteration, status, humanInterventions);
        if (boundary.decision !== "continue" || signals.shouldStop()) break;
      } catch (err) {
        await safeSummary(runtime, Math.max(1, iteration), humanInterventions);
        throw err;
      }
    }

    const state = derive(await store.listTasks(), await store.listRecords());
    const stop: LaunchStop = signals.interruptedBy
      ? "interrupted"
      : state.goal === "done"
        ? "done"
        : state.goal === "blocked"
          ? "blocked"
          : "iteration-limit";
    return {
      goal: opts.goal,
      iterations,
      state,
      lastSummary,
      stop,
      interruptedBy: signals.interruptedBy,
      recoveredRecords,
    };
  } finally {
    lock.release();
    uninstall?.();
  }
}
