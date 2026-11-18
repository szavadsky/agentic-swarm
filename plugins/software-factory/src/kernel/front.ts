import fs from "node:fs";
import path from "node:path";
import { runAgentTurn } from "./agent.js";
import { contextPackRelPath } from "./context-pack.js";
import {
  type FrontClass,
  FrontClassError,
  frontTarget,
  readFrontClass,
} from "./flow-context.js";
import { scanInbox } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { parseTaskFile, TaskFileError, validateTaskGraph } from "./tasks.js";
import type {
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskTypeDefinition,
} from "./types.js";

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

const PLAN_FILE = "plan.md";
const CLASS_FILE = "class.yaml";

/**
 * The flow each front class writes, enforced by `validateFrontTasks` and
 * rendered into the front prompt as `class_types`: the configured task type
 * whose flow matches, so the front names a type instead of pairing flow/kind.
 */
export const FRONT_CLASS_FLOWS = {
  trivial: "just-implement",
  task: "implement-review",
} as const;

/** The `class_types` prompt variable: the task type each class writes. */
export function frontClassTypesVar(
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): string {
  return Object.entries(FRONT_CLASS_FLOWS)
    .map(([cls, flow]) => {
      const type = Object.entries(taskTypes ?? {}).find(
        ([, definition]) =>
          definition.kind === "development" && definition.flow === flow,
      )?.[0];
      return type ? `\`${type}\` for ${cls}` : `none for ${cls}`;
    })
    .join(", ");
}

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

function readTasks(runtime: KernelRuntime): TaskFile[] {
  const tasks: TaskFile[] = [];
  if (!fs.existsSync(runtime.store.tasksDir)) return tasks;
  for (const name of fs.readdirSync(runtime.store.tasksDir).sort()) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -".md".length);
    const text = fs.readFileSync(
      path.join(runtime.store.tasksDir, name),
      "utf8",
    );
    try {
      tasks.push(parseTaskFile(text, slug, runtime.configs.process.taskTypes));
    } catch (err) {
      throw new FrontError(
        err instanceof TaskFileError
          ? err.message
          : `task "${slug}" is unreadable`,
      );
    }
  }
  return tasks;
}

/**
 * The front's task file gets the same `tasks.ts` validation as a PM file: parse,
 * graph (slug, scope, deps, base), and the run-config tier pre-flight would have
 * checked had the file existed before launch.
 */
function validateFrontTasks(runtime: KernelRuntime, cls: FrontClass): void {
  const tasks = readTasks(runtime);
  const findings = validateTaskGraph(tasks);
  if (findings.length > 0) {
    throw new FrontError(
      `front task files are invalid: ${findings.join("; ")}`,
    );
  }
  if (tasks.length !== 1) {
    throw new FrontError(
      `class "${cls.class}" needs exactly one task file, found ${tasks.length}`,
    );
  }
  const task = tasks.find((candidate) => candidate.slug === cls.slug);
  if (!task) {
    throw new FrontError(
      `class.yaml names slug "${cls.slug}" but ${runtime.store.tasksDir}/${cls.slug}.md does not exist`,
    );
  }
  const expectedFlow =
    cls.class === "trivial"
      ? FRONT_CLASS_FLOWS.trivial
      : FRONT_CLASS_FLOWS.task;
  if (task.kind !== "development") {
    throw new FrontError(
      `front task "${task.slug}" has kind "${task.kind}"; the front writes a development task`,
    );
  }
  if (task.flow !== expectedFlow) {
    throw new FrontError(
      `front task "${task.slug}" uses flow "${task.flow}"; class "${cls.class}" needs "${expectedFlow}"`,
    );
  }
  if (
    task.tier &&
    task.tier !== "default" &&
    !runtime.configs.run.aliases[task.tier]
  ) {
    throw new FrontError(
      `front task "${task.slug}" names tier "${task.tier}", which is not a run-config alias`,
    );
  }
}

function gateCommands(runtime: KernelRuntime): string {
  return (
    runtime.configs.repo.gates
      .map((gate) => `- ${gate.id}: ${gate.command}`)
      .join("\n") || "none"
  );
}

function resultFor(
  runtime: KernelRuntime,
  cls: FrontClass,
  opts: { ran: boolean; iteration: number },
): FrontResult {
  const packRel = contextPackRelPath(opts.iteration);
  // Every class gets a pack: a bigger front hands it to the architect, a
  // trivial/task front leaves it as the implementer's briefing, delivered as
  // the implement prompt's front_pack variable.
  if (opts.ran) {
    const pack = path.join(runtime.store.goalDir, packRel);
    if (!fs.existsSync(pack) || fs.statSync(pack).size === 0) {
      throw new FrontError(
        `front classified ${cls.class} but wrote no context pack at ${packRel}`,
      );
    }
  }
  if (cls.class === "bigger") {
    return opts.ran
      ? { action: "boundary", packPath: packRel }
      : { action: "boundary" };
  }
  validateFrontTasks(runtime, cls);
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
  opts: FrontRunOptions,
): Promise<FrontResult> {
  const goalDir = runtime.store.goalDir;
  try {
    if (fs.existsSync(path.join(goalDir, PLAN_FILE)))
      return { action: "boundary" };
    // The front has no steer variable and cannot answer one; the architect
    // boundary is the only steer consumer, so a pending steer must not be
    // skipped by a class that would dispatch without it.
    if ((await scanInbox(runtime.store)).length > 0)
      return { action: "boundary" };
    const existing = readFrontClass(runtime);
    if (existing)
      return resultFor(runtime, existing, {
        ran: false,
        iteration: opts.iteration,
      });

    const target = frontTarget(runtime, opts.iteration);
    const packRel = contextPackRelPath(opts.iteration);
    // The front writes its pack; the script owns the directory so the agent
    // never has to create a path outside the goal artifacts.
    fs.mkdirSync(path.join(goalDir, path.dirname(packRel)), {
      recursive: true,
    });
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
        class_types: frontClassTypesVar(runtime.configs.process.taskTypes),
      },
      expectation: KERNEL_TURN_STEPS.front,
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
    const cls = readFrontClass(runtime);
    if (!cls) {
      return {
        action: "infra",
        cause: `front turn wrote no ${CLASS_FILE} at ${path.join(goalDir, CLASS_FILE)}`,
      };
    }
    return resultFor(runtime, cls, { ran: true, iteration: opts.iteration });
  } catch (err) {
    if (err instanceof FrontError || err instanceof FrontClassError) {
      return { action: "infra", cause: err.message };
    }
    throw err;
  }
}
