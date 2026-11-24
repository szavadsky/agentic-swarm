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
import {
  gateFlakeTests,
  isInfraCheck,
  newGateFailures,
  runGates,
} from "./gates.js";
import {
  appendGateFlake,
  appendPark,
  finishChecks,
  scriptMeta,
  startChecks,
} from "./record.js";
import { checkSpikeReport } from "./spike-report.js";
import type { Cause, KernelRuntime, StepRecord, TaskFile } from "./types.js";
import { headSha, integrationHead, treeSha } from "./worktree.js";

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
 * One re-run for red gates on the same tree, one per gate per tree: green on
 * the re-run records a `gate-flake`; red again keeps the fix route. Infra reds
 * and inherited reds never re-run.
 */
async function rerunRedGates(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  worktree: string,
  red: readonly CheckResult[],
  prior: readonly StepRecord[],
  tree: string,
): Promise<Map<string, CheckResult>> {
  const reran = prior.some(
    (rec) =>
      rec.slug === meta.slug &&
      rec.step === "checks" &&
      rec.endedAt &&
      rec.tree === tree,
  );
  if (red.length === 0 || reran) return new Map();
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
  return fresh;
}

/**
 * Task gates with one flake re-run: a red gate re-runs once on the same tree
 * before any fix turn. Green on re-run closes the checks record green with a
 * `gate-flake` record naming the gate and its red-run failing tests; red again
 * keeps the existing fix route. The re-run keys on the tree, consumes no round,
 * and baseline/merge-checks runs never reach this helper.
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
): Promise<CheckResult[]> {
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

  const red = newGateFailures(checks, preexisting).filter(
    (check) => !isInfraCheck(check),
  );
  const fresh = await rerunRedGates(runtime, meta, worktree, red, prior, tree);
  if (fresh.size > 0) {
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
  return checks;
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
): Promise<Record<string, never>> {
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
  const checks = await runTaskGates(
    runtime,
    task,
    meta,
    worktree,
    preexisting,
    prior,
  );
  const red = redGateCause(checks, preexisting);
  if (red) await appendPark(runtime.store, meta, red);
  return {};
}
