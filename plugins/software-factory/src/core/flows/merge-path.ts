import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig, ProjectConfig, InfraArtifact, GatesBaselineArtifact, DeveloperTarget } from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import {
  mergeParentInto,
  concludeMerge,
  mergeChildIntoParent,
  removeWorktree,
  treeOf,
} from "../git/index.js";
import { runAgentStep, getNextStepAttempt } from "./step-runner.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { runGates } from "../checks/gates.js";
import { runCheck } from "../checks/runner.js";
import type { CheckContext } from "../checks/types.js";
import type { DerivedItemState } from "../derive/item.js";
import type { Semaphore } from "../mutex.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";

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
  /** Wave number driving this merge; keys the persisted attempt ledger. */
  wave?: number;
  turnsSemaphore?: Semaphore;
}

export interface MergeItemResult {
  ok: boolean;
  sha?: string;
  error?: string;
  conflictResolved?: boolean;
  /** Merge attempt number for this item+wave (1-based). */
  mergeAttempt?: number;
}

/**
 * Merge-attempt ledger (§7): persisted per item per wave at
 * `items/<slug>/merge-attempts.yaml` ({attempts: {<waveKey>: <count>}}).
 * File-backed (not journal-scanned) so restarts resume without resetting
 * the bound. Keyed by wave number passed by the caller.
 */
export const MAX_MERGE_ATTEMPTS_PER_WAVE = 2;

export async function readMergeAttempts(taskDir: string, slug: string, waveKey: string): Promise<number> {
  const p = path.join(taskDir, "items", slug, "merge-attempts.yaml");
  if (!fs.existsSync(p)) return 0;
  try {
    const data = await readYaml<{ attempts?: Record<string, number> }>(p);
    return data?.attempts?.[waveKey] ?? 0;
  } catch {
    return 0;
  }
}

export async function recordMergeAttempt(taskDir: string, slug: string, waveKey: string): Promise<number> {
  const p = path.join(taskDir, "items", slug, "merge-attempts.yaml");
  let attempts: Record<string, number> = {};
  if (fs.existsSync(p)) {
    try {
      const data = await readYaml<{ attempts?: Record<string, number> }>(p);
      attempts = { ...(data?.attempts ?? {}) };
    } catch {
      attempts = {};
    }
  }
  const next = (attempts[waveKey] ?? 0) + 1;
  attempts[waveKey] = next;
  await writeYamlAtomic(p, { attempts });
  return next;
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
  const waveKey = String(params.wave ?? item.wave ?? 0);

  return await repo.mergeLocks.runExclusive(parentBranch, async () => {
    // Bound enforcement (single point): past MAX_MERGE_ATTEMPTS_PER_WAVE the
    // merge refuses without touching git — every caller (wave-end redrive,
    // blocked-answer reentry, iteration redrive) funnels through here, so no
    // path can spin past the bound. The caller journals the terminal state
    // with the recorded evidence.
    const priorAttempts = await readMergeAttempts(taskDir, item.slug, waveKey);
    if (priorAttempts >= MAX_MERGE_ATTEMPTS_PER_WAVE) {
      return {
        ok: false,
        mergeAttempt: priorAttempts,
        error: `merge attempts exhausted for ${item.slug} (${priorAttempts}/${MAX_MERGE_ATTEMPTS_PER_WAVE}); refusing further merges with the recorded evidence`,
      };
    }
    const mergeAttempt = await recordMergeAttempt(taskDir, item.slug, waveKey);
    await appendJournal(taskDir, {
      type: "item_merge_started",
      item: item.slug,
      branch: item.branch,
      wave: params.wave ?? item.wave,
      mergeAttempt,
    });
    const preMergeTree = await treeOf(childWt);

    // 1. In child worktree: merge parent into child (§7)
    await appendJournal(taskDir, { type: "item_merge_phase", item: item.slug, phase: "merge-parent-into-child" });
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
      const relTaskDir = path.relative(taskWt, taskDir);
      const recordsDir = path.join(childWt, relTaskDir, "items", item.slug, "steps");

      const integrateAttempt = getNextStepAttempt(recordsDir, "integrate", pipeline.limits?.maxInterruptions ?? 3);
      const integrateRes = await runAgentStep({
        task,
        attempt: integrateAttempt,
        item: item.slug,
        stepId: "integrate",
        stepFragment: "steps/integrate",
        agent: "developer",
        role: "workhorse",
        cwd: childWt,
        taskWt,
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
          mergeAttempt,
          error: `Integrate step failed for item ${item.slug}`,
        };
      }

      const mergeHeadCheck = await git(childWt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
      if (mergeHeadCheck.code === 0) {
        try {
          await concludeMerge(
            repo,
            childWt,
            `factory(${item.slug}): integrate conflict resolution`
          );
        } catch (err: any) {
          await git(childWt, ["merge", "--abort"], { allowFail: true });
          return {
            ok: false,
            mergeAttempt,
            error: err.message ?? `Failed to conclude merge for item ${item.slug}`,
          };
        }
      }
      conflictResolved = true;
    }

    // 2. Tree comparison and check verification if tree differs (§7, §9)
    const postMergeTree = await treeOf(childWt);
    if (postMergeTree !== preMergeTree) {
      await appendJournal(taskDir, { type: "item_merge_phase", item: item.slug, phase: "verify-checks" });
      let infra: InfraArtifact | undefined;
      const infraPath = path.join(taskDir, "infra.yaml");
      if (fs.existsSync(infraPath)) {
        try {
          infra = await readYaml<InfraArtifact>(infraPath);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt infra artifact at ${infraPath}: ${err?.message ?? err}`);
          }
        }
      }

      let baseline: GatesBaselineArtifact | undefined;
      const baselinePath = path.join(taskDir, "gates-baseline.yaml");
      if (fs.existsSync(baselinePath)) {
        try {
          baseline = await readYaml<GatesBaselineArtifact>(baselinePath);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt gates baseline at ${baselinePath}: ${err?.message ?? err}`);
          }
        }
      }

      let lastDeveloperTarget: DeveloperTarget | undefined;
      for (let i = item.records.length - 1; i >= 0; i--) {
        const r = item.records[i]!;
        if (r.output && typeof r.output === "object" && "target" in (r.output as any)) {
          lastDeveloperTarget = (r.output as any).target as DeveloperTarget;
          break;
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
        taskDir,
        target: lastDeveloperTarget,
        limits: pipeline.limits ?? {},
        outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
      };

      // Run gates if configured
      if (infra && infra.gates && infra.gates.length > 0) {
        const gatesOutcome = await runGates(checkCtx);
        if (!gatesOutcome.ok) {
          const failing = gatesOutcome.results.filter((r) => r.status === "fail");
          // Evidence for the consult: command + stderr tail per failing gate.
          // An exit-127 here means "command not found", not an assertion
          // failure — without the command name the error is unactionable.
          const failingEvidence = failing.map((r) => {
            const cmd = r.command ? ` Command: ${r.command}` : "";
            const tail = r.details ? ` Details: ${r.details.slice(-500)}` : "";
            return `${r.id} (exit via status=${r.status}).${cmd}${tail}`;
          });
          await appendJournal(taskDir, {
            type: "item_merge_gates_failed",
            item: item.slug,
            failingGates: failing.map((r) => r.id),
            results: gatesOutcome.results.map((r) => ({ id: r.id, status: r.status })),
            evidence: failingEvidence,
          });
          return {
            ok: false,
            mergeAttempt,
            error: `Quality gates failed on merge path for ${item.slug}: ${failing.map((r) => r.id).join(", ") || "unknown gate"}. ${failingEvidence.join(" | ")}`,
          };
        }
      }

      // Run target-green if testRunner and target are configured
      if (infra && infra.testRunner && checkCtx.target) {
        const targetRes = await runCheck("target-green", checkCtx);
        if (!targetRes.ok) {
          const cmdEvidence =
            targetRes.details && typeof targetRes.details === "object" && "command" in (targetRes.details as any)
              ? ` Command: ${(targetRes.details as { command: string }).command}`
              : "";
          const outTail = targetRes.output ? ` Output tail: ${targetRes.output.slice(-500)}` : "";
          await appendJournal(taskDir, {
            type: "item_merge_failed",
            item: item.slug,
            check: "target-green",
            command:
              targetRes.details && typeof targetRes.details === "object" && "command" in (targetRes.details as any)
                ? (targetRes.details as { command: string }).command
                : undefined,
            output: targetRes.output ? targetRes.output.slice(-2000) : undefined,
            error: targetRes.summary,
          });
          return {
            ok: false,
            mergeAttempt,
            error: `target-green failed on merge path for ${item.slug}: ${targetRes.summary}${cmdEvidence}${outTail}`,
          };
        }
      }
    }

    // 3. Merge child into parent with --no-ff (§7)
    await appendJournal(taskDir, { type: "item_merge_phase", item: item.slug, phase: "merge-child-into-parent" });
    const mergeCommitSha = await mergeChildIntoParent(
      repo,
      taskWt,
      item.branch,
      `factory: merge item ${item.slug}`
    );
    // 4. Remove child worktree (branch is kept)
    await appendJournal(taskDir, { type: "item_merge_phase", item: item.slug, phase: "remove-worktree" });
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
      mergeAttempt,
    };
  });
}
