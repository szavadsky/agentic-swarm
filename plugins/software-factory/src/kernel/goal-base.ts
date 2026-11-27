/** Current-checkout origin resolution and tracking for the goal branch. */

import { git } from "../core/git/exec.js";
import { resolveBaseCommit } from "./baseline.js";

interface CurrentCheckout {
  /** Named branch currently checked out, or undefined on a detached HEAD. */
  branch: string | undefined;
  commit: string;
}

interface GoalBaseTarget {
  /** Branch name (or `"HEAD"` when detached) for reporting and follow errors. */
  branch: string;
  /** Commit the goal branch starts from or follows. */
  commit: string;
}

function goalBaseConfigKey(integrationBranch: string): string {
  return `branch.${integrationBranch}.factoryBase`;
}

/**
 * Current checkout branch and commit of `repoRoot` without modifying it.
 * Returns undefined only when HEAD has no commit yet (unborn branch).
 */
export async function resolveCurrentCheckout(
  repoRoot: string,
): Promise<CurrentCheckout | undefined> {
  const commitRes = await git(
    repoRoot,
    ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
    { allowFail: true },
  );
  if (commitRes.code !== 0) return undefined;
  const commit = commitRes.stdout.trim();
  if (!commit) return undefined;
  const branchRes = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], {
    allowFail: true,
  });
  const rawBranch = branchRes.code === 0 ? branchRes.stdout.trim() : "";
  const branch = rawBranch && rawBranch !== "HEAD" ? rawBranch : undefined;
  return { branch, commit };
}

/**
 * Records which branch (or detached HEAD as `""`) the goal branch was cut
 * from so followBase and baseline checks track that origin instead of
 * `repo.baseBranch`.
 */
export async function recordGoalBaseBranch(
  repoRoot: string,
  integrationBranch: string,
  branch: string | undefined,
): Promise<void> {
  await git(repoRoot, [
    "config",
    "--local",
    goalBaseConfigKey(integrationBranch),
    branch ?? "",
  ]);
}

/**
 * Resolves the branch and commit `integrationBranch` starts from (when absent)
 * or follows (when present). Returns undefined when the branch was cut from a
 * detached HEAD or its recorded origin branch no longer exists.
 */
export async function resolveGoalFollowTarget(
  repoRoot: string,
  integrationBranch: string,
  configuredBaseBranch: string,
): Promise<GoalBaseTarget | undefined> {
  const integrationCommit = await resolveBaseCommit(
    repoRoot,
    integrationBranch,
  );
  if (!integrationCommit) {
    const current = await resolveCurrentCheckout(repoRoot);
    if (!current) return undefined;
    return { branch: current.branch ?? "HEAD", commit: current.commit };
  }
  const recorded = await git(
    repoRoot,
    ["config", "--local", "--get", goalBaseConfigKey(integrationBranch)],
    { allowFail: true },
  );
  if (recorded.code !== 0) {
    const commit = await resolveBaseCommit(repoRoot, configuredBaseBranch);
    return commit ? { branch: configuredBaseBranch, commit } : undefined;
  }
  const branch = recorded.stdout.trim();
  if (branch === "") return undefined;
  const commit = await resolveBaseCommit(repoRoot, branch);
  return commit ? { branch, commit } : undefined;
}
