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
import { isFrozenStatus, type PlanSnapshot } from "./reconcile.js";
import { scopeEpic } from "./scope.js";
import type { PmMandate, PmScope } from "./types.js";
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
export interface PmPromptInput {
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
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(
    rung,
    target,
    failure,
    `derive the task files from the plan again, and if the plan itself cannot be turned into tasks, answer "blocked" with one question for the architect in the summary.`,
    "Restated PM contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Write task files under the tasks directory, then the outcome.",
  );
}

function ladderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
  escalation: string,
  contract: string,
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: ${escalation}`,
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`,
    );
  }
  notes.push(contract);
  if (failure.length > 0)
    notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
  return notes.join("\n");
}

export function steerLadderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(
    rung,
    target,
    failure,
    "route the steers again from their text, and if a steer cannot be routed, send it to the architect with an empty hold.",
    "Restated PM steer contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route each pending steer as task|spike|intent|architect|stall (or {architect: id}), write one hold file per steer, write task files only for task and spike steers with source steer: <id>, then the outcome with steerRoutes.",
  );
}

/**
 * The message injected into a PM steer turn when a new steer arrives: the
 * running turn takes it into the same `steerRoutes`, so one turn answers both
 * and no second PM starts. The contract is restated because the steer was not
 * in the turn's opening prompt.
 */
export function steerInjectionNote(steer: Steer): string {
  return [
    "A steer arrived while this turn was running. Route it in this turn's steerRoutes as well (task|spike|intent|architect|stall, answer only a task route), then rewrite the outcome so it carries the route:",
    formatSteerTurn([steer]),
  ].join("\n");
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
    `  default: ${formatParkDefault(cause)}`,
    `  done-when: ${doneWhen(facts.bySlug.get(slug)?.body ?? "") || "(none)"}`,
  ];
}

export function stallLadderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(
    rung,
    target,
    failure,
    "route the stalled slugs again from their records, and if a slug cannot continue, leave it parked with a reason for the architect.",
    "Restated PM stall contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route every parked slug in stallRoutes, then write the outcome: `amend` rewrites the slug's own file and bumps `revision` by one (refused past the brief's `amends:` limit), `cancel` writes no task file, `replace` writes one task with a new slug, `base:` naming the parked slug and the same done-when, `split` writes one task per separable outcome, `leave` writes nothing.",
  );
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
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  return ladderNote(
    rung,
    target,
    failure,
    "route the checker's follow-ups again from their brief, and if a slug cannot continue, leave it with a reason for the architect.",
    "Restated PM plan-check contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route every follow-up in planCheckRoutes, then write the outcome: `continue` carries the checker's kind — `amend` rewrites the slug's own file and bumps `revision` by one (refused past the brief's `amends:` limit), `cancel` writes no task file, `replace` writes one task with a new slug, `base:` naming the parked slug and the same done-when, `split` writes one task per separable outcome, a dead dep is written as the dep task or dropped from the slug's list, `unmerged` work continues its branch; `leave` writes nothing.",
  );
}
