/** The steward wave entry point. */

import type { SessionRef } from "../../harness/types.js";
import { derive } from "../derive.js";
import type { KernelRuntime } from "../types.js";
import type { StewardDead, StewardOptions, StewardResult } from "./types.js";
import {
  attemptedThisWave,
  skipStewardWave,
  stewardCandidate,
  stewardCandidateState,
  stewardCandidates,
} from "./candidates.js";

/**
 * Steward-merge launch step: every parked conflict is attempted once by a
 * model turn in its own worktree (compacted at settle), then the merge queue
 * lands it with gates; failures hold the task and leave an architect pointer
 * (status, worktree, branch) as a forwarded concern. A candidate whose leg
 * stops on infra is reported as dead and the remaining candidates still run;
 * only a frozen slug (its bounded re-dispatches spent, or a fatal cause) is
 * left for the next launch. Unmerged tasks relaunch via continuations on the
 * new head through the existing `base:` path.
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
  const attempted = attemptedThisWave(records, iteration);
  const candidates = stewardCandidates(tasks, state, attempted, opts.frozen);
  if (candidates.length === 0)
    return await skipStewardWave(runtime, records, iteration);

  const attemptedSlugs: string[] = [];
  const landed: string[] = [];
  const unmerged: string[] = [];
  const dead: StewardDead[] = [];
  let session: SessionRef | undefined;

  for (const slug of candidates) {
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
    );
    if (outcome.session) session = outcome.session;
    if (outcome.kind === "cancelled") {
      return {
        skipped: false,
        attempted: attemptedSlugs,
        landed,
        unmerged,
        dead,
        cancelled: true,
      };
    }
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
