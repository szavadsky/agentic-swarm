import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  acquireRunLock,
  getRunLockPath,
  isRunLockFree,
} from "../../src/cli/lock.js";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import {
  loadConfigs,
  repositoryId,
  resolveGoalPaths,
  toLimits,
} from "../../src/kernel/config.js";
import { runGoal } from "../../src/kernel/launch.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  ensureTaskWorktree,
  prepareIntegrationCheckout,
} from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import { setupFlowRepo } from "./s2-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";

/** Same construction as s2-helpers.makeRuntime, without the checkout recovery. */
async function runtimeFor(repo: TmpRepo, goal: string): Promise<KernelRuntime> {
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, goal);
  const store = createFolderStore(
    paths.goalDir,
    path.dirname(paths.goalDir),
    {},
  );
  await store.ensureLayout();
  return {
    paths,
    configs,
    repo: new Repo({
      mainRoot: repo.dir,
      worktreeRoot: paths.worktreeRoot,
      identity: configs.repo.identity,
    }),
    store,
    harnesses: new Map<string, Harness>(),
    prompts: loadPrompts(configs.process, repo.dir, {}),
    limits: toLimits(configs),
    exhaustedPools: new Map(),
  };
}

function worktreeList(repo: TmpRepo): string {
  return repo.git(["worktree", "list", "--porcelain"]).stdout;
}

function fake(): Record<string, Harness> {
  return { fake: withKernelRoleFallbacks(new FakeHarness({ id: "fake" })) };
}

function addIntent(repo: TmpRepo, goal: string): void {
  const dir = path.join(repo.dir, ".factory/artifacts", goal);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "intent.md"), `# Goal\n\n${goal}.\n`, "utf8");
}

function useSharedWorktreeRoot(repo: TmpRepo, shared: string): void {
  const runYaml = yaml.parse(
    fs.readFileSync(path.join(repo.dir, ".factory/run.yaml"), "utf8"),
  );
  repo.writeFile(
    ".factory/run.yaml",
    yaml.stringify({ worktreeRoot: shared, ...runYaml }),
  );
  repo.commit("shared worktreeRoot");
}

const locks: { release(): void }[] = [];

describe("E1: a second goal's recovery stays inside its own goal", () => {
  registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart1();
  registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart2();
  registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart3();
});

async function goalBSLaunchLeavesGoalSCheckoutPart1(repo: TmpRepo) {
  const a = await runtimeFor(repo, "alpha");
  await prepareIntegrationCheckout(a);
  const taskWt = await ensureTaskWorktree(a, task("t-one"));
  expect(taskWt.created).toBe(true);
  expect(fs.existsSync(taskWt.path)).toBe(true);
  // Uncommitted work in A's task worktree: only A's own recovery may remove it.
  fs.writeFileSync(
    path.join(taskWt.path, "in-progress.txt"),
    "half-done\n",
    "utf8",
  );

  const runtimeDir = path.join(a.paths.worktreeRoot, ".factory-runtime");
  const lockA = acquireRunLock(repo.dir, "goal-alpha", { runtimeDir });
  expect(lockA).not.toBeNull();
  locks.push(lockA!);
  expect(isRunLockFree(repo.dir, "goal-alpha", { runtimeDir }).free).toBe(
    false,
  );

  // A real launch of B, while A's goal lock is held by this (live) process.
  let failed: Error | undefined;
  try {
    await runGoal({
      repo: repo.dir,
      goal: "beta",
      iterations: 1,
      harnesses: fake(),
      baseGates: false,
      // Hermetic prices: the repo-local cache, never the network.
      priceSource: {
        cachePath: path.join(repo.dir, ".factory", "price-cache.json"),
        fetchModels: async () => {
          throw new Error("price fetch disabled in tests");
        },
      },
    });
  } catch (err) {
    failed = err as Error;
  }
  // Recovery ran; the fake harness has no scripted turn.
  expect(failed).toBeInstanceOf(Error);

  return { a, taskWt, runtimeDir, failed };
}

async function goalBSLaunchLeavesGoalSCheckoutPart2(
  repo: TmpRepo,
  scope: Awaited<ReturnType<typeof goalBSLaunchLeavesGoalSCheckoutPart1>>,
) {
  const { failed, taskWt, a, runtimeDir } = scope;
  expect(failed!.message).toContain("no scripted turn");

  const b = await runtimeFor(repo, "beta");
  expect(fs.existsSync(taskWt.path)).toBe(true);
  expect(
    fs.readFileSync(path.join(taskWt.path, "in-progress.txt"), "utf8"),
  ).toBe("half-done\n");
  expect(fs.existsSync(a.paths.goalCheckout)).toBe(true);
  expect(worktreeList(repo)).toContain(path.resolve(a.paths.goalCheckout));
  expect(worktreeList(repo)).toContain(path.resolve(taskWt.path));
  expect(fs.existsSync(b.paths.goalCheckout)).toBe(true);
  expect(b.paths.goalCheckout).not.toBe(a.paths.goalCheckout);
  expect(isRunLockFree(repo.dir, "goal-alpha", { runtimeDir }).free).toBe(
    false,
  );
}

function registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart1(): void {
  it("goal B's launch leaves goal A's checkout and task worktree in the same repo alone", async () => {
    const { repo } = setupFlowRepo({ goal: "alpha" });
    addIntent(repo, "beta");
    try {
      const scope1 = await goalBSLaunchLeavesGoalSCheckoutPart1(repo);
      await goalBSLaunchLeavesGoalSCheckoutPart2(repo, scope1);
    } finally {
      for (const lock of locks) lock.release();
      repo.cleanup();
      fs.rmSync(
        path.resolve(
          repo.dir,
          "..",
          ".factory-worktrees",
          path.basename(repo.dir),
        ),
        {
          recursive: true,
          force: true,
        },
      );
    }
  }, 60_000);
}

/** Locks both repos through one explicit runtime dir. */
function acquireSharedRootLocks(
  shared: string,
  one: ReturnType<typeof setupFlowRepo>,
  two: ReturnType<typeof setupFlowRepo>,
): { release(): void }[] {
  const runtimeDir = path.join(shared, ".factory-runtime");
  const lockA = acquireRunLock(one.repo.dir, "goal-demo", { runtimeDir });
  const lockB = acquireRunLock(two.repo.dir, "goal-demo", { runtimeDir });
  expect(lockA).not.toBeNull();
  expect(lockB).not.toBeNull();
  expect(lockA!.lockPath).not.toBe(lockB!.lockPath);
  expect(getRunLockPath(one.repo.dir, "goal-demo", { runtimeDir })).not.toBe(
    getRunLockPath(two.repo.dir, "goal-demo", { runtimeDir }),
  );
  return [lockA!, lockB!];
}

/** Runs recovery for repo two and returns its unscripted-turn failure. */
async function runUnscriptedRecovery(
  two: ReturnType<typeof setupFlowRepo>,
): Promise<Error> {
  addIntent(two.repo, "demo");
  try {
    await runGoal({
      repo: two.repo.dir,
      goal: "demo",
      iterations: 1,
      harnesses: fake(),
      baseGates: false,
      // Hermetic prices: the repo-local cache, never the network.
      priceSource: {
        cachePath: path.join(two.repo.dir, ".factory", "price-cache.json"),
        fetchModels: async () => {
          throw new Error("price fetch disabled in tests");
        },
      },
    });
  } catch (err) {
    return err as Error;
  }
  throw new Error("recovery was expected to fail on the missing script");
}

/** Asserts repo one's checkout and worktree registration survived repo two. */
function expectRepoOneCheckoutIntact(
  marker: string,
  a: Awaited<ReturnType<typeof runtimeFor>>,
  one: ReturnType<typeof setupFlowRepo>,
  b: Awaited<ReturnType<typeof runtimeFor>>,
): void {
  expect(fs.existsSync(marker)).toBe(true);
  const dotGit = fs.readFileSync(
    path.join(a.paths.goalCheckout, ".git"),
    "utf8",
  );
  expect(dotGit).toContain(path.basename(one.repo.dir));
  expect(worktreeList(one.repo)).toContain(a.paths.goalCheckout);
  expect(fs.existsSync(path.join(a.paths.goalCheckout, "README.md"))).toBe(
    true,
  );
  expect(fs.existsSync(path.join(b.paths.goalCheckout, "README.md"))).toBe(
    true,
  );
}

/** Removes both repos' shared-root worktrees and their temp dirs. */
function cleanupSharedRepos(
  one: ReturnType<typeof setupFlowRepo>,
  two: ReturnType<typeof setupFlowRepo>,
  shared: string,
): void {
  for (const r of [one.repo, two.repo]) {
    fs.rmSync(
      path.join(
        path.dirname(r.dir),
        ".factory-worktrees",
        path.basename(r.dir),
      ),
      { recursive: true, force: true },
    );
  }
  one.repo.cleanup();
  two.repo.cleanup();
  fs.rmSync(shared, { recursive: true, force: true });
}

function registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart2(): void {
  it("two repos with one goal name and one configured worktreeRoot get their own checkout and lock", async () => {
    const shared = fs.mkdtempSync(
      path.join(os.tmpdir(), "repro-e1-shared-wt-"),
    );
    const one = setupFlowRepo({ goal: "demo" });
    const two = setupFlowRepo({ goal: "demo" });
    const locks: { release(): void }[] = [];
    try {
      for (const r of [one.repo, two.repo]) useSharedWorktreeRoot(r, shared);

      const a = await runtimeFor(one.repo, "demo");
      await prepareIntegrationCheckout(a); // launch of repo one / goal demo
      const marker = path.join(a.paths.goalCheckout, "repo-one-only.txt");
      fs.writeFileSync(marker, "repo one\n", "utf8");
      one.repo.git(["add", "-A"], { cwd: a.paths.goalCheckout });
      one.repo.git(["commit", "-m", "repo one marker"], {
        cwd: a.paths.goalCheckout,
      });

      const b = await runtimeFor(two.repo, "demo");
      expect(b.paths.goalCheckout).not.toBe(a.paths.goalCheckout);
      expect(a.paths.goalCheckout).toContain(repositoryId(one.repo.dir));
      expect(b.paths.goalCheckout).toContain(repositoryId(two.repo.dir));
      locks.push(...acquireSharedRootLocks(shared, one, two));

      // Repo two's recovery must not replace repo one's checkout in the shared root.
      const failed = await runUnscriptedRecovery(two);
      // Recovery ran; the fake harness has no scripted turn.
      expect(failed).toBeInstanceOf(Error);
      expect(failed.message).toContain("no scripted turn");
      expectRepoOneCheckoutIntact(marker, a, one, b);
    } finally {
      for (const lock of locks) lock.release();
      cleanupSharedRepos(one, two, shared);
    }
  }, 60_000);
}

function registerE1ASecondGoalSRecoveryStaysInsideItsOwnGoalPart3(): void {
  it("an existing checkout at the old path keeps resolving, and no other repo adopts it", async () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), "repro-e1-legacy-"));
    const one = setupFlowRepo({ goal: "demo" });
    const two = setupFlowRepo({ goal: "demo" });
    try {
      for (const r of [one.repo, two.repo]) useSharedWorktreeRoot(r, shared);

      // The live layout before the repo id: <shared>/<goal> as a linked worktree.
      const legacy = path.join(shared, "demo");
      one.repo.git(["worktree", "add", "-b", "factory/demo", legacy]);

      const a = await runtimeFor(one.repo, "demo");
      expect(a.paths.goalCheckout).toBe(legacy);
      await prepareIntegrationCheckout(a);
      expect(a.paths.goalCheckout).toBe(legacy);
      expect(fs.existsSync(path.join(legacy, "README.md"))).toBe(true);
      const taskWt = await ensureTaskWorktree(a, task("t-one"));
      expect(taskWt.created).toBe(true);
      expect(
        taskWt.path.startsWith(path.join(shared, "demo-tasks") + path.sep),
      ).toBe(true);

      const b = await runtimeFor(two.repo, "demo");
      expect(b.paths.goalCheckout).toBe(
        path.join(shared, repositoryId(two.repo.dir), "demo"),
      );
      expect(b.paths.goalCheckout).not.toBe(legacy);
      expect(fs.existsSync(legacy)).toBe(true);
      expect(fs.readFileSync(path.join(legacy, ".git"), "utf8")).toContain(
        path.basename(one.repo.dir),
      );
    } finally {
      one.repo.cleanup();
      two.repo.cleanup();
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 60_000);
}
