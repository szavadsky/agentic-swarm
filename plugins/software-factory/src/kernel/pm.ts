import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { writeTextAtomic } from "../core/records/io.js";
import type { Stop } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { resolveRole } from "./flow-context.js";
import {
  expireHold,
  formatSteerTurn,
  holdsDir,
  markProcessed,
  steerProvenance,
  writeOutbox,
  type Steer,
} from "./mailbox.js";
import { appendCancel, appendPark, scriptMeta } from "./record.js";
import {
  materialHash,
  parseTaskFile,
  TaskFileError,
  validateTaskGraph,
} from "./tasks.js";
import type {
  AliasConfig,
  KernelRuntime,
  Outcome,
  State,
  StepRecord,
  SteerRoute,
  TaskFile,
  TaskStatus,
} from "./types.js";

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
interface TurnSnapshot {
  planPath: string;
  plan: string;
  /** An absent plan is restored by deleting the file, not by emptying it. */
  planExists: boolean;
  tasks: Map<string, string>;
}

async function snapshotTurn(
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
async function restoreTurn(
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

function parseTasks(texts: Map<string, string>): {
  tasks: TaskFile[];
  findings: string[];
} {
  const tasks: TaskFile[] = [];
  const findings: string[] = [];
  for (const [slug, text] of [...texts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    try {
      tasks.push(parseTaskFile(text, slug));
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

function existingTasks(state: State, tasks: TaskFile[]): string {
  if (tasks.length === 0) return "none";
  return [...tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => {
      const status = state.tasks[task.slug]?.status ?? "new";
      const steer = steerProvenance(task.source);
      const provenance = steer
        ? ` | steer ${steer} (not in the plan; leave it)`
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Position carries no meaning in a task file; the plan's bullet names the slug.
 * A bullet that points at the file (`tasks/foo.md`) names the same task as the
 * bare slug (`foo`). A sentence-ending dot after the name is punctuation, not
 * part of the slug, so `tasks/foo.md.` still names `foo`; a dot that starts
 * another word (`foo.bar`) is a longer slug and does not.
 */
function planMentionsSlug(plan: string, slug: string): boolean {
  const boundary = "(?![a-z0-9-]|\\.[a-z0-9])";
  return [slug, `tasks/${slug}.md`].some((name) =>
    new RegExp(`(?<![a-z0-9.-])${escapeRegExp(name)}${boundary}`, "i").test(
      plan,
    ),
  );
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
      source = parseTaskFile(original, slug).source;
    } catch {
      continue;
    }
    const steer = steerProvenance(source);
    if (!steer) continue;
    await writeTextAtomic(taskPath(runtime, slug), original);
    findings.push(
      `steer task "${slug}" was deleted; restored: a task with provenance steer ${steer} is not in the plan and the PM must leave it`,
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
 * A task the architect dropped from the plan becomes cancelled by a record, so
 * its slug stays spent and state needs no memory. A changed task that remains
 * in the plan needs nothing: dispatch re-reads the file. A dropped task that
 * already committed on its branch is parked instead: cancelling it would strand
 * work no record names, and its slug must stay reusable by a `base:` task. A
 * PM-created task with provenance `steer: <id>` is never in the plan and is
 * never cancelled here: its steer, not the plan, owns it.
 */
async function cancelRemovedTasks(
  runtime: KernelRuntime,
  state: State,
  plan: string,
  iteration: number,
): Promise<void> {
  const files = await runtime.store.listTasks();
  const provenance = new Map(files.map((file) => [file.slug, file.source]));
  for (const [slug, task] of Object.entries(state.tasks)) {
    if (task.status !== "pending" && task.status !== "ready") continue;
    if (steerProvenance(provenance.get(slug) ?? "")) continue;
    if (planMentionsSlug(plan, slug)) continue;
    if (task.commit !== undefined) {
      await appendPark(
        runtime.store,
        { iteration, slug, round: task.round },
        "dropped-with-commits",
      );
      continue;
    }
    await appendCancel(
      runtime.store,
      { iteration, slug, round: task.round },
      `removed from the plan at iteration ${iteration}`,
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
  let name: string | undefined = resolveRole(runtime, "pm").alias;
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
  target: ReturnType<typeof resolveRole>,
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
    const target = resolveRole(runtime, "pm", rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(await readTaskTexts(runtime));
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
      },
      expectation: "any",
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
      await cancelRemovedTasks(runtime, opts.state, planBefore, opts.iteration);
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
    // because the alias's fallbacks already absorbed the same-harness trouble.
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
  target: ReturnType<typeof resolveRole>,
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
  if (!Array.isArray(hold.slugs) || hold.slugs.length > 0) {
    return `architect steer "${steerId}" hold lists slugs; an architect steer holds nothing with slugs: []`;
  }
  if (hold.goal !== false) {
    return `architect steer "${steerId}" hold has no goal: false; an architect steer holds nothing`;
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
  const { tasks, findings: parseFindings } = parseTasks(texts);
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
 * record uses the PM step, so it stays out of the item turn budget and prices
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
    const target = resolveRole(runtime, "pm", rung.alias);
    const round = index + 1;
    const { tasks } = parseTasks(await readTaskTexts(runtime));
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
      },
      expectation: "any",
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
