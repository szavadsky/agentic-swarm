// biome-ignore-all lint/complexity: split-rest
import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { unmergedFiles } from "../core/git/merge.js";
import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { boundaryTarget, compactSession } from "./flow-context.js";
import { mergeTask } from "./integrate.js";
import { abortMerge, resolveVars, settleMergeTurn } from "./merge-conflict.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import type {
  Cause,
  KernelRuntime,
  Outcome,
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
} from "./worktree.js";

/** One conflict candidate whose steward leg stopped on infra. */
export interface StewardDead {
  slug: string;
  /** The stop's cause verbatim: dispatch classifies it for the backoff. */
  cause: string;
  details?: string;
}

export interface StewardResult {
  skipped: boolean;
  attempted: string[];
  landed: string[];
  unmerged: string[];
  /**
   * Candidates whose leg stopped on infra. Dispatch books the fault against
   * the slug; the remaining candidates still ran.
   */
  dead: StewardDead[];
  cancelled?: boolean;
}

export interface StewardOptions {
  /**
   * Slugs whose infra fault has no live leg this pass: a fatal cause, spent
   * re-dispatches, or a backoff the loop will not spend (a drain or a stop
   * request). Their work waits for the next launch, so the steward skips them.
   */
  frozen?: ReadonlySet<string>;
}

interface StewardAttempt {
  ok: boolean;
  cause?: Cause;
  infra?: { kind: "infra"; cause: string; details?: string };
  cancelled?: boolean;
  session?: SessionRef;
  outcome?: Outcome;
  agentTurn: boolean;
}

function pointerConcern(
  slug: string,
  status: Cause,
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
        text: `steward: ${slug} unmerged (${formatCause(status)}); worktree ${worktree}; branch ${branch}`,
        evidence: `records steward ${slug}`,
      },
    ],
    forward: [],
  };
}

/** Commits the merge HEAD already built in the steward worktree. */
async function commitMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  cwd: string,
): Promise<{ ok: true } | { ok: false; cause: Cause }> {
  try {
    const commit = await commitAll(
      runtime.repo,
      cwd,
      `factory: ${task.slug} merge integration head`,
    );
    if (commit) return { ok: true };
    return {
      ok: false,
      cause: makeCause("merge-failed", "merge produced no commit"),
    };
  } catch (err) {
    return {
      ok: false,
      cause: makeCause(
        "merge-failed",
        `merge commit failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    };
  }
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
  if (ensured.error) {
    return {
      ok: false,
      cause: makeCause("setup", ensured.error),
      agentTurn: false,
    };
  }
  if (ensured.setup && !ensured.setup.ok) {
    return {
      ok: false,
      cause: makeCause("setup", ensured.setup.error ?? "unknown"),
      agentTurn: false,
    };
  }
  if (ensured.mergeConflict) {
    const named =
      ensured.mergeConflict.paths.join(", ") ||
      "git reported no unmerged paths";
    await abortMerge(ensured.path);
    return {
      ok: false,
      cause: makeCause("base-conflict", named),
      agentTurn: false,
    };
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
      cause: makeCause(
        "merge-failed",
        merge.stderr.trim().slice(-500) || "merge failed without conflicts",
      ),
      agentTurn: false,
    };
  }

  const target = boundaryTarget(runtime, "steward", iteration);
  const base = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.base)
    .sort((a, b) => a.seq - b.seq)[0]?.base;
  const vars = resolveVars(
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
    expectation: KERNEL_TURN_STEPS.steward,
    session,
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(
        runtime,
        ensured.path,
        ensured.branch,
        contained,
      );
      if (breach) {
        return { ok: false, cause: makeCause("containment", breach) };
      }
      const settled = await settleMergeTurn(
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
    return {
      ok: false,
      cause: makeCause("containment", breach),
      agentTurn: true,
    };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    await abortMerge(ensured.path);
    return {
      ok: false,
      infra: {
        kind: "infra",
        cause: stop.cause,
        ...(stop.details ? { details: stop.details } : {}),
      },
      agentTurn: true,
    };
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
      cause: makeCause(
        "merge-failed",
        result.outcome?.summary ?? "steward made no merge commit",
      ),
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
      cause: makeCause(
        "merge-failed",
        "merge still in progress after the steward attempt",
      ),
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
  status: Cause,
  worktree: string,
  branch: string,
  outcome: Outcome | undefined,
): Promise<void> {
  if (hasPointer(outcome, branch)) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, "steward", { slug: task.slug, round }),
    {
      ok: false,
      cause: makeCause("held", formatCause(status)),
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
 * a forwarded concern. A candidate whose leg stops on infra is reported as
 * dead and the remaining candidates still run; only a frozen slug (its bounded
 * re-dispatches spent, or a fatal cause) is left for the next launch. Unmerged
 * tasks relaunch via continuations on the new head through the existing
 * `base:` path.
 */
export async function runSteward(
  runtime: KernelRuntime,
  iteration: number,
  opts: StewardOptions = {},
): Promise<StewardResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  // A turn that stopped on infra is not an attempt: its slug gets the
  // task-turn backoff, so a later wave retries it instead of skipping it.
  const attemptedThisWave = new Set(
    records
      .filter(
        (r) =>
          r.iteration === iteration &&
          r.step === "steward" &&
          r.slug &&
          r.stop?.kind !== "infra",
      )
      .map((r) => r.slug!),
  );
  const candidates = tasks
    .filter((t) => {
      const s = state.tasks[t.slug];
      return (
        s?.status === "parked" &&
        s.cause?.kind === "conflict" &&
        !attemptedThisWave.has(t.slug) &&
        !opts.frozen?.has(t.slug)
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
        cause: makeCause("note", "skipped: no conflicts"),
      });
    }
    return { skipped: true, attempted: [], landed: [], unmerged: [], dead: [] };
  }

  const attempted: string[] = [];
  const landed: string[] = [];
  const unmerged: string[] = [];
  const dead: StewardDead[] = [];
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
    if (attempt.infra) {
      dead.push({
        slug,
        cause: attempt.infra.cause,
        ...(attempt.infra.details ? { details: attempt.infra.details } : {}),
      });
      continue;
    }
    if (attempt.cancelled)
      return {
        skipped: false,
        attempted,
        landed,
        unmerged,
        dead,
        cancelled: true,
      };
    if (attempt.session) session = attempt.session;

    const branch = taskBranchName(runtime, slug);
    // The worktree path is stable per slug; read it from the ensured checkout
    // when present, else the branch name is the pointer's locator.
    const ensured = await ensureTaskWorktree(runtime, task);
    const worktree = ensured.path;

    if (!attempt.ok) {
      unmerged.push(slug);
      const status = attempt.cause ?? makeCause("held", "unresolved");
      if (!attempt.agentTurn) {
        await runtime.store.appendRecord(
          scriptMeta(iteration, "steward", {
            slug,
            round: taskState.round,
          }),
          {
            ok: false,
            cause: makeCause("held", formatCause(status)),
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
        {
          ok: true,
          cause: makeCause("note", `auto-merged ${branch} without a turn`),
        },
      );
    }
    // The branch now carries the head; land through the queue without a second
    // agent attempt (kept-land mode: conflict parks, red gates get one flake
    // re-run). Gates are the steward's CI run.
    const merged = await mergeTask(runtime, task, iteration, taskState, {
      keptLand: true,
    });
    if (merged.infra) {
      dead.push({
        slug,
        cause: merged.infra.cause,
        ...(merged.infra.details ? { details: merged.infra.details } : {}),
      });
      continue;
    }
    if (merged.cancelled)
      return {
        skipped: false,
        attempted,
        landed,
        unmerged,
        dead,
        cancelled: true,
      };
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
      const status =
        merge?.cause ?? makeCause("merge-failed", "merge did not land");
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

  return { skipped: false, attempted, landed, unmerged, dead };
}
