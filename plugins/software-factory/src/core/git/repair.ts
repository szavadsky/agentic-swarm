import { git } from "./exec.js";
import { matchGlobs } from "./diff.js";
import type { Repo } from "./repo.js";

/**
 * Performs start-up repair on a worktree per §6.3.6:
 * - If MERGE_HEAD exists → git merge --abort.
 * - Task worktree:
 *     uncommitted operator-editable files committed as "factory: operator edits";
 *     everything else uncommitted → git stash push -u -m factory-stray-{ts} (never discarded).
 * - Item worktree:
 *     dirty → commit "interrupted".
 */
export async function repairWorktree(
  repo: Repo,
  wt: string,
  kind: "task" | "item",
  opts: { operatorEditable: string[] }
): Promise<{ actions: string[] }> {
  return repo.writeLock.runExclusive(async () => {
    const actions: string[] = [];
    const env = repo.identity
      ? {
          GIT_AUTHOR_NAME: repo.identity.name,
          GIT_AUTHOR_EMAIL: repo.identity.email,
          GIT_COMMITTER_NAME: repo.identity.name,
          GIT_COMMITTER_EMAIL: repo.identity.email,
        }
      : undefined;

    // 1. Abort merge in progress if MERGE_HEAD is present
    const mhCheck = await git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
      allowFail: true,
      env,
    });
    if (mhCheck.code === 0) {
      await git(wt, ["merge", "--abort"], { env });
      actions.push("abort_merge");
    }

    // 2. Check for dirty/uncommitted changes
    const statusRes = await git(wt, ["status", "--porcelain"], { env });
    const dirtyLines = statusRes.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (dirtyLines.length === 0) {
      return { actions };
    }

    if (kind === "item") {
      // Item worktree: commit everything as "interrupted"
      await git(wt, ["add", "-A"], { env });
      await git(wt, ["commit", "-m", "interrupted"], { env });
      actions.push("commit_interrupted");
      return { actions };
    }

    // Task worktree: partition into operator-editable vs stray dirt
    const operatorFiles: string[] = [];
    for (const line of dirtyLines) {
      let filePath = line.slice(2).trim();
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ")[1]?.trim() ?? filePath;
      }
      if (matchGlobs(filePath, opts.operatorEditable)) {
        operatorFiles.push(filePath);
      }
    }

    if (operatorFiles.length > 0) {
      await git(wt, ["add", "--", ...operatorFiles], { env });
      await git(wt, ["commit", "-m", "factory: operator edits"], { env });
      actions.push("commit_operator_edits");
    }

    // Check if any stray dirt remains
    const remainingStatus = await git(wt, ["status", "--porcelain"], { env });
    if (remainingStatus.stdout.trim().length > 0) {
      const ts = Date.now();
      const stashMsg = `factory-stray-${ts}`;
      await git(wt, ["stash", "push", "-u", "-m", stashMsg], { env });
      actions.push(`stash_stray:${stashMsg}`);
    }

    return { actions };
  });
}
