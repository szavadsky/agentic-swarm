import fs from "node:fs";
import path from "node:path";
import { git } from "./exec.js";
import { taskBranch, childBranch, worktreePath } from "./naming.js";
import { commitAll } from "./commit.js";
import { porcelainStatus, parseWorktreeList } from "./status.js";
import type { Repo } from "./repo.js";

/**
 * Returns true when wtPath is registered in `git worktree list --porcelain`
 * (exact path compare, never substring).
 */
async function isWorktreeRegistered(mainRoot: string, wtPath: string): Promise<boolean> {
  const listRes = await git(mainRoot, ["worktree", "list", "--porcelain"], {
    allowFail: true,
  });
  const resolved = path.resolve(wtPath);
  return parseWorktreeList(listRes.stdout).some((p) => path.resolve(p) === resolved);
}

/**
 * Removes a stale folder that exists on disk but is not registered as a
 * worktree (e.g. crash during `worktree add`), so a later `worktree add`
 * does not fail on the existing folder.
 */
async function pruneUnregisteredFolder(mainRoot: string, wtPath: string): Promise<boolean> {
  const registered = await isWorktreeRegistered(mainRoot, wtPath);
  const existsOnDisk = fs.existsSync(wtPath);
  if (registered && existsOnDisk) return true;
  if (!registered && existsOnDisk) {
    await fs.promises.rm(wtPath, { recursive: true, force: true });
  }
  return false;
}

/**
 * Ensures the root task worktree exists.
 * First run:
 *   Validates main checkout is clean except INTENT.md.
 *   Branches topic/{task} from main HEAD.
 *   Creates worktree at {worktreeRoot}/topic_{task}.
 *   Copies INTENT.md to {orchestrationFolder}/{task}/INTENT.md in the task worktree and commits.
 * Idempotent: Subsequent calls reuse the existing worktree.
 * Never touches the main checkout after the task worktree exists.
 */
export async function ensureTaskWorktree(
  repo: Repo,
  task: string,
  opts: { intentPath: string; orchestrationFolder: string }
): Promise<{ branch: string; path: string; created: boolean }> {
  const branch = taskBranch(task);
  const wtPath = worktreePath(repo.worktreeRoot, branch);

  // Prune stale worktree registrations
  await repo.writeLock.runExclusive(() =>
    git(repo.mainRoot, ["worktree", "prune"], { allowFail: true })
  );

  if (await pruneUnregisteredFolder(repo.mainRoot, wtPath)) {
    return { branch, path: wtPath, created: false };
  }

  // Check if the branch already exists
  const branchCheck = await git(
    repo.mainRoot,
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    { allowFail: true }
  );

  if (branchCheck.code === 0) {
    // Branch exists; attach worktree
    await fs.promises.mkdir(path.dirname(wtPath), { recursive: true });
    await repo.writeLock.runExclusive(() =>
      git(repo.mainRoot, ["worktree", "add", wtPath, branch])
    );
    return { branch, path: wtPath, created: false };
  }

  // First run: main checkout must be clean except the INTENT file itself.
  // Use -z + untracked-files=all so a new untracked folder shows up as its
  // individual files (default mode collapses it to one folder entry), and
  // compare exact repo-relative paths only.
  const entries = await porcelainStatus(repo.mainRoot);

  const resolvedIntent = path.resolve(opts.intentPath);
  const relIntent = path.relative(repo.mainRoot, resolvedIntent).replace(/\\/g, "/");

  for (const entry of entries) {
    if (entry.path !== relIntent) {
      throw new Error(
        `Main checkout is dirty (uncommitted changes outside INTENT: ${entry.path})`
      );
    }
  }

  // Read intent content
  const intentContent = await fs.promises.readFile(resolvedIntent, "utf8");

  // Create worktree on new branch from main HEAD
  await fs.promises.mkdir(path.dirname(wtPath), { recursive: true });
  await repo.writeLock.runExclusive(() =>
    git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
  );

  // Write intent inside task worktree orchestration folder
  const destIntent = path.join(wtPath, opts.orchestrationFolder, task, "INTENT.md");
  await fs.promises.mkdir(path.dirname(destIntent), { recursive: true });
  await fs.promises.writeFile(destIntent, intentContent, "utf8");

  // Commit INTENT.md in the task worktree (commitAll acquires writeLock per commit)
  await commitAll(repo, wtPath, "factory: task intent", {
    paths: [path.join(opts.orchestrationFolder, task, "INTENT.md")],
  });

  return { branch, path: wtPath, created: true };
}

/**
 * Ensures a child worktree exists (e.g. topic/{task}--{item} or topic/{task}--{epic}--{item}).
 * Idempotent: reuses existing branch/worktree, prunes stale registrations.
 */
export async function ensureChildWorktree(
  repo: Repo,
  parent: { branch: string; path: string },
  slug: string,
  opts?: { fromRef?: string }
): Promise<{ branch: string; path: string; created: boolean }> {
  const branch = childBranch(parent.branch, slug, { allowReserved: slug === "simple" });
  const wtPath = worktreePath(repo.worktreeRoot, branch);

  await repo.writeLock.runExclusive(() =>
    git(repo.mainRoot, ["worktree", "prune"], { allowFail: true })
  );

  if (await pruneUnregisteredFolder(repo.mainRoot, wtPath)) {
    return { branch, path: wtPath, created: false };
  }

  const branchCheck = await git(
    repo.mainRoot,
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    { allowFail: true }
  );

  await fs.promises.mkdir(path.dirname(wtPath), { recursive: true });

  if (branchCheck.code === 0) {
    await repo.writeLock.runExclusive(() =>
      git(repo.mainRoot, ["worktree", "add", wtPath, branch])
    );
    return { branch, path: wtPath, created: false };
  }

  const fromRef = opts?.fromRef ?? parent.branch;
  await repo.writeLock.runExclusive(() =>
    git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, fromRef])
  );
  return { branch, path: wtPath, created: true };
}

/**
 * Removes a worktree while preserving its branch.
 */
export async function removeWorktree(repo: Repo, wtPath: string): Promise<void> {
  if (fs.existsSync(wtPath)) {
    await repo.writeLock.runExclusive(async () => {
      await git(repo.mainRoot, ["worktree", "remove", "--force", wtPath], {
        allowFail: true,
      });
      await git(repo.mainRoot, ["worktree", "prune"], { allowFail: true });
    });
    if (fs.existsSync(wtPath)) {
      await fs.promises.rm(wtPath, { recursive: true, force: true });
    }
  } else {
    await repo.writeLock.runExclusive(() =>
      git(repo.mainRoot, ["worktree", "prune"], { allowFail: true })
    );
  }
}

/**
 * Resets a scratch worktree (e.g. topic/{task}--simple) recreated freshly from parent tip.
 */
export async function resetScratch(
  repo: Repo,
  parent: { branch: string; path: string },
  slug: string
): Promise<{ branch: string; path: string }> {
  const branch = childBranch(parent.branch, slug, { allowReserved: slug === "simple" });
  const wtPath = worktreePath(repo.worktreeRoot, branch);

  await repo.writeLock.runExclusive(async () => {
    // Remove existing worktree if present
    await git(repo.mainRoot, ["worktree", "remove", "--force", wtPath], {
      allowFail: true,
    });
    await git(repo.mainRoot, ["worktree", "prune"], { allowFail: true });
  });

  if (fs.existsSync(wtPath)) {
    await fs.promises.rm(wtPath, { recursive: true, force: true });
  }

  await repo.writeLock.runExclusive(async () => {
    // Delete existing branch if present
    await git(repo.mainRoot, ["branch", "-D", branch], { allowFail: true });
    await git(repo.mainRoot, ["worktree", "prune"], { allowFail: true });
  });

  // Recreate worktree and branch fresh from parent tip
  await fs.promises.mkdir(path.dirname(wtPath), { recursive: true });
  await repo.writeLock.runExclusive(() =>
    git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, parent.branch])
  );

  return { branch, path: wtPath };
}
