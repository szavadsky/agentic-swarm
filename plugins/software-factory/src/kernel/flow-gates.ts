/**
 * Task gates for one turn: the gate run, the one flake re-run per red gate per
 * tree, the cleanliness check, the spike report, and the park cause an
 * actionable red names. Also the clean-head resolve that needs no turn.
 */
import type { CheckResult } from "../core/checks/types.js";
import { commitAll } from "../core/git/commit.js";
import { makeCause } from "./cause.js";
import { runCleanlinessCheck } from "./cleanliness.js";
import { firstBase, revisionBase } from "./flow-context.js";
import type { TaskActionResult, TaskGateRun } from "./flow-types.js";
import {
  advisoryChecks,
  isInfraCheck,
  newGateFailures,
  runGates,
} from "./gates.js";
import {
  adjudicateInfraChecks,
  isTimeoutGate,
  markInfraGates,
  rerunGateSubset,
} from "./infra-verdict.js";
import { appendPark, finishChecks, scriptMeta, startChecks } from "./record.js";
import { checkSpikeReport } from "./spike-report.js";
import type { Cause, KernelRuntime, StepRecord, TaskFile } from "./types.js";
import { headSha, integrationHead, treeSha } from "./worktree.js";

/** The park cause for actionable red checks, or undefined when every red is infra. */
export function redGateCause(
  checks: CheckResult[],
  preexisting: ReadonlySet<string>,
): Cause | undefined {
  const red = newGateFailures(checks, preexisting).filter(
    (check) => !isInfraCheck(check),
  );
  return red.length > 0
    ? makeCause("gates", red.map((check) => check.name).join(", "))
    : undefined;
}

/**
 * One re-run for red gates on the same tree and one retry for timed-out
 * gates: green on the re-run records a `gate-flake`; red again keeps the fix
 * route; a second timeout goes to the infra verdict turn.
 */
async function rerunRedOrTimedOutGates(
  runtime: KernelRuntime,
  meta: {
    iteration: number;
    slug: string;
    round: number;
    architect?: string;
  },
  worktree: string,
  checks: CheckResult[],
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
  tree: string,
): Promise<CheckResult[]> {
  const reran = prior.some(
    (rec) =>
      rec.slug === meta.slug &&
      rec.step === "checks" &&
      rec.endedAt &&
      rec.tree === tree,
  );
  const failing = newGateFailures(checks, preexisting);
  const red = reran ? [] : failing.filter((check) => !isInfraCheck(check));
  const timedOut = failing.filter(isTimeoutGate);
  const targets = new Set([
    ...red.map((check) => check.name),
    ...timedOut.map((check) => check.name),
  ]);
  return rerunGateSubset(runtime, worktree, tree, checks, targets, {
    meta,
    replaceInfraFor: new Set(timedOut.map((check) => check.name)),
  });
}

/**
 * Task gates with one flake/timeout re-run: a red gate re-runs once per tree
 * and a timed-out gate retries once before any fix turn or infra verdict.
 * Persistent timeouts and cannot-start failures route to the infra turn.
 */
export async function runTaskGates(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: {
    iteration: number;
    slug: string;
    round: number;
    architect?: string;
  },
  worktree: string,
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
): Promise<TaskGateRun> {
  const tree = await treeSha(worktree);
  const gate = await startChecks(runtime.store, meta);
  let checks = await runGates(runtime, worktree);
  markInfraGates(checks);

  const gatesRecords = await runtime.store.listRecords();
  const base =
    revisionBase(gatesRecords, meta.slug, task.revision) ??
    firstBase(gatesRecords, meta.slug) ??
    "HEAD";
  const cleanliness = await runCleanlinessCheck(
    runtime,
    worktree,
    base,
    await integrationHead(runtime),
  );
  if (!cleanliness.ok) checks.push(cleanliness);

  checks = await rerunRedOrTimedOutGates(
    runtime,
    meta,
    worktree,
    checks,
    preexisting,
    prior,
    tree,
  );
  // A spike's product is its committed report, gated like a repo gate but
  // never re-run: it reads the commit, which a re-run cannot change. A
  // `nogit` type delivers outside git, so it has no report to gate.
  if (task.kind === "spike" && !task.nogit) {
    checks.push(
      await checkSpikeReport(worktree, task.slug, await headSha(worktree)),
    );
  }
  if (task.advisory) checks = advisoryChecks(checks);
  const adjudicated = await adjudicateInfraChecks(
    runtime,
    meta.iteration,
    "checks",
    worktree,
    checks,
    preexisting,
    { slug: meta.slug, round: meta.round, lock: true },
  );
  checks = adjudicated.checks;
  await finishChecks(gate, checks, { preexisting, tree });
  return {
    checks,
    ...(adjudicated.infra ? { infra: adjudicated.infra } : {}),
    ...(adjudicated.cancelled ? { cancelled: true } : {}),
  };
}

/**
 * A resolve step whose head merged cleanly needs no turn: commit the merge,
 * gate its tree, and park when a gate is red. The record still settles the
 * conflict, so derive consumes the merge and retries it.
 */
export async function finishCleanResolve(
  runtime: KernelRuntime,
  task: TaskFile,
  meta: {
    iteration: number;
    slug: string;
    round: number;
    revision: number;
    architect?: string;
  },
  worktree: string,
  preexisting: ReadonlySet<string>,
  prior: readonly StepRecord[],
): Promise<TaskActionResult> {
  const before = await headSha(worktree);
  const committed = await commitAll(
    runtime.repo,
    worktree,
    `factory: ${task.slug} merge integration head`,
  );
  const commit = committed ?? before;
  const tree = await treeSha(worktree);
  await runtime.store.appendRecord(
    scriptMeta(meta.iteration, "resolve", meta),
    {
      ok: true,
      commit,
      tree,
      cause: makeCause(
        "note",
        committed
          ? "auto-merged the integration head without a turn"
          : "the integration head was already merged",
      ),
    },
  );
  const gated = await runTaskGates(
    runtime,
    task,
    meta,
    worktree,
    preexisting,
    prior,
  );
  if (gated.infra) return { infra: gated.infra };
  if (gated.cancelled) return { cancelled: true };
  const red = redGateCause(gated.checks, preexisting);
  if (red) await appendPark(runtime.store, meta, red);
  return {};
}
