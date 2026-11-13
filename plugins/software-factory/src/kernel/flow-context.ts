import path from "node:path";
import { portable, type Harness, type ModelRef, type SessionRef } from "../harness/types.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { formatFailingChecks, newGateFailures } from "./gates.js";
import { formatConcerns } from "./record.js";
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
}

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

function lastReview(records: StepRecord[], slug: string, flow: FlowDefinition): StepRecord | undefined {
  const reviewIds = new Set(flow.steps.filter((s) => s.review).map((s) => s.id));
  return records
    .filter((r) => r.slug === slug && reviewIds.has(r.step) && r.outcome)
    .sort(bySeq)
    .at(-1);
}

function lastChecks(records: StepRecord[], slug: string): StepRecord | undefined {
  return records.filter((r) => r.slug === slug && r.step === "checks").sort(bySeq).at(-1);
}

function lastMergeChecks(records: StepRecord[], slug: string): StepRecord | undefined {
  return records.filter((r) => r.slug === slug && r.step === "merge-checks").sort(bySeq).at(-1);
}

export function firstBase(records: StepRecord[], slug: string): string | undefined {
  return records.filter((r) => r.slug === slug && r.actor === "agent" && r.base).sort(bySeq)[0]?.base;
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

export function isFixTurn(flow: FlowDefinition, state: TaskState, stepId: string): boolean {
  return flow.steps[0]?.id === stepId && (state.round > 1 || state.gateFix === true);
}

/**
 * Resolves a role to its alias, harness and model. A task tier names an alias
 * directly (`default` and absent mean no override); flows branch on this,
 * never on a harness id.
 */
export function resolveRole(runtime: KernelRuntime, role: string, tier?: string): RoleTarget {
  const roleConfig = runtime.configs.process.roles[role];
  if (!roleConfig) throw new Error(`process config has no role "${role}"`);
  const override = tier && tier !== "default" ? tier : undefined;
  const aliasName = override ?? roleConfig.alias ?? role;
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias) throw new Error(`run config has no alias "${aliasName}" (needed by role "${role}")`);
  const harness = runtime.harnesses.get(alias.harness);
  if (!harness) throw new Error(`no harness "${alias.harness}" registered for alias "${aliasName}"`);
  return {
    role,
    alias: aliasName,
    harness,
    model: { id: alias.model, ...(alias.effort ? { effort: alias.effort } : {}) },
    effort: alias.effort,
    fallbacks: alias.fallbacks,
    timeouts: alias.timeouts,
  };
}

/** The role that actually runs this step: a `different-model` fix turn overrides it. */
function stepRole(runtime: KernelRuntime, task: TaskFile, state: TaskState, stepId: string): string {
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  const followUp = flow.followUp ?? { mode: "same-session" as const };
  if (followUp.mode === "different-model" && isFixTurn(flow, state, stepId)) {
    if (!followUp.role) {
      throw new Error(`flow "${task.flow}": follow-up mode different-model needs a role`);
    }
    return followUp.role;
  }
  return step.role;
}

export function stepTarget(runtime: KernelRuntime, task: TaskFile, state: TaskState, stepId: string): RoleTarget {
  // A task tier escalates the producer; review keeps the reviewer alias.
  const step = findStep(flowOf(runtime, task), stepId);
  return resolveRole(runtime, stepRole(runtime, task, state, stepId), step.review ? undefined : task.tier);
}

/** Resume the last session for this alias when it is portable to the alias's harness. */
export async function resumeSessionFor(
  runtime: KernelRuntime,
  task: TaskFile,
  alias: string,
  records: StepRecord[],
  worktree: string
): Promise<SessionRef | undefined> {
  const prior = records
    .filter((r) => r.slug === task.slug && r.actor === "agent" && r.endedAt && r.session && r.alias === alias)
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

/**
 * The front turn's session for a trivial task's first implement turn. A resume
 * is cwd-bound, and the front runs in the goal checkout while the task runs in
 * its own worktree, so this fires only when the stored ref is bound to that
 * worktree; the alias must also route to the harness that recorded it. Either
 * miss starts the implement turn de novo with the front's pack.
 */
export function frontSessionFor(
  runtime: KernelRuntime,
  alias: string,
  records: StepRecord[],
  worktree: string
): SessionRef | undefined {
  const prior = records
    .filter((r) => r.step === "front" && r.actor === "agent" && r.endedAt && r.session)
    .sort(bySeq)
    .at(-1)?.session;
  if (!prior) return undefined;
  if (path.resolve(prior.cwd) !== path.resolve(worktree)) return undefined;
  if (!portable(prior.harness, aliasHarness(runtime, alias))) return undefined;
  return prior;
}

/** Compaction is cache hygiene, not a gate; a failure keeps the uncompacted ref. */
export async function compactSession(runtime: KernelRuntime, session: SessionRef): Promise<SessionRef | undefined> {
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
  worktree: string
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
  flow: FlowDefinition
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
  if (latest === review && review?.outcome) findings = formatConcerns(review.outcome);
  else if (latest?.checks) findings = formatFailingChecks(newGateFailures(latest.checks, preexisting));
  return {
    task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
    worktree,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: runtime.configs.repo.gates.map((g) => `- ${g.id}: ${g.command}`).join("\n") || "none",
    baseline_checks: base ? formatFailingChecks(base.checks) || "none" : "none",
    findings,
    round: String(round),
    base_hash: "",
    head_hash: "",
    max_rounds: String(flow.reviewRounds),
    prior_findings: review?.outcome ? formatConcerns(review.outcome) : "",
  };
}
