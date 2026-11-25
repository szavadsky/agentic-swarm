/** Kept-branch landing: red gates, candidates and their records. */

import { git } from "../../core/git/exec.js";
import { makeCause } from "../cause.js";
import { derive } from "../derive.js";
import { DEFAULT_FLOWS } from "../derive-task.js";
import { scriptMeta } from "../record.js";
import { taskArchitect } from "../tasks.js";
import type {
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
  TaskState,
} from "../types.js";
import { branchExists, taskBranchName } from "../worktree.js";
import { bySeq, causeOf } from "./merge.js";
import { mergeTask } from "./merge-checks.js";
import type { KeptLandResult } from "./types.js";

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
        r.slug === slug &&
        r.actor === "agent" &&
        r.endedAt &&
        r.commit === tip &&
        // A verdict turn (a review, or the decider the kernel raises) reads
        // the tip; it never moves it, so it is not the anchor the reds date
        // from.
        r.outcome?.verdict === undefined,
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

/**
 * R10: a kept green branch lands without a new task and without an agent
 * turn. Every parked task whose kept branch still carries its approve (or
 * green checks under a review-less flow) gets one merge attempt at each landing
 * point — the wave end first, the boundary last — and a conflict or a repeated
 * red leaves it parked for the steward. Deterministic reds are skipped before
 * the attempt. A landing, a failed attempt and a deterministic-red skip each
 * write a `kept-land` record: the landing has no task flow records of its own,
 * and the evidence needs one. Spikes never land (their product is the finding,
 * not a merge), and neither does a `base` another task continues: the
 * continuation already carries the work, and PM validation reads a landed base
 * as a broken continuation.
 */
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
      attempted.push(task.slug);
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
