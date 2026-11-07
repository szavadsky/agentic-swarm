import { git, GitError } from "./exec.js";
import type { Repo } from "./repo.js";

/**
 * Returns tree SHA of the given revision in the worktree.
 */
export async function treeOf(wt: string, rev: string = "HEAD"): Promise<string> {
  const res = await git(wt, ["rev-parse", `${rev}^{tree}`]);
  return res.stdout.trim();
}

/**
 * Identifies files that are either unmerged or still contain git conflict markers.
 */
export async function hasConflictMarkers(wt: string): Promise<string[]> {
  const conflictedFiles = new Set<string>();

  // Check unmerged index files (diff-filter=U)
  const unmergedRes = await git(wt, ["diff", "--name-only", "--diff-filter=U"], {
    allowFail: true,
  });
  if (unmergedRes.code === 0) {
    for (const f of unmergedRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
      conflictedFiles.add(f);
    }
  }

  // Check porcelain status for conflict codes
  const statusRes = await git(wt, ["status", "--porcelain"], { allowFail: true });
  if (statusRes.code === 0) {
    for (const line of statusRes.stdout.split("\n")) {
      const code = line.slice(0, 2);
      if (["UU", "AA", "UD", "DU", "UA", "AU", "DD"].includes(code)) {
        let filePath = line.slice(3).trim();
        if (filePath.includes(" -> ")) {
          filePath = filePath.split(" -> ")[1]?.trim() ?? filePath;
        }
        if (filePath) conflictedFiles.add(filePath);
      }
    }
  }

  // Check tracked files containing standard conflict marker lines
  const grepRes = await git(
    wt,
    ["grep", "-l", "-E", "^(<<<<<<< |={7}$|>>>>>>> )"],
    { allowFail: true }
  );
  if (grepRes.code === 0) {
    for (const f of grepRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
      conflictedFiles.add(f);
    }
  }

  return Array.from(conflictedFiles).sort();
}

/**
 * Merges parent branch into child worktree.
 * Leaves conflict state on disk for an integrate step if conflicts occur.
 */
export async function mergeParentInto(
  repo: Repo,
  childWt: string,
  parentBranch: string
): Promise<{ ok: true; sha: string } | { ok: false; conflicts: string[] }> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identity
      ? {
          GIT_AUTHOR_NAME: repo.identity.name,
          GIT_AUTHOR_EMAIL: repo.identity.email,
          GIT_COMMITTER_NAME: repo.identity.name,
          GIT_COMMITTER_EMAIL: repo.identity.email,
        }
      : undefined;

    const res = await git(childWt, ["merge", "--no-edit", parentBranch], {
      allowFail: true,
      env,
    });

    if (res.code === 0) {
      const shaRes = await git(childWt, ["rev-parse", "HEAD"], { env });
      return { ok: true, sha: shaRes.stdout.trim() };
    }

    const mhRes = await git(
      childWt,
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      { allowFail: true, env }
    );
    const conflicts = await hasConflictMarkers(childWt);

    if (mhRes.code === 0 || conflicts.length > 0) {
      return { ok: false, conflicts };
    }

    throw new GitError(`git merge ${parentBranch}`, res.code, res.stderr, res.stdout);
  });
}

/**
 * Concludes a resolved merge in the child worktree after integration.
 * Throws if conflict markers or unmerged files remain.
 */
export async function concludeMerge(
  repo: Repo,
  childWt: string,
  message: string
): Promise<string> {
  return repo.writeLock.runExclusive(async () => {
    const conflicts = await hasConflictMarkers(childWt);
    if (conflicts.length > 0) {
      throw new Error(
        `Cannot conclude merge: conflict markers or unmerged files remain in ${conflicts.join(", ")}`
      );
    }

    const env = repo.identity
      ? {
          GIT_AUTHOR_NAME: repo.identity.name,
          GIT_AUTHOR_EMAIL: repo.identity.email,
          GIT_COMMITTER_NAME: repo.identity.name,
          GIT_COMMITTER_EMAIL: repo.identity.email,
        }
      : undefined;

    await git(childWt, ["commit", "-m", message], { env });
    const headRes = await git(childWt, ["rev-parse", "HEAD"], { env });
    return headRes.stdout.trim();
  });
}

/**
 * Merges child branch into parent worktree (--no-ff).
 * Throws GitError on conflict (must not happen after parent merged into child).
 */
export async function mergeChildIntoParent(
  repo: Repo,
  parentWt: string,
  childBranch: string,
  message: string
): Promise<string> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identity
      ? {
          GIT_AUTHOR_NAME: repo.identity.name,
          GIT_AUTHOR_EMAIL: repo.identity.email,
          GIT_COMMITTER_NAME: repo.identity.name,
          GIT_COMMITTER_EMAIL: repo.identity.email,
        }
      : undefined;

    await git(parentWt, ["merge", "--no-ff", "-m", message, childBranch], { env });
    const headRes = await git(parentWt, ["rev-parse", "HEAD"], { env });
    return headRes.stdout.trim();
  });
}
