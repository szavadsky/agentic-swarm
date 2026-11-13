import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { runAgentTurn } from "./agent.js";
import { contextPackRelPath } from "./context-pack.js";
import { resolveRole, type RoleTarget } from "./flow-context.js";
import { scanInbox } from "./mailbox.js";
import { parseTaskFile, TaskFileError, validateTaskGraph } from "./tasks.js";
import type { KernelRuntime, StepRecord, TaskFile } from "./types.js";

/** What the launch does after the front turn (or after reading an existing class). */
type FrontAction = "boundary" | "dispatch" | "blocked" | "infra";

export interface FrontResult {
  action: FrontAction;
  /** Goal-relative front pack, only when this turn prepared one for a bigger goal. */
  packPath?: string;
  /** Why the front ended the launch as blocked or infra. */
  cause?: string;
}

interface FrontRunOptions {
  iteration: number;
}

const CLASS_FILE = "class.yaml";
const PLAN_FILE = "plan.md";

const classSchema = z
  .object({
    class: z.enum(["trivial", "task", "bigger"]),
    slug: z.string().min(1).optional(),
  })
  .strict();

type ClassFile = z.infer<typeof classSchema>;

/** A front output the script refuses; the launch ends as infra, never as a default class. */
class FrontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontError";
  }
}

function stopText(stop: StepRecord["stop"]): string {
  if (!stop) return "no stop";
  return "cause" in stop ? `${stop.kind}: ${stop.cause}` : stop.kind;
}

function parseClassText(text: string): ClassFile {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    throw new FrontError(`class.yaml is not valid YAML: ${(err as Error).message}`);
  }
  const parsed = classSchema.safeParse(raw);
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    );
    throw new FrontError(`class.yaml is invalid: ${findings.join("; ")}`);
  }
  if (parsed.data.class !== "bigger" && !parsed.data.slug) {
    throw new FrontError(`class.yaml class "${parsed.data.class}" needs a task slug`);
  }
  return parsed.data;
}

function readClassFile(goalDir: string): ClassFile | null {
  const file = path.join(goalDir, CLASS_FILE);
  if (!fs.existsSync(file)) return null;
  return parseClassText(fs.readFileSync(file, "utf8"));
}

function readTasks(runtime: KernelRuntime): TaskFile[] {
  const tasks: TaskFile[] = [];
  if (!fs.existsSync(runtime.store.tasksDir)) return tasks;
  for (const name of fs.readdirSync(runtime.store.tasksDir).sort()) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -".md".length);
    const text = fs.readFileSync(path.join(runtime.store.tasksDir, name), "utf8");
    try {
      tasks.push(parseTaskFile(text, slug));
    } catch (err) {
      throw new FrontError(
        err instanceof TaskFileError ? err.message : `task "${slug}" is unreadable`
      );
    }
  }
  return tasks;
}

/**
 * The front's task file gets the same `tasks.ts` validation as a PM file: parse,
 * graph (slug, scope, deps, base), and the run-config tier pre-flight would have
 * checked had the file existed before launch. A front-written task must also
 * name the pack in its brief: the implement turn starts de novo in the task
 * worktree, so that line is the only handoff of the front's context.
 */
function validateFrontTasks(runtime: KernelRuntime, cls: ClassFile, packRel?: string): void {
  const tasks = readTasks(runtime);
  const findings = validateTaskGraph(tasks);
  if (findings.length > 0) {
    throw new FrontError(`front task files are invalid: ${findings.join("; ")}`);
  }
  if (tasks.length !== 1) {
    throw new FrontError(
      `class "${cls.class}" needs exactly one task file, found ${tasks.length}`
    );
  }
  const task = tasks.find((candidate) => candidate.slug === cls.slug);
  if (!task) {
    throw new FrontError(
      `class.yaml names slug "${cls.slug}" but ${runtime.store.tasksDir}/${cls.slug}.md does not exist`
    );
  }
  const expectedFlow = cls.class === "trivial" ? "just-implement" : "implement-review";
  if (task.kind !== "task") {
    throw new FrontError(`front task "${task.slug}" has kind "${task.kind}"; the front writes a task`);
  }
  if (task.flow !== expectedFlow) {
    throw new FrontError(
      `front task "${task.slug}" uses flow "${task.flow}"; class "${cls.class}" needs "${expectedFlow}"`
    );
  }
  if (task.tier && task.tier !== "default" && !runtime.configs.run.aliases[task.tier]) {
    throw new FrontError(
      `front task "${task.slug}" names tier "${task.tier}", which is not a run-config alias`
    );
  }
  if (packRel) {
    const packPath = path.join(runtime.store.goalDir, packRel);
    const namesPack = task.body
      .split(/\r?\n/)
      .some((line) => /^front pack:/i.test(line.trim()) && line.includes(packPath));
    if (!namesPack) {
      throw new FrontError(
        `front task "${task.slug}" has no "Front pack: ${packPath}" line: a de novo implementer would start without the front's briefing`
      );
    }
  }
}

/**
 * The front alias is optional: when the run config has no `front` alias, the
 * front speaks through the `pm` alias, so the ladder needs no new required knob.
 */
function frontTarget(runtime: KernelRuntime): RoleTarget {
  const configured = runtime.configs.process.roles.front;
  if (!configured) throw new Error('process config has no role "front"');
  const aliasName = configured.alias ?? "front";
  if (runtime.configs.run.aliases[aliasName]) return resolveRole(runtime, "front");
  if (aliasName === "front" && runtime.configs.run.aliases.pm) {
    return resolveRole(runtime, "front", "pm");
  }
  throw new Error(
    `run config has no alias "${aliasName}" (needed by role "front") and no "pm" fallback`
  );
}

function gateCommands(runtime: KernelRuntime): string {
  return runtime.configs.repo.gates.map((gate) => `- ${gate.id}: ${gate.command}`).join("\n") || "none";
}

function resultFor(
  runtime: KernelRuntime,
  cls: ClassFile,
  opts: { ran: boolean; iteration: number }
): FrontResult {
  const packRel = contextPackRelPath(opts.iteration);
  // Every class gets a pack: a bigger front hands it to the architect, a
  // trivial/task front leaves it as the implementer's briefing when its
  // session cannot be resumed.
  if (opts.ran) {
    const pack = path.join(runtime.store.goalDir, packRel);
    if (!fs.existsSync(pack) || fs.statSync(pack).size === 0) {
      throw new FrontError(`front classified ${cls.class} but wrote no context pack at ${packRel}`);
    }
  }
  if (cls.class === "bigger") {
    return opts.ran ? { action: "boundary", packPath: packRel } : { action: "boundary" };
  }
  validateFrontTasks(runtime, cls, opts.ran ? packRel : undefined);
  return { action: "dispatch" };
}

/**
 * The front consult, run before the architect boundary. A goal that already has
 * a plan or a class.yaml skips the turn: the class only changes by escalation.
 * The front prepares the context pack; a bigger one hands it to the architect,
 * while a trivial or task front writes exactly one task and the launch
 * dispatches it without a boundary. Any front failure is infra, never a silent
 * default to bigger.
 */
export async function runFront(
  runtime: KernelRuntime,
  opts: FrontRunOptions
): Promise<FrontResult> {
  const goalDir = runtime.store.goalDir;
  try {
    if (fs.existsSync(path.join(goalDir, PLAN_FILE))) return { action: "boundary" };
    // The front has no steer variable and cannot answer one; the architect
    // boundary is the only steer consumer, so a pending steer must not be
    // skipped by a class that would dispatch without it.
    if ((await scanInbox(runtime.store)).length > 0) return { action: "boundary" };
    const existing = readClassFile(goalDir);
    if (existing) return resultFor(runtime, existing, { ran: false, iteration: opts.iteration });

    const target = frontTarget(runtime);
    const packRel = contextPackRelPath(opts.iteration);
    // The front writes its pack; the script owns the directory so the agent
    // never has to create a path outside the goal artifacts.
    fs.mkdirSync(path.join(goalDir, path.dirname(packRel)), { recursive: true });
    const result = await runAgentTurn(runtime, {
      target,
      cwd: runtime.paths.goalCheckout,
      meta: { iteration: opts.iteration, step: "front", round: 1 },
      vars: {
        iteration: String(opts.iteration),
        intent_path: path.join(goalDir, "intent.md"),
        plan_path: path.join(goalDir, PLAN_FILE),
        tasks_dir: runtime.store.tasksDir,
        class_path: path.join(goalDir, CLASS_FILE),
        pack_path: path.join(goalDir, packRel),
        checkout: runtime.paths.goalCheckout,
        setup_command: runtime.configs.repo.setup.join(" && ") || "none",
        gate_commands: gateCommands(runtime),
      },
      expectation: "any",
    });
    if (!result.outcome) {
      return {
        action: "infra",
        cause: `front turn produced no outcome (${stopText(result.record.stop)})`,
      };
    }
    if (result.outcome.status === "blocked") {
      return { action: "blocked", cause: result.outcome.summary };
    }
    if (result.outcome.status !== "done") {
      return {
        action: "infra",
        cause: `front turn ended ${result.outcome.status}: ${result.outcome.summary}`,
      };
    }
    const cls = readClassFile(goalDir);
    if (!cls) {
      return { action: "infra", cause: `front turn wrote no ${CLASS_FILE} at ${path.join(goalDir, CLASS_FILE)}` };
    }
    return resultFor(runtime, cls, { ran: true, iteration: opts.iteration });
  } catch (err) {
    if (err instanceof FrontError) return { action: "infra", cause: err.message };
    throw err;
  }
}
