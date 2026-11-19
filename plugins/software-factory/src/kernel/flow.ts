import type { CheckResult } from "../core/checks/types.js";
import { commitAll, isAncestor } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { hasConflictMarkers, unmergedFiles } from "../core/git/merge.js";
import type { Harness, TurnRequest, TurnResult } from "../harness/types.js";
import { DEFAULT_TIMEOUTS, runAgentTurn } from "./agent.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import {
  checksDue,
  compactSession,
  escalateFrontClassToBigger,
  findStep,
  firstBase,
  flowOf,
  followUpSession,
  isFixTurn,
  isStandaloneTask,
  isTrivialImplementTurn,
  priorStepCommit,
  promptVars,
  reviewSession,
  stepTarget,
  trivialResumeNote,
  trivialResumeSession,
} from "./flow-context.js";
import {
  gateFlakeTests,
  isInfraCheck,
  newGateFailures,
  runGates,
} from "./gates.js";
import { runCleanlinessCheck } from "./cleanliness.js";
import { type MergeResult, mergeTask } from "./integrate.js";
import { taskOutcomeSchema } from "./outcome-schemas.js";
import {
  abortMerge,
  mergeConflictAsk,
  mergeHeadSha,
} from "./merge-conflict.js";
import {
  appendDebt,
  appendFinish,
  appendGateFlake,
  appendPark,
  commitEdits,
  finishChecks,
  scriptMeta,
  startChecks,
} from "./record.js";
import { checkSpikeReport } from "./spike-report.js";
import { materialHash } from "./tasks.js";
import { isLastReviewCall, reviewRoundLimit } from "./review.js";
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

/**
 * Mechanical commit, recorded with its tree for no-progress history. The
 * record opens before the commit so its timestamps stamp the run itself, and
 * carries the diff stats as the turn's work.
 */
async function commitStep(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string,
): Promise<RecordEnd> {
  const turn = await runtime.store.startRecord(
    scriptMeta(meta.iteration, "commit", meta),
  );
  const started = Date.parse(turn.meta.startedAt);
  const sha = await commitAll(runtime.repo, cwd, message);
  const commit = await headSha(cwd);
  const tree = await treeSha(cwd);
  const edits = await commitEdits(cwd, sha);
  const wallMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
  await turn.finish({ ok: true, commit, tree, edits, wallMs });
  return { commit, tree, edits };
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

/** Stamps gates that could not start so derive parks infra instead of looping the task. */
function markInfraGates(checks: CheckResult[]): void {
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
}

/**
 * Task gates with one flake re-run: a red gate re-runs once on the same tree
 * before any fix turn. Green on re-run closes the checks record green with a
 * `gate-flake` record naming the gate and its red-run failing tests; red again
 * keeps the existing fix route. Only red gates with the task's own failures
 * re-run — infra reds keep their own path and inherited reds need no re-run.
 * The re-run keys on the tree: one per red gate per tree, a new commit gets a
 * fresh re-run, and it consumes no round. Baseline and merge-checks runs never
 * reach this helper.
 */
async function runTaskGates(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: { iteration: number; slug: string; round: number },
  worktree: string,
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
): Promise<void> {
  const tree = await treeSha(worktree);
  const gate = await startChecks(runtime.store, meta);
  let checks = await runGates(runtime, worktree);
  markInfraGates(checks);

  const base =
    firstBase(await runtime.store.listRecords(), meta.slug) ?? "HEAD";
  const cleanliness = await runCleanlinessCheck(runtime, worktree, base);
  if (!cleanliness.ok) {
    checks.push(cleanliness);
  }

  const red = newGateFailures(checks, preexisting).filter(
    (check) => !isInfraCheck(check),
  );
  const reran = prior.some(
    (rec) =>
      rec.slug === meta.slug &&
      rec.step === "checks" &&
      rec.endedAt &&
      rec.tree === tree,
  );
  if (red.length > 0 && !reran) {
    const rerun = await runGates(runtime, worktree, {
      only: new Set(red.map((check) => check.name)),
    });
    markInfraGates(rerun);
    const fresh = new Map(rerun.map((check) => [check.name, check]));
    const flipped = red.filter((check) => fresh.get(check.name)?.ok === true);
    if (flipped.length > 0) {
      await appendGateFlake(runtime.store, meta, {
        tree,
        flakes: flipped.map((check) => ({
          gate: check.name,
          tests: gateFlakeTests(check),
        })),
        checks: flipped,
      });
    }
    checks = checks.map((check) => {
      const next = fresh.get(check.name);
      // An infra re-run is inconclusive, not a verdict: the fix turn still
      // reads the red run, and a test red never becomes an infra park.
      if (!next || (!next.ok && isInfraCheck(next))) return check;
      return next;
    });
  }
  // A spike's product is its committed report, gated like a repo gate but
  // never re-run: it reads the commit, which a re-run cannot change.
  if (task.kind === "spike") {
    checks.push(
      await checkSpikeReport(worktree, task.slug, await headSha(worktree)),
    );
  }
  await finishChecks(gate, checks, { preexisting, tree });
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
  harnesses: Harness[];
  timedOut: () => boolean;
  waitSettled: () => Promise<void>;
}

/**
 * Bound on settling orphaned turns after the wall bound fired: the agent
 * already aborted the harness child, so a cooperative orphan is gone long
 * before this; a hung one must not hang the launch. A constant, not a knob.
 */
export const TIMEOUT_SETTLE_GRACE_MS = 5_000;

/** Wraps every tier harness with one shared orphan account for the turn. */
function trackHarnessTimeouts(inners: readonly Harness[]): TimeoutTracker {
  let sawTimeout = false;
  let pending = 0;
  const orphans = new Set<Promise<TurnResult>>();
  const wrap = (inner: Harness): Harness => ({
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
  });
  return {
    harnesses: inners.map(wrap),
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
  prior: readonly StepRecord[],
  stop: StepRecord["stop"],
  outcome: StepRecord["outcome"],
): Promise<TaskActionResult> {
  const meta = {
    iteration,
    slug: task.slug,
    round: state.round,
    revision: task.revision,
  };
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
    // Standalone escalation: the reviewer answered the upscope ask with yes.
    // Parks with the same cause shape as a status upscope, whatever the
    // verdict says; a standalone task also rewrites the front class to bigger
    // so the next launch runs the architect. Architect-plan tasks park without
    // the rewrite and never take the escalation path.
    if (outcome?.upscope === "yes") {
      await appendPark(
        runtime.store,
        meta,
        parkCause("upscope", outcome?.summary),
      );
      if (isStandaloneTask(runtime, task)) escalateFrontClassToBigger(runtime);
      return infraResult ?? cancelledResult ?? {};
    }
    const lastCall = isLastReviewCall(step, state.round);
    if (outcome?.verdict === "reject") {
      await appendPark(
        runtime.store,
        meta,
        `review rejected: ${outcome.summary}`,
      );
    } else if (lastCall && outcome?.verdict === "changes") {
      // The reviewer's outcome validator refuses this; a delivered record is
      // a contract breach, never a merge.
      await appendPark(
        runtime.store,
        meta,
        `invalid outcome: changes on the last review call: ${outcome.summary}`,
      );
    } else if (
      lastCall &&
      outcome?.verdict === "approve" &&
      outcome.concerns.length > 0
    ) {
      await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
      // No `else`: a done review always carries a verdict — outcome repair
      // fails the turn otherwise — so a missing verdict never reaches settle.
    }
    return infraResult ?? cancelledResult ?? {};
  }
  if (checksDue(flow, step.id)) {
    await runTaskGates(runtime, task, meta, worktree, preexisting, prior);
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
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
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
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
      cause,
    );
    return {};
  }

  const meta = {
    iteration,
    slug: task.slug,
    round: state.round,
    revision: task.revision,
  };
  // A first-turn `base:` conflict resolves in the turn instead of parking: the
  // merge stays in progress and the ask rides the counted turn. Fix turns and
  // reviews keep the park; a resumed MERGE_HEAD (crash mid-resolve) always
  // resumes so partial work is not lost.
  let pendingResolve: { head: string; paths: string[] } | null = null;
  let resolveIsCreation = false;
  if (ensured.mergeConflict) {
    if (step.review || isFixTurn(flow, state, step.id)) {
      const named =
        ensured.mergeConflict.paths.join(", ") ||
        "git reported no unmerged paths";
      await abortMerge(ensured.path);
      await appendPark(runtime.store, meta, `base-conflict: ${named}`);
      return {};
    }
    pendingResolve = {
      head: ensured.mergeConflict.head,
      paths: ensured.mergeConflict.paths,
    };
    resolveIsCreation = true;
  } else if (task.base && ensured.created) {
    // The creation merge in ensureTaskWorktree moved the branch without the
    // agent; derive needs the post-advance tree as the empty-diff baseline.
    // Written even when the merge was a no-op: the parked tip alone already
    // differs from the integration head the commit==base check would use.
    // headTree lets derive tell kept work beyond the head from work already
    // on it when the first turn commits nothing.
    const commit = await headSha(ensured.path);
    const tree = await treeSha(ensured.path);
    const headTree = (
      await git(runtime.paths.repoRoot, [
        "rev-parse",
        `${ensured.startPoint}^{tree}`,
      ])
    ).stdout.trim();
    await runtime.store.appendRecord(
      scriptMeta(iteration, "base-advance", {
        slug: task.slug,
        round: state.round,
      }),
      { ok: true, commit, tree, headTree },
    );
  }
  // A reused `base:` worktree advances to the current integration head before
  // the turn, the same advance a created one gets (B6); a created worktree
  // moved inside ensureTaskWorktree. A clean tree merges the head with the
  // creation conflict path; a dirty tree keeps the state the last turn left.
  let startPoint = ensured.startPoint;
  if (
    !pendingResolve &&
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
      { leaveConflict: true },
    );
    if (!attempt.ok) {
      if (isFixTurn(flow, state, step.id)) {
        const named =
          attempt.paths.join(", ") || "git reported no unmerged paths";
        await abortMerge(ensured.path);
        await appendPark(runtime.store, meta, `base-conflict: ${named}`);
        return {};
      }
      pendingResolve = { head, paths: attempt.paths };
      startPoint = head;
    } else {
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
  }
  if (!pendingResolve && task.base && !step.review) {
    const inFlight = await mergeHeadSha(ensured.path);
    if (inFlight) {
      let paths = await unmergedFiles(ensured.path);
      if (paths.length === 0) {
        const diff = await git(
          ensured.path,
          ["diff", "--name-only", "HEAD", inFlight],
          { allowFail: true },
        );
        paths = diff.stdout
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean)
          .sort();
      }
      pendingResolve = { head: inFlight, paths };
    }
  }
  if (task.base && step.review && (await mergeHeadSha(ensured.path))) {
    const paths = await unmergedFiles(ensured.path);
    const named = paths.join(", ") || "git reported no unmerged paths";
    await abortMerge(ensured.path);
    await appendPark(runtime.store, meta, `base-conflict: ${named}`);
    return {};
  }
  const preexisting = preexistingRed(recordedBaseGates(records));
  const target = stepTarget(runtime, task, state, step.id, iteration, records);
  const fix = isFixTurn(flow, state, step.id);
  // A trivial goal implements in the front's own session: the turn resumes it
  // with the session's recorded cwd, and the prompt names the absolute
  // worktree and branch. No session, or a harness that cannot resume, parks
  // with a cause — never a silent de-novo run. Other first turns are de novo;
  // other fix turns resume the implement session in this worktree, and later
  // review rounds resume the review session on its own step.
  const trivial = isTrivialImplementTurn(runtime, task, state, step.id);
  let session = step.review
    ? await reviewSession(runtime, task, target, step.id, records, ensured.path)
    : fix && !trivial
      ? await followUpSession(
          runtime,
          task,
          target,
          records,
          ensured.path,
          iteration,
        )
      : undefined;
  let turnCwd = ensured.path;
  if (trivial) {
    const resumed = await trivialResumeSession(
      runtime,
      task,
      records,
      fix,
      iteration,
    );
    if ("cause" in resumed) {
      await appendPark(runtime.store, meta, resumed.cause);
      return {};
    }
    session = resumed.session;
    turnCwd = session.cwd;
  }
  const vars = promptVars(
    runtime,
    task,
    ensured.path,
    records,
    state.round,
    flow,
    state,
  );
  vars.base_hash = firstBase(records, task.slug) ?? startPoint;
  vars.head_hash = await headSha(ensured.path);
  const lastCall = step.review && isLastReviewCall(step, state.round);
  if (step.review) {
    vars.max_rounds = String(reviewRoundLimit(step));
    vars.last_call = String(lastCall);
  } else if (state.gateFix && state.gateLastCall) {
    vars.last_call = "true";
  }
  if (step.review && session) {
    // A resumed review already holds the prior rounds: the range carries the
    // delta since the last turn of this step, with the fix dispositions.
    const delta = priorStepCommit(records, task.slug, step.id);
    if (delta) vars.base_hash = delta;
  }
  if (trivial && session) {
    vars.resume_note = trivialResumeNote(
      session.cwd,
      ensured.path,
      ensured.branch,
    );
  }
  if (pendingResolve) {
    const ask = mergeConflictAsk(pendingResolve.head, pendingResolve.paths);
    vars.findings = vars.findings ? `${ask}\n\n${vars.findings}` : ask;
  }
  // A turn may only change its own worktree (implementer.md). Snapshot the
  // shared checkouts now; the settle below refuses the commit on any breach.
  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const aliasTimeouts = target.timeouts;
  const aliasWallMs = aliasTimeouts?.wallMs ?? DEFAULT_TIMEOUTS.wallMs;
  // The task file overrides the alias wall for its own turns; the run's bound
  // still caps it, because the operator's bound beats the PM's. Owner ruling 2.
  const taskWallMs =
    task.turnMinutes !== undefined
      ? Math.round(task.turnMinutes * 60_000)
      : aliasWallMs;
  const runWallMs =
    runtime.limits.turnMinutes !== undefined
      ? Math.round(runtime.limits.turnMinutes * 60_000)
      : undefined;
  const timeouts =
    task.turnMinutes === undefined && runWallMs === undefined
      ? (aliasTimeouts ?? DEFAULT_TIMEOUTS)
      : {
          idleMs: aliasTimeouts?.idleMs ?? DEFAULT_TIMEOUTS.idleMs,
          wallMs:
            runWallMs !== undefined
              ? Math.min(taskWallMs, runWallMs)
              : taskWallMs,
        };
  // The commit the turn starts from; a timed-out turn returns the worktree here.
  const startHead = await headSha(ensured.path);
  const tracked = trackHarnessTimeouts(
    target.tiers.map((tier) => tier.harness),
  );
  const trackedTarget = {
    ...target,
    harness: tracked.harnesses[0]!,
    tiers: target.tiers.map((tier, index) => ({
      ...tier,
      harness: tracked.harnesses[index]!,
    })),
  };
  const result = await runAgentTurn(runtime, {
    target: trackedTarget,
    cwd: turnCwd,
    meta: {
      ...meta,
      step: step.id,
      base: firstBase(records, task.slug) ?? startPoint,
      taskHash: materialHash(task),
    },
    vars,
    expectation: step.review ? "review" : "any",
    outcomeSchema: taskOutcomeSchema(task, runtime.configs.process.taskTypes),
    lastCall,
    session,
    timeouts,
    ...(task.repairTurns !== undefined
      ? { repairTurns: task.repairTurns }
      : {}),
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
      if (pendingResolve) {
        // Stage first so edited files leave the unmerged set; markers in the
        // content still flag below and never reach a commit.
        await git(ensured.path, ["add", "-A"], { allowFail: true });
        const flagged = await hasConflictMarkers(ensured.path);
        if (flagged.length > 0) return {};
      }
      const settled = await commitStep(
        runtime,
        meta,
        ensured.path,
        `factory: ${task.slug} ${step.id} r${state.round}`,
      );
      // Compact where the session ends, so the stored ref is already compacted
      // when a later turn resumes it: a fix turn resumes the implement
      // session, a later review round resumes the review session. An
      // infra/refusal stop delivers no outcome; that session is not kept.
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
    if (pendingResolve) await abortMerge(ensured.path);
    await appendPark(runtime.store, meta, `containment: ${breach}`);
    return {};
  }
  if (pendingResolve && !tracked.timedOut()) {
    const stop = result.record.stop;
    const hasOutcome = Boolean(result.outcome?.status);
    const resumable =
      !hasOutcome &&
      (stop?.kind === "infra" ||
        stop?.kind === "cancelled" ||
        stop?.kind === "truncated");
    if (!resumable) {
      const flagged = await hasConflictMarkers(ensured.path);
      const stillInFlight = await mergeHeadSha(ensured.path);
      const newHead = await headSha(ensured.path);
      let contains = false;
      try {
        contains = await isAncestor(ensured.path, pendingResolve.head, newHead);
      } catch {
        contains = false;
      }
      if (flagged.length > 0 || stillInFlight || !contains) {
        const files = flagged.length > 0 ? flagged : pendingResolve.paths;
        const named = files.join(", ") || "git reported no unmerged paths";
        await abortMerge(ensured.path);
        await appendPark(runtime.store, meta, `base-conflict: ${named}`);
        return {};
      }
      // The merge committed with the turn; the empty-diff baseline is this
      // post-merge tree, the same tree a clean creation advance would record.
      const commit = newHead;
      const tree = await treeSha(ensured.path);
      const needsHeadTree =
        resolveIsCreation ||
        !records.some(
          (r) => r.slug === task.slug && r.step === "base-advance" && r.endedAt,
        );
      if (needsHeadTree) {
        const headTree = (
          await git(runtime.paths.repoRoot, [
            "rev-parse",
            `${pendingResolve.head}^{tree}`,
          ])
        ).stdout.trim();
        await runtime.store.appendRecord(
          scriptMeta(iteration, "base-advance", {
            slug: task.slug,
            round: state.round,
          }),
          { ok: true, commit, tree, headTree },
        );
      } else {
        await runtime.store.appendRecord(
          scriptMeta(iteration, "base-advance", {
            slug: task.slug,
            round: state.round,
          }),
          { ok: true, commit, tree },
        );
      }
    }
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
    records,
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
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
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
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
      cause,
    );
    return {};
  }
  if (ensured.mergeConflict) {
    const named =
      ensured.mergeConflict.paths.join(", ") ||
      "git reported no unmerged paths";
    await abortMerge(ensured.path);
    await appendPark(
      runtime.store,
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
      `base-conflict: ${named}`,
    );
    return {};
  }
  if (task.base && (await mergeHeadSha(ensured.path))) {
    const paths = await unmergedFiles(ensured.path);
    const named = paths.join(", ") || "git reported no unmerged paths";
    await abortMerge(ensured.path);
    await appendPark(
      runtime.store,
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
      `base-conflict: ${named}`,
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
  const prior = await runtime.store.listRecords();
  const preexisting = preexistingRed(recordedBaseGates(prior));
  await runTaskGates(
    runtime,
    task,
    { iteration, slug: task.slug, round: state.round },
    ensured.path,
    preexisting,
    prior,
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
      task,
      state.commit,
    );
    return {};
  }
  if (action.kind === "park") {
    await appendPark(
      runtime.store,
      {
        iteration,
        slug: task.slug,
        round: state.round,
        revision: task.revision,
      },
      action.cause,
    );
    return {};
  }
  return {};
}
