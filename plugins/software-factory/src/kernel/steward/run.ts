/** The steward wave entry point. */

import type { SessionRef } from "../../harness/types.js";
import { derive } from "../derive.js";
import { revisionStart } from "../derive-task-facts.js";
import { parkTask, taskMeta } from "../flow-meta.js";
import { judgeGoalHead } from "../integrate.js";
import type { KernelRuntime, StepRecord, TaskFile } from "../types.js";
import type {
  StewardCandidate,
  StewardDead,
  StewardOptions,
  StewardResult,
} from "./types.js";
import {
  attemptedThisWave,
  skipStewardWave,
  stewardCandidate,
  stewardCandidateState,
  stewardCandidates,
  stewardParks,
} from "./candidates.js";

/**
 * Steward-merge launch step: every conflict the wave left parked, including a
 * base conflict the branch could not take in and one the flow could not hand
 * to its resolve turn, is attempted once by a model turn in its own worktree
 * (compacted at settle), then the merge queue lands it with gates; failures
 * hold the task and leave an architect pointer (status, worktree, branch) as a
 * forwarded concern. A gates park is a candidate only when gate evidence says
 * the red is still there: the goal head is gated (or the run that already
 * judged its tree reused) and a red-after-merge candidate repairs it. A
 * candidate whose leg stops on infra is reported as dead and the remaining
 * candidates still run; only a frozen slug (its bounded re-dispatches spent, or
 * a fatal cause) is left for the next launch. Unmerged tasks relaunch via
 * continuations on the new head through the existing `base:` path.
 */
export async function runSteward(
  runtime: KernelRuntime,
  iteration: number,
  opts: StewardOptions = {},
): Promise<StewardResult> {
  const view = await stewardView(runtime, iteration, opts.frozen);
  const { tasks, records, state, frozen } = view;
  // A turn that stopped on infra is not an attempt: its slug gets the
  // task-turn backoff, so a later wave retries it instead of skipping it.
  const attempted = attemptedThisWave(records, iteration);
  const parks = stewardParks(tasks, state, attempted, frozen);
  if (parks.length === 0)
    return await skipStewardWave(runtime, records, iteration);
  // A gates park needs the head's own verdict before it can be a candidate:
  // the gates run once per head tree, and a tree already judged reuses its run.
  const goalHead = parks.some((park) => park.kind === "gates")
    ? await judgeGoalHead(runtime, iteration, records)
    : undefined;
  const candidates = stewardCandidates(
    tasks,
    state,
    attempted,
    frozen,
    records,
    runtime.store,
    goalHead,
  );
  if (candidates.length === 0)
    return await skipStewardWave(runtime, records, iteration);
  return await runStewardCandidates(runtime, tasks, candidates, iteration);
}

/** Runs the candidates through the steward in slug order, sharing one session. */
async function runStewardCandidates(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  candidates: readonly StewardCandidate[],
  iteration: number,
): Promise<StewardResult> {
  const attemptedSlugs: string[] = [];
  const landed: string[] = [];
  const unmerged: string[] = [];
  const dead: StewardDead[] = [];
  let session: SessionRef | undefined;

  for (const candidate of candidates) {
    const slug = candidate.slug;
    const task = tasks.find((t) => t.slug === slug)!;
    const fresh = await runtime.store.listRecords();
    const taskState = await stewardCandidateState(runtime, fresh, slug);
    attemptedSlugs.push(slug);
    const outcome = await stewardCandidate(
      runtime,
      task,
      fresh,
      iteration,
      taskState,
      session,
      candidate,
    );
    if (outcome.session) session = outcome.session;
    if (outcome.kind === "cancelled")
      return cancelledResult(attemptedSlugs, landed, unmerged, dead);
    if (outcome.kind === "dead") {
      dead.push(outcome.dead);
      continue;
    }
    if (outcome.kind === "landed") landed.push(slug);
    else unmerged.push(slug);
  }

  return {
    skipped: false,
    attempted: attemptedSlugs,
    landed,
    unmerged,
    dead,
  };
}

/** The wave interrupted by a cancelled steward leg. */
function cancelledResult(
  attempted: string[],
  landed: string[],
  unmerged: string[],
  dead: StewardDead[],
): StewardResult {
  return {
    skipped: false,
    attempted,
    landed,
    unmerged,
    dead,
    cancelled: true,
  };
}

/**
 * The wave-end steward's view. A conflict the wave could not hand to its
 * in-flow resolve turn parks first, so the candidate query sees it; a slug
 * frozen by the fault that blocked its resolve turn is a candidate this
 * wave, since the steward turn is not the faulted dispatch.
 */
async function stewardView(
  runtime: KernelRuntime,
  iteration: number,
  frozenSlugs: ReadonlySet<string> | undefined,
): Promise<{
  tasks: TaskFile[];
  records: StepRecord[];
  state: ReturnType<typeof derive>;
  frozen: Set<string>;
}> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  const parked = await parkUnresolvedConflicts(
    runtime,
    tasks,
    records,
    state,
    iteration,
  );
  const fresh = parked.size > 0 ? await runtime.store.listRecords() : records;
  const settled =
    parked.size > 0
      ? derive(tasks, fresh, runtime.configs.process.flows)
      : state;
  return {
    tasks,
    records: fresh,
    state: settled,
    frozen: new Set(
      [...(frozenSlugs ?? [])].filter((slug) => !parked.has(slug)),
    ),
  };
}

/**
 * A conflict the wave could not hand to its in-flow resolve turn: the flow
 * has the step but nothing admitted it, so the task reduced to the resolve
 * phase and every later wave would propose the same turn again. Parks it with
 * the merge's conflict cause.
 */
async function parkUnresolvedConflicts(
  runtime: KernelRuntime,
  tasks: TaskFile[],
  records: StepRecord[],
  state: ReturnType<typeof derive>,
  iteration: number,
): Promise<Set<string>> {
  const parked = new Set<string>();
  for (const task of tasks) {
    const s = state.tasks[task.slug];
    if (s?.status !== "ready" || s.phase !== "resolve") continue;
    const own = records.filter((r) => r.slug === task.slug);
    const merge = own
      .slice(revisionStart(task.revision, own))
      .findLast((r) => r.step === "merge");
    const cause = merge?.cause;
    if (cause?.kind !== "conflict") continue;
    await parkTask(runtime, taskMeta(task, s, iteration), cause);
    parked.add(task.slug);
  }
  return parked;
}
