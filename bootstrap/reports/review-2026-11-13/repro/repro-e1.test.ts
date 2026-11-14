import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { acquireRunLock, isRunLockFree } from "../../src/cli/lock.js";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths, toLimits } from "../../src/kernel/config.js";
import { runGoal } from "../../src/kernel/launch.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { recoverLaunch } from "../../src/kernel/recovery.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree, prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import { setupFlowRepo } from "./s2-helpers.js";

/** Same construction as s2-helpers.makeRuntime, without the checkout recovery. */
async function runtimeFor(repo: TmpRepo, goal: string): Promise<KernelRuntime> {
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, goal);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
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
    prompts: loadPrompts(configs.process, repo.dir),
    limits: toLimits(configs),
  };
}

function worktreeList(repo: TmpRepo): string {
  return repo.git(["worktree", "list", "--porcelain"]).stdout;
}

function fake(): Record<string, Harness> {
  return { fake: new FakeHarness({ id: "fake" }) };
}

function addIntent(repo: TmpRepo, goal: string): void {
  const dir = path.join(repo.dir, ".factory/artifacts", goal);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "intent.md"), `# Goal\n\n${goal}.\n`, "utf8");
}

describe("E1: launch recovery prunes the whole shared worktreeRoot", () => {
  it("goal B's launch deletes goal A's integration checkout and task worktree in the same repo", async () => {
    const { repo } = setupFlowRepo({ goal: "alpha" });
    addIntent(repo, "beta");
    const locks: { release(): void }[] = [];
    try {
      const a = await runtimeFor(repo, "alpha");
      await prepareIntegrationCheckout(a); // launch of A: creates alpha's integration checkout
      const taskWt = await ensureTaskWorktree(a, task("t-one"));
      expect(taskWt.created).toBe(true);
      expect(fs.existsSync(taskWt.path)).toBe(true);
      // Uncommitted work in A's task worktree: recovery removes it with --force anyway.
      fs.writeFileSync(path.join(taskWt.path, "in-progress.txt"), "half-done\n", "utf8");

      const runtimeDir = path.join(a.paths.worktreeRoot, ".factory-runtime");
      const lockA = acquireRunLock(repo.dir, "goal-alpha", { runtimeDir });
      expect(lockA).not.toBeNull();
      locks.push(lockA!);
      // The lock is per goal: alpha's file is held, beta's path is a different free file.
      expect(isRunLockFree(repo.dir, "goal-alpha", { runtimeDir }).free).toBe(false);
      expect(isRunLockFree(repo.dir, "goal-beta", { runtimeDir }).free).toBe(true);
      expect(path.join(runtimeDir, "locks", "goal-alpha.lock")).not.toBe(
        path.join(runtimeDir, "locks", "goal-beta.lock")
      );

      const before = worktreeList(repo);
      // A real launch of B, while A's goal lock is held by this (live) process.
      let resultText = "";
      try {
        const result = await runGoal({
          repo: repo.dir,
          goal: "beta",
          iterations: 1,
          harnesses: fake(),
          baseGates: false,
        });
        resultText = `stop=${result.stop} iterations=${result.iterations} cause=${result.cause ?? ""}`;
      } catch (err) {
        resultText = `threw: ${(err as Error).message.split("\n")[0]}`;
      }
      const after = worktreeList(repo);

      console.log(
        [
          `[E1] worktreeRoot=${a.paths.worktreeRoot}`,
          `[E1] goalCheckoutA=${a.paths.goalCheckout} exists=${fs.existsSync(a.paths.goalCheckout)}`,
          `[E1] taskWtA=${taskWt.path} exists=${fs.existsSync(taskWt.path)}`,
          `[E1] beta checkout exists=${fs.existsSync(path.join(a.paths.worktreeRoot, "beta"))}`,
          `[E1] alpha lock held after B launch=${!isRunLockFree(repo.dir, "goal-alpha", { runtimeDir }).free}`,
          `[E1] B launch result: ${resultText}`,
          "[E1] worktrees before B launch:",
          before,
          "[E1] worktrees after B launch:",
          after,
        ].join("\n")
      );

      expect(fs.existsSync(taskWt.path)).toBe(false);
      expect(fs.existsSync(a.paths.goalCheckout)).toBe(false);
      expect(fs.existsSync(path.join(a.paths.worktreeRoot, "beta"))).toBe(true);
      expect(isRunLockFree(repo.dir, "goal-alpha", { runtimeDir }).free).toBe(false);
    } finally {
      for (const lock of locks) lock.release();
      repo.cleanup();
      fs.rmSync(path.resolve(repo.dir, "..", ".factory-worktrees", path.basename(repo.dir)), {
        recursive: true,
        force: true,
      });
    }
  }, 60_000);

  it("two repos with one goal name and one configured worktreeRoot share a single checkout path", async () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), "repro-e1-shared-wt-"));
    const one = setupFlowRepo({ goal: "demo" });
    const two = setupFlowRepo({ goal: "demo" });
    const locks: { release(): void }[] = [];
    try {
      for (const r of [one.repo, two.repo]) {
        const runYaml = yaml.parse(fs.readFileSync(path.join(r.dir, ".factory/run.yaml"), "utf8"));
        r.writeFile(".factory/run.yaml", yaml.stringify({ worktreeRoot: shared, ...runYaml }));
        r.commit("shared worktreeRoot");
      }

      const a = await runtimeFor(one.repo, "demo");
      await prepareIntegrationCheckout(a); // launch of repo one / goal demo
      const marker = path.join(a.paths.goalCheckout, "repo-one-only.txt");
      fs.writeFileSync(marker, "repo one\n", "utf8");
      one.repo.git(["add", "-A"], { cwd: a.paths.goalCheckout });
      one.repo.git(["commit", "-m", "repo one marker"], { cwd: a.paths.goalCheckout });

      const b = await runtimeFor(two.repo, "demo");
      expect(b.paths.goalCheckout).toBe(a.paths.goalCheckout);
      expect(b.paths.worktreeRoot).toBe(a.paths.worktreeRoot);

      // The lock directory is also shared: same goal name -> same lock file.
      const runtimeDir = path.join(a.paths.worktreeRoot, ".factory-runtime");
      const lockA = acquireRunLock(one.repo.dir, "goal-demo", { runtimeDir });
      const lockB = acquireRunLock(two.repo.dir, "goal-demo", { runtimeDir });
      expect(lockA).not.toBeNull();
      expect(lockB).toBeNull();
      lockA!.release();

      // Crash case: repo one's lock is stale (dead pid), so repo two's launch takes it over.
      const lockPath = path.join(runtimeDir, "locks", "goal-demo.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 4_000_000, host: os.hostname(), start: new Date(0).toISOString() }, null, 2)
      );
      expect(isRunLockFree(two.repo.dir, "goal-demo", { runtimeDir }).free).toBe(true);

      let resultText = "";
      try {
        const result = await runGoal({
          repo: two.repo.dir,
          goal: "demo",
          iterations: 1,
          harnesses: fake(),
          baseGates: false,
        });
        resultText = `stop=${result.stop} iterations=${result.iterations} cause=${result.cause ?? ""}`;
      } catch (err) {
        resultText = `threw: ${(err as Error).message.split("\n")[0]}`;
      }

      const dotGit = fs.readFileSync(path.join(a.paths.goalCheckout, ".git"), "utf8");
      console.log(
        [
          `[E1b] shared worktreeRoot=${shared}`,
          `[E1b] goalCheckout=${a.paths.goalCheckout}`,
          `[E1b] repoOneMarkerExists=${fs.existsSync(marker)}`,
          `[E1b] .git of checkout now points at repoTwo=${dotGit.includes(path.basename(two.repo.dir))}`,
          `[E1b] .git content=${dotGit.trim()}`,
          `[E1b] repo two launch result: ${resultText}`,
          "[E1b] repo one worktree list:",
          worktreeList(one.repo),
        ].join("\n")
      );

      expect(fs.existsSync(marker)).toBe(false);
      expect(dotGit).toContain(path.basename(two.repo.dir));
      expect(worktreeList(one.repo)).toContain(a.paths.goalCheckout);
      expect(fs.existsSync(path.join(a.paths.goalCheckout, "README.md"))).toBe(true);
    } finally {
      for (const lock of locks) lock.release();
      for (const r of [one.repo, two.repo]) {
        fs.rmSync(path.join(r.dir, "..", ".factory-worktrees", path.basename(r.dir)), {
          recursive: true,
          force: true,
        });
      }
      one.repo.cleanup();
      two.repo.cleanup();
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 60_000);
});
