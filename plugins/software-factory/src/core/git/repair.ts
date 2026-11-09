import { git } from "./exec.js";
import { matchGlobs } from "./diff.js";
import { porcelainStatus } from "./status.js";
import type { Repo } from "./repo.js";

/**
 * Performs start-up repair on a worktree per §6.3.6:
 * - If MERGE_HEAD exists → git merge --abort.
 * - Task worktree:
 *     all tracked modifications + untracked files under
 *     {orchestrationFolder}/** (engine records: journal.ndjson, state.yaml,
 *     runs/, items/*\/steps, waves/, decisions/, closeup-*.yaml, plan/ — plus
 *     operator inputs: INTENT.md, pipeline.yaml, steer/fromuserpending)
 *     committed as "factory: restart recovery";
 *     only remaining dirt OUTSIDE the orchestration folder (agent droppings,
 *     target src edits, editor backups) → git stash push -u -m
 *     factory-stray-{ts} (never discarded). Engine recovery evidence is
 *     never stashed, so journal-keyed restart detectors stay visible.
 * - Item worktree: same split for its task-dir slice (orchestration dir →
 *     "factory: restart recovery", rest stashed).
 */
export async function repairWorktree(
  repo: Repo,
  wt: string,
  kind: "task" | "item",
  opts: { operatorEditable: string[]; orchestrationFolder?: string }
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

    // Recovery globs: everything under the orchestration folder (engine
    // records + operator inputs) plus legacy operator-editable patterns
    // (e.g. a root INTENT.md outside the orchestration folder).
    const orch = (opts.orchestrationFolder ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    const recoveryGlobs =
      orch && orch !== "."
        ? [`${orch}/**`, ...opts.operatorEditable]
        : [...opts.operatorEditable];

    // Partition dirt: orchestration-folder files → recovery commit;
    // everything else → stash. Never stash engine recovery evidence.
    const recoveryFiles: string[] = [];
    for (const entry of entries) {
      if (matchGlobs(entry.path, recoveryGlobs)) {
        recoveryFiles.push(entry.path);
      }
    }

    if (recoveryFiles.length > 0) {
      await git(wt, ["add", "--", ...recoveryFiles], { env });
      const staged = await git(wt, ["diff", "--cached", "--quiet"], {
        allowFail: true,
        env,
      });
      if (staged.code !== 0) {
        await git(wt, ["commit", "-m", "factory: restart recovery"], { env });
        actions.push("commit_recovery");
      }
    }

    // Check if any stray dirt remains (outside the orchestration folder)
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
