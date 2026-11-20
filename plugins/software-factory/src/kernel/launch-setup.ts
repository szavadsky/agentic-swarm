/**
 * Launch setup before the first turn: config and goal paths, the tmp/intent
 * refusals, the store and sessions, the harness set, the kernel runtime, the
 * goal lock and crash recovery. Everything here is one-shot; the iteration
 * loop never revisits it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRunLock, type RunLockHandle } from "../cli/lock.js";
import { Repo } from "../core/git/repo.js";
import type { Harness } from "../harness/types.js";
import { artifactLspConfigPath } from "./artifact-lsp.js";
import {
  configFilePaths,
  loadConfigs,
  resolveGoalPaths,
  toLimits,
} from "./config.js";
import { derive } from "./derive.js";
import {
  LaunchError,
  type LaunchResult,
  type RunGoalOptions,
} from "./launch-types.js";
import {
  acpxOptionFindings,
  DEFAULT_MIN_TMP_FREE_BYTES,
  PreflightError,
  preflight,
  tmpHeadroom,
} from "./preflight.js";
import { loadPrompts } from "./prompts.js";
import { loadPoolResets } from "./quota-pools.js";
import { recoverLaunch } from "./recovery.js";
import { createLaunchSessions } from "./sessions.js";
import { createDrainController, type DrainController } from "./signals.js";
import { createFolderStore } from "./store.js";
import type { KernelRuntime } from "./types.js";
import { BaseFollowConflictError } from "./worktree.js";

interface LaunchSetup {
  repoRoot: string;
  configs: KernelRuntime["configs"];
  paths: KernelRuntime["paths"];
}

/** Config, goal paths and the two pre-turn refusals: tmp headroom and intent. */
function resolveLaunch(opts: RunGoalOptions): LaunchSetup {
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
  return { repoRoot, configs, paths };
}

async function openStore(setup: LaunchSetup): Promise<KernelRuntime["store"]> {
  const store = createFolderStore(
    setup.paths.goalDir,
    path.dirname(setup.paths.goalDir),
    setup.configs.process.taskTypes,
  );
  await store.ensureLayout();
  return store;
}

/** The injected harnesses, or the factory's, which owns the launch session dir. */
async function buildHarnesses(
  opts: RunGoalOptions,
  setup: LaunchSetup,
  sessionDir: string,
): Promise<Record<string, Harness>> {
  if (opts.harnesses) return opts.harnesses;
  if (!opts.harnessFactory) return {};
  const { configs } = setup;
  // The acpx adapter refuses a malformed `args`/`env` when constructed, and
  // that happens before pre-flight; report the same shape as a finding so the
  // operator sees the config key instead of a constructor stack.
  const optionFindings = acpxOptionFindings(
    configs.run.harnesses,
    (configs.files ?? configFilePaths(setup.repoRoot)).run,
  );
  if (optionFindings.length > 0) throw new PreflightError(optionFindings);
  return opts.harnessFactory({
    sessionDir,
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
      ? { lsp: { config: artifactLspConfigPath(setup.paths.goalDir) } }
      : {}),
  });
}

async function buildRuntime(
  opts: RunGoalOptions,
  setup: LaunchSetup,
  store: KernelRuntime["store"],
  harnesses: Record<string, Harness>,
): Promise<KernelRuntime> {
  const { repoRoot, configs, paths } = setup;
  return {
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
}

interface LaunchLock {
  signals: DrainController;
  uninstall: (() => void) | undefined;
  lock: RunLockHandle;
}

/** The goal lock; a concurrent launch of the same goal is refused, never shared. */
function acquireLaunchLock(
  opts: RunGoalOptions,
  setup: LaunchSetup,
): LaunchLock {
  const signals = opts.signals ?? createDrainController();
  const uninstall = opts.signals ? undefined : signals.install();
  const lock = acquireRunLock(setup.repoRoot, `goal-${opts.goal}`, {
    runtimeDir: path.join(setup.paths.worktreeRoot, ".factory-runtime"),
  });
  if (!lock) {
    uninstall?.();
    throw new LaunchError(
      `goal "${opts.goal}" is already running in another process`,
    );
  }
  return { signals, uninstall, lock };
}

/**
 * Crash recovery; a base-follow conflict is an infrastructure stop before the
 * first turn, reported as a launch result instead of thrown.
 */
export async function recoverOrInfra(
  runtime: KernelRuntime,
  opts: RunGoalOptions,
  interrupted: number,
): Promise<LaunchResult | undefined> {
  try {
    await recoverLaunch(runtime);
    return undefined;
  } catch (err) {
    if (!(err instanceof BaseFollowConflictError)) throw err;
    console.warn(`[factory] ${err.message}`);
    return {
      goal: opts.goal,
      iterations: 0,
      state: derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      ),
      stop: "infra",
      cause: err.message,
      recoveredRecords: interrupted,
    };
  }
}

export interface PreparedLaunch {
  setup: LaunchSetup;
  store: KernelRuntime["store"];
  runtime: KernelRuntime;
  signals: DrainController;
  uninstall: (() => void) | undefined;
  lock: RunLockHandle;
}

/** Everything a launch needs before its first turn, including the goal lock. */
export async function prepareLaunch(
  opts: RunGoalOptions,
): Promise<PreparedLaunch> {
  const setup = resolveLaunch(opts);
  const store = await openStore(setup);
  const sessions = await createLaunchSessions(
    setup.paths.sessionsDir,
    opts.goal,
    setup.configs.run.sessions.keepRuns,
    { repo: setup.repoRoot },
  );
  const harnesses = await buildHarnesses(opts, setup, sessions.dir);
  await preflight({
    configs: setup.configs,
    paths: setup.paths,
    store,
    harnesses: new Map(Object.entries(harnesses)),
    binaries: opts.binaries,
    catalog: opts.modelCatalog,
    baseGates: opts.baseGates,
  });
  const runtime = await buildRuntime(opts, setup, store, harnesses);
  const { signals, uninstall, lock } = acquireLaunchLock(opts, setup);
  return { setup, store, runtime, signals, uninstall, lock };
}
