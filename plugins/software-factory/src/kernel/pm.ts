import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../core/records/io.js";
import { runAgentTurn } from "./agent.js";
import { resolveRole } from "./flow-context.js";
import { formatSteerTurn, holdsDir, type Steer } from "./mailbox.js";
import { materialHash, parseTaskFile, validateTaskGraph, TaskFileError } from "./tasks.js";
import { appendCancel, appendPark, scriptMeta } from "./record.js";
import type { Stop } from "../harness/types.js";
import type { AliasConfig, KernelRuntime, Outcome, State, StepRecord, TaskFile, TaskStatus } from "./types.js";

function taskPath(runtime: KernelRuntime, slug: string): string {
  return path.join(runtime.store.tasksDir, `${slug}.md`);
}

async function readTaskTexts(runtime: KernelRuntime): Promise<Map<string, string>> {
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

async function snapshotTurn(runtime: KernelRuntime, planPath: string): Promise<TurnSnapshot> {
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
  snapshot: TurnSnapshot
): Promise<{ plan: boolean; tasks: string[] }> {
  const planExistsNow = fs.existsSync(snapshot.planPath);
  const planNow = planExistsNow ? fs.readFileSync(snapshot.planPath, "utf8") : "";
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

function parseTasks(texts: Map<string, string>): { tasks: TaskFile[]; findings: string[] } {
  const tasks: TaskFile[] = [];
  const findings: string[] = [];
  for (const [slug, text] of [...texts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    try {
      tasks.push(parseTaskFile(text, slug));
    } catch (err) {
      findings.push(err instanceof TaskFileError ? err.message : `task "${slug}" is unreadable`);
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
      return `- ${task.slug} | ${status} | ${materialHash(task).slice(0, 10)} | deps: ${task.deps.join(",") || "none"}${readOnlyMarker(status)}`;
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
    new RegExp(`(?<![a-z0-9.-])${escapeRegExp(name)}${boundary}`, "i").test(plan)
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
  taskSnapshot: Map<string, string>
): Promise<string[]> {
  const findings: string[] = [];
  const planNow = fs.existsSync(opts.planPath)
    ? fs.readFileSync(opts.planPath, "utf8")
    : "";
  if (planNow !== planBefore) {
    await writeTextAtomic(opts.planPath, planBefore);
    findings.push("plan.md changed during the PM turn; restored: only the architect edits the plan");
  }

  const texts = await readTaskTexts(runtime);
  for (const slug of frozenSlugs(opts.state)) {
    const original = taskSnapshot.get(slug);
    const now = texts.get(slug);
    if (original === undefined) {
      if (now !== undefined) {
        findings.push(`frozen task "${slug}" appeared; frozen slugs are immutable`);
      }
      continue;
    }
    if (now !== original) {
      await writeTextAtomic(taskPath(runtime, slug), original);
      findings.push(
        `frozen task "${slug}" was edited; restored: merged work is history, rework needs a new slug`
      );
    }
  }
  for (const slug of cancelledSlugs(opts.state)) {
    const original = taskSnapshot.get(slug);
    if (original === undefined) continue;
    if (texts.get(slug) !== original) {
      await writeTextAtomic(taskPath(runtime, slug), original);
      findings.push(`cancelled task "${slug}" was edited; restored: a spent slug cannot be reused`);
    }
  }

  if (findings.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-reconcile", { round: opts.round }),
      { ok: false, cause: findings.join("; ") }
    );
  }
  return findings;
}

async function validate(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; round: number },
  planBefore: string,
  taskSnapshot: Map<string, string>
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, planBefore, taskSnapshot);
  const { tasks, findings: parseFindings } = parseTasks(await readTaskTexts(runtime));
  findings.push(...parseFindings);
  const parked = new Set(
    Object.keys(opts.state.tasks).filter((slug) => opts.state.tasks[slug]!.status === "parked")
  );
  findings.push(...validateTaskGraph(tasks, { parked }));
  return [...new Set(findings)];
}

/**
 * A task the architect dropped from the plan becomes cancelled by a record, so
 * its slug stays spent and state needs no memory. A changed task that remains
 * in the plan needs nothing: dispatch re-reads the file. A dropped task that
 * already committed on its branch is parked instead: cancelling it would strand
 * work no record names, and its slug must stay reusable by a `base:` task.
 */
async function cancelRemovedTasks(
  runtime: KernelRuntime,
  state: State,
  plan: string,
  iteration: number
): Promise<void> {
  for (const [slug, task] of Object.entries(state.tasks)) {
    if (task.status !== "pending" && task.status !== "ready") continue;
    if (planMentionsSlug(plan, slug)) continue;
    if (task.commit !== undefined) {
      await appendPark(runtime.store, { iteration, slug, round: task.round }, "dropped-with-commits");
      continue;
    }
    await appendCancel(
      runtime.store,
      { iteration, slug, round: task.round },
      `removed from the plan at iteration ${iteration}`
    );
  }
}

export type PmMandate = "first" | "retry" | "escalated-first" | "escalated-retry";

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
    if (!alias) throw new Error(`run config has no alias "${name}" (needed by role "pm")`);
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
  record: StepRecord
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
  failure: string[]
): string {
  const notes: string[] = [];
  if (rung.mandate.startsWith("escalated")) {
    notes.push(
      `The PM ladder escalated to alias "${target.alias}" (model "${target.model.id}"). You hold a broader mandate: derive the task files from the plan again, and if the plan itself cannot be turned into tasks, answer "blocked" with one question for the architect in the summary.`
    );
  }
  if (rung.mandate.endsWith("retry")) {
    notes.push(
      `This is a fresh retry on alias "${target.alias}"; the previous turn's plan and task-file writes were rolled back to the pre-PM snapshot.`
    );
  }
  notes.push(
    "Restated PM contract: you are the PM — never edit the plan, never plan, never implement, never invent intent. Write task files under the tasks directory, then the outcome."
  );
  if (failure.length > 0) notes.push("", "Findings:", ...failure.map((reason) => `- ${reason}`));
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
  opts: { iteration: number; state: State; planPath: string; cwd: string }
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
    const findings = await validate(runtime, { ...opts, round }, planBefore, taskSnapshot);
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
    await runtime.store.appendRecord(scriptMeta(opts.iteration, "pm-validate", { round }), {
      ok: false,
      cause: failureText,
    });
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

/**
 * One PM turn for steers dropped mid-iteration. The PM structures each steer
 * into a hold file and writes no task file; there is no ladder because the
 * steer still reaches the architect at the boundary whether this turn succeeds
 * or fails. A failed turn therefore writes no hold and changes no dispatch.
 * The record uses the PM step, so it stays out of the item turn budget and
 * prices into the iteration's spend like every other PM turn.
 *
 * A steer turn is not the task turn: any task-file or plan write it makes is
 * restored from the pre-turn snapshot and named in a failed script record, so
 * a malformed write cannot throw out of the next derive or stand all
 * iteration.
 */
export async function runSteerPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; tasks: TaskFile[]; steers: Steer[]; cwd: string }
): Promise<void> {
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const snapshot = await snapshotTurn(runtime, planPath);
  await runAgentTurn(runtime, {
    target: resolveRole(runtime, "pm"),
    cwd: opts.cwd,
    meta: { iteration: opts.iteration, step: "pm", round: 1 },
    vars: {
      iteration: String(opts.iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: planPath,
      tasks_dir: runtime.store.tasksDir,
      existing_tasks: existingTasks(opts.state, opts.tasks),
      repair: "",
      steers: formatSteerTurn(opts.steers),
      holds_dir: holdsDir(runtime.store),
    },
    expectation: "any",
  });
  const restored = await restoreTurn(runtime, snapshot);
  const files = [
    ...(restored.plan ? ["plan.md"] : []),
    ...restored.tasks.map((slug) => `tasks/${slug}.md`),
  ];
  if (files.length > 0) {
    await runtime.store.appendRecord(scriptMeta(opts.iteration, "steer-reconcile"), {
      ok: false,
      cause: `steer turn changed ${files.join(", ")}; restored: a steer structures holds and writes no task file or plan`,
    });
  }
}
