import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { writeTextAtomic } from "../core/records/io.js";
import type { Stop } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { boundaryTarget, type TurnTarget } from "./flow-context.js";
import {
  expireHold,
  formatSteerTurn,
  holdsDir,
  markProcessed,
  planCheckProvenance,
  type Steer,
  stallProvenance,
  steerProvenance,
  writeOutbox,
} from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { appendCancel, scriptMeta } from "./record.js";
import {
  doneWhen,
  materialHash,
  parseTaskFile,
  TaskFileError,
  validateTaskGraph,
} from "./tasks.js";
import type {
  AliasConfig,
  KernelRuntime,
  Outcome,
  PlanCheckFollowUp,
  PlanCheckRouteEntry,
  StallDecision,
  StallRouteEntry,
  State,
  SteerRoute,
  StepRecord,
  TaskFile,
  TaskStatus,
  TaskTypeDefinition,
} from "./types.js";
import { integrationHead, taskBranchName } from "./worktree.js";

function taskPath(runtime: KernelRuntime, slug: string): string {
  return path.join(runtime.store.tasksDir, `${slug}.md`);
}

async function readTaskTexts(
  runtime: KernelRuntime,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const name of await runtime.store.listDir("tasks")) {
    if (!name.endsWith(".md")) continue;
    const text = await runtime.store.readFile(`tasks/${name}`);
    if (text !== null) out.set(name.slice(0, -".md".length), text);
  }
  return out;
}

/** The plan and every task file as they stood before a turn. */
export interface TurnSnapshot {
  planPath: string;
  plan: string;
  /** An absent plan is restored by deleting the file, not by emptying it. */
  planExists: boolean;
  tasks: Map<string, string>;
}

export async function snapshotTurn(
  runtime: KernelRuntime,
  planPath: string,
): Promise<TurnSnapshot> {
  const planExists = fs.existsSync(planPath);
  return {
    planPath,
    plan: planExists ? fs.readFileSync(planPath, "utf8") : "",
    planExists,
    tasks: await readTaskTexts(runtime),
  };
}

/**
 * Restores the plan and every task file a turn changed or created, byte for
 * byte, and names what it restored. The PM task turn uses it to roll back a
 * failed rung; the steer turn uses it to undo a write that must not happen.
 */
export async function restoreTurn(
  runtime: KernelRuntime,
  snapshot: TurnSnapshot,
): Promise<{ plan: boolean; tasks: string[] }> {
  const planExistsNow = fs.existsSync(snapshot.planPath);
  const planNow = planExistsNow
    ? fs.readFileSync(snapshot.planPath, "utf8")
    : "";
  let planChanged = false;
  if (!snapshot.planExists) {
    // A plan the turn created would send the next front to the boundary; it
    // must be gone, not left behind as an empty file.
    if (planExistsNow) {
      fs.rmSync(snapshot.planPath, { force: true });
      planChanged = true;
    }
  } else if (planNow !== snapshot.plan) {
    await writeTextAtomic(snapshot.planPath, snapshot.plan);
    planChanged = true;
  }

  const texts = await readTaskTexts(runtime);
  const changed = new Set<string>();
  for (const [slug, original] of snapshot.tasks) {
    if (texts.get(slug) !== original) {
      await writeTextAtomic(taskPath(runtime, slug), original);
      changed.add(slug);
    }
  }
  for (const slug of texts.keys()) {
    if (!snapshot.tasks.has(slug)) {
      fs.rmSync(taskPath(runtime, slug), { force: true });
      changed.add(slug);
    }
  }
  return { plan: planChanged, tasks: [...changed].sort() };
}

function parseTasks(
  texts: Map<string, string>,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): {
  tasks: TaskFile[];
  findings: string[];
} {
  const tasks: TaskFile[] = [];
  const findings: string[] = [];
  for (const [slug, text] of [...texts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    try {
      tasks.push(parseTaskFile(text, slug, taskTypes));
    } catch (err) {
      findings.push(
        err instanceof TaskFileError
          ? err.message
          : `task "${slug}" is unreadable`,
      );
    }
  }
  return { tasks, findings };
}

/** The frozen set: reconcile restores these and the PM may not edit them. */
function isFrozenStatus(status: TaskStatus | "new"): boolean {
  return status === "merged" || status === "finished";
}

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
    .map((task) => {
      const status = state.tasks[task.slug]?.status ?? "new";
      const steer = steerProvenance(task.source);
      const stall = steer ? undefined : stallProvenance(task.source);
      const check =
        steer || stall ? undefined : planCheckProvenance(task.source);
      const provenance = steer
        ? ` | steer ${steer} (not in the plan; leave it)`
        : stall
          ? ` | stall ${stall} (not in the plan; leave it)`
          : check
            ? ` | plan-check ${check} (not in the plan; leave it)`
            : "";
      return `- ${task.slug} | ${status} | ${materialHash(task).slice(0, 10)} | deps: ${task.deps.join(",") || "none"}${readOnlyMarker(status)}${provenance}`;
    })
    .join("\n");
}

function frozenSlugs(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => isFrozenStatus(task.status))
    .map(([slug]) => slug)
    .sort();
}

function cancelledSlugs(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => task.status === "cancelled")
    .map(([slug]) => slug)
    .sort();
}

/**
 * The plan's explicit leave decisions: a line `cancelled: <slug> — reason`
 * retires that task. Absence of a bullet says nothing, so no cancellation is
 * ever inferred from the plan mentioning a task less. A line without the em
 * dash and a reason is prose, not a decision.
 */
function planCancellations(plan: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of plan.split("\n")) {
    const match = /^\s*cancelled:\s+(\S+)\s+—\s*(\S.*?)\s*$/u.exec(line);
    if (match) out.set(match[1]!, match[2]!);
  }
  return out;
}

/**
 * Undoes what the PM may not do and reports it: plan edits are restored,
 * merged/finished task files are restored byte for byte. A second failure is
 * handled by the caller as a blocked iteration.
 */
async function reconcile(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; round: number },
  planBefore: string,
  taskSnapshot: Map<string, string>,
): Promise<string[]> {
  const findings: string[] = [];
  const planNow = fs.existsSync(opts.planPath)
    ? fs.readFileSync(opts.planPath, "utf8")
    : "";
  if (planNow !== planBefore) {
    await writeTextAtomic(opts.planPath, planBefore);
    findings.push(
      "plan.md changed during the PM turn; restored: only the architect edits the plan",
    );
  }

  const texts = await readTaskTexts(runtime);
  for (const slug of frozenSlugs(opts.state)) {
    const original = taskSnapshot.get(slug);
    const now = texts.get(slug);
    if (original === undefined) {
      if (now !== undefined) {
        findings.push(
          `frozen task "${slug}" appeared; frozen slugs are immutable`,
        );
      }
      continue;
    }
    if (now !== original) {
      await writeTextAtomic(taskPath(runtime, slug), original);
      findings.push(
        `frozen task "${slug}" was edited; restored: merged work is history, rework needs a new slug`,
      );
    }
  }
  for (const slug of cancelledSlugs(opts.state)) {
    const original = taskSnapshot.get(slug);
    if (original === undefined) continue;
    if (texts.get(slug) !== original) {
      await writeTextAtomic(taskPath(runtime, slug), original);
      findings.push(
        `cancelled task "${slug}" was edited; restored: a spent slug cannot be reused`,
      );
    }
  }
  for (const [slug, original] of taskSnapshot) {
    if (texts.has(slug)) continue;
    if (frozenSlugs(opts.state).includes(slug)) continue;
    if (cancelledSlugs(opts.state).includes(slug)) continue;
    let source = "";
    try {
      source = parseTaskFile(
        original,
        slug,
        runtime.configs.process.taskTypes,
      ).source;
    } catch {
      continue;
    }
    const steer = steerProvenance(source);
    const stall = steer ? undefined : stallProvenance(source);
    const check = steer || stall ? undefined : planCheckProvenance(source);
    await writeTextAtomic(taskPath(runtime, slug), original);
    findings.push(
      steer
        ? `steer task "${slug}" was deleted; restored: a task with provenance steer ${steer} is not in the plan and the PM must leave it`
        : stall
          ? `stall task "${slug}" was deleted; restored: a task with provenance stall ${stall} is not in the plan and the PM must leave it`
          : check
            ? `plan-check task "${slug}" was deleted; restored: a task with provenance plan-check ${check} is not in the plan and the PM must leave it`
            : `task "${slug}" was deleted; restored: a task leaves only through the plan's cancelled line or a PM decision`,
    );
  }

  if (findings.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-reconcile", { round: opts.round }),
      { ok: false, cause: findings.join("; ") },
    );
  }
  return findings;
}

async function validate(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; round: number },
  planBefore: string,
  taskSnapshot: Map<string, string>,
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, planBefore, taskSnapshot);
  const { tasks, findings: parseFindings } = parseTasks(
    await readTaskTexts(runtime),
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  const parked = new Set(
    Object.keys(opts.state.tasks).filter(
      (slug) => opts.state.tasks[slug]!.status === "parked",
    ),
  );
  findings.push(...validateTaskGraph(tasks, { parked }));
  return [...new Set(findings)];
}

/**
 * Applies the plan's explicit cancellations. A task whose bullet disappears
 * stays open: only the architect's `cancelled:` line or a PM leave decision
 * retires it, so dropping a bullet never silently strands a branch or spends a
 * slug. A merged or finished task is history and a cancelled slug is spent, so
 * neither is touched again.
 */
async function cancelPlanNamed(
  runtime: KernelRuntime,
  state: State,
  plan: string,
  iteration: number,
): Promise<void> {
  for (const [slug, reason] of planCancellations(plan)) {
    const task = state.tasks[slug];
    if (
      task === undefined ||
      task.status === "cancelled" ||
      isFrozenStatus(task.status)
    )
      continue;
    await appendCancel(
      runtime.store,
      { iteration, slug, round: task.round },
      reason,
    );
  }
}

export type PmMandate =
  | "first"
  | "retry"
  | "escalated-first"
  | "escalated-retry";

/** One attempted PM turn; the round is its 1-based position in the ladder. */
export interface PmRung {
  round: number;
  alias: string;
  model: string;
  failure: string;
}

/** A rung ended on infrastructure trouble the alias's own fallbacks could not cure. */
export type PmInfraStop = Extract<Stop, { kind: "infra" }>;

export type PmRun =
  | { status: "done"; outcome: Outcome; rungs: PmRung[] }
  /** An escalated rung stopped the ladder with a question for the architect. */
  | { status: "asked"; outcome: Outcome; rungs: PmRung[] }
  /** A rung ended on an infra stop; a stronger model would not cure it, so the ladder stops. */
  | { status: "infra"; stop: PmInfraStop; rungs: PmRung[] }
  /** Every tier failed both of its turns. */
  | { status: "exhausted"; rungs: PmRung[] };

interface RungStep {
  alias: string;
  mandate: PmMandate;
}

/**
 * The ladder is the alias chain from the PM alias through `escalateTo`, two
 * turns per tier: the first and one de-novo retry. The chain is built once; a
 * cycle is a config error pre-flight rejects.
 */
function rungSteps(runtime: KernelRuntime): RungStep[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let name: string | undefined = boundaryTarget(runtime, "pm").alias;
  while (name) {
    if (seen.has(name)) {
      throw new Error(`PM escalation cycle: ${[...seen, name].join(" -> ")}`);
    }
    seen.add(name);
    const alias: AliasConfig | undefined = runtime.configs.run.aliases[name];
    if (!alias)
      throw new Error(
        `run config has no alias "${name}" (needed by role "pm")`,
      );
    chain.push(name);
    name = alias.escalateTo;
  }
  return chain.flatMap((alias, tier) => {
    const escalated = tier > 0;
    return [
      { alias, mandate: escalated ? "escalated-first" : "first" },
      { alias, mandate: escalated ? "escalated-retry" : "retry" },
    ];
  });
}

function stopText(stop: StepRecord["stop"]): string {
  if (!stop) return "no stop";
  return "cause" in stop ? `${stop.kind}: ${stop.cause}` : stop.kind;
}

/** Why a rung is not usable: its outcome status, concerns, findings or stop. */
function failureReasons(
  outcome: Outcome | undefined,
  findings: string[],
  record: StepRecord,
): string[] {
  const reasons: string[] = [];
  if (outcome && outcome.status !== "done") {
    reasons.push(`status ${outcome.status}: ${outcome.summary}`);
    for (const concern of outcome.concerns) {
      reasons.push(`${concern.kind}/${concern.calibration}: ${concern.text}`);
    }
  }
  reasons.push(...findings);
  if (!outcome) reasons.push(`no outcome (${stopText(record.stop)})`);
  return reasons;
}

function ladderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: derive the task files from the plan again, and if the plan itself cannot be turned into tasks, answer "blocked" with one question for the architect in the summary.`,
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`,
    );
  }
  notes.push(
    "Restated PM contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Write task files under the tasks directory, then the outcome.",
  );
  if (failure.length > 0)
    notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
  return notes.join("\n");
}

/**
 * PM ladder: each tier gets its first turn and one de-novo retry; a failed rung
 * is rolled back before the next. The next alias in the chain escalates with a
 * broader mandate; an infra stop ends the ladder because a stronger model does
 * not cure quota or crash trouble the fallbacks already absorbed. Only an
 * escalated `blocked` stops with a question, and an exhausted ladder reports
 * every rung as alias, model and failure.
 */
export async function runPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; cwd: string },
): Promise<PmRun> {
  const snapshot = await snapshotTurn(runtime, opts.planPath);
  const planBefore = snapshot.plan;
  const taskSnapshot = snapshot.tasks;
  const rungs: PmRung[] = [];
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(
      await readTaskTexts(runtime),
      runtime.configs.process.taskTypes,
    );
    const result = await runAgentTurn(runtime, {
      target,
      cwd: opts.cwd,
      meta: { iteration: opts.iteration, step: "pm", round },
      vars: {
        iteration: String(opts.iteration),
        intent_path: `${runtime.store.goalDir}/intent.md`,
        plan_path: opts.planPath,
        tasks_dir: runtime.store.tasksDir,
        existing_tasks: existingTasks(opts.state, tasks),
        repair: round === 1 ? "" : ladderNote(rung, target, failure),
        steers: "none",
        holds_dir: holdsDir(runtime.store),
        stalls: "none",
        plan_checks: "none",
      },
      expectation: KERNEL_TURN_STEPS.pm,
    });
    const findings = await validate(
      runtime,
      { ...opts, round },
      planBefore,
      taskSnapshot,
    );
    const outcome = result.outcome;
    const stop = result.record.stop;

    if (outcome?.status === "done" && findings.length === 0) {
      await cancelPlanNamed(runtime, opts.state, planBefore, opts.iteration);
      return { status: "done", outcome, rungs };
    }

    const reasons = failureReasons(outcome, findings, result.record);
    const failureText = reasons.join("; ");
    rungs.push({
      round,
      alias: target.alias,
      model: target.model.id,
      failure: failureText,
    });
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-validate", { round }),
      {
        ok: false,
        cause: failureText,
      },
    );
    await restoreTurn(runtime, snapshot);

    // Refusal and missing or invalid outcomes climb; an infra stop does not,
    // because the alias's tiers already absorbed the infrastructure trouble.
    if (stop?.kind === "infra") {
      return { status: "infra", stop, rungs };
    }
    if (outcome?.status === "blocked" && rung.mandate.startsWith("escalated")) {
      return { status: "asked", outcome, rungs };
    }
    failure = reasons;
  }

  return { status: "exhausted", rungs };
}

function steerLadderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: route the steers again from their text, and if a steer cannot be routed, send it to the architect with an empty hold.`,
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`,
    );
  }
  notes.push(
    "Restated PM steer contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route each pending steer as task|spike|architect|stall, write one hold file per steer, write task files only for task and spike steers with source steer: <id>, then the outcome with steerRoutes.",
  );
  if (failure.length > 0)
    notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
  return notes.join("\n");
}

type ParsedHold =
  | { status: "missing" }
  | { status: "bad"; message: string }
  | { status: "ok"; slugs: unknown; goal: unknown };

function parseHoldFile(runtime: KernelRuntime, steerId: string): ParsedHold {
  const dir = holdsDir(runtime.store);
  const candidates = [`${steerId}.yaml`, `${steerId}.yml`].map((name) =>
    path.join(dir, name),
  );
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = yaml.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { status: "bad", message: (err as Error).message };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { status: "bad", message: "hold is not a mapping" };
  }
  const { slugs, goal } = parsed as { slugs?: unknown; goal?: unknown };
  return { status: "ok", slugs, goal };
}

function stallHoldProblem(
  runtime: KernelRuntime,
  steerId: string,
): string | undefined {
  const hold = parseHoldFile(runtime, steerId);
  if (hold.status === "missing") {
    return `stall steer "${steerId}" has no hold file; a stall drains the goal with goal: true`;
  }
  if (hold.status === "bad") {
    return `stall steer "${steerId}" hold is not valid YAML: ${hold.message}`;
  }
  if (hold.goal !== true) {
    return `stall steer "${steerId}" hold has no goal: true; a stall drains the goal`;
  }
  return undefined;
}

function architectHoldProblem(
  runtime: KernelRuntime,
  steerId: string,
): string | undefined {
  const hold = parseHoldFile(runtime, steerId);
  if (hold.status === "missing") return undefined;
  if (hold.status === "bad") {
    return `architect steer "${steerId}" hold is not valid YAML: ${hold.message}`;
  }
  if (
    !Array.isArray(hold.slugs) ||
    !hold.slugs.every((slug) => typeof slug === "string")
  ) {
    return `architect steer "${steerId}" hold slugs must be a list of task slugs; an architect steer that voids nothing holds nothing with slugs: []`;
  }
  if (hold.goal !== false) {
    return `architect steer "${steerId}" hold has no goal: false; goal: true stays reserved for stall`;
  }
  return undefined;
}

async function validateSteerTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    planPath: string;
    round: number;
    claim: Steer[];
  },
  planBefore: string,
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, planBefore, taskSnapshot);
  const texts = await readTaskTexts(runtime);
  const { tasks, findings: parseFindings } = parseTasks(
    texts,
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  const parked = new Set(
    Object.keys(opts.state.tasks).filter(
      (slug) => opts.state.tasks[slug]!.status === "parked",
    ),
  );
  findings.push(...validateTaskGraph(tasks, { parked }));

  const routes = outcome?.steerRoutes ?? [];
  const claimed = new Set(opts.claim.map((steer) => steer.id));
  const seen = new Set<string>();
  const routeOf = new Map<string, SteerRoute>();
  for (const entry of routes) {
    if (seen.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" is routed twice; route each claimed steer once`,
      );
      continue;
    }
    seen.add(entry.steer);
    routeOf.set(entry.steer, entry.route);
    if (!claimed.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" was not claimed this turn; route only the pending steers from this turn`,
      );
    }
  }
  for (const steer of opts.claim) {
    if (!seen.has(steer.id)) {
      findings.push(
        `steer "${steer.id}" has no route; route each claimed steer as task|spike|architect|stall`,
      );
    }
  }
  for (const entry of routes) {
    if (!claimed.has(entry.steer)) continue;
    const answer = entry.answer?.trim() ?? "";
    if (entry.route === "task") {
      if (!answer) {
        findings.push(
          `steer "${entry.steer}" routed task needs an answer; the PM answers a task steer in the outbox now`,
        );
      }
    } else if (answer) {
      findings.push(
        `steer "${entry.steer}" routed ${entry.route} must not carry an answer; only task answers now`,
      );
    }
    if (entry.route === "stall") {
      const problem = stallHoldProblem(runtime, entry.steer);
      if (problem) findings.push(problem);
    }
    if (entry.route === "architect") {
      const problem = architectHoldProblem(runtime, entry.steer);
      if (problem) findings.push(problem);
    }
  }

  if (parseFindings.length === 0) {
    const changed = [...taskSnapshot]
      .filter(
        ([slug, original]) => texts.has(slug) && texts.get(slug) !== original,
      )
      .map(([slug]) => slug);
    const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
    const bySlug = new Map(tasks.map((task) => [task.slug, task]));
    for (const slug of created) {
      const task = bySlug.get(slug);
      if (!task) continue;
      const provenance = steerProvenance(task.source);
      if (!provenance) {
        findings.push(
          `new task "${slug}" has no provenance steer: <id>; a steer creates tasks only with source steer: <claimed>`,
        );
        continue;
      }
      if (!claimed.has(provenance)) {
        findings.push(
          `new task "${slug}" names unknown steer "${provenance}"; provenance must be a claimed steer`,
        );
        continue;
      }
      const route = routeOf.get(provenance);
      if (route !== "task" && route !== "spike") {
        findings.push(
          `new task "${slug}" names steer "${provenance}" routed ${route}; only task and spike steers create tasks`,
        );
      }
    }
    const createdProvenance = new Set(
      created
        .map((slug) => bySlug.get(slug))
        .filter((task): task is TaskFile => task !== undefined)
        .map((task) => steerProvenance(task.source))
        .filter((id): id is string => id !== undefined),
    );
    for (const entry of routes) {
      if (!claimed.has(entry.steer) || entry.route !== "spike") continue;
      if (!createdProvenance.has(entry.steer)) {
        findings.push(
          `spike steer "${entry.steer}" created no task; a spike writes one standalone task with source steer: ${entry.steer}`,
        );
      }
    }
    const hasTask = routes.some(
      (entry) => claimed.has(entry.steer) && entry.route === "task",
    );
    const hasSpike = routes.some(
      (entry) => claimed.has(entry.steer) && entry.route === "spike",
    );
    if (hasTask) {
      const taskProvenance = new Set(
        routes
          .filter((entry) => claimed.has(entry.steer) && entry.route === "task")
          .map((entry) => entry.steer),
      );
      const rework = [...createdProvenance].some((id) =>
        taskProvenance.has(id),
      );
      if (changed.length === 0 && !rework) {
        findings.push(
          "task steers changed no task file; amend the pending task or write a rework task with source steer: <id>",
        );
      }
    }
    if (!hasTask && !hasSpike && (changed.length > 0 || created.length > 0)) {
      findings.push(
        "task files changed but no steer routed to task or spike; architect and stall steers write no task file",
      );
    }
  }
  return [...new Set(findings)];
}

function ensureSteerHold(
  runtime: KernelRuntime,
  steerId: string,
  route: SteerRoute,
): void {
  const dir = holdsDir(runtime.store);
  const candidates = [`${steerId}.yaml`, `${steerId}.yml`].map((name) =>
    path.join(dir, name),
  );
  if (candidates.some((candidate) => fs.existsSync(candidate))) return;
  fs.mkdirSync(dir, { recursive: true });
  const goal = route === "stall";
  fs.writeFileSync(
    path.join(dir, `${steerId}.yaml`),
    `slugs: []\ngoal: ${goal}\n`,
    "utf8",
  );
}

/**
 * PM ladder for steers dropped mid-iteration. Each claimed steer gets one
 * route: `task` amends a pending task or writes a rework task and is answered
 * in the outbox now; `spike` writes a standalone task whose landed outcome is
 * answered later; `architect` waits for the next boundary with its hold;
 * `stall` drains the goal with `goal: true` and waits for the architect. The
 * record uses the PM step, so it stays out of the item's turn count and prices
 * into the iteration's spend like every other PM turn.
 *
 * Accepted routes commit to a `steer-routes` script record; a failed rung's
 * routes die with its rollback, so the boundary never reads them. A legacy
 * turn with no `steerRoutes` keeps the old contract: any task-file or plan
 * write is restored and the steer reaches the architect. A routed turn that
 * exhausts the ladder or stops on infra falls back the same way: the writes
 * are rolled back and the steer still reaches the architect, so a steer turn
 * never blocks dispatch.
 */
export async function runSteerPm(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    tasks: TaskFile[];
    steers: Steer[];
    cwd: string;
  },
): Promise<void> {
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  const planBefore = snapshot.plan;
  const taskSnapshot = snapshot.tasks;
  const claim = new Map(opts.steers.map((steer) => [steer.id, steer]));
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(
      await readTaskTexts(runtime),
      runtime.configs.process.taskTypes,
    );
    const result = await runAgentTurn(runtime, {
      target,
      cwd: opts.cwd,
      meta: { iteration: opts.iteration, step: "pm", round },
      vars: {
        iteration: String(opts.iteration),
        intent_path: path.join(runtime.store.goalDir, "intent.md"),
        plan_path: planPath,
        tasks_dir: runtime.store.tasksDir,
        existing_tasks: existingTasks(opts.state, tasks),
        repair: round === 1 ? "" : steerLadderNote(rung, target, failure),
        steers: formatSteerTurn(opts.steers),
        holds_dir: holdsDir(runtime.store),
        stalls: "none",
        plan_checks: "none",
      },
      expectation: KERNEL_TURN_STEPS.pm,
    });
    const outcome = result.outcome;
    if (outcome?.steerRoutes === undefined) {
      const restored = await restoreTurn(runtime, snapshot);
      const files = [
        ...(restored.plan ? ["plan.md"] : []),
        ...restored.tasks.map((slug) => `tasks/${slug}.md`),
      ];
      if (files.length > 0) {
        await runtime.store.appendRecord(
          scriptMeta(opts.iteration, "steer-reconcile"),
          {
            ok: false,
            cause: `steer turn changed ${files.join(", ")}; restored: a steer structures holds and writes no task file or plan`,
          },
        );
      }
      return;
    }

    const findings = await validateSteerTurn(
      runtime,
      {
        iteration: opts.iteration,
        state: opts.state,
        planPath,
        round,
        claim: opts.steers,
      },
      planBefore,
      taskSnapshot,
      outcome,
    );
    if (outcome?.status === "done" && findings.length === 0) {
      const accepted = [...(outcome.steerRoutes ?? [])].sort((a, b) =>
        a.steer.localeCompare(b.steer),
      );
      // The boundary reads routes from this record only, never from the agent
      // rung outcomes: a failed rung's routes die with its rollback.
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, "steer-routes", { round }),
        {
          ok: true,
          outcome: {
            status: "done",
            summary: `steer routes: ${accepted.map((entry) => `${entry.steer}=${entry.route}`).join(", ")}`,
            concerns: [],
            forward: [],
            steerRoutes: accepted,
          },
        },
      );
      for (const entry of outcome.steerRoutes ?? []) {
        const steer = claim.get(entry.steer);
        if (!steer) continue;
        if (entry.route === "task") {
          const answer = entry.answer?.trim() ?? "";
          await writeOutbox(
            runtime.store,
            steer.id,
            `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
          );
          await markProcessed(runtime.store, steer);
          await expireHold(runtime.store, steer.id);
        } else {
          ensureSteerHold(runtime, steer.id, entry.route);
        }
      }
      return;
    }

    const reasons = failureReasons(outcome, findings, result.record);
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-validate", { round }),
      { ok: false, cause: reasons.join("; ") },
    );
    await restoreTurn(runtime, snapshot);
    if (result.record.stop?.kind === "infra") return;
    failure = reasons;
  }
}

/** Script step committing a stall turn's routes; its presence marks the iteration's one stall turn spent. */
export const STALL_ROUTES_STEP = "stall-routes";

/**
 * Which parked slugs a stall turn resumed (amend, replace, split); a leave
 * stays parked with its reason and a cancel spends the slug.
 */
export interface StallResult {
  continued: string[];
  left: string[];
}
/**
 * One stall entry per parked slug: the cause, this iteration's record paths,
 * the kept branch, spent turns and the done-when the continuation keeps.
 * The integration head lets the PM check a base for conflicts before choosing.
 */
async function stallBrief(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; slugs: string[] },
): Promise<string> {
  const facts = await briefFacts(runtime);
  const lines: string[] = [];
  for (const slug of [...opts.slugs].sort()) {
    lines.push(`- ${slug}`, ...slugFactLines(runtime, facts, opts, slug));
  }
  lines.push(`integration head: ${facts.head}`);
  return lines.join("\n");
}

/** Everything a per-slug brief entry needs, read once per PM turn. */
interface BriefFacts {
  records: StepRecord[];
  bySlug: Map<string, TaskFile>;
  dirs: Map<number, string>;
  head: string;
}

async function briefFacts(runtime: KernelRuntime): Promise<BriefFacts> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  const dirs = new Map<number, string>();
  for (const name of await runtime.store.listDir("records")) {
    const match = /^(\d+)-/.exec(name);
    if (match) dirs.set(Number(match[1]), name);
  }
  const head = await integrationHead(runtime);
  return { records, bySlug, dirs, head };
}

/**
 * The indented fact lines under one `- slug` brief entry: the cause, this
 * iteration's record paths, the kept branch, spent turns and the
 * done-when. Shared by the stall and plan-check briefs.
 */
function slugFactLines(
  runtime: KernelRuntime,
  facts: BriefFacts,
  opts: { iteration: number; state: State },
  slug: string,
): string[] {
  const parked = opts.state.tasks[slug];
  const paths = facts.records
    .filter(
      (record) =>
        record.slug === slug &&
        record.iteration === opts.iteration &&
        record.endedAt,
    )
    .sort((a, b) => a.seq - b.seq)
    .map((record) => facts.dirs.get(record.seq))
    .filter((dir): dir is string => dir !== undefined)
    .map((dir) => path.join(runtime.store.recordsDir, dir));
  return [
    `  cause: ${parked?.cause ?? "no recorded cause"}`,
    `  records: ${paths.length > 0 ? paths.join(", ") : "none"}`,
    `  branch: ${taskBranchName(runtime, slug)}`,
    `  turns: ${parked?.turns ?? 0} spent`,
    `  done-when: ${doneWhen(facts.bySlug.get(slug)?.body ?? "") || "(none)"}`,
  ];
}

function stallLadderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: route the stalled slugs again from their records, and if a slug cannot continue, leave it parked with a reason for the architect.`,
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`,
    );
  }
  notes.push(
    "Restated PM stall contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route every parked slug in stallRoutes, then write the outcome: `amend` rewrites the slug's own file and bumps `revision` by one, `cancel` writes no task file, `replace` writes one task with a new slug, `base:` naming the parked slug and the same done-when, `split` writes one task per separable outcome, `leave` writes nothing.",
  );
  if (failure.length > 0)
    notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
  return notes.join("\n");
}

/**
 * How the checker's follow-up kind maps onto the decider's vocabulary: an
 * unmerged park still continues as a task, and a dead dep is the mechanical
 * fix a replace carries.
 */
function planCheckDecision(kind: PlanCheckFollowUp["kind"]): StallDecision {
  return kind === "missing-dep" || kind === "unmerged" ? "replace" : kind;
}

/** The revision a task file declares, or undefined when it does not parse. */
function declaredRevision(
  text: string | undefined,
  slug: string,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): number | undefined {
  if (text === undefined) return undefined;
  try {
    return parseTaskFile(text, slug, taskTypes).revision;
  } catch {
    return undefined;
  }
}

/**
 * One PM turn's decisions over its slugs, checked against the task files the
 * turn left. `amend` edits the slug's own file and bumps its revision;
 * `cancel` and `leave` write nothing; `replace` writes exactly one task that
 * continues the kept branch (or, when that branch conflicts with the head, a
 * fresh task keeping the same done-when); `split` writes at least two, each
 * naming the slug as its base. The kernel owns the consequences the files
 * cannot carry: the cancel record, and derive's cut at the park a revision
 * amended past.
 */
function decisionFindings(input: {
  turn: "stall" | "plan-check";
  slugs: string[];
  decisionOf: ReadonlyMap<string, StallDecision>;
  state: State;
  before: ReadonlyMap<string, string>;
  texts: ReadonlyMap<string, string>;
  bySlug: ReadonlyMap<string, TaskFile>;
  taskTypes: Record<string, TaskTypeDefinition> | undefined;
  created: readonly TaskFile[];
  /**
   * Claims a mechanical fix already made, by slug: a dead-dep drop on the
   * blocked task, or the new task that carries the dead dep's name.
   */
  credits: ReadonlyMap<string, readonly string[]>;
  /** Slugs whose file edit a credit owns: the dead-dep drop. */
  fixed: ReadonlySet<string>;
}): string[] {
  const { turn, slugs, decisionOf, bySlug, created, credits, fixed } = input;
  const findings: string[] = [];
  for (const slug of slugs) {
    const decision = decisionOf.get(slug);
    if (decision !== "amend" && decision !== "cancel") continue;
    const status = input.state.tasks[slug]?.status;
    if (status === "merged" || status === "finished" || status === "cancelled")
      findings.push(
        `slug "${slug}" is ${status}; ${decision} is refused: merged or finished work is history and a cancelled slug is spent`,
      );
  }
  for (const [slug, original] of input.before) {
    if (input.texts.get(slug) === original) continue;
    if (fixed.has(slug)) continue;
    const decision = decisionOf.get(slug);
    if (decision === undefined) {
      findings.push(
        `task "${slug}" was edited; a ${turn} turn never edits a slug it does not amend`,
      );
      continue;
    }
    if (decision !== "amend") {
      findings.push(
        `task "${slug}" was edited; a ${turn} turn never edits a slug it does not amend, and ${decision} keeps this file as it was`,
      );
      continue;
    }
    const was = declaredRevision(original, slug, input.taskTypes);
    const now = bySlug.get(slug)?.revision;
    if (was === undefined || now !== was + 1) {
      findings.push(
        `task "${slug}" is amended; an amend bumps "revision" from ${was ?? "the parked value"} to ${was === undefined ? "the next integer" : was + 1}, not ${now ?? "absent"}`,
      );
    }
  }
  for (const slug of slugs) {
    if (decisionOf.get(slug) !== "amend") continue;
    if (input.texts.get(slug) === input.before.get(slug))
      findings.push(
        `slug "${slug}" is amended but its file is unchanged; write the amended brief and bump "revision"`,
      );
  }
  const claimedBy = new Map<string, string[]>();
  const claim = (slug: string, by: string): void => {
    const list = claimedBy.get(slug) ?? [];
    list.push(by);
    claimedBy.set(slug, list);
  };
  const replaced = slugs.filter((slug) => decisionOf.get(slug) === "replace");
  for (const made of [...created].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    if (made.base !== undefined) {
      const base = made.base;
      const decision = decisionOf.get(base);
      if (!slugs.includes(base)) {
        findings.push(
          `new task "${made.slug}" continues "${base}", which is not in this ${turn}`,
        );
        continue;
      }
      if (decision !== "replace" && decision !== "split") {
        findings.push(
          `new task "${made.slug}" continues "${base}", which was routed ${decision ?? "not at all"}; only replace and split write new tasks`,
        );
        continue;
      }
      const baseTask = bySlug.get(base);
      if (
        decision === "replace" &&
        baseTask &&
        doneWhen(made.body) !== doneWhen(baseTask.body)
      ) {
        findings.push(
          `new task "${made.slug}" changes the done-when; a replace keeps its base's done-when`,
        );
      }
      claim(base, made.slug);
      continue;
    }
    // A fresh (rule-10) task continues a replace park without a base: it
    // matches the parked done-when instead. A split part names its base: the
    // parts divide the done-when, so no fresh task can claim one.
    const candidates = replaced
      .filter((slug) => (claimedBy.get(slug) ?? []).length === 0)
      .filter((slug) => {
        const base = bySlug.get(slug);
        return (
          base !== undefined && doneWhen(made.body) === doneWhen(base.body)
        );
      })
      .sort();
    if (candidates.length === 0) {
      findings.push(
        `new task "${made.slug}" names no base and matches no replace slug's done-when; name the parked slug as base or keep its done-when`,
      );
      continue;
    }
    claim(candidates[0]!, made.slug);
  }
  for (const slug of slugs) {
    const decision = decisionOf.get(slug)!;
    const claims = [
      ...(claimedBy.get(slug) ?? []),
      ...(credits.get(slug) ?? []),
    ];
    const count = claims.length;
    const named = claims.join(", ");
    if (decision === "replace") {
      if (count === 0)
        findings.push(
          `slug "${slug}" is replaced but has no task; write one with base: ${slug}`,
        );
      else if (count > 1)
        findings.push(
          `slug "${slug}" has ${count} tasks (${named}); replace writes exactly one`,
        );
    } else if (decision === "split") {
      if (count < 2)
        findings.push(
          `slug "${slug}" is split into ${count === 0 ? "nothing" : `${count} task`}; split writes at least two, each with base: ${slug}`,
        );
    } else if (decision === "cancel" || decision === "leave") {
      if (count > 0)
        findings.push(
          `slug "${slug}" was ${decision === "cancel" ? "cancelled" : "left"} but gained ${named}; ${decision} writes no task`,
        );
    }
  }
  return findings;
}

async function validateStallTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    planPath: string;
    round: number;
    slugs: string[];
  },
  planBefore: string,
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, planBefore, taskSnapshot);
  const texts = await readTaskTexts(runtime);
  const { tasks, findings: parseFindings } = parseTasks(
    texts,
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  const parked = new Set(
    Object.keys(opts.state.tasks).filter(
      (slug) => opts.state.tasks[slug]!.status === "parked",
    ),
  );
  findings.push(...validateTaskGraph(tasks, { parked }));

  const routes = outcome?.stallRoutes;
  if (!routes) {
    findings.push(
      `stall turn lists no stallRoutes; route each parked slug (${opts.slugs.join(", ")}) as amend|cancel|replace|split|leave`,
    );
    return [...new Set(findings)];
  }
  const claimed = new Set(opts.slugs);
  const seen = new Set<string>();
  const actionOf = new Map<string, StallRouteEntry["action"]>();
  for (const entry of routes) {
    if (seen.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is routed twice; route each parked slug once`,
      );
      continue;
    }
    seen.add(entry.slug);
    actionOf.set(entry.slug, entry.action);
    if (!claimed.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is not in this stall; route only ${opts.slugs.join(", ")}`,
      );
    }
    if (!entry.reason.trim()) {
      findings.push(
        `slug "${entry.slug}" needs a reason; say what happens to the parked work`,
      );
    }
  }
  for (const slug of opts.slugs) {
    if (!seen.has(slug)) {
      findings.push(
        `slug "${slug}" has no route; route each parked slug as amend|cancel|replace|split|leave`,
      );
    }
    if (!texts.has(slug)) {
      findings.push(
        `parked task "${slug}" was deleted; the stall set must survive the turn`,
      );
    }
  }

  if (parseFindings.length === 0) {
    const bySlug = new Map(tasks.map((task) => [task.slug, task]));
    const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
    for (const slug of created) {
      const task = bySlug.get(slug);
      if (!task) continue;
      if (stallProvenance(task.source) !== String(opts.iteration)) {
        findings.push(
          `new task "${slug}" has no provenance stall: ${opts.iteration}; a stall turn creates tasks only with source stall: ${opts.iteration}`,
        );
      }
    }
    findings.push(
      ...decisionFindings({
        turn: "stall",
        slugs: opts.slugs,
        decisionOf: actionOf,
        state: opts.state,
        before: taskSnapshot,
        texts,
        bySlug,
        taskTypes: runtime.configs.process.taskTypes,
        created: created
          .map((slug) => bySlug.get(slug))
          .filter((task): task is TaskFile => task !== undefined),
        credits: new Map(),
        fixed: new Set(),
      }),
    );
  }
  return [...new Set(findings)];
}

/** A cancelled park becomes a kernel cancel record: the slug stays spent. */
async function cancelRoutes(
  runtime: KernelRuntime,
  iteration: number,
  state: State,
  cancellations: readonly { slug: string; cause: string }[],
): Promise<void> {
  for (const { slug, cause } of cancellations) {
    await appendCancel(
      runtime.store,
      { iteration, slug, round: state.tasks[slug]?.round ?? 1 },
      cause,
    );
  }
}

/**
 * PM ladder for a zero-merge stall mid-iteration. Each parked slug of the
 * stall gets one route: `amend` rewrites its own file and bumps its revision,
 * so dispatch resumes the slug on its kept branch; `replace` writes one task
 * under a new slug with `base:` naming the parked one (a fresh task when the
 * kept branch conflicts with the head); `split` writes one per separable
 * outcome, each with `base:` and its own done-when; `cancel` spends the slug;
 * `leave` keeps it parked with a reason the next boundary sees. Amend, replace
 * and split resume dispatch in the same iteration. The record uses the PM
 * step, so it stays out of the item's turn count and prices into the
 * iteration's spend like every other PM turn.
 *
 * Accepted routes commit to a `stall-routes` script record; the cancels are
 * kernel records, not task writes, so they precede it. A failed rung's routes
 * die with its rollback. A turn that exhausts the ladder or stops on infra
 * falls back to the boundary as today: the writes are rolled back, the
 * attempt is recorded so dispatch does not retry it, and the stall still
 * reaches the architect.
 */
export async function runStallPm(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    slugs: string[];
    cwd: string;
  },
): Promise<StallResult> {
  const left = [...opts.slugs].sort();
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  const planBefore = snapshot.plan;
  const taskSnapshot = snapshot.tasks;
  const brief = await stallBrief(runtime, opts);
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(
      await readTaskTexts(runtime),
      runtime.configs.process.taskTypes,
    );
    const result = await runAgentTurn(runtime, {
      target,
      cwd: opts.cwd,
      meta: { iteration: opts.iteration, step: "pm", round },
      vars: {
        iteration: String(opts.iteration),
        intent_path: path.join(runtime.store.goalDir, "intent.md"),
        plan_path: planPath,
        tasks_dir: runtime.store.tasksDir,
        existing_tasks: existingTasks(opts.state, tasks),
        repair: round === 1 ? "" : stallLadderNote(rung, target, failure),
        steers: "none",
        holds_dir: holdsDir(runtime.store),
        stalls: brief,
        plan_checks: "none",
      },
      expectation: KERNEL_TURN_STEPS.pm,
    });
    const outcome = result.outcome;
    const findings = await validateStallTurn(
      runtime,
      { ...opts, planPath, round },
      planBefore,
      taskSnapshot,
      outcome,
    );
    if (outcome?.status === "done" && findings.length === 0) {
      const accepted: StallRouteEntry[] = [...(outcome.stallRoutes ?? [])].sort(
        (a, b) => a.slug.localeCompare(b.slug),
      );
      // A cancelled park is spent by a kernel record, not a task write.
      await cancelRoutes(
        runtime,
        opts.iteration,
        opts.state,
        accepted
          .filter((entry) => entry.action === "cancel")
          .map((entry) => ({ slug: entry.slug, cause: entry.reason })),
      );
      // The boundary reads routes from this record only, never from the agent
      // rung outcomes: a failed rung's routes die with its rollback.
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, STALL_ROUTES_STEP, { round }),
        {
          ok: true,
          outcome: {
            status: "done",
            summary: `stall routes: ${accepted.map((entry) => `${entry.slug}=${entry.action}`).join(", ")}`,
            concerns: [],
            forward: [],
            stallRoutes: accepted,
          },
        },
      );
      return {
        continued: accepted
          .filter(
            (entry) =>
              entry.action === "amend" ||
              entry.action === "replace" ||
              entry.action === "split",
          )
          .map((entry) => entry.slug),
        left: accepted
          .filter(
            (entry) => entry.action === "leave" || entry.action === "cancel",
          )
          .map((entry) => entry.slug),
      };
    }

    const reasons = failureReasons(outcome, findings, result.record);
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-validate", { round }),
      { ok: false, cause: reasons.join("; ") },
    );
    await restoreTurn(runtime, snapshot);
    if (result.record.stop?.kind === "infra") {
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, STALL_ROUTES_STEP, { round }),
        { ok: false, cause: reasons.join("; ") },
      );
      return { continued: [], left };
    }
    failure = reasons;
  }
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, STALL_ROUTES_STEP),
    {
      ok: false,
      cause: failure.join("; ") || "stall PM ladder exhausted",
    },
  );
  return { continued: [], left };
}

/** Script step committing a plan-check turn's routes; one record per checker round. */
export const PLAN_CHECK_ROUTES_STEP = "plan-check-routes";

/**
 * Which follow-up slugs a plan-check turn resumed; a cancel spends its slug
 * and a leave keeps it for the architect.
 */
export interface PlanCheckPmResult {
  continued: string[];
  left: string[];
}

/**
 * One brief entry per checker follow-up: its kind, slug, dead dep and reason,
 * plus the slug's facts when the task file exists (cause, record paths, kept
 * branch, spent turns, done-when). The integration head lets the PM check a
 * base for conflicts before choosing.
 */
async function planCheckPmBrief(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; followUps: PlanCheckFollowUp[] },
): Promise<string> {
  const facts = await briefFacts(runtime);
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

function planCheckLadderNote(
  rung: { alias: string; mandate: PmMandate },
  target: TurnTarget,
  failure: string[],
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: route the checker's follow-ups again from their brief, and if a slug cannot continue, leave it with a reason for the architect.`,
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`,
    );
  }
  notes.push(
    "Restated PM plan-check contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Route every follow-up in planCheckRoutes, then write the outcome: `continue` carries the checker's kind — `amend` rewrites the slug's own file and bumps `revision` by one, `cancel` writes no task file, `replace` writes one task with a new slug, `base:` naming the parked slug and the same done-when, `split` writes one task per separable outcome, a dead dep is written as the dep task or dropped from the slug's list, `unmerged` work continues its branch; `leave` writes nothing.",
  );
  if (failure.length > 0)
    notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
  return notes.join("\n");
}

/**
 * Whether two task texts differ only in their dependency list. An
 * unparseable side is not a dep fix: the caller reports the edit as is.
 */
function onlyDepsChanged(
  before: string,
  after: string,
  slug: string,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): boolean {
  let oldTask: TaskFile;
  let newTask: TaskFile;
  try {
    oldTask = parseTaskFile(before, slug, taskTypes);
    newTask = parseTaskFile(after, slug, taskTypes);
  } catch {
    return false;
  }
  const { deps: _oldDeps, ...oldRest } = oldTask;
  const { deps: _newDeps, ...newRest } = newTask;
  return (
    JSON.stringify(oldRest) === JSON.stringify(newRest) &&
    JSON.stringify([...oldTask.deps].sort()) !==
      JSON.stringify([...newTask.deps].sort())
  );
}

async function validatePlanCheckTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    planPath: string;
    round: number;
    followUps: PlanCheckFollowUp[];
  },
  planBefore: string,
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, planBefore, taskSnapshot);
  const texts = await readTaskTexts(runtime);
  const { tasks, findings: parseFindings } = parseTasks(
    texts,
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  const parked = new Set(
    Object.keys(opts.state.tasks).filter(
      (slug) => opts.state.tasks[slug]!.status === "parked",
    ),
  );
  findings.push(...validateTaskGraph(tasks, { parked }));

  const routes = outcome?.planCheckRoutes;
  const slugs = [...new Set(opts.followUps.map((item) => item.slug))].sort();
  const followUpOf = new Map(opts.followUps.map((item) => [item.slug, item]));
  if (!routes) {
    findings.push(
      `plan-check turn lists no planCheckRoutes; route each follow-up (${slugs.join(", ")}) as continue|leave`,
    );
    return [...new Set(findings)];
  }
  const claimed = new Set(slugs);
  const seen = new Set<string>();
  const actionOf = new Map<string, PlanCheckRouteEntry["action"]>();
  for (const entry of routes) {
    if (seen.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is routed twice; route each follow-up once`,
      );
      continue;
    }
    seen.add(entry.slug);
    actionOf.set(entry.slug, entry.action);
    if (!claimed.has(entry.slug)) {
      findings.push(
        `slug "${entry.slug}" is not in this plan-check; route only ${slugs.join(", ")}`,
      );
    }
    if (!entry.reason.trim()) {
      findings.push(
        `slug "${entry.slug}" needs a reason; say why it continues or stays for the architect`,
      );
    }
  }
  for (const slug of slugs) {
    if (!seen.has(slug)) {
      findings.push(
        `slug "${slug}" has no route; route each follow-up as continue|leave`,
      );
    }
    if (!texts.has(slug)) {
      findings.push(
        `follow-up task "${slug}" was deleted; the follow-up set must survive the turn`,
      );
    }
  }

  if (parseFindings.length === 0) {
    const bySlug = new Map(tasks.map((task) => [task.slug, task]));
    // Besides an amend, the one edit a plan-check turn may make: a
    // missing-dep follow-up drops its dead deps from its own slug.
    const depFixed = new Set<string>();
    for (const [slug, original] of taskSnapshot) {
      const now = texts.get(slug);
      if (now === undefined || now === original) continue;
      const followUp = followUpOf.get(slug);
      if (
        followUp?.kind === "missing-dep" &&
        onlyDepsChanged(original, now, slug, runtime.configs.process.taskTypes)
      ) {
        const before = parseTaskFile(
          original,
          slug,
          runtime.configs.process.taskTypes,
        );
        const after = parseTaskFile(
          now,
          slug,
          runtime.configs.process.taskTypes,
        );
        const dropped = before.deps.filter((dep) => !after.deps.includes(dep));
        const added = after.deps.filter((dep) => !before.deps.includes(dep));
        if (added.length > 0) {
          findings.push(
            `task "${slug}" adds dependencies (${added.join(", ")}); a missing-dep follow-up drops dead deps only`,
          );
          continue;
        }
        const live = dropped.filter(
          (dep) =>
            taskSnapshot.has(dep) &&
            opts.state.tasks[dep]?.status !== "cancelled",
        );
        if (live.length > 0) {
          findings.push(
            `task "${slug}" drops live dependencies (${live.join(", ")}); only deps on missing or cancelled tasks go`,
          );
          continue;
        }
        depFixed.add(slug);
      }
    }
    const decisionOf = new Map<string, StallDecision>();
    for (const item of opts.followUps)
      decisionOf.set(item.slug, planCheckDecision(item.kind));
    const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
    const credits = new Map<string, string[]>();
    const credit = (slug: string, by: string): void => {
      const list = credits.get(slug) ?? [];
      list.push(by);
      credits.set(slug, list);
    };
    for (const slug of depFixed) credit(slug, "dep fix");
    // A missing-dep follow-up may also write the dead dep as a new task
    // carrying its name; that task claims the blocked slug it unblocks.
    const depRewrites = new Set<string>();
    for (const slug of created) {
      const depClaim = opts.followUps.find(
        (item) => item.kind === "missing-dep" && item.dep === slug,
      );
      if (!depClaim) continue;
      if (actionOf.get(depClaim.slug) !== "continue") {
        findings.push(
          `new task "${slug}" rewrites the dead dep of "${depClaim.slug}", which was left for the architect`,
        );
        depRewrites.add(slug);
        continue;
      }
      credit(depClaim.slug, slug);
      depRewrites.add(slug);
    }
    for (const slug of created) {
      const task = bySlug.get(slug);
      if (!task) continue;
      if (planCheckProvenance(task.source) !== String(opts.iteration)) {
        findings.push(
          `new task "${slug}" has no provenance plan-check: ${opts.iteration}; a plan-check turn creates follow-ups only with source plan-check: ${opts.iteration}`,
        );
      }
    }
    findings.push(
      ...decisionFindings({
        turn: "plan-check",
        slugs,
        decisionOf,
        state: opts.state,
        before: taskSnapshot,
        texts,
        bySlug,
        taskTypes: runtime.configs.process.taskTypes,
        created: created
          .filter((slug) => !depRewrites.has(slug))
          .map((slug) => bySlug.get(slug))
          .filter((task): task is TaskFile => task !== undefined),
        credits,
        fixed: depFixed,
      }),
    );
  }
  return [...new Set(findings)];
}

/**
 * PM ladder for a plan-checker's follow-ups at dispatch exhaustion. Each
 * follow-up slug gets one route; `continue` carries out the checker's kind:
 * an `amend` rewrites the parked file and bumps its revision, so dispatch
 * resumes the slug on its kept branch; a `cancel` becomes a kernel cancel
 * record; a `replace` writes one task under a new slug with `base:` naming the
 * parked one (a fresh task when the kept branch conflicts with the head); a
 * `split` writes one per separable outcome, each with `base:` and its own
 * done-when; `missing-dep` drops the dead dep or rewrites it as a task; an
 * `unmerged` park continues as a task. `leave` keeps the slug for the
 * architect with a reason. The record uses the PM step, so it stays out of the
 * item's turn count and prices into the iteration's spend like every other PM
 * turn.
 *
 * Accepted routes commit to a `plan-check-routes` script record after their
 * cancels; a failed rung's routes die with its rollback. A turn that exhausts
 * the ladder or stops on infra falls back to the boundary as today: the writes
 * are rolled back, the attempt is recorded so the round counts once, and the
 * evidence still reaches the architect through the pack.
 */
export async function runPlanCheckPm(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    followUps: PlanCheckFollowUp[];
    cwd: string;
  },
): Promise<PlanCheckPmResult> {
  const slugs = [...new Set(opts.followUps.map((item) => item.slug))].sort();
  const left = [...slugs];
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  const planBefore = snapshot.plan;
  const taskSnapshot = snapshot.tasks;
  const brief = await planCheckPmBrief(runtime, opts);
  let failure: string[] = [];

  for (const [index, rung] of rungSteps(runtime).entries()) {
    const target = boundaryTarget(runtime, "pm", opts.iteration, rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(
      await readTaskTexts(runtime),
      runtime.configs.process.taskTypes,
    );
    const result = await runAgentTurn(runtime, {
      target,
      cwd: opts.cwd,
      meta: { iteration: opts.iteration, step: "pm", round },
      vars: {
        iteration: String(opts.iteration),
        intent_path: path.join(runtime.store.goalDir, "intent.md"),
        plan_path: planPath,
        tasks_dir: runtime.store.tasksDir,
        existing_tasks: existingTasks(opts.state, tasks),
        repair: round === 1 ? "" : planCheckLadderNote(rung, target, failure),
        steers: "none",
        holds_dir: holdsDir(runtime.store),
        stalls: "none",
        plan_checks: brief,
      },
      expectation: KERNEL_TURN_STEPS.pm,
    });
    const outcome = result.outcome;
    const findings = await validatePlanCheckTurn(
      runtime,
      { ...opts, planPath, round },
      planBefore,
      taskSnapshot,
      outcome,
    );
    if (outcome?.status === "done" && findings.length === 0) {
      const accepted: PlanCheckRouteEntry[] = [
        ...(outcome.planCheckRoutes ?? []),
      ].sort((a, b) => a.slug.localeCompare(b.slug));
      const kindOf = new Map(
        opts.followUps.map((item) => [item.slug, item.kind]),
      );
      await cancelRoutes(
        runtime,
        opts.iteration,
        opts.state,
        accepted
          .filter(
            (entry) =>
              entry.action === "continue" &&
              kindOf.get(entry.slug) === "cancel",
          )
          .map((entry) => ({ slug: entry.slug, cause: entry.reason })),
      );
      // The boundary reads routes from this record only, never from the agent
      // rung outcomes: a failed rung's routes die with its rollback.
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, PLAN_CHECK_ROUTES_STEP, { round }),
        {
          ok: true,
          outcome: {
            status: "done",
            summary: `plan-check routes: ${accepted.map((entry) => `${entry.slug}=${entry.action}`).join(", ")}`,
            concerns: [],
            forward: [],
            planCheckRoutes: accepted,
          },
        },
      );
      return {
        continued: accepted
          .filter(
            (entry) =>
              entry.action === "continue" &&
              kindOf.get(entry.slug) !== "cancel",
          )
          .map((entry) => entry.slug),
        left: accepted
          .filter((entry) => entry.action === "leave")
          .map((entry) => entry.slug),
      };
    }

    const reasons = failureReasons(outcome, findings, result.record);
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-validate", { round }),
      { ok: false, cause: reasons.join("; ") },
    );
    await restoreTurn(runtime, snapshot);
    if (result.record.stop?.kind === "infra") {
      await runtime.store.appendRecord(
        scriptMeta(opts.iteration, PLAN_CHECK_ROUTES_STEP, { round }),
        { ok: false, cause: reasons.join("; ") },
      );
      return { continued: [], left };
    }
    failure = reasons;
  }
  await runtime.store.appendRecord(
    scriptMeta(opts.iteration, PLAN_CHECK_ROUTES_STEP),
    {
      ok: false,
      cause: failure.join("; ") || "plan-check PM ladder exhausted",
    },
  );
  return { continued: [], left };
}
