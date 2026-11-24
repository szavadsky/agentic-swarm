import { runAgentTurn } from "./agent.js";
import { formatStop } from "./cause.js";
import {
  type FrontClass,
  FrontClassError,
  frontTarget,
  readFrontClass,
} from "./flow-context.js";
import {
  CODE_MAP_FILE,
  type IngestionResult,
  runIngestionSteps,
} from "./ingestion.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { scanInbox } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import {
  parseTaskFile,
  TaskFileError,
  taskStatuses,
  validateTaskGraph,
} from "./tasks.js";
import type {
  KernelRuntime,
  State,
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
  /** Which ingestion step the stop came from: a step, or the classifier, or a runner error. */
  step?: string;
}

interface FrontRunOptions {
  iteration: number;
  /** Derived state at launch: a terminal continuation's base is history. */
  state: State;
}

const CLASS_FILE = "class.yaml";

/**
 * The flow a front class cannot do without: a trivial goal implements in the
 * front's own session, one implement turn and no review, which is this flow.
 * Every other class runs the development type its task names, so a repo's own
 * type is dispatched instead of a flow the kernel hardcodes.
 */
export const FRONT_TRIVIAL_FLOW = "just-implement";

/** The configured development types, in config order. */
function developmentTypes(
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): [string, TaskTypeDefinition][] {
  return Object.entries(taskTypes ?? {}).filter(
    ([, definition]) => definition.kind === "development",
  );
}

/**
 * The `class_types` prompt variable: the configured development types each
 * front class may write. `trivial` is the type on the kernel's trivial flow;
 * `task` is every other development type, so the front picks a repo's own type
 * by its use-when rather than only the built-in one.
 */
export function frontClassTypesVar(
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): string {
  const development = developmentTypes(taskTypes);
  const trivial = development.find(
    ([, definition]) => definition.flow === FRONT_TRIVIAL_FLOW,
  );
  const task = development.filter(
    ([, definition]) => definition.flow !== FRONT_TRIVIAL_FLOW,
  );
  return [
    trivial ? `\`${trivial[0]}\` for trivial` : "none for trivial",
    task.length > 0
      ? `${task.map(([name]) => `\`${name}\``).join(" or ")} for task`
      : "none for task",
  ].join(", ");
}

/**
 * The flow finding for a front task whose class it does not fit: `trivial`
 * needs the kernel's trivial flow, and `task` needs a configured development
 * type's flow (never the trivial one, whose class carries the front-session
 * behaviour). An unconfigured type never reaches here: `parseTaskFile` refuses
 * it, so the front's turn can repair the type instead of the launch falling
 * back to a default flow.
 */
function frontTaskFlowFinding(
  runtime: KernelRuntime,
  cls: FrontClass["class"],
  task: TaskFile,
): string | undefined {
  // A bigger class writes no task; the count check owns a stray file.
  if (cls === "bigger") return undefined;
  if (cls === "trivial") {
    return task.flow === FRONT_TRIVIAL_FLOW
      ? undefined
      : `front task "${task.slug}" uses flow "${task.flow}"; class "trivial" needs "${FRONT_TRIVIAL_FLOW}"`;
  }
  const flows = developmentTypes(runtime.configs.process.taskTypes)
    .map(([, definition]) => definition.flow)
    .filter((flow) => flow !== FRONT_TRIVIAL_FLOW);
  return flows.includes(task.flow)
    ? undefined
    : `front task "${task.slug}" uses flow "${task.flow}"; class "task" needs a configured development type's flow`;
}

/** A front output the script refuses; the launch ends as infra, never as a default class. */
class FrontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontError";
  }
}

/**
 * One front task file's class finding, or its unconfigured type. Any other
 * malformation is the post-turn validation's finding and reads as none here.
 */
function frontTaskFinding(
  runtime: KernelRuntime,
  cls: FrontClass["class"],
  slug: string,
  text: string,
): string | undefined {
  let task: TaskFile;
  try {
    task = parseTaskFile(text, slug, runtime.configs.process.taskTypes);
  } catch (err) {
    if (!(err instanceof TaskFileError)) throw err;
    return err.kind === "unconfigured-type" ? err.message : undefined;
  }
  return frontTaskFlowFinding(runtime, cls, task);
}

/**
 * The class and type findings a front turn can repair in-session, so a task
 * naming a type no config carries earns the delivery-repair ask instead of
 * ending the launch as infra. Unreadable artefacts and graph findings stay
 * with `validateFrontTasks`: this names only what the front's own files say
 * about its class, and the repair asks it to correct them.
 */
async function frontTypeFindings(runtime: KernelRuntime): Promise<string[]> {
  let cls: FrontClass | null;
  try {
    cls = readFrontClass(runtime);
  } catch (err) {
    // A malformed class.yaml is the post-turn check's finding.
    if (err instanceof FrontClassError) return [];
    throw err;
  }
  // A bigger class writes no task, so it has no front file to check.
  if (!cls || cls.class === "bigger") return [];
  const findings: string[] = [];
  for (const [slug, text] of await runtime.store.tasks.texts()) {
    const finding = frontTaskFinding(runtime, cls.class, slug, text);
    if (finding) findings.push(finding);
  }
  return findings;
}

async function readTasks(runtime: KernelRuntime): Promise<TaskFile[]> {
  const tasks: TaskFile[] = [];
  for (const [slug, text] of await runtime.store.tasks.texts()) {
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
 * graph (slug, deps, base), and the run-config tier pre-flight would have
 * checked had the file existed before launch.
 */
async function validateFrontTasks(
  runtime: KernelRuntime,
  cls: FrontClass,
  state: State,
): Promise<void> {
  const tasks = await readTasks(runtime);
  const findings = validateTaskGraph(tasks, { status: taskStatuses(state) });
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
      `class.yaml names slug "${cls.slug}" but ${runtime.store.tasks.path(cls.slug ?? "")} does not exist`,
    );
  }
  if (task.kind !== "development") {
    throw new FrontError(
      `front task "${task.slug}" has kind "${task.kind}"; the front writes a development task`,
    );
  }
  const flowFinding = frontTaskFlowFinding(runtime, cls.class, task);
  if (flowFinding) throw new FrontError(flowFinding);
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

export function gateCommands(runtime: KernelRuntime): string {
  return (
    runtime.configs.repo.gates
      .map((gate) => `- ${gate.id}: ${gate.command}`)
      .join("\n") || "none"
  );
}

async function resultFor(
  runtime: KernelRuntime,
  cls: FrontClass,
  opts: { ran: boolean; iteration: number; state: State },
): Promise<FrontResult> {
  const packRel = runtime.store.iterations.rel(
    opts.iteration,
    "context-pack.md",
  );
  // Every class gets a pack: a bigger front hands it to the architect, a
  // trivial/task front leaves it as the implementer's briefing, delivered as
  // the implement prompt's front_pack variable.
  if (opts.ran) {
    const pack = await runtime.store.iterations.read(
      opts.iteration,
      "context-pack.md",
    );
    if (pack === null || pack.length === 0) {
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
  await validateFrontTasks(runtime, cls, opts.state);
  return { action: "dispatch" };
}

/** The template variables a front turn reads. */
function frontTurnVars(
  runtime: KernelRuntime,
  opts: FrontRunOptions,
  packPath: string,
  codeMapPath: string,
): Record<string, string> {
  return {
    iteration: String(opts.iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plan_path: runtime.store.plans.path,
    tasks_dir: runtime.store.tasks.dir,
    class_path: runtime.store.pathOf({ area: "goal", rel: CLASS_FILE }),
    pack_path: packPath,
    checkout: runtime.paths.goalCheckout,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: gateCommands(runtime),
    class_types: frontClassTypesVar(runtime.configs.process.taskTypes),
    code_map_path: codeMapPath,
  };
}

/** Runs the front's agent turn against the prepared context pack. */
async function runFrontTurn(
  runtime: KernelRuntime,
  opts: FrontRunOptions,
  target: ReturnType<typeof frontTarget>,
  packPath: string,
  codeMapPath: string,
): Promise<Awaited<ReturnType<typeof runAgentTurn>>> {
  return await runBoundaryTurn(
    runtime,
    { iteration: opts.iteration, step: "front" },
    () =>
      runAgentTurn(runtime, {
        target,
        cwd: runtime.paths.goalCheckout,
        meta: { iteration: opts.iteration, step: "front", round: 1 },
        vars: frontTurnVars(runtime, opts, packPath, codeMapPath),
        expectation: KERNEL_TURN_STEPS.front,
        validate: () => frontTypeFindings(runtime),
      }),
  );
}

/** The infra/blocked result for a front turn that did not finish cleanly. */
function frontTurnFailure(
  result: Awaited<ReturnType<typeof runAgentTurn>>,
): FrontResult | undefined {
  if (!result.outcome) {
    return {
      action: "infra",
      cause: `front turn produced no outcome (${formatStop(result.record.stop)})`,
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
  return undefined;
}

/** A step's stop: a blocked step needs the user; anything else is infra. */
function ingestionStop(failed: IngestionResult): FrontResult {
  return {
    action: failed.blocked ? "blocked" : "infra",
    cause: failed.cause,
    step: failed.step,
  };
}

/** Resumes a goal whose class the front already wrote: only the steps run. */
async function resumeClassified(
  runtime: KernelRuntime,
  opts: FrontRunOptions,
  existing: FrontClass,
): Promise<FrontResult> {
  const resumed = await runIngestionSteps(runtime, opts.iteration, true);
  if (resumed.cause) return ingestionStop(resumed);
  return await resultFor(runtime, existing, {
    ran: false,
    iteration: opts.iteration,
    state: opts.state,
  });
}

/** Runs the classifier turn and the configured steps on either side of it. */
async function classifyFront(
  runtime: KernelRuntime,
  opts: FrontRunOptions,
): Promise<FrontResult> {
  const target = frontTarget(runtime, opts.iteration);
  // The front writes its pack; the script owns the directory so the agent
  // never has to create a path outside the goal artifacts.
  const packPath = await runtime.store.localPath({
    area: "iterations",
    rel: `${opts.iteration}/context-pack.md`,
  });
  const codeMapPath = await runtime.store.localPath({
    area: "goal",
    rel: CODE_MAP_FILE,
  });
  const before = await runIngestionSteps(runtime, opts.iteration);
  if (before.cause) return ingestionStop(before);
  const result = await runFrontTurn(
    runtime,
    opts,
    target,
    packPath,
    codeMapPath,
  );
  const failure = frontTurnFailure(result);
  if (failure) return failure;
  const cls = readFrontClass(runtime);
  if (!cls) {
    return {
      action: "infra",
      cause: `front turn wrote no ${CLASS_FILE} at ${runtime.store.pathOf({ area: "goal", rel: CLASS_FILE })}`,
      step: "front",
    };
  }
  const after = await runIngestionSteps(runtime, opts.iteration, true);
  if (after.cause) return ingestionStop(after);
  return await resultFor(runtime, cls, {
    ran: true,
    iteration: opts.iteration,
    state: opts.state,
  });
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
  try {
    if (await runtime.store.plans.exists()) return { action: "boundary" };
    // The front has no steer variable and cannot answer one; the architect
    // boundary is the only steer consumer, so a pending steer must not be
    // skipped by a class that would dispatch without it.
    if ((await scanInbox(runtime.store)).length > 0)
      return { action: "boundary" };
    const existing = readFrontClass(runtime);
    return existing
      ? await resumeClassified(runtime, opts, existing)
      : await classifyFront(runtime, opts);
  } catch (err) {
    if (err instanceof FrontError || err instanceof FrontClassError) {
      return { action: "infra", cause: err.message };
    }
    throw err;
  }
}
