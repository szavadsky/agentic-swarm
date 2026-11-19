import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import {
  type CompactResult,
  type Harness,
  type ModelRef,
  portable,
  type SessionRef,
} from "../harness/types.js";
import {
  formatBaseGates,
  preexistingRed,
  recordedBaseGates,
} from "./baseline.js";
import { contextPackRelPath } from "./context-pack.js";
import { formatFailingChecks, newGateFailures } from "./gates.js";
import { launchKindOf } from "./metrics.js";
import { taskOutcomeSchema } from "./outcome-schemas.js";
import { outcomeSchemaVar } from "./prompt-schema.js";
import { CHECK_HANDOFF_DEFAULTS, GATE_LAST_CALL_ASK } from "./prompts.js";
import { formatFixDispositions, formatReviewFindings } from "./record.js";
import { agentSteps, isLastChecksFixCall } from "./review.js";
import { sessionCacheHot } from "./sessions.js";
import { spikeReportPath } from "./spike-report.js";
import type {
  AliasConfig,
  BoundaryStep,
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  RepairSpec,
  StepRecord,
  TaskFile,
  TaskState,
  Timeouts,
  TurnSpec,
} from "./types.js";

/** One resolved fallback tier: the harness, model, effort and quota pool one call draws on. */
export interface ResolvedTier {
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
}

/** Pool key for quota tracking: explicit subscription, or harness+model when none. */
export function tierPoolKey(tier: {
  harness: Harness | string;
  model: ModelRef | string;
  subscription?: string;
}): string {
  if (tier.subscription) return tier.subscription;
  const harnessId =
    typeof tier.harness === "string" ? tier.harness : tier.harness.id;
  const modelId = typeof tier.model === "string" ? tier.model : tier.model.id;
  return `${harnessId}+${modelId}`;
}

/** Everything one turn needs to run: the resolved prompt, alias, harness, model and its own limits. */
export interface TurnTarget {
  /** Prompt template the turn renders; the role the agent acts as. */
  prompt: string;
  alias: string;
  /** Repair template the step named; absent renders `delivery-repair`. */
  repairPrompt?: string;
  /** Product the step named; absent derives from the turn's expectation. */
  deliverable?: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /**
   * Effective fallback chain, primary first: tiers whose quota pool is recorded
   * in `exhaustedPools` are dropped, so `[0]` mirrors the fields above.
   */
  tiers: ResolvedTier[];
  /** Chain index `tiers[0]` had in the alias's configured chain before exhausted tiers were dropped. */
  tierOffset: number;
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

/** The latest productive agent turn: the fix whose dispositions a deferred review judges. */
function lastProductiveTurn(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
): StepRecord | undefined {
  const productiveIds = new Set(
    flow.steps.filter((s) => !s.review).map((s) => s.id),
  );
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.actor === "agent" &&
        r.outcome &&
        productiveIds.has(r.step),
    )
    .sort(bySeq)
    .at(-1);
}

/**
 * The current fix round's per-finding dispositions for the deferred review:
 * every reply by its finding number, plus the fix summary. Round 1 has no fix
 * to judge, and a stale turn must never speak for this one.
 */
function fixDispositions(
  records: StepRecord[],
  slug: string,
  flow: FlowDefinition,
  round: number,
): string {
  if (round < 2) return "";
  const fix = lastProductiveTurn(records, slug, flow);
  if (!fix || fix.round !== round || !fix.outcome) return "";
  return formatFixDispositions(fix.outcome);
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

/**
 * The commit the task's current revision started from: the first agent record
 * stamped with that revision. Records without the field read as revision 0,
 * as derive treats them. An amend's first turn stamps the integration head it
 * merged, which is the range a review of the revised branch should judge.
 */
export function revisionBase(
  records: StepRecord[],
  slug: string,
  revision: number,
): string | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.actor === "agent" &&
        (r.revision ?? 0) === revision &&
        r.base,
    )
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

/** Gates run after the last productive step, immediately before a review (or the end). */
export function checksDue(flow: FlowDefinition, id: string): boolean {
  const steps = agentSteps(flow);
  const next = steps[steps.findIndex((s) => s.id === id) + 1];
  return !next || next.review === true;
}

export function isFixTurn(
  flow: FlowDefinition,
  state: TaskState,
  stepId: string,
): boolean {
  const steps = agentSteps(flow);
  return steps[0]?.id === stepId && (state.round > 1 || state.gateFix === true);
}

/** Counts red gate runs that requested a fix for the slug. */
export function countRedGateRequests(
  records: readonly StepRecord[],
  slug: string,
): number {
  let count = 0;
  for (const rec of records) {
    if (rec.slug !== slug || !rec.endedAt) continue;
    if (rec.step === "checks" && rec.ok === false) count += 1;
    else if (
      rec.step === "merge" &&
      rec.ok === false &&
      rec.cause?.startsWith("gates:")
    )
      count += 1;
  }
  return count;
}

/**
 * A turn target on a named alias. `resolveTurn` takes the prompt from the
 * configured step; callers that already hold it use this directly.
 */
function targetForAlias(
  runtime: KernelRuntime,
  prompt: string,
  aliasName: string,
  iteration?: number,
): TurnTarget {
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias)
    throw new Error(
      `run config has no alias "${aliasName}" (needed by prompt "${prompt}")`,
    );
  const chain = resolveChain(runtime, aliasName, iteration);
  const available = chain.filter(
    (tier) => !runtime.exhaustedPools.has(tierPoolKey(tier)),
  );
  const tiers = available.length > 0 ? available : [chain[chain.length - 1]!];
  const first = tiers[0]!;
  const offset = chain.indexOf(first);
  return {
    prompt,
    alias: aliasName,
    harness: first.harness,
    model: first.model,
    effort: first.effort,
    subscription: first.subscription,
    tiers,
    tierOffset: offset,
    timeouts: alias.timeouts,
    opaque: first.opaque,
  };
}

/**
 * The alias's primary entry for an iteration: its rotate entry when one is
 * configured, else the alias's own harness, model and effort. Iteration N
 * selects `rotate[N % rotate.length]`, so iteration 1 starts at index 1.
 */
function primaryEntry(
  alias: AliasConfig,
  iteration: number | undefined,
): { harness: string; model: string; effort?: string } {
  const rotate = alias.rotate ?? [];
  if (iteration === undefined || rotate.length === 0)
    return {
      harness: alias.harness,
      model: alias.model,
      ...(alias.effort ? { effort: alias.effort } : {}),
    };
  const entry = rotate[iteration % rotate.length]!;
  const effort = entry.effort ?? alias.effort;
  return {
    harness: entry.harness,
    model: entry.model,
    ...(effort ? { effort } : {}),
  };
}

/** Tiers accumulated for one chain, deduplicated across nested alias ladders. */
interface ChainTiers {
  seen: Set<string>;
  tiers: ResolvedTier[];
}

/** Adds one tier unless an earlier tier already names the same harness, model and effort. */
function pushTier(
  runtime: KernelRuntime,
  out: ChainTiers,
  owner: string,
  harnessId: string,
  modelId: string,
  effort: string | undefined,
  subscription: string | undefined,
): void {
  const key = `${harnessId}\u0000${modelId}\u0000${effort ?? ""}`;
  if (out.seen.has(key)) return;
  out.seen.add(key);
  const harness = runtime.harnesses.get(harnessId);
  if (!harness)
    throw new Error(
      `no harness "${harnessId}" registered for alias "${owner}"`,
    );
  out.tiers.push({
    harness,
    model: { id: modelId, ...(effort ? { effort } : {}) },
    ...(effort ? { effort } : {}),
    ...(subscription ? { subscription } : {}),
    opaque: runtime.configs.run.harnesses?.[harnessId]?.acpx,
  });
}

/**
 * Appends one alias's ladder to `out`: its primary for the iteration, then
 * each fallback in order. A literal fallback defaults its effort and
 * subscription to this alias's; a fallback that names another alias
 * contributes that alias's whole ladder on the same iteration, so each of its
 * tiers keeps the named alias's own defaults and quota pools. An alias already
 * on `path` is a cycle, refused at pre-flight and never walked twice here.
 */
function collectTiers(
  runtime: KernelRuntime,
  aliasName: string,
  iteration: number | undefined,
  path: readonly string[],
  out: ChainTiers,
): void {
  const alias = runtime.configs.run.aliases[aliasName]!;
  const primary = primaryEntry(alias, iteration);
  pushTier(
    runtime,
    out,
    aliasName,
    primary.harness,
    primary.model,
    primary.effort,
    alias.subscription,
  );
  for (const fallback of alias.fallbacks ?? []) {
    if ("alias" in fallback) {
      const target = fallback.alias;
      if (!runtime.configs.run.aliases[target])
        throw new Error(
          `fallback alias "${target}" names no run-config alias (needed by alias "${aliasName}")`,
        );
      if (path.includes(target))
        throw new Error(
          `fallback alias chain forms a cycle: ${[...path, target].join(" -> ")}`,
        );
      collectTiers(runtime, target, iteration, [...path, target], out);
      continue;
    }
    pushTier(
      runtime,
      out,
      aliasName,
      fallback.harness ?? primary.harness,
      fallback.model,
      fallback.effort ?? primary.effort,
      fallback.subscription ?? alias.subscription,
    );
  }
}

/**
 * The alias's full fallback chain, primary first, deduplicated by harness,
 * model and effort. A fallback names a model on another harness, or another
 * alias whose ladder is reused as-is.
 */
function resolveChain(
  runtime: KernelRuntime,
  aliasName: string,
  iteration?: number,
): ResolvedTier[] {
  const out: ChainTiers = { seen: new Set(), tiers: [] };
  collectTiers(runtime, aliasName, iteration, [aliasName], out);
  return out.tiers;
}

/** The harness a turn on this alias would actually start on. */
function effectiveAliasHarness(
  runtime: KernelRuntime,
  alias: string,
  iteration?: number,
): string {
  const chain = resolveChain(runtime, alias, iteration);
  const available = chain.filter(
    (tier) => !runtime.exhaustedPools.has(tierPoolKey(tier)),
  );
  const first = available[0] ?? chain[chain.length - 1]!;
  return first.harness.id;
}

/**
 * Resolves a configured prompt and alias for an iteration. `aliasOverride` is
 * a task tier or a PM rung (`default` means no override); flows branch on the
 * resolved alias, never on a harness id. An alias with `rotate` resolves the
 * iteration's entry as its primary; omitting the iteration resolves the
 * alias's own primary, for callers that need only its identity.
 */
export function resolveTurn(
  runtime: KernelRuntime,
  prompt: string,
  aliasName: string,
  aliasOverride?: string,
  iteration?: number,
): TurnTarget {
  const override =
    aliasOverride && aliasOverride !== "default" ? aliasOverride : undefined;
  return targetForAlias(runtime, prompt, override ?? aliasName, iteration);
}

/** A step's repair ask; absent fields stay absent so the kernel default applies. */
function repairFields(
  spec: RepairSpec,
): Pick<TurnTarget, "repairPrompt" | "deliverable"> {
  return {
    repairPrompt: spec.repairPrompt,
    deliverable: spec.deliverable,
  };
}

/** Resolves one kernel boundary step from process config. */
export function boundaryTarget(
  runtime: KernelRuntime,
  step: BoundaryStep,
  iteration?: number,
  aliasOverride?: string,
): TurnTarget {
  const spec: TurnSpec | undefined = runtime.configs.process.boundary[step];
  if (!spec) throw new Error(`process config has no boundary step "${step}"`);
  return {
    ...resolveTurn(runtime, spec.prompt, spec.alias, aliasOverride, iteration),
    ...repairFields(spec),
  };
}

/**
 * The prompt and alias that actually run this step: a `different-model` fix
 * turn keeps the step's prompt and moves to the follow-up alias.
 */
function stepTurn(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): TurnSpec {
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  if (!step.prompt || !step.alias) {
    throw new Error(
      `flow "${task.flow}": step "${stepId}" needs a prompt and an alias`,
    );
  }
  const followUp = flow.followUp ?? { mode: "same-session" as const };
  if (followUp.mode === "different-model" && isFixTurn(flow, state, stepId)) {
    if (!followUp.alias) {
      throw new Error(
        `flow "${task.flow}": follow-up mode different-model needs an alias`,
      );
    }
    return {
      prompt: step.prompt,
      alias: followUp.alias,
      repairPrompt: step.repairPrompt,
      deliverable: step.deliverable,
    };
  }
  return {
    prompt: step.prompt,
    alias: step.alias,
    repairPrompt: step.repairPrompt,
    deliverable: step.deliverable,
  };
}

/** The front's configured boundary target. */
export function frontTarget(
  runtime: KernelRuntime,
  iteration?: number,
): TurnTarget {
  return boundaryTarget(runtime, "front", iteration);
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

/** A task the front classified without an architect: class.yaml names its slug. */
export function isStandaloneTask(
  runtime: KernelRuntime,
  task: TaskFile,
): boolean {
  return frontTaskClass(runtime, task) !== undefined;
}

/**
 * The escalation ask for a standalone review, empty for architect-plan tasks.
 * Rendered as the reviewer's `upscope_ask` variable; the reviewer answers it
 * as `upscope: yes|no` alongside its verdict.
 */
export function standaloneUpscopeAsk(
  runtime: KernelRuntime,
  task: TaskFile,
): string {
  if (!isStandaloneTask(runtime, task)) return "";
  return (
    "This is a standalone task: no architect planned it. Is the real scope " +
    "substantially higher than the front's predicted area above, and does the " +
    "result require architecture input? Answer `upscope: yes` to park and " +
    "escalate the goal to bigger, or `upscope: no` to judge normally. Always " +
    "include your verdict; an upscope yes parks regardless of it."
  );
}

/** Rewrites the front class to bigger so the next launch runs the architect. */
export function escalateFrontClassToBigger(runtime: KernelRuntime): void {
  const file = path.join(runtime.store.goalDir, CLASS_FILE);
  fs.writeFileSync(file, yaml.stringify({ class: "bigger" }), "utf8");
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

/**
 * The ladder's "same agent": a trivial task runs its implement step on the
 * front's target, in the front's session. Fix turns keep that target, so they
 * resume the same session chain by alias.
 */
export function isTrivialImplementTurn(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
): boolean {
  const step = findStep(flowOf(runtime, task), stepId);
  return (
    !step.review &&
    stepTurn(runtime, task, state, stepId).prompt === "implementer" &&
    frontTaskClass(runtime, task) === "trivial"
  );
}

/**
 * How many failure-kind launches the step has ended for this task: its
 * alternate position. An agent turn counts when its launch kind is `failure`, and
 * an exhausted gate-fix loop counts for the flow's productive step (the fix
 * step the checks sent back). Records are the only input, so a relaunch derives
 * the same position.
 */
export function alternatePosition(
  records: readonly StepRecord[],
  slug: string,
  stepId: string,
  flow: FlowDefinition,
): number {
  const fixStep = agentSteps(flow)[0]?.id;
  let failures = 0;
  for (const rec of records) {
    if (rec.slug !== slug || !rec.endedAt) continue;
    if (rec.step === stepId) {
      if (rec.actor === "agent" && launchKindOf(rec) === "failure")
        failures += 1;
    } else if (
      stepId === fixStep &&
      rec.step === "park" &&
      rec.cause?.startsWith("gates:")
    ) {
      // Fix rounds exhausted on red gates: the fix turn ran out of rounds, so
      // the next attempt at the productive step starts on the next alternate.
      failures += 1;
    }
  }
  return failures;
}

/**
 * The alias a step runs on at this position: its own alias at zero, then the
 * alternates in order, staying on the last one once the list is spent so a
 * later amend cannot cycle back to a model that already failed.
 */
function alternateAlias(step: FlowStep, position: number): string | undefined {
  const alternates = step.alternates ?? [];
  if (position <= 0 || alternates.length === 0) return undefined;
  return alternates[Math.min(position, alternates.length) - 1];
}

export function stepTarget(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  stepId: string,
  iteration: number,
  records: readonly StepRecord[] = [],
): TurnTarget {
  if (isTrivialImplementTurn(runtime, task, state, stepId)) {
    // The front's alias and model run the turn, but the prompt stays the
    // implementer's: the prompt names the role, not the agent's history.
    const turn = stepTurn(runtime, task, state, stepId);
    return {
      ...frontTarget(runtime, iteration),
      ...repairFields(turn),
      prompt: turn.prompt,
    };
  }
  const flow = flowOf(runtime, task);
  const step = findStep(flow, stepId);
  const turn = stepTurn(runtime, task, state, stepId);
  const alternate = alternateAlias(
    step,
    alternatePosition(records, task.slug, stepId, flow),
  );
  // A `different-model` follow-up names the fix turn's own alias: it is more
  // specific than the step's alternates. A task tier still escalates the
  // producer, alternate or not.
  const alias =
    turn.alias === step.alias ? (alternate ?? turn.alias) : turn.alias;
  return {
    ...resolveTurn(
      runtime,
      turn.prompt,
      alias,
      step.review ? undefined : task.tier,
      iteration,
    ),
    ...repairFields(turn),
  };
}

/** Resume the last session for this alias when it is portable to the turn's harness. */
export async function resumeSessionFor(
  runtime: KernelRuntime,
  task: TaskFile,
  alias: string,
  records: StepRecord[],
  worktree: string,
  iteration?: number,
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
  // The alias may route elsewhere now (a working fallback tier, a changed run
  // config): a session is only portable to the harness that recorded it.
  // Compaction is not done here — a session is compacted by the turn that ended it.
  if (!runtime.configs.run.aliases[alias])
    throw new Error(`run config has no alias "${alias}"`);
  if (
    !portable(prior.harness, effectiveAliasHarness(runtime, alias, iteration))
  )
    return undefined;
  return prior;
}

/** Compaction is cache hygiene, not a gate; a failure keeps the uncompacted ref. */
export async function compactSession(
  runtime: KernelRuntime,
  session: SessionRef,
): Promise<CompactResult | undefined> {
  if (!sessionCacheHot(session)) return undefined;
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
  target: TurnTarget,
  records: StepRecord[],
  worktree: string,
  iteration?: number,
): Promise<SessionRef | undefined> {
  const flow = flowOf(runtime, task);
  const followUp = flow.followUp ?? { mode: "same-session" as const };
  if (followUp.mode !== "same-session") return undefined;
  return resumeSessionFor(
    runtime,
    task,
    target.alias,
    records,
    worktree,
    iteration,
  );
}
/**
 * Resume the last review session for this review step on this alias. Keyed on
 * the step, as `followUpSession` is keyed on the implement alias: the reviewer
 * resumes only its own session, never the implementer's, even when both roles
 * share one alias. A first round has no prior and starts de novo silently; a
 * prior that cannot be resumed (alias change, harness rotation, cwd mismatch,
 * a harness that cannot resume) starts de novo with the reason logged (R2).
 */
export async function reviewSession(
  runtime: KernelRuntime,
  task: TaskFile,
  target: TurnTarget,
  stepId: string,
  records: StepRecord[],
  worktree: string,
): Promise<SessionRef | undefined> {
  const priors = records
    .filter(
      (r) =>
        r.slug === task.slug &&
        r.actor === "agent" &&
        r.endedAt &&
        r.session &&
        r.step === stepId,
    )
    .sort(bySeq);
  if (priors.length === 0) return undefined;
  const onAlias = priors.filter((r) => r.alias === target.alias).at(-1);
  if (!onAlias?.session) {
    const priorAlias = priors.at(-1)?.alias ?? "unknown";
    console.warn(
      `[factory] review "${task.slug}" step "${stepId}" starts de novo: ` +
        `alias changed from "${priorAlias}" to "${target.alias}"`,
    );
    return undefined;
  }
  const prior = onAlias.session;
  let resumable = false;
  try {
    resumable = (await target.harness.caps(target.model)).resume;
  } catch {
    resumable = false;
  }
  if (!resumable) {
    console.warn(
      `[factory] review "${task.slug}" step "${stepId}" starts de novo: ` +
        `harness "${target.harness.id}" cannot resume sessions`,
    );
    return undefined;
  }
  if (path.resolve(prior.cwd) !== path.resolve(worktree)) {
    console.warn(
      `[factory] review "${task.slug}" step "${stepId}" starts de novo: ` +
        `session cwd "${prior.cwd}" does not match worktree "${worktree}"`,
    );
    return undefined;
  }
  const current = target.harness.id;
  if (!portable(prior.harness, current)) {
    console.warn(
      `[factory] review "${task.slug}" step "${stepId}" starts de novo: ` +
        `harness "${prior.harness}" is not portable to alias harness "${current}"`,
    );
    return undefined;
  }
  return prior;
}

/** The head the last turn of this step left; a resumed review diffs since it. */
export function priorStepCommit(
  records: StepRecord[],
  slug: string,
  stepId: string,
  revision: number,
): string | undefined {
  return records
    .filter(
      (r) =>
        r.slug === slug &&
        r.step === stepId &&
        r.endedAt &&
        r.commit &&
        (r.revision ?? 0) === revision,
    )
    .sort(bySeq)
    .at(-1)?.commit;
}

/** The session a trivial implement turn resumes, or why the task parks instead. */
export type TrivialResume = { session: SessionRef } | { cause: string };

/**
 * The front's own session for a trivial implement turn: the front record's
 * session on a first turn, the last session on the front alias on a fix turn.
 * Unlike `resumeSessionFor` there is no worktree-cwd match — the turn resumes
 * with the session's recorded cwd and the prompt names the absolute worktree
 * instead (harness sessions are cwd-bound). A harness whose probe reports no
 * resume, or no session on record, parks with a cause: a trivial turn never
 * starts de novo silently.
 */
export async function trivialResumeSession(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
  isFix: boolean,
  iteration: number,
): Promise<TrivialResume> {
  const target = frontTarget(runtime, iteration);
  let resumable = false;
  try {
    resumable = (await target.harness.caps(target.model)).resume;
  } catch {
    resumable = false;
  }
  if (!resumable) {
    return {
      cause:
        `harness "${target.harness.id}" cannot resume sessions, ` +
        `so trivial task "${task.slug}" cannot implement in the front's session`,
    };
  }
  const current = target.harness.id;
  const kept = (ref: SessionRef | undefined): SessionRef | undefined =>
    ref && portable(ref.harness, current) ? ref : undefined;
  if (isFix) {
    const own = records
      .filter(
        (r) =>
          r.slug === task.slug &&
          r.actor === "agent" &&
          r.endedAt &&
          r.session &&
          r.alias === target.alias,
      )
      .sort(bySeq)
      .at(-1)?.session;
    const resumed = kept(own) ?? kept(lastFrontRecord(records)?.session);
    if (resumed) return { session: resumed };
    return {
      cause:
        `trivial task "${task.slug}" has no session to resume ` +
        `on alias "${target.alias}"`,
    };
  }
  const front = lastFrontRecord(records)?.session;
  if (!front) {
    return {
      cause:
        `trivial task "${task.slug}" has no front session to resume; ` +
        `the front turn left no session record`,
    };
  }
  if (!portable(front.harness, current)) {
    return {
      cause:
        `trivial task "${task.slug}" cannot resume its front session: ` +
        `harness "${front.harness}" is not the front alias harness "${current}"`,
    };
  }
  return { session: front };
}

/**
 * The follow-up notice for a turn resumed in the front's session: the task
 * branch plus the absolute-path rules. The session's tools still run in the
 * front's cwd, so relative paths would land in the goal checkout instead of
 * the worktree — the notice makes the absolute worktree the only workplace.
 * The leading newline separates it from the `worktree:` line it follows; a
 * de-novo turn renders `resume_note` as the empty string instead.
 */
export function trivialResumeNote(
  sessionCwd: string,
  worktree: string,
  branch: string,
): string {
  return [
    "",
    `- branch: \`${branch}\``,
    `- resume: this turn continues your front session; your tools run in \`${sessionCwd}\`, not the worktree. ` +
      `Do all work under the absolute worktree path \`${worktree}\` — relative paths land in the session directory, outside your assignment. ` +
      `Never write outside the worktree: the script rejects the turn on any change there.`,
  ].join("\n");
}

/** Prompt inputs shared by the implementer and reviewer templates. */
export function promptVars(
  runtime: KernelRuntime,
  task: TaskFile,
  worktree: string,
  records: StepRecord[],
  round: number,
  flow: FlowDefinition,
  state?: TaskState,
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

  const isGateLastCall =
    state?.gateLastCall === true ||
    (state === undefined &&
      (latest === checks || latest === mergeChecks) &&
      isLastChecksFixCall(flow, countRedGateRequests(records, task.slug)));
  if (isGateLastCall) {
    findings = findings
      ? `${GATE_LAST_CALL_ASK}\n\n${findings}`
      : GATE_LAST_CALL_ASK;
  }

  return {
    task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
    worktree,
    // Where a spike commits its finding; empty for every other task.
    report_path: task.kind === "spike" ? spikeReportPath(task.slug) : "",
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands:
      runtime.configs.repo.gates
        .map((g) => `- ${g.id}: ${g.command}`)
        .join("\n") || "none",
    base_gates: formatBaseGates(base),
    findings,
    checks_result: checks?.checks
      ? formatFailingChecks(checks.checks) || "pass"
      : CHECK_HANDOFF_DEFAULTS.checks_result,
    checks_tree: checks?.tree ?? CHECK_HANDOFF_DEFAULTS.checks_tree,
    checks_log: checks
      ? path.join(
          runtime.store.recordsDir,
          checks.iteration.toString(),
          checks.slug ?? "unknown",
          checks.step,
        )
      : CHECK_HANDOFF_DEFAULTS.checks_log,
    round: String(round),
    base_hash: "",
    head_hash: "",
    prior_findings: review?.outcome ? formatReviewFindings(review.outcome) : "",
    fix_dispositions: fixDispositions(records, task.slug, flow, round),
    front_pack: frontPack(runtime, task, records) ?? "",
    // The standalone escalation ask for the reviewer; empty when this task is
    // part of an architect plan. The implementer template ignores it.
    upscope_ask: standaloneUpscopeAsk(runtime, task),
    // A de-novo turn carries no follow-up notice; the trivial path overrides
    // this with `trivialResumeNote` before rendering the implement prompt.
    resume_note: "",
    // The task type's output schema, not the role's: a spike and a development
    // task may deliver different shapes even when the same role runs both.
    outcome_schema: outcomeSchemaVar(
      undefined,
      taskOutcomeSchema(task, runtime.configs.process.taskTypes),
    ),
  };
}
