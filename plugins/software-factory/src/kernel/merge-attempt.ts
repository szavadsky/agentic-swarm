import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { hasConflictMarkers, unmergedFiles } from "../core/git/merge.js";
import { runAgentTurn } from "./agent.js";
import {
  compactSession,
  promptVars,
  resolveRole,
  resumeSessionFor,
} from "./flow-context.js";
import { abortMerge, mergeConflictAsk } from "./merge-conflict.js";
import { commitEdits, scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import type {
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
  headSha,
  integrationHead,
  treeSha,
} from "./worktree.js";

export interface AttemptResult {
  ok: boolean;
  cause?: string;
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

async function concludeAutoMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  cwd: string,
): Promise<boolean> {
  try {
    const commit = await commitAll(
      runtime.repo,
      cwd,
      `factory: ${task.slug} merge integration head`,
    );
    return Boolean(commit);
  } catch {
    return false;
  }
}

async function settleMergeAttempt(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string,
): Promise<RecordEnd> {
  await git(cwd, ["add", "-A"]);
  const flagged = await hasConflictMarkers(cwd);
  if (flagged.length > 0) return {};
  const turn = await runtime.store.startRecord(
    scriptMeta(meta.iteration, "commit", meta),
  );
  const started = Date.parse(turn.meta.startedAt);
  const commit = await commitAll(runtime.repo, cwd, message);
  const head = await headSha(cwd);
  const tree = await treeSha(cwd);
  const edits = await commitEdits(cwd, commit);
  const wallMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
  await turn.finish({ ok: true, commit: head, tree, edits, wallMs });
  return { commit: commit ?? head, tree, edits };
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
  state: TaskState,
): Promise<AttemptResult> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) return { ok: false, cause: ensured.error };
  if (ensured.setup && !ensured.setup.ok) {
    return { ok: false, cause: `setup: ${ensured.setup.error ?? "unknown"}` };
  }
  if (ensured.mergeConflict) {
    const named =
      ensured.mergeConflict.paths.join(", ") ||
      "git reported no unmerged paths";
    await abortMerge(ensured.path);
    return { ok: false, cause: `base-conflict: ${named}` };
  }
  const head = await integrationHead(runtime);
  const before = await headSha(ensured.path);
  const merge = await git(
    ensured.path,
    ["merge", "--no-ff", "--no-commit", head],
    { allowFail: true },
  );
  if (merge.code === 0) {
    if (await concludeAutoMerge(runtime, task, ensured.path))
      return { ok: true };
    await abortMerge(ensured.path);
    return { ok: false, cause: "merge produced no commit" };
  }
  const conflicts = await unmergedFiles(ensured.path);
  if (conflicts.length === 0) {
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause:
        merge.stderr.trim().slice(-500) || "merge failed without conflicts",
    };
  }

  const flow = runtime.configs.process.flows[task.flow];
  const roleName = flow?.steps.find((s) => !s.review)?.role ?? "implementer";
  const target = resolveRole(runtime, roleName, task.tier);
  const base = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.base)
    .sort((a, b) => a.seq - b.seq)[0]?.base;
  const vars = flow
    ? promptVars(runtime, task, ensured.path, records, state.round, flow)
    : {
        task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
        worktree: ensured.path,
        round: String(state.round),
      };
  vars.findings = mergeConflictAsk(head, conflicts);
  vars.base_hash = head;
  vars.head_hash = before;

  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const result = await runAgentTurn(runtime, {
    target,
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
    ...(task.repairTurns !== undefined
      ? { repairTurns: task.repairTurns }
      : {}),
    itemBudget: { used: state.turns, limit: runtime.limits.itemTurns },
    session: await resumeSessionFor(
      runtime,
      task,
      target.alias,
      records,
      ensured.path,
    ),
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(
        runtime,
        ensured.path,
        ensured.branch,
        contained,
      );
      if (breach) return { ok: false, cause: `containment: ${breach}` };
      const settled = await settleMergeAttempt(
        runtime,
        { iteration, slug: task.slug, round: state.round },
        ensured.path,
        `factory: ${task.slug} merge integration head`,
      );
      // Compact where this session ends, as the task-turn settle does: a later
      // fix turn resumes the stored ref. A stop with no accepted outcome keeps
      // the ref as it is.
      if (!outcome || !live) return settled;
      const compacted = await compactSession(runtime, live);
      if (!compacted) return settled;
      return {
        ...settled,
        session: compacted.session,
        ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
      };
    },
  });

  if (breach) {
    await abortMerge(ensured.path);
    return { ok: false, cause: `containment: ${breach}` };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    await abortMerge(ensured.path);
    // Verbatim: `details` is already scrubbed and capped by the classifier.
    const cause = stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
    return { ok: false, infra: { kind: "infra", cause } };
  }
  if (stop?.kind === "cancelled") {
    await abortMerge(ensured.path);
    return { ok: false, cancelled: true };
  }
  const after = await headSha(ensured.path);
  if (after === before) {
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause: result.outcome?.summary ?? "implementer made no merge commit",
    };
  }
  const mergeHead = await git(
    ensured.path,
    ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
    { allowFail: true },
  );
  if (mergeHead.code === 0) {
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause: "merge still in progress after the implementer attempt",
    };
  }
  return { ok: true };
}
