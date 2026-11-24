import yaml from "yaml";
import { type ZodIssue, z } from "zod";
import { deadDepFindings } from "./task-deps.js";
import type {
  FlowDefinition,
  State,
  TaskFile,
  TaskKind,
  TaskStatus,
  TaskTypeDefinition,
} from "./types.js";

/** The flow a task file gets when its frontmatter names none. */
export const DEFAULT_FLOW = "implement-review";

/** The goal architect's id; an epic's architect id is its epic name. */
export const MAIN_ARCHITECT = "main";

/** The architect that owns a task's scope: its epic's id, or the goal's. */
export function taskArchitect(task: Pick<TaskFile, "epic">): string {
  return task.epic ?? MAIN_ARCHITECT;
}

/**
 * Task frontmatter shape: the one schema that validates task files and
 * renders the prompt skeleton. Unknown keys are refused, so an undeclared
 * alias such as the old `after` is a finding, never a silent override.
 * Field descriptions are the prompt-facing wording, as on `outcomeSchema`.
 */
export const taskFrontmatterSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .describe("namespaced kebab-case, matches the file name"),
    title: z.string().trim().min(1).describe("one line"),
    type: z
      .string()
      .min(1)
      .optional()
      .describe(
        "one of the configured task types; it supplies flow, kind and schema",
      ),
    kind: z
      .enum(["task", "spike", "development"])
      .optional()
      .describe(
        "legacy: the task type supplies it; development merges, spike finishes with findings",
      ),
    flow: z
      .string()
      .min(1)
      .optional()
      .describe("legacy: the task type supplies it"),
    deps: z
      .array(z.string().describe("a slug that must merge first"))
      .default([]),
    scope: z.array(z.string().describe("a predicted area")).default([]),
    epic: z
      .string()
      .min(1)
      .optional()
      .describe("the epic that owns this task; absent means goal-level work"),
    tier: z
      .string()
      .min(1)
      .optional()
      .describe("default, or a run-config alias"),
    revision: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "one more than the parked revision when amending under its slug",
      ),
    base: z
      .string()
      .min(1)
      .optional()
      .describe("the parked slug this continues"),
    source: z
      .string()
      .default("")
      .describe("plan heading, front, steer, stall or plan-check turn"),
    envNotes: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .describe("one environment fact, flake or workaround"),
      )
      .optional()
      .describe(
        "infra facts, known flakes and workarounds for this task's implementer turns",
      ),
    repairTurns: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("outcome-repair turns for this task's turns"),
    turnMinutes: z
      .number()
      .finite()
      .positive()
      .optional()
      .describe("per-turn wall bound in minutes"),
  })
  .strict();

export class TaskFileError extends Error {
  readonly kind: "unconfigured-type" | "malformed";
  constructor(message: string, kind: "unconfigured-type" | "malformed") {
    super(message);
    this.name = "TaskFileError";
    this.kind = kind;
  }
}

/** Slugs are namespaced by epic (`epic.name`), immutable, safe as branch and file name. */
const TASK_SLUG_REGEX = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function isValidTaskSlug(slug: string): boolean {
  return (
    TASK_SLUG_REGEX.test(slug) && !slug.includes("..") && slug.length <= 120
  );
}

/**
 * One schema issue as the operator-facing sentence. Field-specific wording
 * stays stable for the artifact gate and existing repairs; an undeclared
 * `after` names the declared field that replaced it.
 */
function frontmatterIssue(
  issue: ZodIssue,
  fileSlug: string,
  meta: Record<string, unknown>,
): string {
  if (issue.code === "unrecognized_keys") {
    const others = issue.keys.filter((key) => key !== "after");
    if (issue.keys.includes("after")) {
      const also =
        others.length > 0
          ? `; also undeclared: ${others.map((key) => `"${key}"`).join(", ")}`
          : "";
      return `frontmatter "after" is not accepted: use "deps"${also}`;
    }
    const accepted = Object.keys(taskFrontmatterSchema.shape).join(", ");
    return `frontmatter has undeclared key(s) ${issue.keys.map((key) => `"${key}"`).join(", ")}: accepted keys are ${accepted}`;
  }
  const field = String(issue.path[0] ?? "");
  if (field === "kind") {
    return `task "${fileSlug}" has kind "${String(meta.kind)}": expected "development" or "spike" (legacy "task" reads as development)`;
  }
  if (field === "title") {
    return typeof meta.title === "string"
      ? `task "${fileSlug}" has no title`
      : `frontmatter "title" must be a string`;
  }
  const expected: Record<string, string> = {
    slug: "a non-empty string",
    type: "a non-empty string",
    flow: "a non-empty string",
    deps: "a list of strings",
    scope: "a list of strings",
    tier: "a non-empty string",
    revision: "a non-negative integer",
    base: "a non-empty string",
    source: "a string",
    envNotes: "a list of non-empty strings",
    repairTurns: "a non-negative integer",
    turnMinutes: "a positive number",
  };
  return expected[field]
    ? `frontmatter "${field}" must be ${expected[field]}`
    : `frontmatter "${field || "(root)"}": ${issue.message}`;
}

/**
 * The flow and kind a named type supplies. A missing type is a file finding:
 * the config that should carry it is not the file's problem to guess around.
 */
function resolveTaskType(
  fileSlug: string,
  type: string,
  taskTypes: Record<string, TaskTypeDefinition>,
): { kind: TaskKind; flow: string } {
  const definition = Object.hasOwn(taskTypes, type)
    ? taskTypes[type]
    : undefined;
  if (!definition) {
    throw new TaskFileError(
      `task "${fileSlug}" has type "${type}": type "${type}" is not configured`,
      "unconfigured-type",
    );
  }
  return { kind: definition.kind, flow: definition.flow };
}

/**
 * Parses one task file through `taskFrontmatterSchema`. The file name is
 * authoritative for the slug: a frontmatter slug that disagrees with it is a
 * validation finding, not a silent rename. A file naming a type takes its
 * flow and kind from that configured type; a legacy file declares them itself.
 */
/** A task file's YAML frontmatter mapping and Markdown body. */
function taskSections(
  text: string,
  fileSlug: string,
): { meta: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    throw new TaskFileError(
      `task "${fileSlug}" has no --- frontmatter ---`,
      "malformed",
    );
  }
  let raw: unknown;
  try {
    raw = yaml.parse(match[1] ?? "") ?? {};
  } catch (err) {
    throw new TaskFileError(
      `task "${fileSlug}" frontmatter is not valid YAML: ${(err as Error).message}`,
      "malformed",
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TaskFileError(
      `task "${fileSlug}" frontmatter is not a mapping`,
      "malformed",
    );
  }
  return { meta: raw as Record<string, unknown>, body: match[2] ?? "" };
}

export function parseTaskFile(
  text: string,
  fileSlug: string,
  taskTypes: Record<string, TaskTypeDefinition> = {},
): TaskFile {
  const { meta, body } = taskSections(text, fileSlug);
  const result = taskFrontmatterSchema.safeParse({
    ...meta,
    slug: meta.slug ?? fileSlug,
  });
  if (!result.success) {
    throw new TaskFileError(
      result.error.issues
        .map((issue) => frontmatterIssue(issue, fileSlug, meta))
        .join("; "),
      "malformed",
    );
  }
  if (result.data.slug !== fileSlug) {
    throw new TaskFileError(
      `task file "${fileSlug}" declares slug "${result.data.slug}": slugs are immutable and file names authoritative`,
      "malformed",
    );
  }
  const type = result.data.type;
  const legacy = ["kind", "flow"].filter((key) => meta[key] !== undefined);
  if (type !== undefined && legacy.length > 0) {
    throw new TaskFileError(
      `task "${fileSlug}" names type "${type}" and legacy ${legacy.join(" and ")}: the type supplies flow and kind`,
      "malformed",
    );
  }
  const resolved =
    type !== undefined
      ? resolveTaskType(fileSlug, type, taskTypes)
      : {
          kind: (result.data.kind === "spike"
            ? "spike"
            : "development") as TaskKind,
          flow: result.data.flow ?? DEFAULT_FLOW,
        };
  return {
    ...result.data,
    ...resolved,
    revision: result.data.revision ?? 0,
    body: body.trim(),
  };
}

export function renderTaskFile(task: TaskFile): string {
  const front: Record<string, unknown> = {
    slug: task.slug,
    title: task.title,
  };
  if (task.type !== undefined) front.type = task.type;
  else {
    front.kind = task.kind;
    front.flow = task.flow;
  }
  front.deps = task.deps;
  front.scope = task.scope;
  if (task.epic !== undefined) front.epic = task.epic;
  if (task.tier) front.tier = task.tier;
  if (task.revision > 0) front.revision = task.revision;
  if (task.base) front.base = task.base;
  if (task.source) front.source = task.source;
  if (task.envNotes !== undefined && task.envNotes.length > 0)
    front.envNotes = task.envNotes;
  if (task.repairTurns !== undefined) front.repairTurns = task.repairTurns;
  if (task.turnMinutes !== undefined) front.turnMinutes = task.turnMinutes;
  return `---\n${yaml.stringify(front).trimEnd()}\n---\n\n${task.body.trim()}\n`;
}

/** The statuses that still have work left; every other status is history. */
const LIVE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "pending",
  "ready",
  "running",
]);

/**
 * A task the state has no entry for is live work, never history: a file the PM
 * wrote this turn has no record yet.
 */
function isLive(status: TaskStatus | undefined): boolean {
  return status === undefined || LIVE_STATUSES.has(status);
}

/**
 * The `status` option `validateTaskGraph` reads. It covers every slug the state
 * knows, including a terminal slug whose task file is gone: a cancelled base
 * still names its state on a live continuation.
 */
export function taskStatuses(state: State): Map<string, TaskStatus> {
  return new Map(
    Object.entries(state.tasks).map(([slug, task]) => [slug, task.status]),
  );
}

/**
 * Script-checkable plan properties; returns human-readable findings, empty when
 * valid. `status` names the derived task statuses; without it every file is
 * live. A base edge is history once its continuation is terminal — the base
 * landed or was cancelled after the continuation did, and no PM turn can derive
 * the edge away. A live continuation names a base that is not parked by the
 * base's state (merged, finished, cancelled, or not parked at all).
 */
/** Slug, scope, duplicate and epic findings; registers the task by slug. */
function taskFieldFindings(
  task: TaskFile,
  bySlug: Map<string, TaskFile>,
): string[] {
  const findings: string[] = [];
  if (!isValidTaskSlug(task.slug)) {
    findings.push(
      `slug "${task.slug}" is not namespaced kebab-case (example: auth.token-refresh)`,
    );
  }
  if (task.scope.length === 0) {
    findings.push(
      `task "${task.slug}" has no scope: declare the predicted area it works in`,
    );
  }
  if (bySlug.has(task.slug)) {
    findings.push(`slug "${task.slug}" is declared twice`);
  }
  if (task.epic !== undefined) {
    if (!/^[a-z0-9-]+$/.test(task.epic)) {
      findings.push(
        `task "${task.slug}" names epic "${task.epic}": an epic id is [a-z0-9-]+`,
      );
    } else if (!task.slug.startsWith(`${task.epic}.`)) {
      findings.push(
        `task "${task.slug}" names epic "${task.epic}": an epic's tasks are named "${task.epic}.<name>"`,
      );
    }
  }
  bySlug.set(task.slug, task);
  return findings;
}

/** Missing or self-referencing dependency findings. */
function depFindings(
  task: TaskFile,
  bySlug: ReadonlyMap<string, TaskFile>,
): string[] {
  const findings: string[] = [];
  for (const dep of task.deps) {
    if (!bySlug.has(dep)) {
      findings.push(`task "${task.slug}" depends on missing task "${dep}"`);
    }
    if (dep === task.slug) {
      findings.push(`task "${task.slug}" depends on itself`);
    }
  }
  return findings;
}

/** Findings for one task's base edge, given the other tasks' statuses. */
function baseFindings(
  task: TaskFile,
  bySlug: ReadonlyMap<string, TaskFile>,
  status: ReadonlyMap<string, TaskStatus> | undefined,
): string[] {
  if (task.base === undefined) return [];
  // A terminal continuation is history: its base was cancelled or landed
  // afterwards and no PM turn can change that edge.
  if (status && !isLive(status.get(task.slug))) return [];
  const baseStatus = status?.get(task.base);
  if (baseStatus === "parked") return [];
  if (
    baseStatus === "merged" ||
    baseStatus === "finished" ||
    baseStatus === "cancelled"
  ) {
    return [
      `task "${task.slug}" continues "${task.base}", which is ${baseStatus}`,
    ];
  }
  if (!bySlug.has(task.base)) {
    return [`task "${task.slug}" continues missing task "${task.base}"`];
  }
  if (status !== undefined) {
    return [
      `task "${task.slug}" continues "${task.base}", which is not parked`,
    ];
  }
  return [];
}

/** Dependency-cycle findings over the registered tasks. */
function cycleFindings(bySlug: ReadonlyMap<string, TaskFile>): string[] {
  const findings: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (slug: string, path: string[]): void => {
    if (done.has(slug)) return;
    if (visiting.has(slug)) {
      findings.push(`dependency cycle: ${[...path, slug].join(" -> ")}`);
      return;
    }
    visiting.add(slug);
    for (const dep of bySlug.get(slug)?.deps ?? []) {
      if (bySlug.has(dep)) walk(dep, [...path, slug]);
    }
    visiting.delete(slug);
    done.add(slug);
  };
  for (const slug of [...bySlug.keys()].sort()) walk(slug, []);
  return findings;
}

export function validateTaskGraph(
  tasks: TaskFile[],
  opts: { status?: ReadonlyMap<string, TaskStatus> } = {},
): string[] {
  const findings: string[] = [];
  const bySlug = new Map<string, TaskFile>();
  for (const task of tasks) {
    findings.push(...taskFieldFindings(task, bySlug));
  }
  for (const task of tasks) {
    findings.push(
      ...depFindings(task, bySlug),
      ...baseFindings(task, bySlug, opts.status),
    );
  }
  if (opts.status) findings.push(...deadDepFindings(tasks, opts.status));
  findings.push(...cycleFindings(bySlug));
  return [...new Set(findings)];
}

/**
 * Flow existence against the merged process config. Same `flow "x" is not
 * configured` text the dispatcher parks on; `factory validate` calls this so
 * one definition rejects unknown flows.
 */
export function validateTaskFlows(
  tasks: TaskFile[],
  flows: Record<string, FlowDefinition>,
): string[] {
  const findings: string[] = [];
  for (const task of tasks) {
    if (!Object.hasOwn(flows, task.flow)) {
      findings.push(
        `task "${task.slug}" uses flow "${task.flow}": flow "${task.flow}" is not configured`,
      );
    }
  }
  return findings;
}
