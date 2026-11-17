import path from "node:path";
import { runAgentTurn } from "./agent.js";
import type { PlanReviewPack } from "./context-pack.js";
import { resolveRole } from "./flow-context.js";
import { restoreTurn, snapshotTurn } from "./pm.js";
import { scriptMeta } from "./record.js";
import type { KernelRuntime, StepRecord } from "./types.js";

/** Agent step of a plan-review turn; slug-less, so it stays out of the item's turn count. */
export const PLAN_REVIEW_STEP = "planreview";

async function recordMissing(
  runtime: KernelRuntime,
  iteration: number,
  cause: string,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(iteration, "plan-review-missing", { round: 1 }),
    { ok: false, cause },
  );
}

/**
 * One plan-reviewer turn after the architect's plan edit: a fresh session,
 * task-tier by default (the role alias), read-only. The findings are advisory:
 * a failed turn is recorded and the iteration continues; the next pack carries
 * whatever the reviewer delivered. Writes outside the outcome are discarded and
 * recorded, so the reviewer can only advise.
 */
export async function runPlanReview(
  runtime: KernelRuntime,
  opts: { iteration: number; packRel: string },
): Promise<void> {
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  const result = await runAgentTurn(runtime, {
    target: resolveRole(runtime, "plan-reviewer"),
    cwd: runtime.paths.goalCheckout,
    meta: { iteration: opts.iteration, step: PLAN_REVIEW_STEP, round: 1 },
    vars: {
      author: "architect",
      iteration: String(opts.iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: planPath,
      pack_path: path.join(runtime.store.goalDir, opts.packRel),
      worktree: runtime.paths.goalCheckout,
    },
    expectation: "any",
  });
  const restored = await restoreTurn(runtime, snapshot);
  const touched = [
    ...(restored.plan ? ["plan.md"] : []),
    ...restored.tasks,
  ].sort();
  if (touched.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "plan-review-reconcile", { round: 1 }),
      {
        ok: false,
        cause: `plan reviewer writes discarded: ${touched.join(", ")}; the reviewer is read-only`,
      },
    );
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    const cause = `plan review stopped on infrastructure: ${
      stop.details ? `${stop.cause}: ${stop.details}` : stop.cause
    }`;
    await recordMissing(runtime, opts.iteration, cause);
    return;
  }
  const outcome = result.outcome;
  if (!outcome || outcome.status !== "done" || !outcome.summary.trim()) {
    const cause = `plan review produced no findings: ${
      outcome?.summary ?? "no outcome"
    }`;
    await recordMissing(runtime, opts.iteration, cause);
  }
}

/**
 * The latest plan-review attempt, when it carried findings. A newer failed
 * attempt hides an older review: the pack must not present stale findings about
 * a plan the architect has since changed. The boundary renders the findings so
 * the architect marks each one.
 */
export function latestPlanReview(
  records: StepRecord[],
): PlanReviewPack | undefined {
  const last = records
    .filter(
      (record) =>
        record.step === PLAN_REVIEW_STEP &&
        record.actor === "agent" &&
        record.endedAt,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  // A failed latest review means there are no fresh findings; an older one is
  // stale evidence about a plan the architect has since changed.
  if (
    !last?.outcome ||
    last.outcome.status !== "done" ||
    last.outcome.summary.trim().length === 0
  )
    return undefined;
  return {
    iteration: last.iteration,
    alias: last.alias ?? "plan-reviewer",
    summary: last.outcome.summary.trim(),
  };
}
