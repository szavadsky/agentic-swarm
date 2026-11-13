import fs from "node:fs";
import { fingerprintText } from "../core/fingerprint.js";
import { runAgentTurn } from "./agent.js";
import { materialHash, parseTaskFile, validateTaskGraph, TaskFileError } from "./tasks.js";
import { scriptMeta } from "./record.js";
import type { KernelRuntime, State, StepRecord, TaskFile } from "./types.js";

export class PmValidationError extends Error {
  constructor(public readonly findings: string[]) {
    super(findings.join("; "));
    this.name = "PmValidationError";
  }
}

async function readTaskFiles(runtime: KernelRuntime): Promise<{ tasks: TaskFile[]; findings: string[] }> {
  const tasks: TaskFile[] = [];
  const findings: string[] = [];
  for (const name of await runtime.store.listDir("tasks")) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    const text = await runtime.store.readFile(`tasks/${name}`);
    if (text === null) continue;
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

function frozenFindings(state: State, tasks: TaskFile[], records: StepRecord[]): string[] {
  const bySlug = new Map(tasks.map((t) => [t.slug, t]));
  const findings: string[] = [];
  for (const [slug, taskState] of Object.entries(state.tasks)) {
    if (taskState.status !== "merged" && taskState.status !== "finished") continue;
    const file = bySlug.get(slug);
    if (!file) {
      findings.push(`frozen task "${slug}" was removed; frozen files stay, rework goes to a new slug`);
      continue;
    }
    const dispatch = [...records]
      .filter((r) => r.slug === slug && r.actor === "agent" && r.taskHash)
      .sort((a, b) => a.seq - b.seq)
      .at(-1);
    if (dispatch?.taskHash && dispatch.taskHash !== materialHash(file)) {
      findings.push(
        `frozen task "${slug}" was edited; file a rework task "${slug}-r2" with deps: [${slug}] instead`
      );
    }
  }
  return findings;
}

async function validate(
  runtime: KernelRuntime,
  state: State,
  planPath: string,
  planHashBefore: string
): Promise<string[]> {
  const { tasks, findings } = await readTaskFiles(runtime);
  const parked = new Set(
    Object.keys(state.tasks).filter((slug) => state.tasks[slug]!.status === "parked")
  );
  const records = await runtime.store.listRecords();
  const planHashAfter = fs.existsSync(planPath)
    ? fingerprintText(fs.readFileSync(planPath, "utf8"), { lowercase: false })
    : "";
  if (planHashAfter !== planHashBefore) {
    findings.push("plan.md changed during the PM turn; only the architect edits the plan");
  }
  findings.push(...validateTaskGraph(tasks, { parked }));
  findings.push(...frozenFindings(state, tasks, records));
  return findings;
}

/**
 * PM turn plus script validation. One repair ask in the same session; a second
 * failure ends the iteration as blocked (KERNEL0 §3).
 */
export async function runPm(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; planPath: string; cwd: string; repair?: string }
): Promise<void> {
  const planHashBefore = fs.existsSync(opts.planPath)
    ? fingerprintText(fs.readFileSync(opts.planPath, "utf8"), { lowercase: false })
    : "";

  const ask = async (repair: string, session?: StepRecord["session"]): Promise<void> => {
    const { tasks } = await readTaskFiles(runtime);
    const result = await runAgentTurn(runtime, {
      role: "pm",
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
    const findings = await validate(runtime, opts.state, opts.planPath, planHashBefore);
    if (findings.length === 0) return;
    if (session === undefined) {
      await ask(findings.map((f) => `- ${f}`).join("\n"), result.record.session);
      return;
    }
    await runtime.store.appendRecord(scriptMeta(opts.iteration, "pm-validate", { round: 1 }), {
      ok: false,
      cause: findings.join("; "),
    });
    throw new PmValidationError(findings);
  };

  await ask(opts.repair ?? "");
}
