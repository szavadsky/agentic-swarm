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
import { backfillSummaries, writeIterationSummary } from "./summary.js";
import { writeMetrics } from "./metrics.js";
import { prepareIntegrationCheckout } from "./worktree.js";
import type { Harness } from "../harness/types.js";
import type { Action, KernelRuntime, State } from "./types.js";

export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchError";
  }
}

export interface RunGoalOptions {
  repo: string;
  goal: string;
  iterations?: number;
  runConfigPath?: string;
  /** Harness instances by run-config id; S1 registers real adapters here. */
  harnesses?: Record<string, Harness>;
}

export interface LaunchResult {
  goal: string;
  iterations: number;
  state: State;
  lastSummary?: string;
}

function assertAliases(runtime: KernelRuntime): void {
  const roles = new Set(["architect", "pm"]);
  for (const flow of Object.values(runtime.configs.process.flows)) {
    for (const step of flow.steps) roles.add(step.role);
  }
  for (const role of roles) {
    const roleConfig = runtime.configs.process.roles[role];
    if (!roleConfig) throw new LaunchError(`process config has no role "${role}"`);
    const aliasName = roleConfig.alias ?? role;
    const alias = runtime.configs.run.aliases[aliasName];
    if (!alias) throw new LaunchError(`run config has no alias "${aliasName}" (role "${role}")`);
    if (!runtime.harnesses.has(alias.harness)) {
      throw new LaunchError(
        `alias "${aliasName}" wants harness "${alias.harness}"; registered: ${
          [...runtime.harnesses.keys()].join(", ") || "none"
        }`
      );
    }
  }
}

function workActions(actions: Action[]): Action[] {
  return actions.filter((a) => a.kind !== "boundary" && a.kind !== "exit");
}

/**
 * Dispatches until `next` reports the boundary. Serial in kernel-0: S2 adds
 * concurrency and the merge queue; S0 proves the loop is crash-safe.
 */
async function drain(runtime: KernelRuntime): Promise<void> {
  for (;;) {
    const tasks = await runtime.store.listTasks();
    const records = await runtime.store.listRecords();
    const state = derive(tasks, records);
    const actions = workActions(next(state, runtime.limits, new Set()));
    const action = actions[0];
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
        `infrastructure stop on ${action.slug} ${label} (${JSON.stringify(infra.stop)}); retry/fallback policy is a later slice`
      );
    }
  }
}

async function safeSummary(
  runtime: KernelRuntime,
  iteration: number,
  status: "blocked-by-user" | "stopped-with-debt"
): Promise<void> {
  try {
    const records = await runtime.store.listRecords();
    const state = derive(await runtime.store.listTasks(), records);
    await writeIterationSummary(runtime.store, { iteration, state, records, status });
    await writeMetrics(runtime.store, { iteration, status, records, state });
  } catch {
    // The launch error is the useful one; a broken store cannot report.
  }
}

/**
 * One launch: pre-flight (configs, aliases, lock, integration checkout),
 * bounded iterations, one summary and metrics per iteration. State is only
 * ever derived; relaunch after a kill is the same call.
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
  const runtime: KernelRuntime = {
    paths,
    configs,
    repo: new Repo({
      mainRoot: repoRoot,
      worktreeRoot: paths.worktreeRoot,
      identity: configs.repo.identity,
    }),
    store,
    harnesses: new Map(Object.entries(opts.harnesses ?? {})),
    prompts: loadPrompts(configs.process, repoRoot),
    limits: toLimits(configs),
  };
  assertAliases(runtime);

  const lock: RunLockHandle | null = acquireRunLock(repoRoot, `goal-${opts.goal}`, {
    runtimeDir: path.join(paths.worktreeRoot, ".factory-runtime"),
  });
  if (!lock) throw new LaunchError(`goal "${opts.goal}" is already running in another process`);

  try {
    await prepareIntegrationCheckout(runtime);
    await backfillSummaries(runtime);
    const relaunch = (await store.listRecords()).length > 0;
    let iterations = 0;
    let lastSummary: string | undefined;

    for (let i = 0; i < runtime.limits.iterations; i++) {
      const state = derive(await store.listTasks(), await store.listRecords());
      if (state.terminal) break;

      let iteration = state.iteration + 1;
      try {
        const boundary = await runBoundary(runtime, { relaunch: relaunch && i === 0 });
        iteration = boundary.iteration;
        iterations += 1;
        if (boundary.decision === "continue") await drain(runtime);

        const after = derive(await store.listTasks(), await store.listRecords());
        const records = await store.listRecords();
        lastSummary = await writeIterationSummary(store, {
          iteration,
          state: after,
          records,
          decision: boundary.decision,
          cause: boundary.cause,
        });
        await writeMetrics(store, {
          iteration,
          status: boundary.decision === "done" ? "goal-met" : boundary.decision === "blocked" ? "blocked-by-user" : "in-progress",
          records,
          state: after,
        });
        if (boundary.decision !== "continue") break;
      } catch (err) {
        await safeSummary(runtime, Math.max(1, iteration), "stopped-with-debt");
        throw err;
      }
    }

    return {
      goal: opts.goal,
      iterations,
      state: derive(await store.listTasks(), await store.listRecords()),
      lastSummary,
    };
  } finally {
    lock.release();
  }
}
