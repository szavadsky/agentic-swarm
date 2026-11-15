import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import type { Harness, TurnRequest, TurnResult } from "../harness/types.js";
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
  mergeRef,
  resetWorktreeToCommit,
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
 * A harness turn that outlives the wall bound keeps running after the agent's
 * race synthesizes its timeout result. The tracker sees the orphan the agent
 * abandoned: still pending at settle, or finished past the bound. An adapter
 * that reports timeout promptly (elapsed under the bound) is not an orphan;
 * its writes are final and settle commits them through the kept-outcome rule.
 */
interface TimeoutTracker {
  harness: Harness;
  timedOut: () => boolean;
  waitSettled: () => Promise<void>;
}

/**
 * Bound on settling orphaned turns after the wall bound fired: the agent
 * already aborted the harness child, so a cooperative orphan is gone long
 * before this; a hung one must not hang the launch. A constant, not a knob.
 */
export const TIMEOUT_SETTLE_GRACE_MS = 5_000;

function trackHarnessTimeouts(inner: Harness): TimeoutTracker {
  let sawTimeout = false;
  let pending = 0;
  const orphans = new Set<Promise<TurnResult>>();
  const harness: Harness = {
    id: inner.id,
    caps: (model) => inner.caps(model),
    turn: (req: TurnRequest): Promise<TurnResult> => {
      const wallMs = req.timeouts.wallMs;
      const start = Date.now();
      pending += 1;
      let tracked: Promise<TurnResult>;
      try {
        tracked = inner.turn(req).then(
          (result) => {
            pending -= 1;
            orphans.delete(tracked);
            if (wallMs > 0 && Date.now() - start >= wallMs) sawTimeout = true;
            return result;
          },
          (err: unknown) => {
            pending -= 1;
            orphans.delete(tracked);
            if (wallMs > 0 && Date.now() - start >= wallMs) sawTimeout = true;
            throw err;
          },
        );
      } catch (err) {
        pending -= 1;
        throw err;
      }
      orphans.add(tracked);
      return tracked;
    },
    ...(inner.compact ? { compact: (ref) => inner.compact!(ref) } : {}),
  };
  return {
    harness,
    timedOut: () => sawTimeout || pending > 0,
    waitSettled: async () => {
      const pendingTurns = [...orphans];
      if (pendingTurns.length === 0) return;
      let grace: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled(pendingTurns),
          new Promise<void>((resolve) => {
            grace = setTimeout(resolve, TIMEOUT_SETTLE_GRACE_MS);
          }),
        ]);
      } finally {
        if (grace) clearTimeout(grace);
      }
    },
  };
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
  if (task.base && ensured.created) {
    // The creation merge in ensureTaskWorktree moved the branch without the
    // agent; derive needs the post-advance tree as the empty-diff baseline.
    // Written even when the merge was a no-op: the parked tip alone already
    // differs from the integration head the commit==base check would use.
    const commit = await headSha(ensured.path);
    const tree = await treeSha(ensured.path);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "base-advance", {
        slug: task.slug,
        round: state.round,
      }),
      { ok: true, commit, tree },
    );
  }
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
    const before = await headSha(ensured.path);
    const attempt = await mergeRef(
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
    if ((await headSha(ensured.path)) !== before) {
      // The branch moved without the agent; the fix turn's tree must compare
      // against this post-advance tree, not the last counted turn's.
      const commit = await headSha(ensured.path);
      const tree = await treeSha(ensured.path);
      await runtime.store.appendRecord(
        scriptMeta(iteration, "base-advance", {
          slug: task.slug,
          round: state.round,
        }),
        { ok: true, commit, tree },
      );
    }
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
  const turnMinutes = runtime.limits.turnMinutes;
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
  // The commit the turn starts from; a timed-out turn returns the worktree here.
  const startHead = await headSha(ensured.path);
  const tracked = trackHarnessTimeouts(target.harness);
  const result = await runAgentTurn(runtime, {
    target: { ...target, harness: tracked.harness },
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
    ...(task.repairTurns !== undefined
      ? { repairTurns: task.repairTurns }
      : {}),
    itemBudget: { used: state.turns, limit: runtime.limits.itemTurns },
    settle: async (_record, outcome, live) => {
      // A timeout commits nothing: the orphan still owns the tree, and `git add
      // -A` would sweep its half-written files into an attributed commit. The
      // timeout itself is recorded by the agent's stop; a valid outcome written
      // before the bound stays on the record through the kept-outcome rule.
      if (tracked.timedOut()) return {};
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
  if (tracked.timedOut()) {
    // The agent aborted the orphan at the bound; the grace gives a cooperative
    // adapter time to reap its child before the tree is reset, and a hung one
    // cannot hold the launch past it.
    await tracked.waitSettled();
    await resetWorktreeToCommit(ensured.path, startHead);
    breach = await containmentViolation(
      runtime,
      ensured.path,
      ensured.branch,
      contained,
    );
  }
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
  if (task.base && ensured.created) {
    // A recreated continuation worktree re-merged the head (see runStep);
    // the next fix turn still needs the post-advance baseline.
    const commit = await headSha(ensured.path);
    const tree = await treeSha(ensured.path);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "base-advance", {
        slug: task.slug,
        round: state.round,
      }),
      { ok: true, commit, tree },
    );
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
