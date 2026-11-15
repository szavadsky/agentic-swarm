import { commitAll } from "../core/git/commit.js";
import { GitError, git } from "../core/git/exec.js";
import { DEFAULT_TIMEOUTS, runAgentTurn } from "./agent.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import {
  checksDue,
  compactSession,
  findStep,
  firstBase,
  flowOf,
  followUpSession,
  isFixTurn,
  promptVars,
  stepTarget,
} from "./flow-context.js";
import { runGates } from "./gates.js";
import { type MergeResult, mergeTask } from "./integrate.js";
import {
  appendChecks,
  appendCommit,
  appendDebt,
  appendFinish,
  appendPark,
  scriptMeta,
} from "./record.js";
import { materialHash } from "./tasks.js";
import type {
  Action,
  FlowDefinition,
  FlowStep,
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

export interface TaskActionResult {
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

/** Mechanical commit, recorded with its tree for no-progress history. */
async function commitStep(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string,
): Promise<RecordEnd> {
  await commitAll(runtime.repo, cwd, message);
  const commit = await headSha(cwd);
  const tree = await treeSha(cwd);
  await appendCommit(runtime.store, meta, commit, tree);
  return { commit, tree };
}

function parkCause(status: string, summary: string | undefined): string {
  return `${status}: ${summary ?? "no summary"}`;
}

/**
 * Infra gate evidence the kernel itself owns: the gate's own wall timeout and
 * the shell's cannot-execute codes. Gate output is not evidence — a failing
 * task may print anything, so output is never consulted.
 */
function isInfraGate(check: {
  ok: boolean;
  summary: string;
  details?: unknown;
}): boolean {
  if (check.ok) return false;
  const summary = check.summary.toLowerCase();
  if (summary.includes("timed out")) return true;
  if (/exit 12[67]/.test(summary)) return true;
  if (
    typeof check.details === "object" &&
    check.details !== null &&
    (check.details as { kind?: unknown }).kind === "infra"
  )
    return true;
  return false;
}

/** A tree with no tracked edits and no merge in flight; untracked files count as dirty. */
async function worktreeClean(cwd: string): Promise<boolean> {
  const status = await git(cwd, ["status", "--porcelain"], { allowFail: true });
  return status.code === 0 && status.stdout.trim() === "";
}

/**
 * Mirrors `mergeRef` in worktree.ts (outside this task's scope): a conflict
 * aborts the merge and reports the unmerged paths; any other refusal leaves no
 * merge state and is thrown.
 */
async function mergeIntegrationHead(
  cwd: string,
  ref: string,
  env: Record<string, string> | undefined,
): Promise<{ ok: true } | { ok: false; paths: string[] }> {
  const merge = await git(cwd, ["merge", "--no-edit", ref], {
    allowFail: true,
    env,
  });
  if (merge.code === 0) return { ok: true };
  const unmerged = await git(cwd, ["diff", "--name-only", "--diff-filter=U"], {
    allowFail: true,
  });
  const paths = unmerged.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
  const head = await git(
    cwd,
    ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    { allowFail: true },
  );
  if (head.code === 0) await git(cwd, ["merge", "--abort"]);
  if (head.code !== 0 && paths.length === 0) {
    throw new GitError(
      `merge --no-edit ${ref}`,
      merge.code,
      merge.stderr,
      merge.stdout,
    );
  }
  return { ok: false, paths };
}

async function handleStepResult(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  state: TaskState,
  flow: FlowDefinition,
  iteration: number,
  worktree: string,
  preexisting: ReadonlySet<string>,
  stop: StepRecord["stop"],
  outcome: StepRecord["outcome"],
): Promise<TaskActionResult> {
  const meta = { iteration, slug: task.slug, round: state.round };
  const infraResult =
    stop?.kind === "infra"
      ? {
          infra: {
            kind: "infra" as const,
            cause: stop.details ? `${stop.cause}: ${stop.details}` : stop.cause,
          },
        }
      : undefined;
  const cancelledResult =
    stop?.kind === "cancelled" ? { cancelled: true } : undefined;

  // A valid outcome is kept even when the turn stopped on infra or was
  // cancelled: the record still carries the outcome and derive advances on it.
  // Only a turn with no outcome is a pure infra/cancelled stop.
  if (infraResult && !outcome) return infraResult;
  if (cancelledResult && !outcome) return cancelledResult;
  if (stop?.kind === "truncated") return {};
  if (stop?.kind === "refusal") {
    await appendPark(
      runtime.store,
      meta,
      `refused: ${stop.details ?? "no details"}`,
    );
    return infraResult ?? cancelledResult ?? {};
  }
  const status = outcome?.status;
  if (status === "blocked" || status === "failed" || status === "upscope") {
    await appendPark(runtime.store, meta, parkCause(status, outcome?.summary));
    return infraResult ?? cancelledResult ?? {};
  }
  if (step.review) {
    const lastRound = state.round >= flow.reviewRounds;
    if (outcome?.verdict === "reject") {
      await appendPark(
        runtime.store,
        meta,
        `review rejected: ${outcome.summary}`,
      );
    } else if (lastRound && outcome?.verdict === "changes") {
      await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
    } else if (
      lastRound &&
      outcome?.verdict === "approve" &&
      outcome.concerns.length > 0
    ) {
      await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
    } else if (!outcome?.verdict) {
      await appendPark(
        runtime.store,
        meta,
        `review produced no verdict: ${outcome?.summary ?? "no summary"}`,
      );
    }
    return infraResult ?? cancelledResult ?? {};
  }
  if (checksDue(flow, step.id)) {
    const checks = await runGates(runtime, worktree);
    for (const check of checks) {
      if (!check.ok && isInfraGate(check)) {
        check.details = {
          ...(typeof check.details === "object" && check.details
            ? check.details
            : {}),
          kind: "infra",
        };
      }
    }
    await appendChecks(runtime.store, meta, checks, { preexisting });
  }
  return infraResult ?? cancelledResult ?? {};
}

interface StepDeps {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  iteration: number;
  step: FlowStep;
  flow: FlowDefinition;
}

async function runStep(deps: StepDeps): Promise<TaskActionResult> {
  const { runtime, task, state, iteration, step, flow } = deps;
  const records = await runtime.store.listRecords();
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      ensured.error,
    );
    return {};
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = `worktree setup failed: ${ensured.setup.error ?? "unknown"}`;
    await runtime.store.appendRecord(
      scriptMeta(iteration, "setup", { slug: task.slug, round: state.round }),
      {
        ok: false,
        cause,
      },
    );
    await appendPark(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      cause,
    );
    return {};
  }

  const meta = { iteration, slug: task.slug, round: state.round };
  // A reused `base:` worktree advances to the current integration head before
  // the turn, the same advance a created one gets (B6); a created worktree
  // moved inside ensureTaskWorktree. A clean tree merges the head with the
  // creation conflict path; a dirty tree keeps the state the last turn left.
  let startPoint = ensured.startPoint;
  if (
    task.base &&
    !ensured.created &&
    !step.review &&
    (await worktreeClean(ensured.path))
  ) {
    const head = await integrationHead(runtime);
    const attempt = await mergeIntegrationHead(
      ensured.path,
      head,
      runtime.repo.identityEnv(),
    );
    if (!attempt.ok) {
      const named =
        attempt.paths.join(", ") || "git reported no unmerged paths";
      await appendPark(runtime.store, meta, `base-conflict: ${named}`);
      return {};
    }
    startPoint = head;
  }
  const preexisting = preexistingRed(recordedBaseGates(records));
  const target = stepTarget(runtime, task, state, step.id);
  // A fix turn resumes the implement session in this worktree; a first turn is
  // always de novo — the front's session is cwd-bound to the goal checkout.
  const session = isFixTurn(flow, state, step.id)
    ? await followUpSession(runtime, task, target, records, ensured.path)
    : undefined;
  const vars = promptVars(
    runtime,
    task,
    ensured.path,
    records,
    state.round,
    flow,
  );
  vars.base_hash = firstBase(records, task.slug) ?? startPoint;
  vars.head_hash = await headSha(ensured.path);
  // A turn may only change its own worktree (implementer.md). Snapshot the
  // shared checkouts now; the settle below refuses the commit on any breach.
  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const aliasTimeouts = target.timeouts;
  const turnMinutes = (runtime.limits as { turnMinutes?: number }).turnMinutes;
  const turnMinutesMs =
    turnMinutes !== undefined ? Math.round(turnMinutes * 60_000) : undefined;
  const timeouts =
    turnMinutesMs !== undefined
      ? {
          idleMs: aliasTimeouts?.idleMs ?? DEFAULT_TIMEOUTS.idleMs,
          wallMs: Math.min(
            aliasTimeouts?.wallMs ?? DEFAULT_TIMEOUTS.wallMs,
            turnMinutesMs,
          ),
        }
      : (aliasTimeouts ?? DEFAULT_TIMEOUTS);
  const result = await runAgentTurn(runtime, {
    target,
    cwd: ensured.path,
    meta: {
      ...meta,
      step: step.id,
      base: firstBase(records, task.slug) ?? startPoint,
      taskHash: materialHash(task),
    },
    vars,
    expectation: step.review ? "review" : "any",
    session,
    timeouts,
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(
        runtime,
        ensured.path,
        ensured.branch,
        contained,
      );
      if (breach) return { ok: false, cause: `containment: ${breach}` };
      const settled = await commitStep(
        runtime,
        meta,
        ensured.path,
        `factory: ${task.slug} ${step.id} r${state.round}`,
      );
      // Compact where the session ends, so the stored ref is already compacted
      // when a later fix turn resumes it. An infra/refusal stop delivers no
      // outcome; that session is not kept.
      if (!outcome || !live) return settled;
      const compacted = await compactSession(runtime, live);
      return compacted ? { ...settled, session: compacted } : settled;
    },
  });
  if (breach) {
    await appendPark(runtime.store, meta, `containment: ${breach}`);
    return {};
  }
  return handleStepResult(
    runtime,
    task,
    step,
    state,
    flow,
    iteration,
    ensured.path,
    preexisting,
    result.record.stop,
    result.outcome,
  );
}

async function runChecks(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  iteration: number,
): Promise<TaskActionResult> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      ensured.error,
    );
    return {};
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = `worktree setup failed: ${ensured.setup.error ?? "unknown"}`;
    await runtime.store.appendRecord(
      scriptMeta(iteration, "setup", { slug: task.slug, round: state.round }),
      {
        ok: false,
        cause,
      },
    );
    await appendPark(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      cause,
    );
    return {};
  }
  const checks = await runGates(runtime, ensured.path);
  for (const check of checks) {
    if (!check.ok && isInfraGate(check)) {
      check.details = {
        ...(typeof check.details === "object" && check.details
          ? check.details
          : {}),
        kind: "infra",
      };
    }
  }
  const preexisting = preexistingRed(
    recordedBaseGates(await runtime.store.listRecords()),
  );
  await appendChecks(
    runtime.store,
    { iteration, slug: task.slug, round: state.round },
    checks,
    {
      preexisting,
    },
  );
  return {};
}

/** Executes one dispatch action; every script step writes its own record. */
export async function executeTaskAction(
  runtime: KernelRuntime,
  task: TaskFile,
  action: Action,
  iteration: number,
  state: TaskState,
): Promise<TaskActionResult | MergeResult> {
  if (action.kind === "step") {
    const flow = flowOf(runtime, task);
    const step = findStep(flow, action.step);
    return runStep({ runtime, task, state, iteration, step, flow });
  }
  if (action.kind === "checks") {
    return runChecks(runtime, task, state, iteration);
  }
  if (action.kind === "merge") {
    return mergeTask(runtime, task, iteration, state);
  }
  if (action.kind === "finish") {
    await appendFinish(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      state.commit,
    );
    return {};
  }
  if (action.kind === "park") {
    await appendPark(
      runtime.store,
      { iteration, slug: task.slug, round: state.round },
      action.cause,
    );
    return {};
  }
  return {};
}
