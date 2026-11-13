import path from "node:path";
import type { SessionRef } from "../harness/types.js";
import { formatFailingChecks } from "./gates.js";
import { formatConcerns } from "./record.js";
import type {
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

export interface RoleTarget {
  role: string;
  alias: string;
  harnessId: string;
  model: { id: string; effort?: string };
  effort?: string;
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

/** Resolves a role to its alias and harness; flows branch on this, never on a harness id. */
export function resolveRole(runtime: KernelRuntime, role: string): RoleTarget {
  const roleConfig = runtime.configs.process.roles[role];
  if (!roleConfig) throw new Error(`process config has no role "${role}"`);
  const aliasName = roleConfig.alias ?? role;
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias) throw new Error(`run config has no alias "${aliasName}" (needed by role "${role}")`);
  return {
    role,
    alias: aliasName,
    harnessId: alias.harness,
    model: { id: alias.model, ...(alias.effort ? { effort: alias.effort } : {}) },
    effort: alias.effort,
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
  return resolveRole(runtime, stepRole(runtime, task, state, stepId));
}

/** Resume + compact the last session for this alias in this worktree. */
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
  if (prior.compacted) return prior;
  const harness = runtime.harnesses.get(prior.harness);
  if (!harness) return prior;
  try {
    const caps = await harness.caps(prior.model);
    if (caps.compact !== "none" && harness.compact) return await harness.compact(prior);
  } catch {
    // Cache hygiene only; an uncompacted resume is still a valid session.
  }
  return prior;
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
  let findings = "";
  if (latest === review && review?.outcome) findings = formatConcerns(review.outcome);
  else if (latest?.checks) findings = formatFailingChecks(latest.checks);
  return {
    task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
    worktree,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: runtime.configs.repo.gates.map((g) => `- ${g.id}: ${g.command}`).join("\n") || "none",
    baseline_checks: checks?.checks ? formatFailingChecks(checks.checks) || "none" : "none",
    findings,
    round: String(round),
    base_hash: "",
    head_hash: "",
    max_rounds: String(flow.reviewRounds),
    prior_findings: review?.outcome ? formatConcerns(review.outcome) : "",
  };
}
