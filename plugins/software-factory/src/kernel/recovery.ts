import { deliveredIngestionComplete, ingestionStepIds } from "./ingestion.js";
import { OutcomeInvalidError, readDeliveredOutcome } from "./outcome.js";
import { backfillSummaries } from "./summary.js";
import {
  type KernelRuntime,
  type Outcome,
  outcomeSchema,
  type StepRecord,
} from "./types.js";
import { prepareIntegrationCheckout } from "./worktree.js";

interface SettledRecords {
  closed: number;
  /** Of the closed ones, the records sealed with a delivered outcome. */
  adopted: number;
}

/**
 * The outcome a killed ingestion turn already delivered and its step backs with
 * the promised artifact, or undefined when there is none to adopt. An agent
 * writes its outcome before the kernel records the turn's end, so a hard death
 * mid-step leaves a valid `outcome.yaml` behind an unended record. These steps
 * have no mechanical settle after the turn: the files the agent wrote are the
 * product and the outcome only reports them, so a delivered outcome that
 * completes the step is its result. Recovery applies the step's completion
 * predicate, not just the file's schema: a scout that said done but never wrote
 * its code map, or a front without its class, stays unfinished and reruns.
 * Usage does not survive the process that measured it: the adopted turn carries
 * none and prices as an unpriced turn, never as a guess. A task turn is never
 * adopted — its commit and checks settle after the turn — and a malformed file
 * was never a result.
 */
function deliveredIngestionOutcome(
  runtime: KernelRuntime,
  steps: ReadonlySet<string>,
  record: StepRecord,
): Outcome | undefined {
  if (record.actor !== "agent") return undefined;
  if (!steps.has(record.step)) return undefined;
  const file = runtime.store.records.file(record, "outcome.yaml");
  try {
    const outcome = readDeliveredOutcome(file, "", outcomeSchema)?.outcome;
    if (outcome === undefined) return undefined;
    return deliveredIngestionComplete(runtime, record.step, outcome)
      ? outcome
      : undefined;
  } catch (err) {
    if (err instanceof OutcomeInvalidError) return undefined;
    throw err;
  }
}

/**
 * A record directory with `started.yaml` and no `end.yaml` is a turn cut off by
 * the process dying. An ingestion step's delivered outcome is adopted when it
 * completes the step: the record is sealed `done` with that outcome, so the
 * step stays completed and the relaunch resumes its iteration instead of
 * rerunning it. A delivered outcome its step did not complete is sealed bare
 * with the rest, and the stale file behind the seal does not finish the step:
 * the completion predicates read the artifact, not the outcome alone. Every
 * other record is closed as a bare `infra: crash` with no cause, details, usage,
 * prompt bytes or outcome. Repeat rule: the bare seal is a free interruption,
 * redispatched like an orphan — the count is by step, not by actor, so only a
 * crash the turn itself reported (cause, details, usage or prompt bytes, from
 * harness or script) counts as a turn and parks `infra-repeat` after two
 * repeats on the same step. Never invent an outcome, usage or commit. Still
 * free: quota/rate/network/auth/overflow/glitch stops and drain (tasks never
 * started). Every record that already has `end.yaml` is sealed too, so history
 * written before records were read-only becomes sealed as well. An interrupted
 * agent turn's worktree is kept: the sweep removes terminal tasks only, so the
 * relaunch continues that turn in the tree it was already working in.
 */
async function settleRecords(runtime: KernelRuntime): Promise<SettledRecords> {
  const { store } = runtime;
  const steps = ingestionStepIds(runtime);
  const delivered = new Map<string, Outcome>();
  for (const record of await store.listRecords()) {
    if (record.endedAt !== undefined) continue;
    const outcome = deliveredIngestionOutcome(runtime, steps, record);
    if (outcome !== undefined)
      delivered.set(store.records.dir(record), outcome);
  }
  let closed = 0;
  let adopted = 0;
  for (const dir of await store.records.dirs()) {
    if (!dir.started) continue;
    if (dir.ended) {
      await store.records.seal(dir.name);
      continue;
    }
    const outcome = delivered.get(dir.path);
    if (outcome !== undefined) {
      await store.records.close(dir.name, {
        stop: { kind: "done" },
        ok: true,
        outcome,
      });
      adopted += 1;
    } else {
      await store.records.close(dir.name, {
        stop: { kind: "infra", cause: "crash" },
        ok: false,
      });
    }
    closed += 1;
  }
  return { closed, adopted };
}

/**
 * Startup recovery under the goal lock: orphan records first, then the stable
 * checkout (removes stale task worktrees, keeps an interrupted agent turn's
 * tree, resets a half-finished merge) and the summaries missing from
 * iterations that were killed.
 */
export async function recoverLaunch(runtime: KernelRuntime): Promise<number> {
  const settled = await settleRecords(runtime);
  await prepareIntegrationCheckout(runtime);
  await backfillSummaries(runtime);
  if (settled.closed > 0)
    console.warn(
      `[factory] recovery closed ${settled.closed} interrupted record(s): ${settled.adopted} adopted from a delivered outcome, ${settled.closed - settled.adopted} as infra: crash`,
    );
  return settled.closed;
}
