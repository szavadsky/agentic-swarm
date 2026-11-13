import { git } from "../core/git/exec.js";
import { commitAll } from "../core/git/commit.js";
import { hasConflictMarkers, unmergedFiles } from "../core/git/merge.js";
import { runAgentTurn } from "./agent.js";
import { promptVars, resolveRole, resumeSessionFor } from "./flow-context.js";
import { scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
  headSha,
  integrationHead,
  treeSha,
} from "./worktree.js";
import type { KernelRuntime, RecordEnd, StepRecord, TaskFile, TaskState } from "./types.js";

export interface AttemptResult {
  ok: boolean;
  cause?: string;
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

async function abortMerge(cwd: string): Promise<void> {
  await git(cwd, ["merge", "--abort"], { allowFail: true });
}

async function concludeAutoMerge(runtime: KernelRuntime, task: TaskFile, cwd: string): Promise<boolean> {
  try {
    const commit = await commitAll(runtime.repo, cwd, `factory: ${task.slug} merge integration head`);
    return Boolean(commit);
  } catch {
    return false;
  }
}

async function settleMergeAttempt(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string
): Promise<RecordEnd> {
  await git(cwd, ["add", "-A"]);
  const flagged = await hasConflictMarkers(cwd);
  if (flagged.length > 0) return {};
  const commit = await commitAll(runtime.repo, cwd, message);
  const head = await headSha(cwd);
  const tree = await treeSha(cwd);
  await runtime.store.appendRecord(scriptMeta(meta.iteration, "commit", meta), {
    ok: true,
    commit: head,
    tree,
  });
  return { commit: commit ?? head, tree };
}

/**
 * After a squash conflict: one attempt by the task's implementer session to
 * merge the integration head into its branch. No rebase, no second attempt.
 */
export async function attemptConflictMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState
): Promise<AttemptResult> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) return { ok: false, cause: ensured.error };
  if (ensured.setup && !ensured.setup.ok) {
    return { ok: false, cause: `setup: ${ensured.setup.error ?? "unknown"}` };
  }
  const head = await integrationHead(runtime);
  const before = await headSha(ensured.path);
  const merge = await git(ensured.path, ["merge", "--no-ff", "--no-commit", head], { allowFail: true });
  if (merge.code === 0) {
    if (await concludeAutoMerge(runtime, task, ensured.path)) return { ok: true };
    await abortMerge(ensured.path);
    return { ok: false, cause: "merge produced no commit" };
  }
  const conflicts = await unmergedFiles(ensured.path);
  if (conflicts.length === 0) {
    await abortMerge(ensured.path);
    return { ok: false, cause: merge.stderr.trim().slice(-500) || "merge failed without conflicts" };
  }

  const flow = runtime.configs.process.flows[task.flow];
  const roleName = flow?.steps.find((s) => !s.review)?.role ?? "implementer";
  const target = resolveRole(runtime, roleName);
  const base = records.filter((r) => r.slug === task.slug && r.actor === "agent" && r.base).sort((a, b) => a.seq - b.seq)[0]?.base;
  const vars = flow
    ? promptVars(runtime, task, ensured.path, records, state.round, flow)
    : { task_path: `${runtime.store.tasksDir}/${task.slug}.md`, worktree: ensured.path, round: String(state.round) };
  vars.findings = [
    `The integration head ${head.slice(0, 10)} conflicts with this task branch.`,
    `Conflicted files: ${conflicts.join(", ")}.`,
    "Resolve the conflict in the worktree, keeping both sides' intent. Do not rebase, do not switch branches; the script commits the merge.",
  ].join("\n");
  vars.base_hash = head;
  vars.head_hash = before;

  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const result = await runAgentTurn(runtime, {
    role: target.role,
    cwd: ensured.path,
    meta: {
      iteration,
      slug: task.slug,
      step: "merge-attempt",
      round: state.round,
      ...(base ? { base } : {}),
      taskHash: materialHash(task),
    },
    vars,
    expectation: "any",
    session: await resumeSessionFor(runtime, task, target.alias, records, ensured.path),
    settle: async () => {
      breach = await containmentViolation(runtime, ensured.path, ensured.branch, contained);
      if (breach) return { ok: false, cause: `containment: ${breach}` };
      return settleMergeAttempt(
        runtime,
        { iteration, slug: task.slug, round: state.round },
        ensured.path,
        `factory: ${task.slug} merge integration head`
      );
    },
  });

  if (breach) {
    await abortMerge(ensured.path);
    return { ok: false, cause: `containment: ${breach}` };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    await abortMerge(ensured.path);
    return { ok: false, infra: { kind: "infra", cause: stop.cause } };
  }
  if (stop?.kind === "cancelled") {
    await abortMerge(ensured.path);
    return { ok: false, cancelled: true };
  }
  const after = await headSha(ensured.path);
  if (after === before) {
    await abortMerge(ensured.path);
    return { ok: false, cause: result.outcome?.summary ?? "implementer made no merge commit" };
  }
  const mergeHead = await git(ensured.path, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
  if (mergeHead.code === 0) {
    await abortMerge(ensured.path);
    return { ok: false, cause: "merge still in progress after the implementer attempt" };
  }
  return { ok: true };
}
