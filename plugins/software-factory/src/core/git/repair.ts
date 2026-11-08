import { git } from "./exec.js";
import { matchGlobs } from "./diff.js";
import { porcelainStatus } from "./status.js";
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
  opts: { operatorEditable: string[]; commitGlobs?: string[] }
): Promise<{ actions: string[] }> {
  return repo.writeLock.runExclusive(async () => {
    const actions: string[] = [];
    const env = repo.identityEnv();

    // 1. Abort merge in progress if MERGE_HEAD is present
    const mhCheck = await git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
      allowFail: true,
      env,
    });
    if (mhCheck.code === 0) {
      await git(wt, ["merge", "--abort"], { env });
      actions.push("abort_merge");
    }

    // 2. Check for dirty/uncommitted changes. -z + untracked-files=all lists
    // every untracked file individually so a new file under an untracked
    // folder (e.g. steer/fromuserpending/) matches its glob instead of being
    // stashed as stray.
    const entries = await porcelainStatus(wt, { env });

    if (entries.length === 0) {
      return { actions };
    }

    if (kind === "item") {
      // Item worktree: commit everything as "interrupted"
      await git(wt, ["add", "-A"], { env });
      await git(wt, ["commit", "-m", "interrupted"], { env });
      actions.push("commit_interrupted");
      return { actions };
    }

    // Task worktree: partition into engine-owned, operator-editable, and stray dirt
    const engineFiles: string[] = [];
    const operatorFiles: string[] = [];
    for (const entry of entries) {
      if (matchGlobs(entry.path, opts.commitGlobs ?? [])) {
        engineFiles.push(entry.path);
      } else if (matchGlobs(entry.path, opts.operatorEditable)) {
        operatorFiles.push(entry.path);
      }
    }

    if (engineFiles.length > 0) {
      await git(wt, ["add", "--", ...engineFiles], { env });
      await git(wt, ["commit", "-m", "factory: concern store recovery"], { env });
      actions.push("commit_concerns");
    }

    if (operatorFiles.length > 0) {
      await git(wt, ["add", "--", ...operatorFiles], { env });
      await git(wt, ["commit", "-m", "factory: operator edits"], { env });
      actions.push("commit_operator_edits");
    }

    // Check if any stray dirt remains
    const remaining = await porcelainStatus(wt, { env });
    if (remaining.length > 0) {
      const ts = Date.now();
      const stashMsg = `factory-stray-${ts}`;
      await git(wt, ["stash", "push", "-u", "-m", stashMsg], { env });
      actions.push(`stash_stray:${stashMsg}`);
    }

    return { actions };
  });
}
