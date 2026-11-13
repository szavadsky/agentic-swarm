import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../core/records/io.js";
import { runAgentTurn } from "./agent.js";
import { resolveRole } from "./flow-context.js";
import { materialHash, parseTaskFile, validateTaskGraph, TaskFileError } from "./tasks.js";
import { appendCancel, scriptMeta } from "./record.js";
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

function existingTasks(state: State, tasks: TaskFile[]): string {
  if (tasks.length === 0) return "none";
  return [...tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => {
      const status = state.tasks[task.slug]?.status ?? "new";
      const frozen = isFrozenStatus(status) ? " | frozen (read-only)" : "";
      return `- ${task.slug} | ${status} | ${materialHash(task).slice(0, 10)} | deps: ${task.deps.join(",") || "none"}${frozen}`;
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

/** Position carries no meaning in a task file; the plan's bullet names the slug. */
function planMentionsSlug(plan: string, slug: string): boolean {
  return new RegExp(`(?<![a-z0-9.-])${escapeRegExp(slug)}(?![a-z0-9.-])`, "i").test(plan);
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
 * in the plan needs nothing: dispatch re-reads the file.
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

export type PmRun =
  | { status: "done"; outcome: Outcome; rungs: PmRung[] }
  /** An escalated rung stopped the ladder with a question for the architect. */
  | { status: "asked"; outcome: Outcome; rungs: PmRung[] }
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

/** Restores the plan and every task file the failed rung may have changed. */
async function restorePrePm(
  runtime: KernelRuntime,
  planPath: string,
  planBefore: string,
  taskSnapshot: Map<string, string>
): Promise<void> {
  const planNow = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";
  if (planNow !== planBefore) await writeTextAtomic(planPath, planBefore);

  const texts = await readTaskTexts(runtime);
  for (const [slug, original] of taskSnapshot) {
    if (texts.get(slug) !== original) await writeTextAtomic(taskPath(runtime, slug), original);
  }
  for (const slug of texts.keys()) {
    if (!taskSnapshot.has(slug)) fs.rmSync(taskPath(runtime, slug), { force: true });
  }
}

/**
 * PM ladder: each tier gets its first turn and one de-novo retry; a failed rung
 * is rolled back before the next. The next alias in the chain escalates with a
 * broader mandate; only an escalated `blocked` stops with a question, and an
 * exhausted ladder reports every rung as alias, model and failure.
 */
export async function runPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; cwd: string }
): Promise<PmRun> {
  const planBefore = fs.existsSync(opts.planPath)
    ? fs.readFileSync(opts.planPath, "utf8")
    : "";
  const taskSnapshot = await readTaskTexts(runtime);
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
      },
      expectation: "any",
    });
    const findings = await validate(runtime, { ...opts, round }, planBefore, taskSnapshot);
    const outcome = result.outcome;

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
    await restorePrePm(runtime, opts.planPath, planBefore, taskSnapshot);

    if (outcome?.status === "blocked" && rung.mandate.startsWith("escalated")) {
      return { status: "asked", outcome, rungs };
    }
    failure = reasons;
  }

  return { status: "exhausted", rungs };
}
