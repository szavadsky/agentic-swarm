import { git, GitError } from "./exec.js";
import type { Repo } from "./repo.js";

/**
 * Commits changes in the given worktree.
 * All git writes are serialized through repo.writeLock (held only per commit).
 * Returns the new commit SHA, or null if there were no changes to commit (unless allowEmpty is true).
 */
export async function commitAll(
  repo: Repo,
  wt: string,
  message: string,
  opts?: { allowEmpty?: boolean; paths?: string[] }
): Promise<string | null> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identity
      ? {
          GIT_AUTHOR_NAME: repo.identity.name,
          GIT_AUTHOR_EMAIL: repo.identity.email,
          GIT_COMMITTER_NAME: repo.identity.name,
          GIT_COMMITTER_EMAIL: repo.identity.email,
        }
      : undefined;

    if (opts?.paths && opts.paths.length > 0) {
      await git(wt, ["add", "-A", "--", ...opts.paths], { env });
    } else {
      await git(wt, ["add", "-A"], { env });
    }

    const diffCheck = await git(wt, ["diff", "--cached", "--quiet"], {
      allowFail: true,
      env,
    });

    if (diffCheck.code === 0 && !opts?.allowEmpty) {
      return null;
    }

    const commitArgs = ["commit", "-m", message];
    if (opts?.allowEmpty) {
      commitArgs.push("--allow-empty");
    }

    await git(wt, commitArgs, { env });
    const headRes = await git(wt, ["rev-parse", "HEAD"], { env });
    return headRes.stdout.trim();
  });
}

/**
 * Returns the current branch name (or "HEAD" if detached) and commit SHA of a worktree.
 */
export async function headOf(wt: string): Promise<{ branch: string; sha: string }> {
  const branchRes = await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const shaRes = await git(wt, ["rev-parse", "HEAD"]);
  return {
    branch: branchRes.stdout.trim(),
    sha: shaRes.stdout.trim(),
  };
}

/**
 * Checks whether commit `a` is an ancestor of commit `b`.
 */
export async function isAncestor(wt: string, a: string, b: string): Promise<boolean> {
  const res = await git(wt, ["merge-base", "--is-ancestor", a, b], {
    allowFail: true,
  });
  if (res.code === 0) return true;
  if (res.code === 1) return false;
  throw new GitError(`merge-base --is-ancestor ${a} ${b}`, res.code, res.stderr, res.stdout);
}
