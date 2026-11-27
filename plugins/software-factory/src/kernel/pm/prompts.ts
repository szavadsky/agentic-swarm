import { formatCause, makeCause } from "../cause.js";
import { DEFAULT_PARK_AMENDS } from "../config.js";
import type { ForwardedConcern } from "../context-pack/types.js";
import type { TurnTarget } from "../flow-context.js";
import {
  formatSteerTurn,
  holdsDir,
  planCheckProvenance,
  type Steer,
  stallProvenance,
  steerProvenance,
} from "../mailbox.js";
import { formatParkDefault } from "../park-route.js";
import { formatPlanDiff, type PlanDocument } from "../plan-file.js";
import type { PromptLibrary } from "../prompts.js";
import { doneWhen, materialHash } from "../task-material.js";
import type {
  Cause,
  KernelRuntime,
  PlanCheckFollowUp,
  State,
  StepRecord,
  TaskFile,
  TaskStatus,
} from "../types.js";
import { integrationHead, taskBranchName } from "../worktree.js";
import { isFrozenStatus } from "./reconcile.js";
import { scopeEpic } from "./scope.js";
import type { PlanSnapshot, PmMandate, PmScope } from "./types.js";
import { amendsUsed } from "./validation.js";

/** A cancelled slug is spent: reconcile restores it and the PM must not reuse it. */
function readOnlyMarker(status: TaskStatus | "new"): string {
  if (isFrozenStatus(status)) return " | frozen (read-only)";
  if (status === "cancelled") return " | read-only (spent)";
  return "";
}

export function existingTasks(state: State, tasks: TaskFile[]): string {
  if (tasks.length === 0) return "none";
  return [...tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => existingTaskLine(state, task))
    .join("\n");
}

/** The prompt inputs every PM turn renders, the derive ladder and config steps alike. */
interface PmPromptInput {
  planList: string;
  planDiff?: string;
  tasks: TaskFile[];
  repair: string;
  steers: string;
  stalls: string;
  planChecks: string;
  concerns: string;
}

/** The variables a PM-role turn renders, whichever step of the PM flow runs it. */
export function pmTurnVars(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; scope?: PmScope },
  input: PmPromptInput,
): Record<string, string> {
  return {
    iteration: String(opts.iteration),
    epic: scopeEpic(opts.scope ?? { kind: "goal" }) ?? "",
    epic_scoped: scopeEpic(opts.scope ?? { kind: "goal" }) ? "true" : "false",
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plans: input.planList,
    plan_diff: input.planDiff ?? "none",
    tasks_dir: runtime.store.tasks.dir,
    existing_tasks: existingTasks(opts.state, input.tasks),
    repair: input.repair,
    steers: input.steers,
    holds_dir: holdsDir(runtime.store),
    stalls: input.stalls,
    plan_checks: input.planChecks,
    concerns: input.concerns,
  };
}

/** The plan diff since the last derived plan, or `none` on the first derive. */
export function planDiffPrompt(
  plansBefore: readonly PlanSnapshot[],
  previous: readonly PlanDocument[] | null,
): string {
  const current = plansBefore
    .filter((before) => before.exists)
    .map((before) => ({ rel: before.plan.rel, text: before.text }));
  return formatPlanDiff(current, previous);
}

function existingTaskLine(state: State, task: TaskFile): string {
  const status = state.tasks[task.slug]?.status ?? "new";
  const deps = task.deps.join(",") || "none";
  return `- ${task.slug} | ${status} | ${materialHash(task).slice(0, 10)} | deps: ${deps}${readOnlyMarker(status)}${provenanceNote(task.source)}`;
}

function provenanceNote(source: string): string {
  const steer = steerProvenance(source);
  if (steer) return ` | steer ${steer} (not in the plan; leave it)`;
  const stall = stallProvenance(source);
  if (stall) return ` | stall ${stall} (not in the plan; leave it)`;
  const check = planCheckProvenance(source);
  return check ? ` | plan-check ${check} (not in the plan; leave it)` : "";
}

export function pmLadderNote(
  prompts: PromptLibrary,
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(prompts, "plan", rung, target, failure);
}

function ladderNote(
  prompts: PromptLibrary,
  mode: "plan" | "steer" | "stall" | "concerns" | "plan-check",
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return prompts
    .render("pm-ladder", {
      mode,
      escalated: rung.mandate.startsWith("escalated") ? "true" : "",
      retry: rung.mandate.endsWith("retry") ? "true" : "",
      alias: target.alias,
      model: target.model.id,
      findings: failure.map((reason) => `- ${reason}`).join("\n"),
    })
    .trim();
}

export function steerLadderNote(
  prompts: PromptLibrary,
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(prompts, "steer", rung, target, failure);
}

/**
 * The message injected into a PM steer turn when a new steer arrives: the
 * running turn takes it into the same `steerRoutes`, so one turn answers both
 * and no second PM starts. The contract is restated because the steer was not
 * in the turn's opening prompt.
 */
export function steerInjectionNote(
  prompts: PromptLibrary,
  steer: Steer,
): string {
  return prompts
    .render("pm-steer-inject", {
      steer: formatSteerTurn([steer]),
    })
    .trim();
}

/**
 * One stall entry per parked slug: the cause, this iteration's record paths,
 * the kept branch, spent turns and the done-when the continuation keeps.
 * The integration head lets the PM check a base for conflicts before choosing.
 */
export async function stallBrief(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; slugs: string[] },
): Promise<string> {
  const facts = await briefFacts(runtime, opts.iteration);
  const lines: string[] = [];
  for (const slug of [...opts.slugs].sort()) {
    lines.push(`- ${slug}`, ...slugFactLines(runtime, facts, opts, slug));
  }
  lines.push(`integration head: ${facts.head}`);
  return lines.join("\n");
}

/**
 * The open concerns a wave-end turn marks, one per identity: the id names the
 * hold file, and the rest is what the PM judges. `none` when no concern waits
 * for a mark.
 */
export function openConcernBrief(
  concerns: readonly ForwardedConcern[],
): string {
  if (concerns.length === 0) return "none";
  return concerns
    .map(
      (concern) =>
        `- ${concern.id} [${concern.kind}/${concern.calibration}]: ${concern.text}${
          concern.evidence ? ` (${concern.evidence})` : ""
        }\n  raised by ${concern.source}`,
    )
    .join("\n");
}

/** Everything a per-slug brief entry needs, read once per PM turn. */
interface BriefFacts {
  records: StepRecord[];
  bySlug: Map<string, TaskFile>;
  head: string;
  /** Amends already spent this iteration, per slug. */
  amends: Map<string, number>;
}

async function briefFacts(
  runtime: KernelRuntime,
  iteration: number,
): Promise<BriefFacts> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  const head = await integrationHead(runtime);
  return {
    records,
    bySlug,
    head,
    amends: amendsUsed(records, iteration),
  };
}

/**
 * The indented fact lines under one `- slug` brief entry: the cause, this
 * iteration's record paths, the kept branch, spent turns, the amend budget,
 * the cause's default action and the done-when. Shared by the stall and
 * plan-check briefs.
 */
function slugFactLines(
  runtime: KernelRuntime,
  facts: BriefFacts,
  opts: { iteration: number; state: State },
  slug: string,
): string[] {
  const parked = opts.state.tasks[slug];
  const cause: Cause =
    parked?.cause ?? makeCause("unknown", "no recorded cause");
  const paths = facts.records
    .filter(
      (record) =>
        record.slug === slug &&
        record.iteration === opts.iteration &&
        record.endedAt,
    )
    .sort((a, b) => a.seq - b.seq)
    .map((record) => runtime.store.records.dir(record));
  const used = facts.amends.get(slug) ?? 0;
  const bound = runtime.limits.parkAmends ?? DEFAULT_PARK_AMENDS;
  return [
    `  cause: ${formatCause(cause)}`,
    `  records: ${paths.length > 0 ? paths.join(", ") : "none"}`,
    `  branch: ${taskBranchName(runtime, slug)}`,
    `  turns: ${parked?.turns ?? 0} spent`,
    `  amends: ${used} of ${bound} this iteration${used >= bound ? " (amend refused; replace, split, cancel or leave)" : ""}`,
    `  default: ${formatParkDefault(cause, runtime.configs.repo.parkRoutes)}`,
    `  done-when: ${doneWhen(facts.bySlug.get(slug)?.body ?? "") || "(none)"}`,
  ];
}

export function stallLadderNote(
  prompts: PromptLibrary,
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(prompts, "stall", rung, target, failure);
}

export function concernsLadderNote(
  prompts: PromptLibrary,
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(prompts, "concerns", rung, target, failure);
}
/**
 * One brief entry per checker follow-up: its kind, slug, dead dep and reason,
 * plus the slug's facts when the task file exists (cause, record paths, kept
 * branch, spent turns, done-when). The integration head lets the PM check a
 * base for conflicts before choosing.
 */
export async function planCheckPmBrief(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; followUps: PlanCheckFollowUp[] },
): Promise<string> {
  const facts = await briefFacts(runtime, opts.iteration);
  const lines: string[] = [];
  for (const followUp of [...opts.followUps].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    const dep = followUp.dep ? `, dep ${followUp.dep}` : "";
    lines.push(
      `- ${followUp.slug} (${followUp.kind}${dep}): ${followUp.reason}`,
    );
    if (facts.bySlug.has(followUp.slug)) {
      lines.push(...slugFactLines(runtime, facts, opts, followUp.slug));
    }
  }
  lines.push(`integration head: ${facts.head}`);
  return lines.join("\n");
}

export function planCheckLadderNote(
  prompts: PromptLibrary,
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(prompts, "plan-check", rung, target, failure);
}
