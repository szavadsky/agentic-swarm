import { git } from "./exec.js";
import { headOf } from "./commit.js";
import type { Repo } from "./repo.js";

/**
 * Captures current branch and HEAD SHA of a worktree before an agent turn.
 */
export async function captureHead(wt: string): Promise<{ branch: string; sha: string }> {
  return headOf(wt);
}

/**
 * Enforces HEAD invariants after an agent turn (§7).
 * - If branch changed: check out back to the original branch (preserving working tree changes).
 * - If HEAD moved (agent made commits): soft-reset back to before.sha so changes stay
 *   staged/uncommitted for the engine to commit with standard metadata.
 */
export async function enforceHead(
  repo: Repo,
  wt: string,
  before: { branch: string; sha: string }
): Promise<{ branchChanged: boolean; headMoved: boolean }> {
  const current = await headOf(wt);
  const branchChanged = current.branch !== before.branch;
  const headMoved = current.sha !== before.sha;

  if (!branchChanged && !headMoved) {
    return { branchChanged: false, headMoved: false };
  }

  return repo.writeLock.runExclusive(async () => {
    // If agent committed, soft reset back to recorded SHA first
    if (headMoved) {
      await git(wt, ["reset", "--soft", before.sha]);
    }

    // If agent switched branches, check out back to the original branch
    if (branchChanged) {
      if (before.branch === "HEAD") {
        await git(wt, ["checkout", before.sha]);
      } else {
        await git(wt, ["checkout", before.branch]);
      }
    }

    return { branchChanged, headMoved };
  });
}
