import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import {
  type Harness,
  type ModelRef,
  portable,
  type SessionRef,
} from "../harness/types.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { contextPackRelPath } from "./context-pack.js";
import { formatFailingChecks, newGateFailures } from "./gates.js";
import { formatReviewFindings } from "./record.js";
import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
  Timeouts,
} from "./types.js";

/** Everything one turn needs to run: the resolved alias, harness, model and its own limits. */
export interface RoleTarget {
  role: string;
  alias: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  fallbacks?: string[];
  timeouts?: Timeouts;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
}

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

const CLASS_FILE = "class.yaml";

export const classSchema = z
  .object({
    class: z.enum(["trivial", "task", "bigger"]),
    slug: z.string().min(1).optional(),
  })
  .strict();

export type FrontClass = z.infer<typeof classSchema>;

/** A class.yaml the launch refuses; runFront turns it into an infra result. */
export class FrontClassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontClassError";
  }
}

/** The goal's front classification; null when the front has not run yet. */
export function readFrontClass(runtime: KernelRuntime): FrontClass | null {
  const file = path.join(runtime.store.goalDir, CLASS_FILE);
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = yaml.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new FrontClassError(
      `class.yaml is not valid YAML: ${(err as Error).message}`,
    );
  }
  const parsed = classSchema.safeParse(raw);
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new FrontClassError(`class.yaml is invalid: ${findings.join("; ")}`);
  }
  if (parsed.data.class !== "bigger" && !parsed.data.slug) {
    throw new FrontClassError(
      `class.yaml class "${parsed.data.class}" needs a task slug`,
    );
  }
  return parsed.data;
}

function lastReview(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
): StepRecord | undefined {
  const reviewIds = new Set(
    flow.steps.filter((s) => s.review).map((s) => s.id),
  );
  return records
    .filter((r) => r.slug === slug && reviewIds.has(r.step) && r.outcome)
    .sort(bySeq)
    .at(-1);
}

function lastChecks(
  records: StepRecord[],
  slug: string,
): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "checks")
    .sort(bySeq)
    .at(-1);
}

function lastMergeChecks(
  records: StepRecord[],
  slug: string,
): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "merge-checks")
    .sort(bySeq)
    .at(-1);
}

export function firstBase(
  records: StepRecord[],
  slug: string,
): string | undefined {
  return records
    .filter((r) => r.slug === slug && r.actor === "agent" && r.base)
    .sort(bySeq)[0]?.base;
}

export function flowOf(runtime: KernelRuntime, task: TaskFile): FlowDefinition {
  const flow = runtime.configs.process.flows[task.flow];
  if (!flow) throw new Error(`flow "${task.flow}" is not configured`);
  return flow;
}

export function findStep(flow: FlowDefinition, id: string): FlowStep {
  const step = flow.steps.find((s) => s.id === id);
  if (!step) throw new Error(`flow has no step "${id}"`);
  return step;
}

function stepIndex(flow: FlowDefinition, id: string): number {
  return flow.steps.findIndex((s) => s.id === id);
}

/** Gates run after the last productive step, immediately before a review (or the end). */
export function checksDue(flow: FlowDefinition, id: string): boolean {
  const next = flow.steps[stepIndex(flow, id) + 1];
  return !next || next.review === true;
}

export function isFixTurn(
  flow: FlowDefinition,
  state: TaskState,
  stepId: string,
): boolean {
  return (
    flow.steps[0]?.id === stepId && (state.round > 1 || state.gateFix === true)
  );
}

/**
 * Resolves a role to its alias, harness and model. A task tier names an alias
 * directly (`default` and absent mean no override); flows branch on this,
 * never on a harness id.
 */
export function resolveRole(
  runtime: KernelRuntime,
  role: string,
  tier?: string,
): RoleTarget {
  const roleConfig = runtime.configs.process.roles[role];
  if (!roleConfig) throw new Error(`process config has no role "${role}"`);
  const override = tier && tier !== "default" ? tier : undefined;
  const aliasName = override ?? roleConfig.alias ?? role;
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias)
    throw new Error(
      `run config has no alias "${aliasName}" (needed by role "${role}")`,
    );
  const harness = runtime.harnesses.get(alias.harness);
  if (!harness)
    throw new Error(
      `no harness "${alias.harness}" registered for alias "${aliasName}"`,
    );
  return {
    role,
    alias: aliasName,
    harness,
    model: {
      id: alias.model,
      ...(alias.effort ? { effort: alias.effort } : {}),
    },
    effort: alias.effort,
    fallbacks: alias.fallbacks,
    timeouts: alias.timeouts,
    opaque: runtime.configs.run.harnesses?.[alias.harness]?.acpx,
  };
}

/** The role that actually runs this step: a `different-model` fix turn overrides it. */
function stepRole(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): string {
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  const followUp = flow.followUp ?? { mode: "same-session" as const };
  if (followUp.mode === "different-model" && isFixTurn(flow, state, stepId)) {
    if (!followUp.role) {
      throw new Error(
        `flow "${task.flow}": follow-up mode different-model needs a role`,
      );
    }
    return followUp.role;
  }
  return step.role;
}

/**
 * The front alias is optional: when the run config has no `front` alias, the
 * front speaks through the `pm` alias, so the ladder needs no new required knob.
 */
export function frontTarget(runtime: KernelRuntime): RoleTarget {
  const configured = runtime.configs.process.roles.front;
  if (!configured) throw new Error('process config has no role "front"');
  const aliasName = configured.alias ?? "front";
  if (runtime.configs.run.aliases[aliasName])
    return resolveRole(runtime, "front");
  if (aliasName === "front" && runtime.configs.run.aliases.pm) {
    return resolveRole(runtime, "front", "pm");
  }
  throw new Error(
    `run config has no alias "${aliasName}" (needed by role "front") and no "pm" fallback`,
  );
}

function lastFrontRecord(records: StepRecord[]): StepRecord | undefined {
  return records
    .filter((r) => r.step === "front" && r.actor === "agent" && r.endedAt)
    .sort(bySeq)
    .at(-1);
}

/** The class.yaml names this task when its class is not bigger and the slug matches. */
function frontTaskClass(
  runtime: KernelRuntime,
  task: TaskFile,
): "trivial" | "task" | undefined {
  const cls = readFrontClass(runtime);
  if (!cls || cls.class === "bigger" || cls.slug !== task.slug)
    return undefined;
  return cls.class;
}

/**
 * The front's record proves the front ran and names the iteration whose pack is
 * the task's briefing.
 */
function frontPack(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
): string | undefined {
  if (!frontTaskClass(runtime, task)) return undefined;
  const front = lastFrontRecord(records);
  if (!front) return undefined;
  return path.join(runtime.store.goalDir, contextPackRelPath(front.iteration));
}

export function stepTarget(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): RoleTarget {
  const step = findStep(flowOf(runtime, task), stepId);
  const role = stepRole(runtime, task, state, stepId);
  // The ladder's "same agent": a trivial task runs its implement step on the
  // front's target, de novo in the task worktree. Fix turns keep that target,
  // so they resume the implement session by alias.
  if (
    !step.review &&
    role === "implementer" &&
    frontTaskClass(runtime, task) === "trivial"
  ) {
    // The front's alias and model run the turn, but the prompt stays the
    // implementer's: the role names the prompt, not the agent's history.
    return { ...frontTarget(runtime), role };
  }
  // A task tier escalates the producer; review keeps the reviewer alias.
  return resolveRole(runtime, role, step.review ? undefined : task.tier);
}

/** Resume the last session for this alias when it is portable to the alias's harness. */
export async function resumeSessionFor(
  runtime: KernelRuntime,
  task: TaskFile,
  alias: string,
  records: StepRecord[],
  worktree: string,
): Promise<SessionRef | undefined> {
  const prior = records
    .filter(
      (r) =>
        r.slug === task.slug &&
        r.actor === "agent" &&
        r.endedAt &&
        r.session &&
        r.alias === alias,
    )
    .sort(bySeq)
    .at(-1)?.session;
  if (!prior) return undefined;
  if (path.resolve(prior.cwd) !== path.resolve(worktree)) return undefined;
  // The alias may route elsewhere now (rotation, a changed run config): a
  // session is only portable to the harness that recorded it. Compaction is not
  // done here — a session is compacted by the turn that ended it.
  if (!portable(prior.harness, aliasHarness(runtime, alias))) return undefined;
  return prior;
}

function aliasHarness(runtime: KernelRuntime, alias: string): string {
  const configured = runtime.configs.run.aliases[alias];
  if (!configured) throw new Error(`run config has no alias "${alias}"`);
  return configured.harness;
}

/** Compaction is cache hygiene, not a gate; a failure keeps the uncompacted ref. */
export async function compactSession(
  runtime: KernelRuntime,
  session: SessionRef,
): Promise<SessionRef | undefined> {
  const harness = runtime.harnesses.get(session.harness);
  if (!harness?.compact) return undefined;
  try {
    const caps = await harness.caps(session.model);
    if (caps.compact === "none") return undefined;
    return await harness.compact(session);
  } catch {
    return undefined;
  }
}

export async function followUpSession(
  runtime: KernelRuntime,
  task: TaskFile,
  target: RoleTarget,
  records: StepRecord[],
  worktree: string,
): Promise<SessionRef | undefined> {
  const flow = flowOf(runtime, task);
  const followUp = flow.followUp ?? { mode: "same-session" as const };
  if (followUp.mode !== "same-session") return undefined;
  return resumeSessionFor(runtime, task, target.alias, records, worktree);
}

/** Prompt inputs shared by the implementer and reviewer templates. */
export function promptVars(
  runtime: KernelRuntime,
  task: TaskFile,
  worktree: string,
  records: StepRecord[],
  round: number,
  flow: FlowDefinition,
): Record<string, string> {
  const review = lastReview(records, task.slug, flow);
  const checks = lastChecks(records, task.slug);
  const mergeChecks = lastMergeChecks(records, task.slug);
  const latest = [review, checks, mergeChecks]
    .filter((r): r is StepRecord => Boolean(r))
    .sort(bySeq)
    .at(-1);
  const base = recordedBaseGates(records);
  const preexisting = preexistingRed(base);
  let findings = "";
  if (latest === review && review?.outcome)
    findings = formatReviewFindings(review.outcome);
  else if (latest?.checks)
    findings = formatFailingChecks(newGateFailures(latest.checks, preexisting));
  return {
    task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
    worktree,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands:
      runtime.configs.repo.gates
        .map((g) => `- ${g.id}: ${g.command}`)
        .join("\n") || "none",
    baseline_checks: base ? formatFailingChecks(base.checks) || "none" : "none",
    findings,
    round: String(round),
    base_hash: "",
    head_hash: "",
    max_rounds: String(flow.reviewRounds),
    prior_findings: review?.outcome ? formatReviewFindings(review.outcome) : "",
    front_pack: frontPack(runtime, task, records) ?? "",
  };
}
