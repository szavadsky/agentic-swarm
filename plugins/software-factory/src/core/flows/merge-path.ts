import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig, ProjectConfig } from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import { runAgentStep } from "./step-runner.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import type { DerivedItemState } from "../derive/item.js";
import type { Semaphore } from "../mutex.js";

export interface MergeItemParams {
  task: string;
  item: DerivedItemState;
  parentBranch: string;
  taskWt: string;
  childWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  taskDir: string;
  turnsSemaphore?: Semaphore;
  onFixLoopNeeded?: (item: DerivedItemState, reason: string) => Promise<void>;
}

export interface MergeItemResult {
  ok: boolean;
  sha?: string;
  error?: string;
  conflictResolved?: boolean;
}

/**
 * Merges parent into child worktree (§7).
 */
async function mergeParentIntoSafe(
  repo: any,
  childWt: string,
  parentBranch: string
): Promise<{ ok: true; sha: string } | { ok: false; conflicts: string[] }> {
  try {
    const { mergeParentInto } = await import("../git/merge.js" as any);
    return await mergeParentInto(repo, childWt, parentBranch);
  } catch {
    const res = await git(childWt, ["merge", parentBranch], { allowFail: true });
    if (res.code === 0) {
      const shaRes = await git(childWt, ["rev-parse", "HEAD"]);
      return { ok: true, sha: shaRes.stdout.trim() };
    }
    // Conflict
    const statusRes = await git(childWt, ["diff", "--name-only", "--diff-filter=U"], { allowFail: true });
    const conflicts = statusRes.stdout.split("\n").map((f) => f.trim()).filter(Boolean);
    return { ok: false, conflicts };
  }
}

/**
 * Concludes merge after integrate step (§7).
 */
async function concludeMergeSafe(
  repo: any,
  childWt: string,
  message: string
): Promise<string> {
  try {
    const { concludeMerge } = await import("../git/merge.js" as any);
    return await concludeMerge(repo, childWt, message);
  } catch {
    await git(childWt, ["add", "-A"], { allowFail: true });
    await git(childWt, ["commit", "-m", message], { allowFail: true });
    const shaRes = await git(childWt, ["rev-parse", "HEAD"]);
    return shaRes.stdout.trim();
  }
}

/**
 * Merges child into parent with --no-ff (§7).
 */
export async function mergeChildIntoParentSafe(
  repo: any,
  parentWt: string,
  childBranch: string,
  message: string
): Promise<string> {
  try {
    const { mergeChildIntoParent } = await import("../git/merge.js" as any);
    return await mergeChildIntoParent(repo, parentWt, childBranch, message);
  } catch {
    const res = await git(parentWt, ["merge", "--no-ff", childBranch, "-m", message]);
    const shaRes = await git(parentWt, ["rev-parse", "HEAD"]);
    return shaRes.stdout.trim();
  }
}

/**
 * Removes child worktree (§7).
 */
async function removeWorktreeSafe(repo: any, wtPath: string): Promise<void> {
  try {
    const { removeWorktree } = await import("../git/worktrees.js" as any);
    await removeWorktree(repo, wtPath);
  } catch {
    try {
      await git(repo?.mainRoot ?? wtPath, ["worktree", "remove", "--force", wtPath], { allowFail: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Returns tree sha of worktree (§7).
 */
async function treeOfSafe(wt: string, rev?: string): Promise<string> {
  try {
    const { treeOf } = await import("../git/merge.js" as any);
    return await treeOf(wt, rev);
  } catch {
    const targetRev = rev ?? "HEAD";
    const res = await git(wt, ["rev-parse", `${targetRev}^{tree}`], { allowFail: true });
    return res.stdout.trim();
  }
}

/**
 * Runs the merge path for a single ready item under the parent's merge lock (§7).
 */
export async function mergeItem(params: MergeItemParams): Promise<MergeItemResult> {
  const {
    task,
    item,
    parentBranch,
    taskWt,
    childWt,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    taskDir,
    turnsSemaphore,
  } = params;

  await appendJournal(taskDir, {
    type: "item_merge_started",
    item: item.slug,
    branch: item.branch,
  });

  // 1. In child worktree: merge parent into child
  const mergeParentRes = await mergeParentIntoSafe(repo, childWt, parentBranch);
  let conflictResolved = false;

  if (!mergeParentRes.ok) {
    // Conflict -> integrate step with developer agent
    await appendJournal(taskDir, {
      type: "merge_conflict",
      item: item.slug,
      conflicts: mergeParentRes.conflicts,
    });

    const diffRes = await git(childWt, ["diff"], { allowFail: true });
    const recordsDir = path.join(taskDir, "items", item.slug, "steps");

    const integrateRes = await runAgentStep({
      task,
      item: item.slug,
      stepId: "integrate",
      stepFragment: "steps/integrate",
      agent: "developer",
      role: "workhorse",
      cwd: childWt,
      taskDir,
      recordsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        item: item.slug,
        diff: diffRes.stdout || `Conflicts in: ${mergeParentRes.conflicts.join(", ")}`,
      },
      turnsSemaphore,
    });

    if (!integrateRes.ok) {
      return {
        ok: false,
        error: `Integrate step failed for item ${item.slug}`,
      };
    }

    await concludeMergeSafe(
      repo,
      childWt,
      `factory(${item.slug}): integrate conflict resolution`
    );
    conflictResolved = true;
  }

  // 2. Tree comparison and check verification if tree differs
  // Check if gates / target-green need to run
  // In full flow: if tree differed, re-run checks.

  // 3. Merge child into parent with --no-ff
  const mergeCommitSha = await mergeChildIntoParentSafe(
    repo,
    taskWt,
    item.branch,
    `factory: merge item ${item.slug}`
  );

  // 4. Remove child worktree (branch is kept)
  await removeWorktreeSafe(repo, childWt);

  // 5. Run after:item.merge hooks (§8.10)
  await runSeamHooks({
    phase: "after",
    seam: "item.merge",
    cwd: taskWt,
    baseRef: parentBranch,
    kind: item.kind,
    isEscalated: item.isEscalated,
    taskKind: "story",
    pipeline,
    project,
    repo,
    harness,
    prompts,
    taskDir,
    item: item.slug,
  });

  await appendJournal(taskDir, {
    type: "item_merged",
    item: item.slug,
    sha: mergeCommitSha,
    conflictResolved,
  });

  return {
    ok: true,
    sha: mergeCommitSha,
    conflictResolved,
  };
}
