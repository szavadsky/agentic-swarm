import path from "node:path";
import { runAgentTurn } from "./agent.js";
import type { PlanCheckPack } from "./context-pack.js";
import { resolveRole } from "./flow-context.js";
import { existingTasks, restoreTurn, snapshotTurn } from "./pm.js";
import { scriptMeta } from "./record.js";
import type {
  KernelRuntime,
  Outcome,
  PlanCheck,
  PlanCheckEvidence,
  PlanCheckFollowUp,
  PlanCheckVerdict,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

/** Agent step of a plan-checker turn; slug-less, so it stays out of the item budget. */
export const PLAN_CHECK_STEP = "plancheck";

/**
 * Whether the checker can run. A run config without the plan-checker alias
 * predates the checker, so dispatch ends at the boundary as before instead
 * of failing on an unresolvable role.
 */
export function planCheckConfigured(runtime: KernelRuntime): boolean {
  try {
    resolveRole(runtime, "plan-checker");
    return true;
  } catch {
    return false;
  }
}

/**
 * The checker's brief: every task file with status, then parked slugs with
 * the cause that parked them. The causes let the checker tell a mechanical
 * park (a follow-up) from a review rejection or a deterministic red (the
 * architect), without opening every record first.
 */
export function planCheckBrief(state: State, tasks: TaskFile[]): string {
  const lines = [existingTasks(state, tasks)];
  const parked = tasks
    .filter((task) => state.tasks[task.slug]?.status === "parked")
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(
      (task) =>
        `- ${task.slug}: ${state.tasks[task.slug]?.cause ?? "no recorded cause"}`,
    );
  if (parked.length > 0) lines.push("", "Parked by cause:", ...parked);
  return lines.join("\n");
}

export interface PlanCheckTurn {
  verdict: PlanCheckVerdict;
  evidence: PlanCheckEvidence[];
  followUps: PlanCheckFollowUp[];
  outcome?: Outcome;
  /** An infrastructure stop: the iteration falls through to the boundary. */
  infra?: { cause: string };
}

/**
 * One plan-checker turn: a task-tier, read-only check of the plan against
 * the repo at dispatch exhaustion. Writes outside the outcome are discarded
 * and recorded; a missing verdict, a refusal, or an infra stop reports
 * `architect`, so the checker can only add progress, never block the
 * iteration on its own failure.
 */
export async function runPlanCheck(
  runtime: KernelRuntime,
  opts: { iteration: number; round: number; state: State },
): Promise<PlanCheckTurn> {
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  const tasks = await runtime.store.listTasks();
  const result = await runAgentTurn(runtime, {
    target: resolveRole(runtime, "plan-checker"),
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration: opts.iteration,
      step: PLAN_CHECK_STEP,
      round: opts.round,
    },
    vars: {
      iteration: String(opts.iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: planPath,
      checkout: runtime.paths.goalCheckout,
      tasks_dir: runtime.store.tasksDir,
      existing_tasks: planCheckBrief(opts.state, tasks),
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
      scriptMeta(opts.iteration, "plan-check-reconcile", {
        round: opts.round,
      }),
      {
        ok: false,
        cause: `checker writes discarded: ${touched.join(", ")}; the checker is read-only`,
      },
    );
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra") {
    return {
      verdict: "architect",
      evidence: [],
      followUps: [],
      outcome: result.outcome,
      infra: {
        cause: stop.details ? `${stop.cause}: ${stop.details}` : stop.cause,
      },
    };
  }
  const check: PlanCheck | undefined =
    result.outcome?.status === "done" ? result.outcome.planCheck : undefined;
  if (!check) {
    return {
      verdict: "architect",
      evidence: [],
      followUps: [],
      outcome: result.outcome,
    };
  }
  return {
    verdict: check.verdict,
    evidence: check.evidence,
    followUps: check.followUps,
    outcome: result.outcome,
  };
}

/**
 * The latest plan-check turn carrying a report, newest record wins. The
 * boundary renders it into the pack, so the architect sees the evidence
 * that sent the goal its way.
 */
export function latestPlanCheck(
  records: StepRecord[],
): PlanCheckPack | undefined {
  const last = records
    .filter(
      (record) =>
        record.step === PLAN_CHECK_STEP &&
        record.actor === "agent" &&
        record.endedAt &&
        record.outcome?.planCheck,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  const check = last?.outcome?.planCheck;
  if (!last || !check) return undefined;
  return {
    iteration: last.iteration,
    verdict: check.verdict,
    evidence: check.evidence,
  };
}
