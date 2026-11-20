import type { CheckResult } from "../core/checks/types.js";
import { runWorktreeSetup } from "../core/checks/setup.js";
import { commitAll, isAncestor } from "../core/git/commit.js";
import { GitError, git } from "../core/git/exec.js";
import { unmergedFiles } from "../core/git/merge.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { DEFAULT_FLOWS } from "./derive-task.js";
import {
  gateFlakeTests,
  isInfraCheck,
  newGateFailures,
  runGates,
} from "./gates.js";
import { integrationExclusive } from "./integration-lock.js";
import {
  appendGateFlake,
  finishChecks,
  scriptMeta,
  startChecks,
} from "./record.js";
import { taskArchitect } from "./tasks.js";
import type {
  Cause,
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";
import {
  branchExists,
  headSha,
  integrationHead,
  removeMergeScratch,
  resetMergeScratch,
  taskBranchName,
  treeSha,
} from "./worktree.js";

export interface MergeResult {
  infra?: { kind: "infra"; cause: string; details?: string };
  cancelled?: boolean;
}

export interface MergeOptions {
  /**
   * Kept-land mode: one flake re-run on red merge gates. A kept-land conflict
   * parks in every mode: the wave-end steward owns it, because a boundary merge
   * has no task flow to run a resolve turn in.
   */
  keptLand?: boolean;
}

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

function causeOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function syncCheckout(
  runtime: KernelRuntime,
  commit: string,
): Promise<void> {
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(runtime.paths.goalCheckout, ["reset", "--hard", commit]);
    await git(runtime.paths.goalCheckout, ["clean", "-fd"], {
      allowFail: true,
    });
  });
}

/** An outside commit moved the integration branch while the queue was building a merge. */
class IntegrationMovedError extends Error {
  /** The cause detail, without the kind prefix the error message carries. */
  readonly detail: string;
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    const detail =
      `expected ${expected.slice(0, 10)}, found ${actual ? actual.slice(0, 10) : "a missing ref"}; ` +
      "an outside commit is on the integration branch and this merge left it untouched";
    super(`integration moved: ${detail}`);
    this.detail = detail;
    this.name = "IntegrationMovedError";
  }
}

/**
 * Moves the integration ref only if it is still where the merge was built from.
 * An operator or rogue commit after that point must not be overwritten: the
 * merge fails loudly and the task records it.
 */
async function refMove(
  runtime: KernelRuntime,
  commit: string,
  expected: string,
): Promise<void> {
  const ref = `refs/heads/${runtime.paths.integrationBranch}`;
  await runtime.repo.writeLock.runExclusive(async () => {
    const res = await git(
      runtime.paths.repoRoot,
      ["update-ref", ref, commit, expected],
      { allowFail: true },
    );
    if (res.code === 0) return;
    const actual = await git(
      runtime.paths.repoRoot,
      ["rev-parse", "--verify", "--quiet", ref],
      { allowFail: true },
    );
    const found = actual.stdout.trim();
    // A refused update that still sees the expected value is a lock or git
    // failure, not an outside commit; keep git's own reason.
    if (found === expected) {
      throw new GitError(
        `update-ref ${ref} ${commit} ${expected}`,
        res.code,
        res.stderr,
        res.stdout,
      );
    }
    throw new IntegrationMovedError(expected, found);
  });
}

async function recordMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  end: RecordEnd,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(iteration, "merge", {
      slug: task.slug,
      round,
      architect: taskArchitect(task),
    }),
    end,
  );
}

/**
 * A merge start that carries the planned commit and did not succeed. Recovery
 * seals interrupted records as `infra: crash` before dispatch, so the match
 * includes those; an explicit failure of any other kind is a real outcome.
 */
function recoverableMergeStart(record: StepRecord): boolean {
  if (!record.commit || record.ok === true) return false;
  if (!record.endedAt) return true;
  return record.stop?.kind === "infra";
}

/**
 * A crash after the planned commit was recorded but before (or just after) the
 * ref moved must complete that merge, never squash it a second time. The open
 * record carries the planned commit; the parent check makes a stale plan inert.
 */
async function recoverOpenMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  iteration: number,
  round: number,
): Promise<boolean> {
  const open = records
    .filter(
      (r) =>
        r.slug === task.slug && r.step === "merge" && recoverableMergeStart(r),
    )
    .sort(bySeq)
    .at(-1);
  if (!open?.commit) return false;
  const commit = open.commit;
  const exists = await git(
    runtime.paths.repoRoot,
    ["cat-file", "-e", `${commit}^{commit}`],
    { allowFail: true },
  );
  if (exists.code !== 0) return false;
  const head = await integrationHead(runtime);
  const already =
    commit === head || (await isAncestor(runtime.paths.repoRoot, commit, head));
  const parent = await git(
    runtime.paths.repoRoot,
    ["rev-parse", `${commit}^`],
    { allowFail: true },
  );
  const movable = parent.code === 0 && parent.stdout.trim() === head;
  if (!already && !movable) return false;
  if (movable) {
    try {
      await refMove(runtime, commit, head);
    } catch (err) {
      if (!(err instanceof IntegrationMovedError)) throw err;
      // A failure record parks the task; the stale open record stays inert.
      await recordMerge(runtime, task, iteration, round, {
        ok: false,
        cause: makeCause("integration-moved", err.detail),
      });
      return true;
    }
  }
  await syncCheckout(runtime, already ? head : commit);
  await recordMerge(runtime, task, iteration, round, {
    ok: true,
    commit,
    cause: makeCause("note", "recovered merge after crash"),
  });
  return true;
}

/**
 * The last task-checks record that already judged `tree` under the current
 * inherited-failure set. Tree identity, not commit: the squash commit always
 * differs from the task tip. A gate-flake re-run that closed green counts —
 * the checks record carries the re-run result.
 */
function judgedChecks(
  records: StepRecord[],
  slug: string,
  tree: string,
  preexisting: ReadonlySet<string>,
): StepRecord | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.step === "checks" &&
        r.endedAt &&
        r.tree === tree &&
        r.checks !== undefined &&
        newGateFailures(r.checks, preexisting).length === 0,
    )
    .sort(bySeq)
    .at(-1);
}

/**
 * Serial squash-merge queue. The squash commit is built and gated in a scratch
 * worktree detached at the current integration head; the integration ref moves
 * only after green, and the stable goal checkout is synced afterwards.
 */
/** Records a merge failure and removes the scratch worktree. */
async function failMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  cause: Cause,
  checks?: CheckResult[],
): Promise<void> {
  await removeMergeScratch(runtime);
  await recordMerge(runtime, task, iteration, round, {
    ok: false,
    cause,
    ...(checks ? { checks } : {}),
  });
}

/** Commits the staged squash; records the failure that prevents it. */
async function commitSquashedBranch(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  scratch: string,
): Promise<boolean> {
  const staged = await git(scratch, ["diff", "--cached", "--quiet"], {
    allowFail: true,
  });
  if (staged.code === 0) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("no-progress", "task branch has no changes since dispatch"),
    );
    return false;
  }

  try {
    const mergeCommit = await commitAll(
      runtime.repo,
      scratch,
      `factory: merge ${task.slug}`,
    );
    if (!mergeCommit) {
      await failMerge(
        runtime,
        task,
        iteration,
        round,
        makeCause("no-progress", "squash merge produced no commit"),
      );
      return false;
    }
  } catch (err) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("merge-failed", causeOf(err)),
    );
    return false;
  }
  return true;
}

/**
 * Squashes the task branch in a scratch worktree at the integration head.
 * Undefined means the merge already failed and its record is written.
 */
async function squashTaskBranch(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
): Promise<{ scratch: string; head: string } | undefined> {
  const branch = taskBranchName(runtime, task.slug);
  if (!(await branchExists(runtime, branch))) {
    await recordMerge(runtime, task, iteration, round, {
      ok: false,
      cause: makeCause("merge-failed", `branch "${branch}" does not exist`),
    });
    return undefined;
  }

  const head = await integrationHead(runtime);
  const scratch = await resetMergeScratch(runtime, head);
  const squash = await git(scratch, ["merge", "--squash", branch], {
    allowFail: true,
  });
  if (squash.code !== 0) {
    // The record is the signal, not a park: the task's resolve step merges the
    // head into the branch and resolves it, then checks and re-merges. A second
    // conflict, a flow with no resolve step, or a kept-land merge parks the
    // branch and leaves it to the wave-end steward.
    const paths = await unmergedFiles(scratch);
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause(
        "conflict",
        paths.join(", ") || "squash merge conflicts with the integration head",
      ),
    );
    return undefined;
  }

  if (!(await commitSquashedBranch(runtime, task, iteration, round, scratch))) {
    return undefined;
  }
  return { scratch, head };
}

/** The recorded green run for this tree, when the merge may reuse it. */
function judgedMergeChecks(
  records: StepRecord[],
  slug: string,
  mergedTree: string,
  preexisting: ReadonlySet<string>,
): { checks: CheckResult[]; skipCause?: Cause } | undefined {
  const judged = judgedChecks(records, slug, mergedTree, preexisting);
  if (!judged) return undefined;
  return {
    checks: judged.checks ?? [],
    skipCause: makeCause(
      "note",
      `skipped merge-checks: merged tree equals checked tree ${mergedTree}`,
    ),
  };
}

/** Runs (or reuses) merge gates; undefined means a gate failed and is recorded. */
async function mergeChecks(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  scratch: string,
  records: StepRecord[],
  preexisting: ReadonlySet<string>,
  keptLand: boolean,
): Promise<{ checks: CheckResult[]; skipCause?: Cause } | undefined> {
  const mergedTree = await treeSha(scratch);
  const judged = judgedMergeChecks(records, task.slug, mergedTree, preexisting);
  if (judged) return judged;
  const setup = await runWorktreeSetup({
    commands: runtime.configs.repo.setup,
    cwd: scratch,
  });
  if (!setup.ok) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("setup", setup.error ?? "unknown"),
    );
    return undefined;
  }
  const gate = await startChecks(
    runtime.store,
    {
      iteration,
      slug: task.slug,
      round,
      architect: taskArchitect(task),
    },
    { step: "merge-checks" },
  );
  let ran = await runGates(runtime, scratch);
  if (keptLand) {
    ran = await rerunRedKeptGates(
      runtime,
      {
        iteration,
        slug: task.slug,
        round,
        architect: taskArchitect(task),
      },
      scratch,
      ran,
      preexisting,
    );
  }
  await finishChecks(gate, ran, { preexisting });
  const red = newGateFailures(ran, preexisting);
  if (red.length > 0) {
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      makeCause("gates", red.map((c) => c.name).join(", ")),
      ran,
    );
    return undefined;
  }
  return { checks: ran };
}

/**
 * Serial squash-merge queue. The squash commit is built and gated in a scratch
 * worktree detached at the current integration head; the integration ref moves
 * only after green, and the stable goal checkout is synced afterwards.
 */
/** Moves the integration ref to the gated squash commit and records the merge. */
async function landMergedTask(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  scratch: string,
  head: string,
  checked: NonNullable<Awaited<ReturnType<typeof mergeChecks>>>,
): Promise<void> {
  const { checks, skipCause } = checked;
  const commit = await headSha(scratch);
  const turn = await runtime.store.startRecord({
    ...scriptMeta(iteration, "merge", {
      slug: task.slug,
      round,
      architect: taskArchitect(task),
    }),
    commit,
  });
  try {
    await refMove(runtime, commit, head);
  } catch (err) {
    if (!(err instanceof IntegrationMovedError)) throw err;
    await removeMergeScratch(runtime);
    await turn.finish({
      ok: false,
      cause: makeCause("integration-moved", err.detail),
    });
    return;
  }
  await syncCheckout(runtime, commit);
  await removeMergeScratch(runtime);
  await turn.finish(
    skipCause
      ? { ok: true, commit, checks, cause: skipCause }
      : { ok: true, commit, checks },
  );
}

export async function mergeTask(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  state: TaskState,
  opts: MergeOptions = {},
): Promise<MergeResult> {
  return integrationExclusive(runtime, async () => {
    const round = state.round;
    const records = await runtime.store.listRecords();
    if (
      records.some(
        (r) => r.slug === task.slug && r.step === "merge" && r.ok === true,
      )
    ) {
      return {};
    }
    if (await recoverOpenMerge(runtime, task, records, iteration, round)) {
      return {};
    }

    const squashed = await squashTaskBranch(runtime, task, iteration, round);
    if (!squashed) return {};
    const { scratch } = squashed;
    const preexisting = preexistingRed(recordedBaseGates(records));
    const checked = await mergeChecks(
      runtime,
      task,
      iteration,
      round,
      scratch,
      records,
      preexisting,
      opts.keptLand === true,
    );
    if (!checked) return {};
    await landMergedTask(
      runtime,
      task,
      iteration,
      round,
      scratch,
      squashed.head,
      checked,
    );
    return {};
  });
}

/**
 * One flake re-run for kept-land merge gates, mirroring the task-gate path: a
 * red gate re-runs once on the same tree, a flip to green lands with a
 * `gate-flake` record, and a repeat red leaves the branch parked. An infra
 * re-run is inconclusive: the red run stands.
 */
async function rerunRedKeptGates(
  runtime: KernelRuntime,
  meta: {
    iteration: number;
    slug: string;
    round: number;
    architect?: string;
  },
  scratch: string,
  checks: CheckResult[],
  preexisting: ReadonlySet<string>,
): Promise<CheckResult[]> {
  const red = newGateFailures(checks, preexisting).filter(
    (check) => !isInfraCheck(check),
  );
  if (red.length === 0) return checks;
  const rerun = await runGates(runtime, scratch, {
    only: new Set(red.map((check) => check.name)),
  });
  const fresh = new Map(rerun.map((check) => [check.name, check]));
  const flipped = red.filter((check) => fresh.get(check.name)?.ok === true);
  if (flipped.length > 0) {
    await appendGateFlake(runtime.store, meta, {
      tree: await treeSha(scratch),
      flakes: flipped.map((check) => ({
        gate: check.name,
        tests: gateFlakeTests(check),
      })),
      checks: flipped,
    });
  }
  return checks.map((check) => {
    const next = fresh.get(check.name);
    if (!next || (!next.ok && isInfraCheck(next))) return check;
    return next;
  });
}

/**
 * A red that already proved itself deterministic on this exact branch tip:
 * two merge-gate runs since the tip commit failed the same gates. Head moves
 * and flake re-runs cannot cure it, so kept-land skips it before any attempt
 * and records the skip.
 */
function deterministicRed(
  records: StepRecord[],
  slug: string,
  tip: string,
): boolean {
  const tipSeq = records
    .filter(
      (r) =>
        r.slug === slug && r.actor === "agent" && r.endedAt && r.commit === tip,
    )
    .sort(bySeq)
    .at(-1)?.seq;
  if (tipSeq === undefined) return false;
  const reds = records
    .filter(
      (r) =>
        r.slug === slug &&
        r.step === "merge-checks" &&
        r.endedAt &&
        r.ok === false &&
        r.seq > tipSeq,
    )
    .sort(bySeq);
  if (reds.length < 2) return false;
  const names = (record: StepRecord): string =>
    (record.checks ?? [])
      .filter((check) => !check.ok)
      .map((check) => check.name)
      .sort()
      .join("\0");
  const previous = names(reds.at(-2)!);
  return previous !== "" && previous === names(reds.at(-1)!);
}

/**
 * Whether the parked kept branch still carries reviewable work: an approve
 * covering the branch's current head commit (a later commit voids it), or
 * green branch checks on the current tree under a review-less flow. Review
 * rejections never qualify; a deterministic red is the caller's skip to
 * record.
 */
async function qualifiesForKeptLand(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  tip: string,
): Promise<boolean> {
  const flows = runtime.configs.process.flows;
  const flow =
    flows[task.flow] ??
    DEFAULT_FLOWS[task.flow] ??
    DEFAULT_FLOWS["implement-review"]!;
  const ended = records.filter((r) => r.slug === task.slug && r.endedAt);
  const reviewId = flow.steps.find((step) => step.review)?.id;
  if (reviewId) {
    const latest = ended
      .filter((r) => r.actor === "agent" && r.step === reviewId)
      .sort(bySeq)
      .at(-1);
    if (!latest || latest.outcome?.verdict !== "approve") return false;
    if (latest.commit !== tip) return false;
  } else {
    const tipTree = (
      await git(runtime.paths.repoRoot, ["rev-parse", `${tip}^{tree}`])
    ).stdout.trim();
    const agents = ended.filter((r) => r.actor === "agent").sort(bySeq);
    if (agents.at(-1)?.commit !== tip) return false;
    const green = ended.some(
      (r) =>
        r.step === "checks" &&
        r.ok === true &&
        r.tree !== undefined &&
        r.tree === tipTree,
    );
    if (!green) return false;
  }
  return true;
}

export interface KeptLandResult {
  /** Parked slugs whose kept branch landed on the integration head. */
  landed: string[];
  /** Parked slugs attempted this boundary, landed or still parked. */
  attempted: string[];
}

/**
 * R10: a kept green branch lands without a new task and without an agent
 * turn. Every parked task whose kept branch still carries its approve (or
 * green checks under a review-less flow) gets one end-of-wave merge attempt;
 * a conflict or a repeated red leaves it parked. Deterministic reds are
 * skipped before the attempt. A landing, a failed attempt and a
 * deterministic-red skip each write a `kept-land` record: the landing has no
 * task flow records of its own, and the evidence needs one. Spikes never land
 * (their product is the finding, not a merge), and neither does a `base`
 * another task continues: the continuation already carries the work, and PM
 * validation reads a landed base as a broken continuation.
 */
/** The `kept-land` record meta for one task. */
function keptLandMeta(
  iteration: number,
  task: TaskFile,
  round: number,
): Parameters<KernelRuntime["store"]["appendRecord"]>[0] {
  return scriptMeta(iteration, "kept-land", {
    slug: task.slug,
    round,
    architect: taskArchitect(task),
  });
}

async function recordKeptLand(
  runtime: KernelRuntime,
  iteration: number,
  task: TaskFile,
  round: number,
  end: RecordEnd,
): Promise<void> {
  await runtime.store.appendRecord(keptLandMeta(iteration, task, round), end);
}

/** The last merge attempt this iteration; a kept-land attempt is final. */
function lastMergeAttempt(
  records: readonly StepRecord[],
  slug: string,
  iteration: number,
): StepRecord | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.iteration === iteration &&
        (r.step === "merge" || r.step === "kept-land") &&
        r.endedAt,
    )
    .sort(bySeq)
    .at(-1);
}

/** A failed merge leaves one kept-land record carrying its cause. */
async function recordKeptLandFailure(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  merge: StepRecord,
): Promise<void> {
  const records = await runtime.store.listRecords();
  if (
    records.some(
      (r) =>
        r.slug === task.slug &&
        r.step === "kept-land" &&
        r.iteration === iteration,
    )
  ) {
    return;
  }
  await recordKeptLand(runtime, iteration, task, round, {
    ok: false,
    cause:
      merge.cause ??
      makeCause("merge-failed", "merge failed with no recorded cause"),
  });
}

/** Merges one approved kept branch, recording the landing or the failure. */
async function landKeptTask(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  state: TaskState,
  tip: string,
): Promise<"landed" | "failed"> {
  try {
    await mergeTask(runtime, task, iteration, state, { keptLand: true });
  } catch (err) {
    await recordKeptLand(runtime, iteration, task, state.round, {
      ok: false,
      cause: makeCause("merge-failed", causeOf(err)),
    });
    return "failed";
  }
  const merge = (await runtime.store.listRecords())
    .filter((r) => r.slug === task.slug && r.step === "merge" && r.endedAt)
    .sort(bySeq)
    .at(-1);
  if (!merge || merge.iteration !== iteration) return "failed";
  if (merge.ok !== true) {
    await recordKeptLandFailure(runtime, task, iteration, state.round, merge);
    return "failed";
  }
  await recordKeptLand(runtime, iteration, task, state.round, {
    ok: true,
    commit: merge.commit,
    cause: makeCause("note", `approved ${tip} landed as ${merge.commit}`),
  });
  return "landed";
}

/** Whether a parked task is a kept-land candidate this wave. */
function keptLandCandidate(
  task: TaskFile,
  state: TaskState | undefined,
  continued: ReadonlySet<string>,
): boolean {
  return (
    state !== undefined &&
    state.status === "parked" &&
    task.kind === "development" &&
    !continued.has(task.slug)
  );
}

export async function runKeptLand(
  runtime: KernelRuntime,
  iteration: number,
): Promise<KeptLandResult> {
  const landed: string[] = [];
  const attempted: string[] = [];
  const tasks = await runtime.store.listTasks();
  const continued = new Set(
    tasks.map((task) => task.base).filter((base): base is string => !!base),
  );
  for (const task of [...tasks].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const records = await runtime.store.listRecords();
    const taskState = derive(tasks, records, runtime.configs.process.flows)
      .tasks[task.slug];
    if (!taskState || !keptLandCandidate(task, taskState, continued)) continue;
    const lastMerge = lastMergeAttempt(records, task.slug, iteration);
    if (lastMerge?.ok === true || lastMerge?.step === "kept-land") continue;
    const branch = taskBranchName(runtime, task.slug);
    if (!(await branchExists(runtime, branch))) {
      attempted.push(task.slug);
      await recordKeptLand(runtime, iteration, task, taskState.round, {
        ok: false,
        cause: makeCause("merge-failed", `branch "${branch}" does not exist`),
      });
      continue;
    }
    const tip = (
      await git(runtime.paths.repoRoot, ["rev-parse", branch])
    ).stdout.trim();
    if (!(await qualifiesForKeptLand(runtime, task, records, tip))) continue;
    if (deterministicRed(records, task.slug, tip)) {
      await recordKeptLand(runtime, iteration, task, taskState.round, {
        ok: true,
        cause: makeCause("note", "skipped: deterministic-red"),
      });
      continue;
    }
    attempted.push(task.slug);
    if (
      (await landKeptTask(runtime, task, iteration, taskState, tip)) ===
      "landed"
    ) {
      landed.push(task.slug);
    }
  }
  return { landed, attempted };
}
