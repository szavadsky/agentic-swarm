import fs from "node:fs";
import path from "node:path";
import { runAgentTurn } from "./agent.js";
import type { PlanCheckPack } from "./context-pack.js";
import { boundaryTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
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

/** Agent step of a plan-checker turn; slug-less, so it stays out of the item's turn count. */
export const PLAN_CHECK_STEP = "plancheck";

/** A top-level plan bullet: `- <slug> — <title>` (the em dash is the plan's). */
const PLAN_BULLET = /^-\s+(\S+)\s+—/u;

/**
 * The slugs the plan names as task bullets. Prose mentions and nested bullets
 * (`  - done: …`) name no task, so a follow-up cannot hide behind them.
 * `plan-scopes` generalizes this parser once every scope has its own plan.
 */
export function planSlugs(plan: string): Set<string> {
  const slugs = new Set<string>();
  for (const line of plan.split(/\r?\n/)) {
    const match = PLAN_BULLET.exec(line);
    if (match) slugs.add(match[1]!);
  }
  return slugs;
}

/**
 * Findings for a plan-check report whose follow-ups reach outside the plan:
 * each follow-up's own slug must be a `- <slug> —` bullet. A `missing-dep`
 * follow-up's dead dependency may be absent from the plan; it is the dep, not
 * the slug acted on. Only a `done` outcome carries a report to check.
 */
export function validatePlanCheck(plan: string, outcome: Outcome): string[] {
  if (outcome.status !== "done" || !outcome.planCheck) return [];
  const named = planSlugs(plan);
  const outside = [
    ...new Set(
      outcome.planCheck.followUps
        .map((followUp) => followUp.slug)
        .filter((slug) => !named.has(slug)),
    ),
  ];
  return outside.map(
    (slug) =>
      `follow-up slug "${slug}" has no "- ${slug} —" bullet in the plan; merged and retired slugs are history`,
  );
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
  const plan = fs.existsSync(planPath)
    ? await fs.promises.readFile(planPath, "utf8")
    : "";
  const snapshot = await snapshotTurn(runtime, planPath);
  const tasks = await runtime.store.listTasks();
  const result = await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, "plancheck", opts.iteration),
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
    expectation: KERNEL_TURN_STEPS[PLAN_CHECK_STEP],
    validate: (outcome) => validatePlanCheck(plan, outcome),
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
