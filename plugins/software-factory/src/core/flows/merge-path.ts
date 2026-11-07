import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig, ProjectConfig, InfraArtifact, GatesBaselineArtifact } from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import {
  mergeParentInto,
  concludeMerge,
  mergeChildIntoParent,
  removeWorktree,
  treeOf,
} from "../git/index.js";
import { runAgentStep } from "./step-runner.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { runGates } from "../checks/gates.js";
import { runCheck } from "../checks/runner.js";
import type { CheckContext } from "../checks/types.js";
import type { DerivedItemState } from "../derive/item.js";
import type { Semaphore } from "../mutex.js";
import { readYaml } from "../records/io.js";

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
 * Runs the merge path for a single ready item under the parent's merge lock (§7, §9).
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

  return await repo.mergeLocks.runExclusive(parentBranch, async () => {
    await appendJournal(taskDir, {
      type: "item_merge_started",
      item: item.slug,
      branch: item.branch,
    });

    const preMergeTree = await treeOf(childWt);

    // 1. In child worktree: merge parent into child (§7)
    const mergeParentRes = await mergeParentInto(repo, childWt, parentBranch);
    let conflictResolved = false;

    if (!mergeParentRes.ok) {
      // Conflict -> integrate step with developer agent
      await appendJournal(taskDir, {
        type: "merge_conflict",
        item: item.slug,
        conflicts: mergeParentRes.conflicts,
      });

      const diffRes = await git(childWt, ["diff"], { allowFail: true });
      const recordsDir = path.join(childWt, project.orchestrationFolder ?? ".factory", task, "items", item.slug, "steps");

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
        // Abort failed merge so child worktree is not left with MERGE_HEAD
        await git(childWt, ["merge", "--abort"], { allowFail: true });
        return {
          ok: false,
          error: `Integrate step failed for item ${item.slug}`,
        };
      }

      const mergeHeadCheck = await git(childWt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
      if (mergeHeadCheck.code === 0) {
        await concludeMerge(
          repo,
          childWt,
          `factory(${item.slug}): integrate conflict resolution`
        );
      }
      conflictResolved = true;
    }

    // 2. Tree comparison and check verification if tree differs (§7, §9)
    const postMergeTree = await treeOf(childWt);
    if (postMergeTree !== preMergeTree) {
      let infra: InfraArtifact | undefined;
      const infraPath = path.join(taskDir, "infra.yaml");
      if (fs.existsSync(infraPath)) {
        try {
          infra = await readYaml<InfraArtifact>(infraPath);
        } catch {
          // ignore
        }
      }

      let baseline: GatesBaselineArtifact | undefined;
      const baselinePath = path.join(taskDir, "gates-baseline.yaml");
      if (fs.existsSync(baselinePath)) {
        try {
          baseline = await readYaml<GatesBaselineArtifact>(baselinePath);
        } catch {
          // ignore
        }
      }

      const checkCtx: CheckContext = {
        repo,
        wt: childWt,
        base: parentBranch,
        project,
        pipeline,
        infra,
        baseline,
        kind: item.kind,
        item: item.slug,
        task,
        taskWt,
        limits: pipeline.limits ?? {},
        outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
      };

      // Run gates if configured
      if (infra && infra.gates && infra.gates.length > 0) {
        const gatesOutcome = await runGates(checkCtx);
        if (!gatesOutcome.ok) {
          return {
            ok: false,
            error: `Quality gates failed on merge path for ${item.slug}`,
          };
        }
      }

      // Run target-green if testRunner and target are configured
      if (infra && infra.testRunner && checkCtx.target) {
        const targetRes = await runCheck("target-green", checkCtx);
        if (!targetRes.ok) {
          return {
            ok: false,
            error: `target-green failed on merge path for ${item.slug}: ${targetRes.summary}`,
          };
        }
      }
    }

    // 3. Merge child into parent with --no-ff (§7)
    const mergeCommitSha = await mergeChildIntoParent(
      repo,
      taskWt,
      item.branch,
      `factory: merge item ${item.slug}`
    );

    // 4. Remove child worktree (branch is kept)
    await removeWorktree(repo, childWt);

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
  });
}
