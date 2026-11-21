/** The merge's gate checks, kept-gate reruns and landing a merged task. */

import type { CheckResult } from "../../core/checks/types.js";
import { runWorktreeSetup } from "../../core/checks/setup.js";
import { preexistingRed, recordedBaseGates } from "../baseline.js";
import { makeCause } from "../cause.js";
import {
  gateFlakeTests,
  isInfraCheck,
  newGateFailures,
  runGates,
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
import { headSha, removeMergeScratch, treeSha } from "../worktree.js";
import {
  IntegrationMovedError,
  failMerge,
  judgedChecks,
  recoverOpenMerge,
  refMove,
  squashTaskBranch,
  syncCheckout,
} from "./merge.js";
import type { MergeOptions, MergeResult } from "./types.js";

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
