import { git } from "../core/git/exec.js";

/**
 * The one resolve ask for a task branch that conflicts with the integration
 * head. The continuation first turn carries it when a `base:` merge conflicts,
 * so a reword stays one edit.
 */
export function mergeConflictAsk(head: string, paths: string[]): string {
  const named = paths.join(", ") || "git reported no unmerged paths";
  return [
    `The integration head ${head.slice(0, 10)} conflicts with this task branch.`,
    `Conflicted files: ${named}.`,
    "Resolve the conflict in the worktree, keeping both sides' intent. Do not rebase, do not switch branches; the script commits the merge.",
  ].join("\n");
}
export async function mergeHeadSha(cwd: string): Promise<string | null> {
  const res = await git(
    cwd,
    ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    {
      allowFail: true,
    },
  );
  if (res.code !== 0) return null;
  const sha = res.stdout.trim();
  return sha ? sha : null;
}

/** Aborts a merge left in flight; no-op when there is none. */
export async function abortMerge(cwd: string): Promise<void> {
  await git(cwd, ["merge", "--abort"], { allowFail: true });
}
