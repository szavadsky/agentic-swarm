import { git } from "./exec.js";
import { headOf } from "./commit.js";
import type { Repo } from "./repo.js";

/**
 * Captures current branch and HEAD SHA of a worktree before an agent turn.
 */
export async function captureHead(wt: string): Promise<{ branch: string; sha: string }> {
  return headOf(wt);
}

export interface EnforceHeadResult {
  branchChanged: boolean;
  headMoved: boolean;
  /** Commit the agent made on a foreign branch (branch name + sha), if any. */
  foreignCommit?: { branch: string; sha: string };
}

/**
 * Enforces HEAD invariants after an agent turn (§7).
 * - If branch changed: re-point HEAD to the original branch WITHOUT touching
 *   the foreign branch ref (so the agent's commit there is preserved), then
 *   soft-reset the restored branch to before.sha so the turn's changes stay
 *   staged/uncommitted for the engine to commit with standard metadata.
 * - If HEAD moved on the same branch: soft-reset back to before.sha.
 */
export async function enforceHead(
  repo: Repo,
  wt: string,
  before: { branch: string; sha: string }
): Promise<EnforceHeadResult> {
  const current = await headOf(wt);
  const branchChanged = current.branch !== before.branch;
  const headMoved = current.sha !== before.sha;

  if (!branchChanged && !headMoved) {
    return { branchChanged: false, headMoved: false };
  }

  return repo.writeLock.runExclusive(async () => {
    let foreignCommit: EnforceHeadResult["foreignCommit"];

    if (branchChanged) {
      // Record the foreign commit (if the agent committed there) before
      // restoring HEAD. The foreign branch ref is left untouched.
      const foreignSha = (await headOf(wt)).sha;
      const foreignBranchCheck = await git(
        wt,
        ["rev-parse", "--verify", `refs/heads/${current.branch}`],
        { allowFail: true }
      );
      if (foreignBranchCheck.code === 0) {
        foreignCommit = { branch: current.branch, sha: foreignSha };
      }

      // Re-point HEAD to the original branch without moving the foreign ref.
      if (before.branch === "HEAD") {
        await git(wt, ["checkout", "--detach", before.sha]);
      } else {
        await git(wt, ["symbolic-ref", "HEAD", `refs/heads/${before.branch}`]);
      }

      // Bring the restored branch back to the recorded SHA; the turn's
      // changes stay in the index/working tree for the engine commit.
      if (headMoved) {
        await git(wt, ["reset", "--soft", before.sha]);
      }

      return { branchChanged, headMoved, ...(foreignCommit ? { foreignCommit } : {}) };
    }

    // Same branch, HEAD moved: soft reset back to recorded SHA.
    await git(wt, ["reset", "--soft", before.sha]);
    return { branchChanged, headMoved };
  });
}
