import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../core/records/io.js";
import { runAgentTurn } from "./agent.js";
import { resolveRole } from "./flow-context.js";
import { materialHash, parseTaskFile, validateTaskGraph, TaskFileError } from "./tasks.js";
import { appendCancel, scriptMeta } from "./record.js";
import type { KernelRuntime, Outcome, State, StepRecord, TaskFile } from "./types.js";

export class PmValidationError extends Error {
  constructor(public readonly findings: string[]) {
    super(findings.join("; "));
    this.name = "PmValidationError";
  }
}

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

function existingTasks(state: State, tasks: TaskFile[]): string {
  if (tasks.length === 0) return "none";
  return [...tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => {
      const status = state.tasks[task.slug]?.status ?? "new";
      const frozen = status === "merged" || status === "finished" ? " | frozen" : "";
      return `- ${task.slug} | ${status} | ${materialHash(task).slice(0, 10)} | deps: ${task.deps.join(",") || "none"}${frozen}`;
    })
    .join("\n");
}

function frozenSlugs(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => task.status === "merged" || task.status === "finished")
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
  opts: { iteration: number; state: State; planPath: string },
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
      scriptMeta(opts.iteration, "pm-reconcile", { round: 1 }),
      { ok: false, cause: findings.join("; ") }
    );
  }
  return findings;
}

async function validate(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string },
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

/**
 * PM turn plus script validation. One repair ask carrying the findings; a
 * second failure ends the iteration as blocked (KERNEL0 §3).
 */
export async function runPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; cwd: string; repair?: string }
): Promise<Outcome | undefined> {
  const planBefore = fs.existsSync(opts.planPath)
    ? fs.readFileSync(opts.planPath, "utf8")
    : "";
  const taskSnapshot = await readTaskTexts(runtime);
  const target = resolveRole(runtime, "pm");

  const ask = async (
    repair: string,
    session?: StepRecord["session"],
    isRepair = false
  ): Promise<Outcome | undefined> => {
    const { tasks } = parseTasks(await readTaskTexts(runtime));
    const result = await runAgentTurn(runtime, {
      target,
      cwd: opts.cwd,
      meta: { iteration: opts.iteration, step: "pm", round: 1 },
      vars: {
        iteration: String(opts.iteration),
        intent_path: `${runtime.store.goalDir}/intent.md`,
        plan_path: opts.planPath,
        tasks_dir: runtime.store.tasksDir,
        existing_tasks: existingTasks(opts.state, tasks),
        repair,
      },
      expectation: "any",
      session,
    });
    const findings = await validate(runtime, opts, planBefore, taskSnapshot);
    if (findings.length === 0) {
      await cancelRemovedTasks(runtime, opts.state, planBefore, opts.iteration);
      return result.outcome;
    }
    if (!isRepair) {
      return ask(findings.map((f) => `- ${f}`).join("\n"), result.record.session, true);
    }
    await runtime.store.appendRecord(scriptMeta(opts.iteration, "pm-validate", { round: 1 }), {
      ok: false,
      cause: findings.join("; "),
    });
    throw new PmValidationError(findings);
  };

  return ask(opts.repair ?? "");
}