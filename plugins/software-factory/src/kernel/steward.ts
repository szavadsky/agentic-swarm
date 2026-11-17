import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { hasConflictMarkers, unmergedFiles } from "../core/git/merge.js";
import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { recordedBaseGates } from "./baseline.js";
import { derive } from "./derive.js";
import { compactSession, resolveRole } from "./flow-context.js";
import { formatFailingChecks } from "./gates.js";
import { mergeTask } from "./integrate.js";
import { abortMerge } from "./merge-conflict.js";
import { commitEdits, scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import type {
  KernelRuntime,
  Outcome,
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
  taskBranchName,
  treeSha,
} from "./worktree.js";

export interface StewardResult {
  skipped: boolean;
  attempted: string[];
  landed: string[];
  unmerged: string[];
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

interface StewardAttempt {
  ok: boolean;
  cause?: string;
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
  session?: SessionRef;
  outcome?: Outcome;
  agentTurn: boolean;
}

function stewardVars(
  runtime: KernelRuntime,
  worktree: string,
  branch: string,
  head: string,
  conflicts: string[],
  records: StepRecord[],
): Record<string, string> {
  const base = recordedBaseGates(records);
  return {
    worktree,
    branch,
    integration_head: head,
    conflicts: conflicts.join(", ") || "none",
    gate_commands:
      runtime.configs.repo.gates
        .map((g) => `- ${g.id}: ${g.command}`)
        .join("\n") || "none",
    baseline_checks: base ? formatFailingChecks(base.checks) || "none" : "none",
  };
}

function pointerConcern(
  slug: string,
  status: string,
  worktree: string,
  branch: string,
): Outcome {
  return {
    status: "done",
    summary: `steward held ${slug}: unresolvable merge`,
    concerns: [
      {
        kind: "risk",
        calibration: "architect",
        text: `steward: ${slug} unmerged (${status}); worktree ${worktree}; branch ${branch}`,
        evidence: `records steward ${slug}`,
      },
    ],
    forward: [`steward held ${slug}: relaunch on the new branch state`],
  };
}

/** Commits the merge HEAD already built in the steward worktree. */
async function commitMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  cwd: string,
): Promise<{ ok: true } | { ok: false; cause: string }> {
  try {
    const commit = await commitAll(
      runtime.repo,
      cwd,
      `factory: ${task.slug} merge integration head`,
    );
    if (commit) return { ok: true };
    return { ok: false, cause: "merge produced no commit" };
  } catch (err) {
    return {
      ok: false,
      cause: `merge commit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Commits the steward turn's conflict resolution. A file still carrying
 * conflict markers is not settled: the empty end leaves the worktree for the
 * caller's no-commit path to abort.
 */
async function settleStewardMerge(
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

async function attemptStewardMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  state: TaskState,
  session: SessionRef | undefined,
): Promise<StewardAttempt> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error)
    return { ok: false, cause: ensured.error, agentTurn: false };
  if (ensured.setup && !ensured.setup.ok) {
    return {
      ok: false,
      cause: `setup: ${ensured.setup.error ?? "unknown"}`,
      agentTurn: false,
    };
  }
  if (ensured.mergeConflict) {
    const named =
      ensured.mergeConflict.paths.join(", ") ||
      "git reported no unmerged paths";
    await abortMerge(ensured.path);
    return { ok: false, cause: `base-conflict: ${named}`, agentTurn: false };
  }
  const head = await integrationHead(runtime);
  const before = await headSha(ensured.path);
  const merge = await git(
    ensured.path,
    ["merge", "--no-ff", "--no-commit", head],
    { allowFail: true },
  );
  if (merge.code === 0) {
    const committed = await commitMerge(runtime, task, ensured.path);
    if (committed.ok) return { ok: true, agentTurn: false, session };
    await abortMerge(ensured.path);
    return { ok: false, cause: committed.cause, agentTurn: false };
  }
  const conflicts = await unmergedFiles(ensured.path);
  if (conflicts.length === 0) {
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause:
        merge.stderr.trim().slice(-500) || "merge failed without conflicts",
      agentTurn: false,
    };
  }

  const target = resolveRole(runtime, "steward");
  const base = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.base)
    .sort((a, b) => a.seq - b.seq)[0]?.base;
  const vars = stewardVars(
    runtime,
    ensured.path,
    ensured.branch,
    head,
    conflicts,
    records,
  );
  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const result = await runAgentTurn(runtime, {
    target,
    cwd: ensured.path,
    meta: {
      iteration,
      slug: task.slug,
      step: "steward",
      round: state.round,
      ...(base ? { base } : {}),
      taskHash: materialHash(task),
    },
    vars,
    expectation: "any",
    session,
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(
        runtime,
        ensured.path,
        ensured.branch,
        contained,
      );
      if (breach) return { ok: false, cause: `containment: ${breach}` };
      const settled = await settleStewardMerge(
        runtime,
        { iteration, slug: task.slug, round: state.round },
        ensured.path,
        `factory: ${task.slug} merge integration head`,
      );
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
    return { ok: false, cause: `containment: ${breach}`, agentTurn: true };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    await abortMerge(ensured.path);
    const cause = stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
    return { ok: false, infra: { kind: "infra", cause }, agentTurn: true };
  }
  if (stop?.kind === "cancelled") {
    await abortMerge(ensured.path);
    return { ok: false, cancelled: true, agentTurn: true };
  }
  const storedSession = result.record.session;
  const after = await headSha(ensured.path);
  if (after === before) {
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause: result.outcome?.summary ?? "steward made no merge commit",
      ...(storedSession ? { session: storedSession } : {}),
      ...(result.outcome ? { outcome: result.outcome } : {}),
      agentTurn: true,
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
      cause: "merge still in progress after the steward attempt",
      ...(storedSession ? { session: storedSession } : {}),
      ...(result.outcome ? { outcome: result.outcome } : {}),
      agentTurn: true,
    };
  }
  return {
    ok: true,
    ...(storedSession ? { session: storedSession } : {}),
    ...(result.outcome ? { outcome: result.outcome } : {}),
    agentTurn: true,
  };
}

function hasPointer(outcome: Outcome | undefined, branch: string): boolean {
  if (!outcome) return false;
  const texts = [
    ...outcome.concerns.map((c) => `${c.text} ${c.evidence ?? ""}`),
    ...outcome.forward,
  ].join("\n");
  return texts.includes(branch);
}

async function ensurePointer(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  status: string,
  worktree: string,
  branch: string,
  outcome: Outcome | undefined,
): Promise<void> {
  if (hasPointer(outcome, branch)) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, "steward", { slug: task.slug, round }),
    {
      ok: false,
      cause: `held: ${status}`,
      outcome: pointerConcern(task.slug, status, worktree, branch),
    },
  );
}

/**
 * End-of-wave steward: the one agent that owns cross-task merge state. Runs
 * once per wave end; skipped (and recorded) when no task parks on a merge
 * conflict. Each conflict gets one steward turn in the shared steward session
 * (compacted at settle), then the merge queue lands it with gates; failures
 * hold the task and leave an architect pointer (status, worktree, branch) as
 * a forwarded concern. Unmerged tasks relaunch via continuations on the new
 * head through the existing `base:` path.
 */
export async function runSteward(
  runtime: KernelRuntime,
  iteration: number,
): Promise<StewardResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  const attemptedThisWave = new Set(
    records
      .filter(
        (r) => r.iteration === iteration && r.step === "steward" && r.slug,
      )
      .map((r) => r.slug!),
  );
  const candidates = tasks
    .filter((t) => {
      const s = state.tasks[t.slug];
      return (
        s?.status === "parked" &&
        s.cause?.startsWith("conflict:") &&
        !attemptedThisWave.has(t.slug)
      );
    })
    .map((t) => t.slug)
    .sort();
  if (candidates.length === 0) {
    const recorded = records.some(
      (r) => r.iteration === iteration && r.step === "steward",
    );
    if (!recorded) {
      await runtime.store.appendRecord(scriptMeta(iteration, "steward"), {
        ok: true,
        cause: "skipped: no conflicts",
      });
    }
    return { skipped: true, attempted: [], landed: [], unmerged: [] };
  }

  const attempted: string[] = [];
  const landed: string[] = [];
  const unmerged: string[] = [];
  let session: SessionRef | undefined;

  for (const slug of candidates) {
    const task = tasks.find((t) => t.slug === slug)!;
    const fresh = await runtime.store.listRecords();
    const taskState = derive(
      await runtime.store.listTasks(),
      fresh,
      runtime.configs.process.flows,
    ).tasks[slug]!;
    attempted.push(slug);
    const attempt = await attemptStewardMerge(
      runtime,
      task,
      fresh,
      iteration,
      taskState,
      session,
    );
    if (attempt.infra)
      return {
        skipped: false,
        attempted,
        landed,
        unmerged,
        infra: attempt.infra,
      };
    if (attempt.cancelled)
      return { skipped: false, attempted, landed, unmerged, cancelled: true };
    if (attempt.session) session = attempt.session;

    const branch = taskBranchName(runtime, slug);
    // The worktree path is stable per slug; read it from the ensured checkout
    // when present, else the branch name is the pointer's locator.
    const ensured = await ensureTaskWorktree(runtime, task);
    const worktree = ensured.path;

    if (!attempt.ok) {
      unmerged.push(slug);
      const status = attempt.cause ?? "unresolved";
      if (!attempt.agentTurn) {
        await runtime.store.appendRecord(
          scriptMeta(iteration, "steward", {
            slug,
            round: taskState.round,
          }),
          {
            ok: false,
            cause: `held: ${status}`,
            outcome: pointerConcern(slug, status, worktree, branch),
          },
        );
      } else {
        await ensurePointer(
          runtime,
          task,
          iteration,
          taskState.round,
          status,
          worktree,
          branch,
          attempt.outcome,
        );
      }
      continue;
    }

    if (!attempt.agentTurn) {
      await runtime.store.appendRecord(
        scriptMeta(iteration, "steward", { slug, round: taskState.round }),
        { ok: true, cause: `auto-merged ${branch} without a turn` },
      );
    }
    // The branch now carries the head; land through the queue without a second
    // agent attempt (kept-land mode: conflict parks, red gates get one flake
    // re-run). Gates are the steward's CI run.
    const merged = await mergeTask(runtime, task, iteration, taskState, {
      keptLand: true,
    });
    if (merged.infra)
      return {
        skipped: false,
        attempted,
        landed,
        unmerged,
        infra: merged.infra,
      };
    if (merged.cancelled)
      return { skipped: false, attempted, landed, unmerged, cancelled: true };
    const after = await runtime.store.listRecords();
    const merge = after
      .filter((r) => r.slug === slug && r.step === "merge" && r.endedAt)
      .sort((a, b) => a.seq - b.seq)
      .at(-1);
    if (merge?.ok === true && merge.iteration === iteration) {
      landed.push(slug);
    } else {
      // Parked is terminal: a red gates run cannot ready a fix turn here, so
      // the steward holds and the relaunch happens via a continuation.
      unmerged.push(slug);
      const status = merge?.cause ?? "merge did not land";
      await ensurePointer(
        runtime,
        task,
        iteration,
        taskState.round,
        status,
        worktree,
        branch,
        attempt.outcome,
      );
    }
  }

  return { skipped: false, attempted, landed, unmerged };
}
