/** Creating and ensuring a task's worktree. */

import fs from "node:fs";
import path from "node:path";
import { runWorktreeSetup } from "../../core/checks/setup.js";
import type { SetupResult } from "../../core/checks/setup.js";
import { git } from "../../core/git/exec.js";
import { reapGateProcesses } from "../gates.js";
import type { KernelRuntime, TaskFile } from "../types.js";
import type { EnsuredWorktree, WorktreeCreation } from "./types.js";
import {
  abortInFlightMerge,
  branchExists,
  integrationHead,
  mergeRef,
  registeredWorktrees,
  taskBranchName,
  taskWorktreePath,
} from "./checkout.js";

/**
 * Setup runs once per worktree, recorded in the worktree's git dir (outside the
 * tree, so it never enters a commit). A crash between `worktree add` and setup
 * therefore still runs setup before the first check.
 */
async function setupMarker(cwd: string): Promise<string | null> {
  const res = await git(cwd, ["rev-parse", "--git-dir"], { allowFail: true });
  if (res.code !== 0) return null;
  return path.join(path.resolve(cwd, res.stdout.trim()), "factory-setup-done");
}

/** Adds the task worktree and, for a continuation, merges the head into it. */
async function createTaskWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
  wtPath: string,
  branch: string,
  startSha: string,
  startPoint: string,
): Promise<WorktreeCreation> {
  if (fs.existsSync(wtPath)) {
    await reapGateProcesses(wtPath);
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  let current = startPoint;
  let conflict: WorktreeCreation["conflict"];
  await runtime.repo.writeLock.runExclusive(async () => {
    if (await branchExists(runtime, branch)) {
      await git(runtime.paths.repoRoot, ["worktree", "add", wtPath, branch]);
    } else {
      await git(runtime.paths.repoRoot, [
        "worktree",
        "add",
        "-b",
        branch,
        wtPath,
        startSha,
      ]);
    }
    if (!task.base) return;
    // The parked branch is never rewritten: only this continuation branch moves.
    // A conflict stays in progress for the first turn to resolve instead of
    // parking before it; the caller decides (first turn resolves, later parks).
    current = await integrationHead(runtime);
    const attempt = await mergeRef(
      wtPath,
      current,
      runtime.repo.identityEnv(),
      {
        leaveConflict: true,
      },
    );
    if (!attempt.ok) conflict = { paths: attempt.paths, head: current };
  });
  return { startPoint: current, conflict };
}

/** Runs the repo's setup commands once per worktree, unless its marker holds. */
async function ensureSetup(
  runtime: KernelRuntime,
  wtPath: string,
  created: boolean,
): Promise<SetupResult | undefined> {
  if (runtime.configs.repo.setup.length === 0) return undefined;
  const marker = await setupMarker(wtPath);
  if (!created && marker && fs.existsSync(marker)) return undefined;
  const setup = await runWorktreeSetup({
    commands: runtime.configs.repo.setup,
    cwd: wtPath,
  });
  if (setup.ok && marker) {
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  }
  return setup;
}

/** The result for a task branch whose start point does not exist. */
function missingBranchWorktree(
  wtPath: string,
  branch: string,
  branchPoint: string,
): EnsuredWorktree {
  return {
    path: wtPath,
    branch,
    created: false,
    startPoint: branchPoint,
    error: `branch "${branchPoint}" does not exist`,
  };
}

/** The result for a created worktree whose setup failed. */
function failedSetupWorktree(
  wtPath: string,
  branch: string,
  created: boolean,
  startPoint: string,
  setup: SetupResult,
): EnsuredWorktree {
  return {
    path: wtPath,
    branch,
    created,
    startPoint,
    setup,
    error: setup.error,
  };
}

export async function ensureTaskWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
): Promise<EnsuredWorktree> {
  const branch = taskBranchName(runtime, task.slug);
  const wtPath = taskWorktreePath(runtime, task.slug);
  const branchPoint = task.base
    ? taskBranchName(runtime, task.base)
    : runtime.paths.integrationBranch;

  const branchPointExists = await branchExists(runtime, branchPoint);
  if (!branchPointExists)
    return missingBranchWorktree(wtPath, branch, branchPoint);
  const startSha = (
    await git(runtime.paths.repoRoot, ["rev-parse", branchPoint])
  ).stdout.trim();
  let startPoint = task.base ? await integrationHead(runtime) : startSha;

  const registered = (await registeredWorktrees(runtime)).map((p) =>
    path.resolve(p),
  );
  let created = false;
  let conflict: WorktreeCreation["conflict"];
  if (!registered.includes(path.resolve(wtPath))) {
    const worktree = await createTaskWorktree(
      runtime,
      task,
      wtPath,
      branch,
      startSha,
      startPoint,
    );
    startPoint = worktree.startPoint;
    conflict = worktree.conflict;
    created = true;
  }

  const setup = await ensureSetup(runtime, wtPath, created);
  if (setup && !setup.ok) {
    if (conflict) await abortInFlightMerge(wtPath);
    return failedSetupWorktree(wtPath, branch, created, startPoint, setup);
  }
  return {
    path: wtPath,
    branch,
    created,
    startPoint,
    setup,
    ...(conflict ? { mergeConflict: conflict } : {}),
  };
}

/** Head of the task worktree; also used as the reviewer's diff head. */
export async function headSha(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "HEAD"])).stdout.trim();
}
