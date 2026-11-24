import { runAgentTurn } from "./agent.js";
import { makeCause } from "./cause.js";
import { formatCause } from "./cause.js";
import type { PlanCheckPack } from "./context-pack.js";
import { boundaryTarget } from "./flow-context.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import {
  existingTasks,
  type PlanCheckPmResult,
  restoreTurn,
  runPlanCheckPm,
  snapshotTurn,
} from "./pm.js";
import { formatPlanList, planBullets } from "./plan-file.js";
import { scriptMeta } from "./record.js";
import {
  type ArtifactStore,
  type Cause,
  type KernelRuntime,
  normalizeSlug,
  type Outcome,
  type PlanCheck,
  type PlanCheckEvidence,
  type PlanCheckFollowUp,
  type PlanCheckVerdict,
  type State,
  type StepRecord,
  type TaskFile,
  type TaskStatus,
} from "./types.js";

/** Agent step of a plan-checker turn; slug-less, so it stays out of the item's turn count. */
export const PLAN_CHECK_STEP = "plancheck";

/** Statuses that still owe the goal work: parked and ready/pending are the checker's business. */
const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "pending",
  "ready",
  "running",
  "parked",
]);

/**
 * The slugs one plan names as task bullets. Prose mentions and nested bullets
 * (`  - done: …`) name no task, so a follow-up cannot hide behind them.
 */
export function planSlugs(plan: string): Set<string> {
  const slugs = new Set<string>();
  for (const raw of planBullets(plan).keys()) {
    const slug = normalizeSlug(raw);
    if (slug.length > 0) slugs.add(slug);
  }
  return slugs;
}

/**
 * Findings for a plan-check report whose follow-ups reach outside every active
 * plan: each follow-up's own slug must be a `- <slug> —` bullet in one of them.
 * A `missing-dep` follow-up's dead dependency may be absent from the plans; it
 * is the dep, not the slug acted on. Only a `done` outcome carries a report to
 * check.
 */
export function validatePlanCheck(
  plans: readonly string[],
  outcome: Outcome,
): string[] {
  if (outcome.status !== "done" || !outcome.planCheck) return [];
  const named = new Set(plans.flatMap((plan) => [...planSlugs(plan)]));
  const outside = [
    ...new Set(
      outcome.planCheck.followUps
        .map((followUp) => normalizeSlug(followUp.slug))
        .filter((slug) => !named.has(slug)),
    ),
  ];
  return outside.map(
    (slug) =>
      `follow-up slug "${slug}" has no "- ${slug} —" bullet in the plan; merged and retired slugs are history`,
  );
}

/** Non-terminal task slugs, sorted: the work a boundary still owes the goal. */
export function openWork(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => OPEN_STATUSES.has(task.status))
    .map(([slug]) => slug)
    .sort();
}

/**
 * Closed plan-check turns since the last architect turn. One consult owns at
 * most `planCheckRounds` of them, so this is the repeat count whether the
 * rounds ran inside dispatch or at the boundary gate.
 */
export function planChecksSinceConsult(records: StepRecord[]): StepRecord[] {
  const lastArchitect = records
    .filter(
      (record) =>
        record.actor === "agent" &&
        record.step === "architect" &&
        record.endedAt,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  return records
    .filter(
      (record) =>
        record.actor === "agent" &&
        record.step === PLAN_CHECK_STEP &&
        record.endedAt &&
        (lastArchitect === undefined || record.seq > lastArchitect.seq),
    )
    .sort((a, b) => a.seq - b.seq);
}

/**
 * Whether a boundary spends a checker round before the architect. The
 * checker runs before every consult with a plan, including when nothing is
 * open: its clean record is the architect's evidence that the plan still
 * holds. `architect`, an exhausted repeat bound and a steer only the
 * architect can answer also skip the check: the consult is their resolver.
 */
export function consultGate(input: {
  /** A plan exists to verify. */
  plan: boolean;
  /** An unprocessed inbox steer waits: the architect is its consumer. */
  steerWaiting: boolean;
  records: StepRecord[];
  /** `limits.planCheckRounds`: checker turns allowed before one consult. */
  bound: number;
}): "check" | "consult" {
  if (!input.plan) return "consult";
  if (input.steerWaiting) return "consult";
  const checks = planChecksSinceConsult(input.records);
  if (checks.length >= input.bound) return "consult";
  if (checks.at(-1)?.outcome?.planCheck?.verdict === "architect")
    return "consult";
  return "check";
}

/**
 * The last closed record that ran gates, as its `end.yaml` path. A merge
 * record copies the checks it merged from, so only a real run counts. The
 * checker reads this instead of re-running the suite.
 */
export function lastGateRecord(
  records: StepRecord[],
  store: ArtifactStore,
): string | undefined {
  const last = records
    .filter(
      (record) =>
        record.endedAt &&
        record.step !== "merge" &&
        record.checks !== undefined,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  return last ? store.records.file(last, "end.yaml") : undefined;
}

/** One parked task's cause as the brief reads it. */
function parkedCauseText(cause: Cause | undefined): string {
  return cause ? formatCause(cause) : "no recorded cause";
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
        `- ${task.slug}: ${parkedCauseText(state.tasks[task.slug]?.cause)}`,
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
 * the repo at a boundary or dispatch exhaustion. Writes outside the outcome
 * are discarded and recorded; a missing verdict, a refusal, or an infra stop
 * reports `architect`, so the checker can only add progress, never block the
 * iteration on its own failure.
 */
/** The template variables of one plan-checker turn. */
function planCheckVars(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
  plans: ReturnType<KernelRuntime["store"]["plans"]["existing"]>,
  tasks: Awaited<ReturnType<KernelRuntime["store"]["listTasks"]>>,
  gateRecord: string | undefined,
): Record<string, string> {
  return {
    iteration: String(opts.iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plans: formatPlanList(plans),
    checkout: runtime.paths.goalCheckout,
    tasks_dir: runtime.store.tasks.dir,
    existing_tasks: planCheckBrief(opts.state, tasks),
    gate_record_path: gateRecord ?? "none recorded",
  };
}

/** Records the checker's reads-only breach after restoring its writes. */
async function recordDiscardedWrites(
  runtime: KernelRuntime,
  opts: { iteration: number; round: number },
  restored: Awaited<ReturnType<typeof restoreTurn>>,
): Promise<void> {
  const touched = [...restored.plans, ...restored.tasks].sort();
  if (touched.length === 0) return;
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, "plan-check-reconcile", {
      round: opts.round,
    }),
    {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        `checker writes discarded: ${touched.join(", ")}; the checker is read-only`,
      ),
    },
  );
}

/** The turn result: infra, no verdict, or the checker's verdict. */
function planCheckTurnResult(
  result: Awaited<ReturnType<typeof runAgentTurn>>,
): PlanCheckTurn {
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

export async function runPlanCheck(
  runtime: KernelRuntime,
  opts: { iteration: number; round: number; state: State },
): Promise<PlanCheckTurn> {
  const allPlans = runtime.store.plans.registered();
  const plans = runtime.store.plans.existing();
  const texts = (
    await Promise.all(plans.map((plan) => runtime.store.plans.read(plan.scope)))
  ).filter((text): text is string => text !== null);
  const snapshot = await snapshotTurn(runtime, allPlans);
  const tasks = await runtime.store.listTasks();
  const gateRecord = lastGateRecord(
    await runtime.store.listRecords(),
    runtime.store,
  );
  const result = await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, "plancheck", opts.iteration),
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration: opts.iteration,
      step: PLAN_CHECK_STEP,
      round: opts.round,
    },
    vars: planCheckVars(runtime, opts, plans, tasks, gateRecord),
    expectation: KERNEL_TURN_STEPS[PLAN_CHECK_STEP],
    validate: (outcome) => validatePlanCheck(texts, outcome),
  });
  await recordDiscardedWrites(
    runtime,
    opts,
    await restoreTurn(runtime, snapshot),
  );
  return planCheckTurnResult(result);
}

export interface PlanCheckRound {
  turn: PlanCheckTurn;
  /** Follow-up slugs the PM continued; non-empty means dispatch has work. */
  continued: string[];
  /** `checked` when no follow-up PM turn ran; otherwise that ladder's exit. */
  status: PlanCheckPmResult["status"] | "checked";
  /** Baseline findings the PM could not fix; `architect` only. */
  findings: string[];
}

/**
 * One checker round and, on `progress`, its follow-up PM turn. The round is
 * shared by the boundary gate and dispatch, so one `planCheckRounds` budget
 * covers both: a round is spent whether the PM continued a slug or left it
 * for the architect. An infra stop, an `architect` verdict and an empty
 * follow-up list stop here; a follow-up PM exit is carried in `status` and
 * `findings`, so the caller can hand its unfixed findings to the next
 * consult. Only continued work resumes dispatch.
 */
export async function runPlanCheckRound(
  runtime: KernelRuntime,
  opts: { iteration: number; round: number; state: State },
): Promise<PlanCheckRound> {
  const turn = await runPlanCheck(runtime, opts);
  if (turn.infra || turn.verdict !== "progress" || turn.followUps.length === 0)
    return { turn, continued: [], status: "checked", findings: [] };
  const followed = await runPlanCheckPm(runtime, {
    iteration: opts.iteration,
    state: opts.state,
    followUps: turn.followUps,
    cwd: runtime.paths.goalCheckout,
  });
  return {
    turn,
    continued: followed.continued,
    status: followed.status,
    findings: followed.status === "architect" ? followed.findings : [],
  };
}

/**
 * The latest plan-check turn carrying a report, newest record wins. A check
 * that ended on infrastructure carries its reason instead of a report, so
 * the architect reads why the checker did not run. The boundary renders it
 * into the pack, so the architect sees the evidence that sent the goal its
 * way, or the reason there was none.
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
        (record.outcome?.planCheck !== undefined ||
          record.stop?.kind === "infra"),
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (!last) return undefined;
  const check = last.outcome?.planCheck;
  if (check) {
    return {
      iteration: last.iteration,
      verdict: check.verdict,
      evidence: check.evidence,
    };
  }
  const stop = last.stop;
  if (stop?.kind === "infra") {
    return {
      iteration: last.iteration,
      verdict: "architect",
      evidence: [],
      reason: stop.details ? `${stop.cause}: ${stop.details}` : stop.cause,
    };
  }
  return undefined;
}
