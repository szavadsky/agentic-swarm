/** The merge's gate checks, kept-gate reruns and landing a merged task. */

import { runWorktreeSetup } from "../../core/checks/setup.js";
import type { CheckResult } from "../../core/checks/types.js";
import { git } from "../../core/git/exec.js";
import { preexistingRed, recordedBaseGates } from "../baseline.js";
import { makeCause } from "../cause.js";
import {
  gateFlakeTests,
  isInfraCheck,
  newGateFailures,
  newRedChecks,
  runGates,
  stampAttribution,
} from "../gates.js";
import { integrationExclusive } from "../integration-lock.js";
import {
  appendGateFlake,
  finishChecks,
  scriptMeta,
  startChecks,
} from "../record.js";
import { taskArchitect } from "../tasks.js";
import type {
  Cause,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "../types.js";
import {
  headSha,
  integrationHead,
  removeMergeScratch,
  resetMergeScratch,
  treeSha,
} from "../worktree.js";
import {
  bySeq,
  failMerge,
  IntegrationMovedError,
  judgedChecks,
  recoverOpenMerge,
  refMove,
  squashTaskBranch,
  syncCheckout,
} from "./merge.js";
import type { GoalHeadJudgement, MergeOptions, MergeResult } from "./types.js";

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

/** The red merge's cause: the new gates it names, or the infra park. */
function mergeRedCause(red: CheckResult[]): Cause {
  const actionable = red.filter((check) => !isInfraCheck(check));
  if (actionable.length > 0)
    return makeCause("gates", actionable.map((check) => check.name).join(", "));
  return makeCause(
    "infra",
    `gate could not start: ${red.map((check) => check.name).join(", ")}`,
  );
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
  await finishChecks(gate, ran, { preexisting, tree: mergedTree });
  const red = newGateFailures(ran, preexisting);
  if (red.length > 0) {
    // The merge record closes outside `finishChecks`, so stamp its checks
    // here: its merge-gate names read the same attribution as the run.
    await failMerge(
      runtime,
      task,
      iteration,
      round,
      mergeRedCause(red),
      stampAttribution(ran, preexisting),
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

/** Record step of the gate run on the integration head itself. */
const GOAL_HEAD_STEP = "goal-head";

/** Whether a gate record judged its tree: green, or red for a reason of its own. */
function judgedTree(
  record: StepRecord,
  preexisting: ReadonlySet<string>,
): boolean {
  if (!record.checks) return false;
  return (
    record.ok === true || newRedChecks(record.checks, preexisting).length > 0
  );
}

/**
 * The last recorded gate run that already judged `tree`, for reuse. Tree
 * identity is the whole key: every gate record carries the tree it ran on (a
 * task's checks, a merge's gates, an earlier goal-head run), so an unchanged
 * head never runs the same gates twice. A run that stopped on infra judged
 * nothing and is not reused.
 */
function judgedGoalHead(
  records: readonly StepRecord[],
  tree: string,
  preexisting: ReadonlySet<string>,
): StepRecord | undefined {
  return records
    .filter(
      (record) =>
        record.actor === "script" &&
        record.tree === tree &&
        record.endedAt !== undefined &&
        judgedTree(record, preexisting),
    )
    .sort(bySeq)
    .at(-1);
}

/**
 * The integration head's gate verdict — the one place head redness is
 * established. A task's merge-check judges a merged result that never landed,
 * so it cannot speak for the head; gating the head can. The head's tree is the
 * key: a tree an earlier run already judged (the merge that just landed gated
 * the tree the head now has) reuses that run, so a wave end pays for the gates
 * once per head tree. The gates run in a detached scratch at the head, never
 * in the goal checkout, which the boundary also uses.
 */
export async function judgeGoalHead(
  runtime: KernelRuntime,
  iteration: number,
  records: readonly StepRecord[],
): Promise<GoalHeadJudgement | undefined> {
  const head = await integrationHead(runtime);
  const tree = (
    await git(runtime.paths.repoRoot, ["rev-parse", `${head}^{tree}`])
  ).stdout.trim();
  const preexisting = preexistingRed(recordedBaseGates(records));
  const judged = judgedGoalHead(records, tree, preexisting);
  if (judged)
    return {
      record: judged,
      red: newRedChecks(judged.checks ?? [], preexisting),
    };

  return integrationExclusive(runtime, async () => {
    const scratch = await resetMergeScratch(runtime, head);
    try {
      const setup = await runWorktreeSetup({
        commands: runtime.configs.repo.setup,
        cwd: scratch,
      });
      if (!setup.ok) {
        await runtime.store.appendRecord(
          scriptMeta(iteration, GOAL_HEAD_STEP),
          {
            ok: false,
            cause: makeCause("setup", setup.error ?? "unknown"),
            tree,
          },
        );
        return undefined;
      }
      const turn = await runtime.store.startRecord(
        scriptMeta(iteration, GOAL_HEAD_STEP),
      );
      const checks = await runGates(runtime, scratch);
      const record = await finishChecks(turn, checks, { preexisting, tree });
      return { record, red: newRedChecks(checks, preexisting) };
    } finally {
      await removeMergeScratch(runtime);
    }
  });
}
