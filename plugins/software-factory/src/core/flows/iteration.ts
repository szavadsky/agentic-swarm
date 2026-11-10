import fs from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  DecisionArtifact,
  GateBaselineEntry,
  PlanArtifact,
  PlanCloseupArtifact,
  PlanEditsArtifact,
  PlanItemOutline,
  PipelineConfig,
  ProjectConfig,
  WaveCloseupArtifact,
  ReviewArtifact,
  StepMetaArtifact,
  SteerItemArtifact,
  GatesBaselineArtifact,
  InfraArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import { childBranch } from "../git/naming.js";
import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js";
import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
import { runAgentStep, findOkCommittedRecord, getNextStepAttempt } from "./step-runner.js";
import { parseStepRecordDirName } from "../records/step-record.js";
import { writeQuestion, processSteeringMailbox } from "../steer.js";
import { persistAdrs } from "./adrs.js";
import { runItemConsult, runNonItemConsult, runConcernConsult } from "./consults.js";
import { isContextPackStale, isContextPackEnabled, runContextPackStep } from "./ingest.js";
import { mergeItem, MAX_MERGE_ATTEMPTS_PER_WAVE, readMergeAttempts, writeMergeTargetOverride } from "./merge-path.js";
import { tickItemMachine, persistTerminalAbandon } from "./item-machine.js";
import { deriveItemState, withRoutedBlocking, type DerivedItemState } from "../derive/item.js";
import { blockedByConcern } from "../plan/scheduler.js";
import { deriveWaveState, isIterationTerminal, nonTerminalWaveItems, type DerivedWaveState } from "../derive/wave.js";
import { refreshStateYaml, countCommittedCloseupIterations, collectRoutedBlockers } from "../derive/task.js";
import { appendJournal, readJournal } from "../journal.js";
import type { JournalEvent } from "../journal.js";
import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
import {
  listConcernIds,
  listConcerns,
  partitionSuggestions,
} from "../concerns.js";
import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
import { validateEdits, checkPlanCountLimits, formatAmendLimitsBlock } from "../plan/limits.js";
import { applyEdits } from "../plan/apply.js";
import { getClock } from "../clock.js";
import { buildGateDiffSection, runGates } from "../checks/gates.js";
import type { CheckContext } from "../checks/types.js";
import { sanitizeDeveloperTarget } from "../checks/junit.js";
import { formatKnownGateTargets, resolveGateTarget } from "../checks/gate-target.js";
import { isUnknownGateTargetError } from "../checks/runner.js";
import { buildArchitectBrief } from "../brief.js";
import { PersistentAgent } from "../sessions.js";
import { Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";

async function findOkCommittedRevise(
  runsDir: string,
  iteration: number,
  taskWt: string,
  maxRounds = 5
): Promise<boolean> {
  for (let r = 1; r <= maxRounds; r++) {
    if (await findOkCommittedRecord(runsDir, `architect-revise-${iteration}-${r}`, taskWt)) {
      return true;
    }
  }
  return false;
}

/**
 * Outline-counts pre-check message → repair prompt (§8.4.2a). Names concrete
 * counts and the remedy so the architect consolidates outlines, splits across
 * milestones, or defers via replanAfter — never just renumbers slugs.
 */
export function buildPlanLimitsRepairFeedback(violations: string[]): string {
  return `Your plan violates pipeline outline-count limits (deterministic check, not reviewer opinion):\n${violations.map((e) => `- ${e}`).join("\n")}\nConsolidate outlines, split milestones, or defer lower-priority outlines to a later iteration via replanAfter (do not just renumber slugs or drop scope silently). Yield the corrected full plan.`;
}

/**
 * Formats validated limit violations for the plan-reviewer prompt var
 * {{limitViolations}}: explicit FAIL directive when non-empty, "none" when clean.
 */
export function formatLimitViolationsVar(violations: string[]): string {
  if (violations.length === 0) return "none";
  return `Deterministic limit check FAILED — you MUST emit a fix-disposition suggestion for each:\n${violations.map((e) => `- ${e}`).join("\n")}`;
}

/**
 * Re-drive bound for the iteration-complete gate (§8.4.7). Each round
 * re-merges ready items / ticks mid-flow items and re-derives; the bound only
 * fires when the non-terminal set persists, i.e. nothing is progressing.
 */
export const MAX_ITERATION_REDRIVES = 5;

/**
 * Last actionable failure per stalled item, drawn from the journal events the
 * redrive rounds wrote (`item_merge_failed`, `merge_failed_terminal`,
 * `iteration_redrive_error`). The stall error names WHAT kept the item
 * non-terminal instead of only re-listing slugs — the modernize stall message
 * gave no reason, so five re-drives looked like a mystery loop.
 */
export function lastIterationFailureEvidence(
  events: JournalEvent[],
  slugs: string[]
): Record<string, string> {
  const wanted = new Set(slugs);
  const out: Record<string, string> = {};
  const kinds = new Set([
    "item_merge_failed",
    "merge_failed_terminal",
    "iteration_redrive_error",
    "step_failed",
    "item_failed",
  ]);
  for (const e of events) {
    const slug = typeof e.item === "string" ? e.item : undefined;
    if (!slug || !wanted.has(slug) || !kinds.has(e.type)) continue;
    const err =
      typeof e.error === "string"
        ? e.error
        : typeof e.reason === "string"
          ? e.reason
          : undefined;
    if (!err) continue;
    out[slug] = err.length > 300 ? `${err.slice(0, 300)}…` : err;
  }
  return out;
}

/**
 * Terminal stall message for the iteration-complete gate. Lists each
 * non-terminal item WITH its status and last failure evidence, states why
 * closing is refused (unmerged/mid-flow work would be stranded off the
 * integration branch), and points at the concrete fix.
 */
export function formatIterationStallReason(
  iteration: number,
  offenders: Array<{ slug: string; status: string }>,
  evidence: Record<string, string> = {}
): string {
  const items = offenders.map((it) => {
    const ev = evidence[it.slug];
    return `${it.slug} (${it.status}${ev ? `; last failure: ${ev}` : "; no failure evidence recorded"})`;
  });
  const hasReady = offenders.some((it) => it.status === "ready");
  return [
    `Iteration ${iteration} stalled with non-terminal items after ${MAX_ITERATION_REDRIVES} re-drives: ${items.join(", ")}.`,
    hasReady
      ? "Ready items are review-passed but UNMERGED; their merge verify keeps failing, so closing the iteration would strand their work off the integration branch."
      : "Pending/running items never reached a terminal state, so closing the iteration would strand mid-flow work.",
    "Refusing plan-close-up. Fix the named failure (merge gates / target-green / the item step), then restart.",
  ].join(" ");
}


/**
 * PM bounce marker (§8.4.4a): records that the once-per-iteration architect
 * bounce for pm-edits validation failures has been taken. Bound: exactly 1
 * per iteration; derived from the bounce record name `architect-pmfix-N`.
 */
export async function hasPmfixBounce(runsDir: string, iteration: number, taskWt: string): Promise<boolean> {
  return (await findOkCommittedRecord(runsDir, `architect-pmfix-${iteration}`, taskWt)) !== null;
}

/**
 * Next never-used attempt number for a step (max existing + 1, or 1 when no
 * records exist). Used for deliberate fresh re-runs (plan-limits repair, PM
 * bounce re-run) where getNextStepAttempt's reuse numbering would collide with
 * the turn being repaired.
 */
export function nextFreshAttempt(runsDir: string, stepId: string): number {
  if (!fs.existsSync(runsDir)) return 1;
  let max = 0;
  for (const e of fs.readdirSync(runsDir)) {
    const parsed = parseStepRecordDirName(e);
    if (parsed && parsed.name === stepId && parsed.attempt > max) max = parsed.attempt;
  }
  return max + 1;
}

export interface IterationParams {
  task: string;
  taskDir: string;
  taskWt: string;
  parentBranch?: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  budgetTracker?: BudgetTracker;
  turnsSemaphore?: Semaphore;
  architectSessionId?: string;
  runTaskChild?: (epicSlug: string) => Promise<any>;
  log?: (msg: string) => void;
  isChildTask?: boolean;
  rootTaskWt?: string;
  rootTaskDir?: string;
  rootTask?: string;
}

export interface IterationResult {
  iteration: number;
  status: "done" | "next-iteration" | "blocked" | "failed" | "stopped";
  plan?: PlanArtifact;
  lastCloseup?: PlanCloseupArtifact;
  architectSessionId?: string;
}

/**
 * Builds the kinds criteria prompt description and valid kind names from pipeline config (§8.3, §10).
 */
function buildKindsPromptVar(
  pipeline: PipelineConfig,
  isRootTask: boolean
): { kindsDescription: string; validKindNames: string[] } {
  const storyKinds = pipeline.flows?.story ?? {};
  const spikeKinds = pipeline.flows?.spike ?? {};
  const lines: string[] = [];
  const validKindNames: string[] = [];

  for (const [k, cfg] of Object.entries(storyKinds)) {
    validKindNames.push(k);
    lines.push(`- **${k}**: ${cfg.criteria ?? "story implementation"}`);
  }
  for (const [k, cfg] of Object.entries(spikeKinds)) {
    validKindNames.push(k);
    lines.push(`- **${k}**: ${cfg.criteria ?? "spike research"}`);
  }
  if (isRootTask) {
    validKindNames.push("epic");
    lines.push(`- **epic**: large multi-milestone initiative decomposed into child iterations`);
  }
  return { kindsDescription: lines.join("\n"), validKindNames };
}

/**
 * Builds the compact {{taskStatus}} block from derived state (§8.4, §10).
 * Items: slug/kind/wave/status/outlineRef; waves + merged/blocked/failed lists;
 * open steer questions with answers. Deterministic: no fallbacks, no swallowed
 * errors — corrupt files throw like the rest of the iteration flow.
 */
export async function buildTaskStatusBlock(opts: {
  taskDir: string;
  taskWt: string;
  parentBranch: string;
  itemSlugs: string[];
  iteration: number;
  amendmentCount: number;
  pipeline: PipelineConfig;
  rootTaskDir?: string;
}): Promise<string> {
  const { taskDir, taskWt, parentBranch, itemSlugs, iteration, amendmentCount, pipeline } = opts;
  const lines: string[] = [`iteration: ${iteration}`, `amendments: ${amendmentCount}`];

  const states = await Promise.all(
    itemSlugs.map((slug) =>
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: opts.rootTaskDir })
    )
  );
  lines.push("items:");
  if (states.length === 0) {
    lines.push("  (none scheduled yet)");
  }
  for (const st of states) {
    lines.push(
      `  - ${st.slug} kind=${st.kind} wave=${st.wave} status=${st.status} outlineRef=${st.assignment?.outlineRef ?? "(none)"}`
    );
  }

  const waves = [...new Set(states.map((s) => s.wave))].sort((a, b) => a - b);
  lines.push(`waves: ${waves.length > 0 ? waves.join(", ") : "(none)"}`);
  const byStatus = (s: string) => states.filter((st) => st.status === s).map((st) => st.slug);
  lines.push(`merged: ${byStatus("merged").join(", ") || "(none)"}`);
  lines.push(`blocked: ${byStatus("blocked").join(", ") || "(none)"}`);
  lines.push(`failed: ${byStatus("failed").join(", ") || "(none)"}`);

  const steerDirs = [path.join(taskDir, "steer", "tousertoreview")];
  if (opts.rootTaskDir && path.resolve(opts.rootTaskDir) !== path.resolve(taskDir)) {
    steerDirs.push(path.join(opts.rootTaskDir, "steer", "tousertoreview"));
  }
  const steerLines: string[] = [];
  for (const dir of steerDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(".yaml")).sort();
    for (const f of files) {
      const q = await readYaml<SteerItemArtifact>(path.join(dir, f));
      if (!q || q.status !== "open") continue;
      steerLines.push(`  - ${q.id} ref=${q.ref} disposition=${q.disposition}: ${q.question}`);
      if (q.answer) steerLines.push(`    answer: ${q.answer}`);
    }
  }
  lines.push("open steer questions:");
  lines.push(...(steerLines.length > 0 ? steerLines : ["  (none)"]));
  return lines.join("\n");
}

/**
 * Idle threshold for the wave-end stretch (merge + close-up gates + close-up
 * turn) before it is journaled as a scheduler_wait event (post-mortem Finding:
 * a multi-minute wave_started→close-up gap with no journal explanation).
 */
export const SCHEDULER_IDLE_THRESHOLD_MS = 60_000;

/**
 * Builds the scheduler_wait journal event for a wave-end stretch that exceeded
 * the idle threshold. Pure (no clock reads): callers pass the measured
 * wall/active gaps so the shape is unit-testable with a fake clock.
 * Wall beyond active = machine suspend, not engine idle — reported separately.
 * Returns undefined when the gap is within threshold (nothing to journal).
 */
export function buildSchedulerWaitEvent(opts: {
  wave: number;
  iteration: number;
  gapWallMs: number;
  gapActiveMs: number;
  readyCount: number;
  hasGates: boolean;
  merges: string[];
}): Record<string, unknown> | undefined {
  if (opts.gapWallMs <= SCHEDULER_IDLE_THRESHOLD_MS) return undefined;
  return {
    type: "scheduler_wait",
    wave: opts.wave,
    iteration: opts.iteration,
    reason:
      opts.readyCount > 0
        ? "wave-end merge + close-up gates + close-up turn"
        : opts.hasGates
          ? "close-up gates + close-up turn"
          : "close-up turn (no ready items, no gates)",
    gapWallMs: Math.round(opts.gapWallMs),
    gapActiveMs: Math.round(Math.max(0, opts.gapActiveMs)),
    merges: opts.merges,
  };
}

/**
 * Reads the current consecutive empty-wave streak for this iteration (D4):
 * the streak of the latest `empty_wave_streak` event in the same iteration,
 * or 0 when the last wave made progress. Journal scans are append-only, so
 * the latest event carries the running count.
 */
async function readEmptyStreak(taskDir: string, iteration: number): Promise<number> {
  const events = await readJournal(taskDir);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { type?: string; iteration?: number; streak?: number };
    if (e.iteration !== undefined && e.iteration !== iteration) break;
    if (e.type === "empty_wave_streak") {
      return typeof e.streak === "number" ? e.streak : 0;
    }
  }
  return 0;
}

/**
 * HEADLINE reconciliation invariant (§8.4.5): every non-terminal item must
 * have an owner in the current wave/iteration. Orphan = a past-wave
 * (`it.wave < wave`) non-terminal unblocked item: the wave loop moved on
 * but the item never closed. Current-wave items are always bucketed
 * (running/runnable/ready/waiting/blocked/terminal — total coverage), and
 * future-wave items are owned by their upcoming wave ticks, so neither can
 * be orphaned. Dep-unsatisfied past items are owned by dep completion, not
 * this tick set. Tick-orphans get journaled loudly as `stranded_no_owner`
 * and re-queued into the current tick set (tick-top call); the pre-close-up
 * call is journal-only (the post-loop redrive drives them). Bounded: the
 * same unchanged tick-orphan set 3 times in a row throws
 * `reconciliation_failed` loudly instead of spinning (progress resets the
 * bound). Merge-stuck orphans (integrate-ok-but-unmerged) route to the
 * merge loop via `mergeDue`, never the tick set, and never count toward
 * strikes. Starved `ready`-unmerged items merge via the normal merge path
 * (owner = merge step). Items only: decisions/outlines/steer/epic-closeups are covered by
 * the wave-resume, consult-exhaust, empty-wave phantom, merge-requeue,
 * blocked-answer, and closeup-trust fixes — no second entity tracker.
 */
async function reconcileWaveOwnership(opts: {
  taskDir: string;
  iteration: number;
  wave: number;
  itemStates: DerivedItemState[];
  waveState: DerivedWaveState;
  reconcileRequeues: Map<number, { sig: string; repeats: number }>;
  /** Tick-top passes true (requeue into tick set); pre-close-up passes false (journal-only). */
  requeue: boolean;
}): Promise<{ requeued: string[]; mergeDue: string[] }> {
  const { taskDir, iteration, wave, itemStates, waveState, reconcileRequeues } = opts;
  const inWave = new Set(waveState.items.map((it) => it.slug));
  const bySlug = new Map(itemStates.map((it) => [it.slug, it]));
  const orphans: string[] = [];
  const mergeDue: string[] = [];
  for (const it of itemStates) {
    if (isIterationTerminal(it.status)) continue;
    if (inWave.has(it.slug)) continue;
    if (it.status === "blocked") continue;
    if (it.wave > wave) continue;
    if (it.wave === wave) continue;
    const depsOk = it.deps.every((d) => bySlug.get(d)?.status === "merged");
    if (!depsOk) continue;
    // Merge-stuck orphans are merge-owned, never tick-owned: re-queuing
    // them into the tick set spins the reconciler (ticks can't advance an
    // integrate-ok-but-unmerged item). The caller drives them via the merge
    // loop instead; they never count toward requeue strikes.
    if (isMergeStuckItem(it)) {
      mergeDue.push(it.slug);
      continue;
    }
    orphans.push(it.slug);
  }
  // Pure merge-stuck waves never strike: no tick requeue happens below,
  // so there is nothing unchanged to count. Record progress and return the
  // merge set (G1/G3: merge loop owns them; the ledger bounds the redrive).
  if (orphans.length === 0) {
    if (mergeDue.length > 0) reconcileRequeues.set(wave, { sig: "", repeats: 0 });
    return { requeued: [], mergeDue };
  }
  const sig = orphans
    .map((s) => {
      const st = bySlug.get(s)!;
      return `${s}:${st.status}:${st.consultCount}:${st.records.length}`;
    })
    .sort()
    .join("|");
  if (!opts.requeue) {
    await appendJournal(taskDir, {
      type: "stranded_no_owner",
      iteration,
      wave,
      slugs: orphans,
      mergeDue,
      reason: "pre-close-up journal-only; post-loop redrive drives them",
    });
    return { requeued: [], mergeDue };
  }
  const prev = reconcileRequeues.get(wave);
  const repeats = prev && prev.sig === sig ? prev.repeats + 1 : 1;
  reconcileRequeues.set(wave, { sig, repeats });
  if (repeats > 3) {
    await appendJournal(taskDir, {
      type: "stranded_no_owner",
      iteration,
      wave,
      slugs: orphans,
      reason: "ownerless non-terminal items unchanged across 3 reconciler re-queues",
    });
    throw new Error(
      `reconciliation_failed: wave ${wave} has ownerless non-terminal items unchanged across 3 re-queues: ${orphans.join(", ")}`
    );
  }
  if (repeats === 1) {
    await appendJournal(taskDir, {
      type: "stranded_no_owner",
      iteration,
      wave,
      slugs: orphans,
      reason: "non-terminal items with no owner in the current wave; re-queued into the tick set",
    });
  }
  return { requeued: orphans, mergeDue };
}

/**
 * True when an item is merge-stuck: non-terminal, unmerged, and its latest
 * step record is an `ok` integrate (merge-verify pending). Such an item can
 * never advance via the tick loop — ticking re-runs step 1 (develop) while
 * the integrate resolution sits done-but-unmerged — so the merge loop owns
 * it exclusively. Covers legacy items whose merge failed before the
 * attempt ledger existed (no ledger entry) as well as current ones.
 */
export function isMergeStuckItem(st: DerivedItemState): boolean {
  if (isIterationTerminal(st.status)) return false;
  const last = st.records[st.records.length - 1];
  if (!last) return false;
  return last.name === "integrate" && last.meta.status === "ok";
}

/**
 * Splits the wave's non-terminal items into tick-owned stragglers vs
 * merge-owned ones (§8.4.5). Merge-owned = a merge-attempt ledger entry for
 * this wave (already went through the wave-end merge) OR merge-stuck
 * (integrate-ok-but-unmerged, including legacy pre-ledger failures): the
 * merge loop owns their re-drive (bounded) or terminal failure — re-ticking
 * them spins the tick cap forever. Ledger unreadable = tick owns it
 * (fail-open).
 */
export async function partitionTickStragglers(
  taskDir: string,
  wave: number,
  waveState: DerivedWaveState
): Promise<{ stragglers: string[]; mergeOwned: string[] }> {
  const mergeOwned: string[] = [];
  for (const it of waveState.items) {
    if (isIterationTerminal(it.status)) continue;
    if (isMergeStuckItem(it)) {
      mergeOwned.push(it.slug);
      continue;
    }
    try {
      const attempts = await readMergeAttempts(taskDir, it.slug, String(wave));
      if (attempts > 0) mergeOwned.push(it.slug);
    } catch {
      // Ledger unreadable: tick owns it (fail-open).
    }
  }
  const stragglers = nonTerminalWaveItems(waveState).filter((s) => !mergeOwned.includes(s));
  return { stragglers, mergeOwned };
}

export interface RedriveMergeOpts {
  task: string;
  taskDir: string;
  taskWt: string;
  parentBranch: string;
  repo: any;
  harness: any;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  wave: number;
  iteration: number;
  turnsSemaphore?: Semaphore;
  architectSessionId?: string;
  infraGates?: Array<{ id: string; command: string }>;
  infraTestRunner?: { command: string; selectorArgs?: string[]; junitArg?: string };
  rootTaskWt?: string;
  rootTaskDir?: string;
}

/**
 * Merge-redrive for a merge-owned item: consults once with the failing
 * evidence, applies an unknown-gate correction when present, then re-merges
 * (bounded by the attempt ledger) or fails the item terminally on
 * exhaustion. Returns the post-consult session id. Callers journal their
 * own entries; the helper journals only the unknown-gate correction trail
 * (`item_merge_unknown_gate_correct`, `item_merge_verify_target` is in
 * mergeItem) and the terminal-abandon evidence.
 */
export async function redriveMergeAfterConsult(
  item: DerivedItemState,
  failingError: string,
  opts: RedriveMergeOpts
): Promise<{ sessionId?: string; merged: boolean; sha?: string }> {
  const { taskDir, wave, iteration } = opts;
  const attemptsSoFar = await readMergeAttempts(taskDir, item.slug, String(wave));

  if (attemptsSoFar >= MAX_MERGE_ATTEMPTS_PER_WAVE) {
    await appendJournal(taskDir, {
      type: "merge_failed_terminal",
      wave,
      iteration,
      item: item.slug,
      reason: `merge attempts exhausted (${attemptsSoFar}/${MAX_MERGE_ATTEMPTS_PER_WAVE}); evidence: ${failingError ?? "unknown"}`,
    });
    await persistTerminalAbandon({
      taskDir,
      task: opts.task,
      parentBranch: opts.parentBranch,
      taskWt: opts.taskWt,
      pipeline: opts.pipeline,
      repo: opts.repo,
      itemSlug: item.slug,
      reason: "merge-attempts-exhausted",
      rationale: `Merge path failed ${attemptsSoFar}/${MAX_MERGE_ATTEMPTS_PER_WAVE} attempts with evidence: ${failingError ?? "unknown"}; abandoning so the wave gate absorbs the item as failed instead of spinning`,
      commitMessage: `factory(${item.slug}): merge attempts exhausted, abandon`,
    });
    return { sessionId: opts.architectSessionId, merged: false };
  }

  const childWtPath = (
    await ensureChildWorktree(opts.repo, { branch: opts.parentBranch, path: opts.taskWt }, item.slug)
  ).path;
  const diffRes = await git(childWtPath, ["diff", opts.parentBranch], { allowFail: true });
  // A stale unknown-gate target never heals by retry: consult once WITH the
  // known-gate list and apply the architect's corrected target to the verify
  // (or fail terminally when nothing fits). The old retry-with-guidance
  // record predates the loud unknown-gate error — it is not consulted here.
  const unknownGate = isUnknownGateTargetError(failingError);
  const knownTargetsText = unknownGate
    ? [
        `gates: ${formatKnownGateTargets({ gates: opts.infraGates ?? [] })}`,
        "selectors form: {selectors: [<test ids>]}",
        "command form: {command, customTarget: true}",
      ].join("\n")
    : "";
  const badId = unknownGate ? (/Unknown gate target:\s*"([^"]+)"/.exec(failingError ?? "")?.[1] ?? "unknown") : "";
  const consultRes = await runItemConsult({
    task: opts.task,
    item: item.slug,
    assignmentYaml: JSON.stringify(item.assignment ?? {}),
    priorAttemptsText: `Merge path failed for ${item.slug} (attempt ${attemptsSoFar + 1}/${MAX_MERGE_ATTEMPTS_PER_WAVE})`,
    diffText: diffRes.stdout,
    feedbackText: failingError ?? "Merge path failed",
    afterRecord: item.records[item.records.length - 1]?.dirName,
    taskDir: opts.taskDir,
    taskWt: opts.taskWt,
    repo: opts.repo,
    harness: opts.harness,
    pipeline: opts.pipeline,
    project: opts.project,
    prompts: opts.prompts,
    architectSessionId: opts.architectSessionId,
    turnsSemaphore: opts.turnsSemaphore,
    iteration: opts.iteration,
    rootTaskWt: opts.rootTaskWt,
    rootTaskDir: opts.rootTaskDir,
    ...(unknownGate ? { unknownGateRetry: { badId, knownTargetsText } } : {}),
  });
  const sessionId = consultRes.sessionId ?? opts.architectSessionId;
  await refreshStateYaml({ taskDir: opts.taskDir, task: opts.task, parentBranch: opts.parentBranch, taskWt: opts.taskWt, pipeline: opts.pipeline });
  const postConsult = await deriveItemState({
    taskDir: opts.taskDir,
    itemSlug: item.slug,
    parentBranch: opts.parentBranch,
    taskWt: opts.taskWt,
    pipeline: opts.pipeline,
    rootTaskDir: opts.rootTaskDir,
  });
  if (postConsult.status === "failed" || postConsult.status === "superseded") {
    await appendJournal(opts.taskDir, {
      type: "merge_failed_terminal",
      wave,
      iteration,
      item: item.slug,
      decision: consultRes.decision.decision,
      status: postConsult.status,
    });
    return { sessionId, merged: false };
  }
  if (postConsult.status !== "ready") {
    return { sessionId, merged: false };
  }
  // Apply the corrected target (unknown-gate recovery): sanitize, then
  // validate the gate form against the infra list. A bare unknown id would
  // re-loop forever — fail the item terminally with the evidence instead.
  let targetOverride = undefined as import("../artifacts.js").DeveloperTarget | undefined;
  if (unknownGate) {
    const corrected = sanitizeDeveloperTarget((consultRes.decision as { target?: unknown }).target);
    const resolvedCorrectedGate =
      corrected && "gate" in corrected && corrected.gate
        ? resolveGateTarget(corrected.gate, {
            gates: opts.infraGates ?? [],
            testRunner: opts.infraTestRunner,
          })
        : undefined;
    if (corrected && "gate" in corrected && corrected.gate && !resolvedCorrectedGate) {
      await appendJournal(opts.taskDir, {
        type: "merge_failed_terminal",
        wave,
        iteration,
        item: item.slug,
        reason: `architect returned unknown gate "${(corrected as { gate: string }).gate}"; evidence: ${failingError ?? "unknown"}`,
      });
      await persistTerminalAbandon({
        taskDir: opts.taskDir,
        task: opts.task,
        parentBranch: opts.parentBranch,
        taskWt: opts.taskWt,
        pipeline: opts.pipeline,
        repo: opts.repo,
        itemSlug: item.slug,
        reason: "merge-unknown-gate-unresolvable",
        rationale: `Architect corrected target names unknown gate "${(corrected as { gate: string }).gate}" with evidence: ${failingError ?? "unknown"}; abandoning so the wave gate absorbs the item as failed`,
        commitMessage: `factory(${item.slug}): unknown gate unresolvable, abandon`,
      });
      return { sessionId, merged: false };
    }
    if (corrected && resolvedCorrectedGate && "gate" in corrected) {
      // Canonicalize a corrected command form to the gate id.
      targetOverride = { gate: resolvedCorrectedGate.id };
    }
    if (corrected && !("gate" in corrected)) {
      targetOverride = corrected;
    }
  }
  if (targetOverride) {
    const corrected = targetOverride;
    await writeMergeTargetOverride(opts.taskDir, item.slug, String(wave), corrected);
    await appendJournal(opts.taskDir, {
      type: "item_merge_unknown_gate_correct",
      item: item.slug,
      wave,
      badId,
      correctedTarget: corrected,
    });
  } else if (unknownGate) {
    await appendJournal(opts.taskDir, {
      type: "merge_failed_terminal",
      wave,
      iteration,
      item: item.slug,
      decision: consultRes.decision.decision,
      status: postConsult.status,
      reason: `unknown gate "${badId}" unresolvable (no corrected target); evidence: ${failingError ?? "unknown"}`,
    });
    await persistTerminalAbandon({
      taskDir: opts.taskDir,
      task: opts.task,
      parentBranch: opts.parentBranch,
      taskWt: opts.taskWt,
      pipeline: opts.pipeline,
      repo: opts.repo,
      itemSlug: item.slug,
      reason: "merge-unknown-gate-unresolvable",
      rationale: `Merge verify targets unknown gate "${badId}" and the architect supplied no usable correction with evidence: ${failingError ?? "unknown"}; abandoning so the wave gate absorbs the item as failed`,
      commitMessage: `factory(${item.slug}): unknown gate unresolvable, abandon`,
    });
    return { sessionId, merged: false };
  }
  // Bounded redrive: merges up to the attempt cap, then fails terminally
  // (absorbed by the wave gate) — never spins the reconciler or ticks.
  const attemptsNow = await readMergeAttempts(opts.taskDir, item.slug, String(wave));
  if (attemptsNow >= MAX_MERGE_ATTEMPTS_PER_WAVE) {
    await appendJournal(opts.taskDir, {
      type: "merge_failed_terminal",
      wave,
      iteration,
      item: item.slug,
      decision: consultRes.decision.decision,
      status: postConsult.status,
      reason: `merge attempts exhausted (${attemptsNow}/${MAX_MERGE_ATTEMPTS_PER_WAVE}); evidence: ${failingError ?? "unknown"}`,
    });
    await persistTerminalAbandon({
      taskDir: opts.taskDir,
      task: opts.task,
      parentBranch: opts.parentBranch,
      taskWt: opts.taskWt,
      pipeline: opts.pipeline,
      repo: opts.repo,
      itemSlug: item.slug,
      reason: "merge-attempts-exhausted",
      rationale: `Merge path failed ${attemptsNow}/${MAX_MERGE_ATTEMPTS_PER_WAVE} attempts with evidence: ${failingError ?? "unknown"}; abandoning so the wave gate absorbs the item as failed instead of spinning`,
      commitMessage: `factory(${item.slug}): merge attempts exhausted, abandon`,
    });
    return { sessionId, merged: false };
  }
  const ensured = await ensureChildWorktree(opts.repo, { branch: opts.parentBranch, path: opts.taskWt }, item.slug);
  const redriveRes = await mergeItem({
    task: opts.task,
    item: postConsult,
    parentBranch: opts.parentBranch,
    taskWt: opts.taskWt,
    childWt: ensured.path,
    repo: opts.repo,
    harness: opts.harness,
    pipeline: opts.pipeline,
    project: opts.project,
    prompts: opts.prompts,
    taskDir: opts.taskDir,
    wave,
    turnsSemaphore: opts.turnsSemaphore,
    ...(targetOverride ? { targetOverride } : {}),
  });
  if (!redriveRes.ok) {
    await appendJournal(opts.taskDir, {
      type: "item_merge_failed",
      item: item.slug,
      error: redriveRes.error,
      mergeAttempt: redriveRes.mergeAttempt,
    });
    const exhausted = (redriveRes.mergeAttempt ?? attemptsNow + 1) >= MAX_MERGE_ATTEMPTS_PER_WAVE;
    await appendJournal(opts.taskDir, {
      type: exhausted ? "merge_failed_terminal" : "merge_failed_requeued",
      wave,
      iteration,
      item: item.slug,
      ...(exhausted ? { reason: `merge attempts exhausted (${redriveRes.mergeAttempt ?? attemptsNow + 1}/${MAX_MERGE_ATTEMPTS_PER_WAVE}); evidence: ${redriveRes.error ?? "unknown"}` } : {}),
    });
    if (exhausted) {
      await persistTerminalAbandon({
        taskDir: opts.taskDir,
        task: opts.task,
        parentBranch: opts.parentBranch,
        taskWt: opts.taskWt,
        pipeline: opts.pipeline,
        repo: opts.repo,
        itemSlug: item.slug,
        reason: "merge-attempts-exhausted",
        rationale: `Merge redrive failed ${redriveRes.mergeAttempt ?? attemptsNow + 1}/${MAX_MERGE_ATTEMPTS_PER_WAVE} attempts with evidence: ${redriveRes.error ?? "unknown"}; abandoning so the wave gate absorbs the item as failed instead of spinning`,
        commitMessage: `factory(${item.slug}): merge attempts exhausted, abandon`,
      });
    }
  }
  return { sessionId, merged: redriveRes.ok, sha: redriveRes.sha };
}

/**
 * Close-up trust gate (§8.4.7): before mapping architect `complete` → `done`,
 * re-derives all current items and refuses `done` over non-terminal
 * unblocked items. Journals `closeup_complete_refused` with the offender
 * slugs and forces `next-iteration` (or `blocked` if any offender is
 * `blocked`) instead. Never writes/returns `done` over non-terminal items.
 * Returns the (possibly rewritten) closeup artifact.
 */
export async function enforceCloseupTrustGate(opts: {
  taskDir: string;
  taskWt: string;
  parentBranch: string;
  pipeline: PipelineConfig;
  rootTaskDir?: string;
  iteration: number;
  itemSlugs: string[];
  closeup: PlanCloseupArtifact;
}): Promise<PlanCloseupArtifact> {
  const { taskDir, taskWt, parentBranch, pipeline, iteration, itemSlugs, closeup } = opts;
  if (closeup.status !== "complete") return closeup;
  // Routed blockers seed pending items here too: the trust gate must see the
  // same blocked set as the wave/iteration gates, or it refuses `complete`
  // over routed-blocked items that are terminally parked, not stranded.
  const trustBlockedBy = await collectRoutedBlockers(
    taskDir,
    pipeline.concerns?.minBlockingSeverity ?? "high"
  );
  const trustStates = await Promise.all(
    itemSlugs.map((slug) =>
      deriveItemState({
        taskDir,
        itemSlug: slug,
        parentBranch,
        taskWt,
        pipeline,
        rootTaskDir: opts.rootTaskDir,
        blockedBy: trustBlockedBy,
      })
    )
  );
  // Failure-union fixpoint (mirrors deriveTaskState §5b): cascade routed
  // seeds over declared deps so a dependent of a blocked item is not
  // mistaken for stranded mid-flow work.
  const trustSched = trustStates.map((it) => ({
    slug: it.slug,
    wave: String(it.wave),
    deps: it.deps,
    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
  }));
  const trustBlocked = new Set(blockedByConcern(trustSched, trustBlockedBy));
  for (let i = 0; i < trustStates.length; i++) {
    trustStates[i] = withRoutedBlocking(trustStates[i]!, trustBlocked);
  }
  const offenders = trustStates.filter((it) => !isIterationTerminal(it.status) && it.status !== "blocked");
  if (offenders.length === 0) return closeup;
  await appendJournal(taskDir, {
    type: "closeup_complete_refused",
    iteration,
    offenders: offenders.map((it) => it.slug),
    statuses: Object.fromEntries(offenders.map((it) => [it.slug, it.status])),
  });
  const refused: PlanCloseupArtifact = {
    ...closeup,
    status: offenders.some((it) => it.status === "blocked") ? "blocked" : "next-iteration",
    summary: `${closeup.summary} (complete refused: non-terminal items ${offenders.map((it) => it.slug).join(", ")})`,
  };
  await writeYamlAtomic(path.join(taskDir, `closeup-${iteration}.yaml`), refused);
  return refused;
}

/**
 * Stranded-item recovery (§8.4.1): an item is stranded when a PRIOR iteration
 * closed (closeup-N.yaml committed) while the item was still mid-flow
 * (`running`/`pending`/`ready`-unmerged — anything `isIterationTerminal` rejects).
 * Recovery re-adds the slug to the current iteration's item list so the wave
 * loop ticks it again; branch, step records, and attempts are untouched, so
 * the fix round resumes where it stranded. Journals one `item_stranded`
 * event per item per iteration (idempotent: skips slugs already journaled
 * for this iteration).
 */
export async function recoverStrandedItems(opts: {
  taskDir: string;
  task: string;
  taskWt: string;
  parentBranch: string;
  pipeline: PipelineConfig;
  iteration: number;
  currentIterationItems: string[];
  rootTaskDir?: string;
}): Promise<string[]> {
  const { taskDir, parentBranch, pipeline, iteration } = opts;
  const items = [...opts.currentIterationItems];
  if (iteration <= 1) return items;
  // Prior iteration closed iff its closeup file exists (committed).
  const prevCloseup = path.join(taskDir, `closeup-${iteration - 1}.yaml`);
  if (!fs.existsSync(prevCloseup)) return items;
  const itemsDir = path.join(taskDir, "items");
  if (!fs.existsSync(itemsDir)) return items;
  // The wave loop iterates waves 1..maxWave derived from assignments. A
  // stranded item recovered WITHOUT a live wave assignment never enters a
  // live wave's tick set — it sits in currentIterationItems but no wave
  // bucket picks it up, so it spins at the wave gate without ever ticking.
  // Fix: stamp each re-queued item's wave into the current plan's open wave
  // set before returning.
  let openWaves: number[] | undefined;
  try {
    openWaves = await readOpenIterationWaves(taskDir, iteration);
  } catch {
    openWaves = undefined;
  }
  const events = await readJournal(taskDir);
  const alreadyJournaled = new Set(
    events
      .filter((e) => e.type === "item_stranded" && (e as { iteration?: number }).iteration === iteration)
      .map((e) => String((e as { item?: string }).item ?? "")),
  );
  const slugs = (await fs.promises.readdir(itemsDir)).sort();
  for (const slug of slugs) {
    if (items.includes(slug)) continue;
    let st;
    try {
      st = await deriveItemState({
        taskDir,
        itemSlug: slug,
        parentBranch,
        taskWt: opts.taskWt,
        pipeline,
        rootTaskDir: opts.rootTaskDir,
      });
    } catch {
      continue;
    }
    if (isIterationTerminal(st.status)) continue;
    // Re-assign the wave when the item's wave is not in the current
    // iteration's open wave set (stale/closed wave numbering) so the live
    // wave loop actually ticks it. Committed via the assignment file the
    // wave derivation reads; deps/wave ordering still enforced by the gate.
    if (openWaves && openWaves.length > 0 && !openWaves.includes(st.wave)) {
      try {
        await reassignItemWave(taskDir, slug, openWaves[0]!);
        st = await deriveItemState({
          taskDir,
          itemSlug: slug,
          parentBranch,
          taskWt: opts.taskWt,
          pipeline,
          rootTaskDir: opts.rootTaskDir,
        });
      } catch {
        // Fall through with the original derivation; the reconciler owns it.
      }
    }
    items.push(slug);
    if (!alreadyJournaled.has(slug)) {
      await appendJournal(taskDir, {
        type: "item_stranded",
        item: slug,
        iteration,
        status: st.status,
        step: st.currentStepId,
        strandedFrom: iteration - 1,
        ...(openWaves && openWaves.length > 0 ? { wave: st.wave } : {}),
      });
    }
  }
  return items;
}

/**
 * Open wave set for the current iteration: wave numbers from the current
 * plan edits (`plan/edits-<iteration>.0.yaml` + amendments). Recovered
 * stranded items are stamped into this set so they enter a LIVE wave tick
 * set — re-queueing a slug without a live wave leaves it owned by nobody
 * (a closed wave's set) and it never ticks again.
 */
export async function readOpenIterationWaves(taskDir: string, iteration: number): Promise<number[]> {
  const waves = new Set<number>();
  const planDir = path.join(taskDir, "plan");
  if (!fs.existsSync(planDir)) return [];
  const files = await fs.promises.readdir(planDir);
  for (const f of files) {
    if (!new RegExp(`^edits-${iteration}\\.(\\d+)\\.yaml$`).exec(f)) continue;
    try {
      const edits = await readYaml<PlanEditsArtifact>(path.join(planDir, f));
      for (const it of edits?.items ?? []) {
        const wv = Number((it as { wave?: unknown }).wave);
        if (Number.isFinite(wv) && wv > 0) waves.add(Math.floor(wv));
      }
    } catch {
      // Corrupt edits files are validated elsewhere; ignore here.
    }
  }
  return [...waves].sort((a, b) => a - b);
}

/**
 * Re-assigns an item's wave in its committed assignment.yaml. Used by
 * stranded recovery so a re-queued item lands in a live wave.
 */
export async function reassignItemWave(taskDir: string, slug: string, wave: number): Promise<void> {
  const assignmentPath = path.join(taskDir, "items", slug, "assignment.yaml");
  const assignment = await readYaml<AssignmentArtifact>(assignmentPath);
  if (!assignment || typeof assignment !== "object") {
    throw new Error(`Cannot reassign wave: missing assignment for ${slug}`);
  }
  await writeYamlAtomic(assignmentPath, { ...assignment, wave });
}

/**
 * Builds the existing-items list for validateEdits from committed assignments.
 * Waves come from assignment.yaml so amended-item dep waves validate against
 * real history. Missing items dir = no history (fresh plan), not an error.
 */
async function buildExistingList(taskDir: string): Promise<{ slug: string; status: string; wave?: string | number }[]> {
  const list: { slug: string; status: string; wave?: string | number }[] = [];
  const itemsDir = path.join(taskDir, "items");
  if (!fs.existsSync(itemsDir)) return list;
  const slugs = (await fs.promises.readdir(itemsDir)).sort();
  for (const slug of slugs) {
    const assignmentPath = path.join(itemsDir, slug, "assignment.yaml");
    let wave: number | undefined;
    if (fs.existsSync(assignmentPath)) {
      const assignment = await readYaml<AssignmentArtifact>(assignmentPath);
      if (assignment?.wave !== undefined) wave = Number(assignment.wave);
    }
    list.push({ slug, status: "existing", ...(wave !== undefined ? { wave } : {}) });
  }
  return list;
}

/**
 * Act-phase routing (§18, adr-routing-derived-state): consult the architect
 * once per routed blocker concern that blocks a pending item in this wave.
 * The per-concern decision artifact is the guard, so repeated or restarted
 * act passes neither repeat the turn nor rewrite the decision.
 */
interface RoutedConsultContext {
  task: string;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  architectSessionId?: string;
  turnsSemaphore?: Semaphore;
  budgetTracker?: BudgetTracker;
  iteration: number;
}

async function consultRoutedBlockers(
  ctx: RoutedConsultContext,
  blockedSlugs: Iterable<string>
): Promise<string | undefined> {
  const blocked = new Set(blockedSlugs);
  if (blocked.size === 0) return ctx.architectSessionId;

  let sessionId = ctx.architectSessionId;
  for (const concern of await listConcerns(ctx.taskDir)) {
    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
    const res = await runConcernConsult({
      task: ctx.task,
      concern,
      taskDir: ctx.taskDir,
      taskWt: ctx.taskWt,
      repo: ctx.repo,
      harness: ctx.harness,
      pipeline: ctx.pipeline,
      project: ctx.project,
      prompts: ctx.prompts,
      architectSessionId: sessionId,
      turnsSemaphore: ctx.turnsSemaphore,
      budgetTracker: ctx.budgetTracker,
      iteration: ctx.iteration,
    });
    sessionId = res.sessionId ?? sessionId;
  }
  return sessionId;
}

/**
 * Runs a full architect iteration (§8.4).
 */
export async function runIteration(params: IterationParams): Promise<IterationResult> {
  const {
    task,
    taskDir,
    taskWt,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    budgetTracker,
    turnsSemaphore,
    runTaskChild,
    isChildTask,
  } = params;

  let architectSessionId = params.architectSessionId;
  const parentBranch = params.parentBranch ?? `topic/${task}`;
  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(runsDir, { recursive: true });

  // 1. Determine iteration number N (§8.4.1): shared ok-committed-only
  // helper with derive (never a local file scan).
  const existingCloseups = await countCommittedCloseupIterations({ taskDir, taskWt });

  const iteration = existingCloseups + 1;
  const limits = pipeline.limits ?? {};
  const maxIterations = limits.maxIterations ?? 3;
  const maxPlanReviewRounds = limits.maxPlanReviewRounds ?? 3;
  const maxParallelItems = limits.maxParallelItems ?? 2;
  const maxAmendments = limits.maxAmendmentsPerIteration ?? 3;

  // Check iteration bounds and zero-progress detector (Finding 14)
  if (iteration > maxIterations) {
    await appendJournal(taskDir, { type: "iteration_limit_exceeded", iteration, maxIterations });
    return {
      iteration,
      status: "blocked",
      architectSessionId,
    };
  }

  // Count merged items per prior iteration to detect zero-progress loops
  const mergedItemsPerIteration: number[] = [];
  for (let prev = 1; prev < iteration; prev++) {
    const editsFile = path.join(taskDir, "plan", `edits-${prev}.0.yaml`);
    let count = 0;
    if (fs.existsSync(editsFile)) {
      try {
        const prevEdits = await readYaml<PlanEditsArtifact>(editsFile);
        for (const it of prevEdits.items ?? []) {
          const st = await deriveItemState({ taskDir, itemSlug: it.slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir });
          if (st.status === "merged") count++;
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt edits file at ${editsFile}: ${err?.message ?? err}`);
        }
      }
    }
    mergedItemsPerIteration.push(count);
  }

  const iterCheck = checkIterations(iteration, maxIterations, mergedItemsPerIteration);
  if (iterCheck.zeroProgress) {
    await appendJournal(taskDir, { type: "iterations_zero_progress", iteration });
    return {
      iteration,
      status: "blocked",
      architectSessionId,
    };
  }

  await appendJournal(taskDir, { type: "iteration_started", iteration });

  // Restore newest architect session id from step records if not supplied (Finding 22)
  if (!architectSessionId && fs.existsSync(runsDir)) {
    const runEntries = (await fs.promises.readdir(runsDir))
      .filter((r) => {
        if (!r.includes("architect-")) return false;
        return (
          r.includes(`-${iteration}-`) ||
          r.endsWith(`-${iteration}`) ||
          new RegExp(`architect-[a-z-]+-${iteration}(-|$)`).test(r)
        );
      })
      .sort();
    for (let i = runEntries.length - 1; i >= 0; i--) {
      const metaPath = path.join(runsDir, runEntries[i]!, "meta.yaml");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = await readYaml<StepMetaArtifact>(metaPath);
          if (meta?.session) {
            architectSessionId = meta.session;
            break;
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt architect step meta at ${metaPath}: ${err?.message ?? err}`);
          }
        }
      }
    }
  }
  const intentText = fs.existsSync(path.join(taskDir, "INTENT.md"))
    ? await readText(path.join(taskDir, "INTENT.md"))
    : "";
  const contextYaml = fs.existsSync(path.join(taskDir, "context.yaml"))
    ? await readText(path.join(taskDir, "context.yaml"))
    : "";
  let infraYaml = "";
  const infraPath = path.join(taskDir, "infra.yaml");
  const parentInfra = path.join(path.dirname(taskDir), "infra.yaml");
  const actualInfraPath = fs.existsSync(infraPath)
    ? infraPath
    : fs.existsSync(parentInfra)
      ? parentInfra
      : undefined;

  let infraArtifact: InfraArtifact | undefined;
  if (actualInfraPath) {
    infraYaml = await readText(actualInfraPath);
    try {
      infraArtifact = await readYaml<InfraArtifact>(actualInfraPath);
    } catch {}
  }

  const baselinePath = path.join(taskDir, "gates-baseline.yaml");
  const parentBaseline = path.join(path.dirname(taskDir), "gates-baseline.yaml");
  const actualBaselinePath = fs.existsSync(baselinePath)
    ? baselinePath
    : fs.existsSync(parentBaseline)
      ? parentBaseline
      : undefined;

  let baselineText = "";
  const mutatingNotes: string[] = [];
  if (actualBaselinePath) {
    try {
      const baselineArtifact = await readYaml<GatesBaselineArtifact>(actualBaselinePath);
      if (baselineArtifact?.gates) {
        for (const g of baselineArtifact.gates) {
          if (g.mutatesWorktree) {
            mutatingNotes.push(
              `- WARNING: Gate '${g.id}' (${g.command ?? ""}) mutates the worktree during execution (mutatesWorktree: true). The gate was restored during baseline check, but it must be configured with check-only flags (e.g. '--check') or operator action required.`
            );
          }
        }
      }
      baselineText = await readText(actualBaselinePath);
    } catch {}
  }

  if (infraArtifact?.notes && infraArtifact.notes.length > 0) {
    infraYaml = `${infraYaml}\n\n# Infra Operator Action Notes\n${infraArtifact.notes.map((n) => `- ${n}`).join("\n")}`.trim();
  }
  if (baselineText) {
    infraYaml = `${infraYaml}\n\n# Gates Baseline\n${baselineText}`.trim();
  }
  if (mutatingNotes.length > 0) {
    infraYaml = `${infraYaml}\n\n# Gate Mutation Warnings\n${mutatingNotes.join("\n")}`.trim();
  }

  // 2. Fresh plan or resume plan (§8.4.2, Finding 12)
  const planDir = path.join(taskDir, "plan");
  await fs.promises.mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, `plan-${iteration}.yaml`);
  let plan: PlanArtifact | undefined;

  const planOk =
    (await findOkCommittedRecord(runsDir, `architect-plan-${iteration}`, taskWt)) ||
    (await findOkCommittedRevise(runsDir, iteration, taskWt, maxPlanReviewRounds));

  if (fs.existsSync(planPath) && planOk) {
    try {
      plan = await readYaml<PlanArtifact>(planPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt plan file at ${planPath}: ${err?.message ?? err}`);
      }
    }
  }
  // Ensure context-pack is up-to-date before architect planning (§8.1, §8.4)
  if (isContextPackEnabled(pipeline)) {
    const isStale = await isContextPackStale(taskDir, taskWt, iteration);
    if (isStale) {
      await runContextPackStep({
        task,
        taskDir,
        taskWt,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        intentText,
        contextArtifact: contextYaml,
        turnsSemaphore,
        budgetTracker,
        stepId: iteration > 1 ? `context-pack-${iteration}` : "context-pack",
      });
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    }
  }

  const contextPackPath = path.join(taskDir, "context-pack.md");
  const contextPackText = fs.existsSync(contextPackPath)
    ? await readText(contextPackPath)
    : "";

  if (!plan) {
    // Fresh brief for this plan turn: resumed runs with an existing plan skip
    // both the architect turn and the judge cost (§8.4.2).
    const hydrationContext = await buildArchitectBrief({
      taskDir,
      task,
      taskWt,
      parentBranch,
      pipeline,
      iteration,
      rootTaskDir: params.rootTaskDir,
      goal: `architect-plan-${iteration}: draft the iteration execution plan`,
      harness,
      prompts,
    });
    // Architect generates plan-N (§8.4.2)
    const planStepId = `architect-plan-${iteration}`;
    const planAttempt = getNextStepAttempt(runsDir, planStepId, pipeline.limits?.maxInterruptions ?? 3);
    const planStatusBlock = await buildTaskStatusBlock({
      taskDir, taskWt, parentBranch, itemSlugs: [], iteration, amendmentCount: 0, pipeline, rootTaskDir: params.rootTaskDir,
    });
    const planStepRes = await runAgentStep({
      task,
      attempt: planAttempt,
      stepId: planStepId,
      stepFragment: "steps/architect-plan",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      existingSessionId: architectSessionId,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        task,
        iteration: String(iteration),
        intent: intentText,
        context: contextYaml,
        contextPack: contextPackText,
        infra: infraYaml,
        debt: hydrationContext,
        steering: hydrationContext,
        limits: JSON.stringify(limits, null, 2),
        taskStatus: planStatusBlock,
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
      writeArtifact: async (output: unknown) => {
        const rawPlan = output as any;
        if (!rawPlan || !rawPlan.milestones || !rawPlan.itemOutlines) {
          throw new Error("Architect step produced invalid plan missing milestones or itemOutlines");
        }
        plan = {
          iteration,
          milestones: rawPlan.milestones,
          uncertainties: rawPlan.uncertainties,
          itemOutlines: rawPlan.itemOutlines,
          assumptions: rawPlan.assumptions,
          epics: rawPlan.epics,
          techDebt: rawPlan.techDebt,
          adrs: rawPlan.adrs,
        };
        await writeYamlAtomic(planPath, plan);

        // Write full ADR records and route blocking/remarkable ones (§8.4.2, §18).
        // Routing always runs; markdown only when adrFolder is configured.
        if (plan.adrs) {
          await persistAdrs({
            taskWt,
            taskDir,
            adrFolder: project.adrFolder,
            adrs: plan.adrs,
            mode: pipeline.humanInvolvement,
          });
        }
      },
    });

    if (!planStepRes.ok || !plan) {
      // Never fabricate a placeholder plan (Finding 4)
      return {
        iteration,
        status: "failed",
        architectSessionId: planStepRes.sessionId,
      };
    }

    if (planStepRes.sessionId) {
      architectSessionId = planStepRes.sessionId;
    }
    // Early outline-count pre-check (§8.4.2a): BEFORE plan-review/PM. ONE resumed
    // repair turn in the same architect session with concrete counts; if still
    // invalid, review proceeds with the violation in {{limitViolations}}.
    if (plan) {
      const planViolations = checkPlanCountLimits(plan, { limits });
      if (planViolations.length > 0 && planStepRes.sessionId) {
        const planLimitsAttempt = nextFreshAttempt(runsDir, `architect-plan-${iteration}`);
        const planRepairRes = await runAgentStep({
          task,
          attempt: planLimitsAttempt,
          stepId: `architect-plan-${iteration}`,
          stepFragment: "steps/architect-plan",
          agent: "architect",
          role: "architect",
          sessionMode: "reuse",
          existingSessionId: architectSessionId,
          resumedRepair: true,
          repairFeedback: buildPlanLimitsRepairFeedback(planViolations),
          cwd: taskWt,
          taskWt,
          taskDir,
          recordsDir: runsDir,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          promptVars: {
            task,
            iteration: String(iteration),
            intent: intentText,
            context: contextYaml,
            contextPack: contextPackText,
            infra: infraYaml,
            debt: hydrationContext,
            steering: hydrationContext,
            limits: JSON.stringify(limits, null, 2),
            taskStatus: planStatusBlock,
          },
          turnsSemaphore,
          budgetTracker,
          iteration,
          writeArtifact: async (output: unknown) => {
            const rawPlan = output as any;
            if (rawPlan && rawPlan.milestones && rawPlan.itemOutlines) {
              plan = {
                iteration,
                milestones: rawPlan.milestones,
                uncertainties: rawPlan.uncertainties,
                itemOutlines: rawPlan.itemOutlines,
                assumptions: rawPlan.assumptions,
                epics: rawPlan.epics,
                techDebt: rawPlan.techDebt,
                adrs: rawPlan.adrs,
              };
              await writeYamlAtomic(planPath, plan);
              await appendJournal(taskDir, {
                type: "plan_limits_repair",
                step: `architect-plan-${iteration}`,
                before: planViolations,
                after: checkPlanCountLimits(plan, { limits }),
              });
            }
          },
        });
        if (planRepairRes.sessionId) {
          architectSessionId = planRepairRes.sessionId;
        }
        // No early return: compliant revisions flow to review; residual
        // violations ride along in {{limitViolations}} for an explicit verdict.
      }
    }
    const iterState = await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });

    // A blocking ADR routed at plan time parks the task: halt before waves so
    // the derive loop reports blocked and exits 10 (§18 blocking table).
    if (iterState.status === "blocked") {
      return {
        iteration,
        status: "blocked",
        plan,
        architectSessionId,
      };
    }
  }
  // Check if PM edits are already completed
  const editsPath = path.join(planDir, `edits-${iteration}.0.yaml`);
  let edits: PlanEditsArtifact | undefined;
  let editsDone = false;

  if (fs.existsSync(editsPath)) {
    try {
      edits = await readYaml<PlanEditsArtifact>(editsPath);
      const pmOk = await findOkCommittedRecord(runsDir, `pm-edits-${iteration}`, taskWt);
      const assignmentsExist =
        edits &&
        Array.isArray(edits.items) &&
        edits.items.every((it) =>
          fs.existsSync(path.join(taskDir, "items", it.slug, "assignment.yaml"))
        );
      if (pmOk && assignmentsExist) {
        editsDone = true;
      }
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt plan edits file at ${editsPath}: ${err?.message ?? err}`);
      }
    }
  }
  // Restart recovery (§8.4.4a): edits-N.yaml absent + pm-edits-N record ok +
  // journal has pm_edits_validation_failed for N → the pre-bounce run died after
  // downstream validation failed. Go straight to the architect bounce: do NOT
  // re-run PM first, do not treat as done. The bounce stepId doubles as the
  // once-per-iteration marker, so this path naturally runs at most once.
  // Legacy journal events lack an iteration field — accept those too, since the
  // ok pm-edits-N record + absent edits file already scope this to iteration N.
  let restartBounceErrors: string[] | undefined;
  if (!editsDone && !fs.existsSync(editsPath)) {
    const pmOkRestart = await findOkCommittedRecord(runsDir, `pm-edits-${iteration}`, taskWt);
    if (pmOkRestart && !(await hasPmfixBounce(runsDir, iteration, taskWt))) {
      const journal = await readJournal(taskDir);
      const failures = journal.filter(
        (e) => e.type === "pm_edits_validation_failed" &&
          ((e as any).iteration === undefined || (e as any).iteration === iteration)
      );
      const lastFailure = failures[failures.length - 1];
      if (lastFailure && Array.isArray((lastFailure as any).errors)) {
        restartBounceErrors = (lastFailure as any).errors as string[];
        await appendJournal(taskDir, {
          type: "pm_edits_restart_bounce",
          iteration,
          errors: restartBounceErrors,
        });
      }
    }
  }
  // 3. Plan review rounds (§8.4.3, Finding 12: restart safe)
  // A pending restart bounce skips review: the plan already passed review in the
  // dead run — the bounce revises it for limits and PM re-runs after.
  if (!editsDone && !restartBounceErrors) {
    let reviewRound = 1;
    const reviewFingerprints: string[] = [];
    while (reviewRound <= maxPlanReviewRounds) {
    // Triage ids are those that existed before this review round; capturing
    // them here mirrors the step-runner exact-id partition.
    const knownConcernIds = await listConcernIds(taskDir);
    // Check if review round record already exists
    const revRecordName = `plan-review-${iteration}-${reviewRound}`;
    const revAttempt = getNextStepAttempt(runsDir, revRecordName, pipeline.limits?.maxInterruptions ?? 3);
    const revStepRes = await runAgentStep({
      task,
      attempt: revAttempt,
      stepId: revRecordName,
      stepFragment: "steps/plan-review",
      agent: "plan-reviewer",
      role: "alt-architect",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        intent: intentText,
        context: contextYaml,
        limits: plan ? (() => {
          const v = checkPlanCountLimits(plan, { limits });
          // Fragments are frozen (no agents/** edits): surface the violation in
          // the rendered {{limits}} section so the reviewer actually sees it;
          // {{limitViolations}} rides along for explicitness and future prompts.
          return v.length > 0
            ? `${JSON.stringify(limits, null, 2)}\n\n${formatLimitViolationsVar(v)}`
            : JSON.stringify(limits, null, 2);
        })() : JSON.stringify(limits, null, 2),
        limitViolations: plan ? formatLimitViolationsVar(checkPlanCountLimits(plan, { limits })) : "none",
        dispositionsCriteria: formatDispositionsSection(
          loadCriteriaBundle(pipeline.criteria).dispositions,
          resolveReviewAllowed(
            pipeline,
            "plan-reviewer",
            isTriagerAgent("plan-reviewer")
          )
        ),
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
    });

    if (!revStepRes.ok) {
      // Do not treat failed reviewer as approved (Finding 4)
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }

    const revOutput = revStepRes.output as ReviewArtifact | undefined;
    // Triage ids are exact-id concern/remarkable decisions, not plan findings;
    // they never request a revision or influence approval.
    const { findings } = partitionSuggestions(
      revOutput?.suggestions ?? [],
      knownConcernIds
    );
    const awarenessSuggestions = findings.filter((s) => s.disposition === "human-awareness");
    if (awarenessSuggestions && awarenessSuggestions.length > 0) {
      for (const q of awarenessSuggestions) {
        const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
        const qId = `awareness-plan-${iteration}-${cleanSuggestionId}`;
        await writeQuestion(params.rootTaskWt ?? taskWt, params.rootTaskDir ?? taskDir, {
          id: qId,
          ref: `plan-${iteration}`,
          disposition: "human-awareness",
          question: q.detail || q.summary,
          blocks: [],
        });
      }
    }
    const fixSuggestions = findings.filter((s) => s.disposition === "fix");
    if (!fixSuggestions || fixSuggestions.length === 0) {
      break; // Plan approved!
    }

    // Check loop detector (§12.2)
    const rCheck = checkPlanReviewRounds(
      reviewRound,
      maxPlanReviewRounds,
      reviewFingerprints
    );
    if (rCheck.exhausted || rCheck.noProgress) {
      break; // Architect decides on unresolved
    }

    // Architect turn (revise) (§8.4.3)
    const reviseStepId = `architect-revise-${iteration}-${reviewRound}`;
    const reviseAttempt = getNextStepAttempt(runsDir, reviseStepId, pipeline.limits?.maxInterruptions ?? 3);
    const reviseStatusBlock = await buildTaskStatusBlock({
      taskDir, taskWt, parentBranch, itemSlugs: [], iteration, amendmentCount: 0, pipeline, rootTaskDir: params.rootTaskDir,
    });
    const reviseRes = await runAgentStep({
      task,
      attempt: reviseAttempt,
      stepId: reviseStepId,
      stepFragment: "steps/architect-revise",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      existingSessionId: architectSessionId,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        planReview: JSON.stringify(revOutput, null, 2),
        contextPack: contextPackText,
        taskStatus: reviseStatusBlock,
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
      writeArtifact: async (output: unknown) => {
        if (output && typeof output === "object") {
          const before = plan ? checkPlanCountLimits(plan, { limits }) : [];
          const merged = { ...plan, ...(output as any), iteration };
          plan = merged;
          await writeYamlAtomic(planPath, merged);
          // Revise may add or flip ADRs: re-persist idempotently (§8.4.2, §18).
          if (merged.adrs) {
            await persistAdrs({
              taskWt,
              taskDir,
              adrFolder: project.adrFolder,
              adrs: merged.adrs,
              mode: pipeline.humanInvolvement,
            });
          }
          const after = plan ? checkPlanCountLimits(plan, { limits }) : [];
          if (before.length > 0 && after.length === 0) {
            await appendJournal(taskDir, {
              type: "plan_limits_repair",
              step: reviseStepId,
              before,
              after,
            });
          }
        }
      },
    });

    if (reviseRes.sessionId) {
      architectSessionId = reviseRes.sessionId;
    }
    if (!reviseRes.ok) {
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }
    reviewRound++;
    const reviseState = await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    if (reviseState.status === "blocked") {
      return {
        iteration,
        status: "blocked",
        plan,
        architectSessionId,
      };
    }
    }
  }

  // 4. PM edits (§8.4.4, Finding 12 & 13)
  const { kindsDescription, validKindNames } = buildKindsPromptVar(pipeline, !isChildTask);
  // Shared architect bounce (§8.4.4a): at most once per iteration (marker record
  // `architect-pmfix-N`). Revises the plan for the validation errors, then
  // re-runs PM once against the revised plan. Returns the post-bounce edits
  // (undefined when the bounce or PM re-run failed) and validation errors.
  const runPmfixBounce = async (opts: {
    bounceErrors: string[];
    offenderSummary: string;
    pmStatusBlock: string;
    existingList: { slug: string; status: string; wave?: string | number }[];
  }): Promise<{ edits?: PlanEditsArtifact; validationErrors: string[] }> => {
    const bounceAttempt = getNextStepAttempt(runsDir, `architect-pmfix-${iteration}`, pipeline.limits?.maxInterruptions ?? 3);
    const bounceRes = await runAgentStep({
      task,
      attempt: bounceAttempt,
      stepId: `architect-pmfix-${iteration}`,
      stepFragment: "steps/architect-revise",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      existingSessionId: architectSessionId,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        planReview: `PM output rejected by deterministic validation after its resumed repair turn. Fix ONLY these errors by revising the plan (consolidate outlines, split milestones, or defer via replanAfter; do not just renumber):\n${opts.bounceErrors.map((e) => `- ${e}`).join("\n")}\n\n${opts.offenderSummary}`,
        contextPack: contextPackText,
        taskStatus: opts.pmStatusBlock,
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
      writeArtifact: async (output: unknown) => {
        if (output && typeof output === "object") {
          const before = plan ? checkPlanCountLimits(plan, { limits }) : [];
          plan = { ...plan, ...(output as any), iteration };
          await writeYamlAtomic(planPath, plan);
          const after = plan ? checkPlanCountLimits(plan, { limits }) : [];
          if (before.length > 0 && after.length === 0) {
            await appendJournal(taskDir, {
              type: "plan_limits_repair",
              step: `architect-pmfix-${iteration}`,
              before,
            });
          }
        }
      },
    });
    if (bounceRes.sessionId) {
      architectSessionId = bounceRes.sessionId;
    }
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    await appendJournal(taskDir, {
      type: "pm_edits_bounced_to_architect",
      iteration,
      errors: opts.bounceErrors,
    });
    if (!bounceRes.ok || !plan) {
      return { validationErrors: opts.bounceErrors };
    }
    // Re-run PM ONCE against the revised plan in a fresh PM turn.
    const pmStepId = `pm-edits-${iteration}`;
    const pmRetryAttempt = nextFreshAttempt(runsDir, pmStepId);
    const pmRetryRes = await runAgentStep({
      task,
      attempt: pmRetryAttempt,
      stepId: pmStepId,
      stepFragment: "steps/pm-edits",
      agent: "pm",
      role: "alt-workhorse",
      sessionMode: "reuse",
      forceFresh: true,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        taskStatus: opts.pmStatusBlock,
        kinds: kindsDescription,
        citations: contextYaml,
        limits: JSON.stringify(limits, null, 2),
        storyKindsCriteria: loadCriteriaBundle(pipeline.criteria).storyKinds ?? "",
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
    });
    if (!pmRetryRes.ok || !pmRetryRes.output || !Array.isArray((pmRetryRes.output as any).items) || (pmRetryRes.output as any).items.length === 0) {
      return { validationErrors: opts.bounceErrors };
    }
    const bouncedEdits: PlanEditsArtifact = { iteration, amendmentIndex: 0, items: (pmRetryRes.output as any).items };
    const bounceErrors = validateEdits(bouncedEdits, {
      plan,
      limits,
      kinds: validKindNames,
      isRootTask: !isChildTask,
      existing: opts.existingList,
    });
    if (bounceErrors.length === 0) {
      await appendJournal(taskDir, {
        type: "pm_edits_bounce_recovered",
        iteration,
      });
    }
    return { edits: bouncedEdits, validationErrors: bounceErrors };
  };
  // A pending restart bounce skips the normal PM turn: the pre-restart PM output
  // already exists (record ok) but failed validation — re-running PM first would
  // reproduce the failure. The bounce revises the plan, then re-runs PM below.
  if (!editsDone && !restartBounceErrors) {
    const pmStepId = `pm-edits-${iteration}`;
    const pmAttempt = getNextStepAttempt(runsDir, pmStepId, pipeline.limits?.maxInterruptions ?? 3);
    const pmStatusBlock = await buildTaskStatusBlock({
      taskDir, taskWt, parentBranch, itemSlugs: [], iteration, amendmentCount: 0, pipeline, rootTaskDir: params.rootTaskDir,
    });
    const pmStepRes = await runAgentStep({
      task,
      attempt: pmAttempt,
      stepId: pmStepId,
      stepFragment: "steps/pm-edits",
      agent: "pm",
      role: "alt-workhorse",
      sessionMode: "reuse",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        taskStatus: pmStatusBlock,
        kinds: kindsDescription,
        citations: contextYaml,
        limits: JSON.stringify(limits, null, 2),
        storyKindsCriteria: loadCriteriaBundle(pipeline.criteria).storyKinds ?? "",
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
    });

    if (!pmStepRes.ok) {
      // Never fabricate items when PM fails (Finding 4)
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }

    let rawEdits = pmStepRes.output as any;
    if (!rawEdits || !Array.isArray(rawEdits.items) || rawEdits.items.length === 0) {
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }

    edits = {
      iteration,
      amendmentIndex: 0,
      items: rawEdits.items,
    };

    // Validate edits with limits and configured kinds (Finding 13)
    const existingList = await buildExistingList(taskDir);

    let validationErrors = validateEdits(edits, {
      plan,
      limits,
      kinds: validKindNames,
      isRootTask: !isChildTask,
      existing: existingList,
    });

    // ONE resumed repair turn in the SAME PM session: errors only, no plan resend (§8.4.4).
    // Recorded as the step's next attempt (same stepId, full record/commit/budget accounting).
    if (validationErrors.length > 0 && pmStepRes.sessionId) {
      const pmRepairRes = await runAgentStep({
        task,
        attempt: pmAttempt + 1,
        stepId: pmStepId,
        stepFragment: "steps/pm-edits",
        agent: "pm",
        role: "alt-workhorse",
        sessionMode: "reuse",
        existingSessionId: pmStepRes.sessionId,
        resumedRepair: true,
        repairFeedback: `Your previous output failed deterministic validation with these errors (fix ONLY these; do not re-render the full plan, do not invent new items):\n${validationErrors.map((e) => `- ${e}`).join("\n")}`,
        cwd: taskWt,
        taskWt,
        taskDir,
        recordsDir: runsDir,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        promptVars: {
          plan: JSON.stringify(plan, null, 2),
          taskStatus: pmStatusBlock,
          kinds: kindsDescription,
          citations: contextYaml,
          limits: JSON.stringify(limits, null, 2),
          storyKindsCriteria: loadCriteriaBundle(pipeline.criteria).storyKinds ?? "",
        },
        turnsSemaphore,
        budgetTracker,
        iteration,
      });
      if (pmRepairRes.ok && pmRepairRes.output && Array.isArray((pmRepairRes.output as any).items)) {
        rawEdits = pmRepairRes.output as any;
        edits = { iteration, amendmentIndex: 0, items: rawEdits.items };
        validationErrors = validateEdits(edits, {
          plan,
          limits,
          kinds: validKindNames,
          isRootTask: !isChildTask,
          existing: existingList,
        });
        await appendJournal(taskDir, {
          type: "pm_edits_repaired",
          errors: validationErrors,
        });
      }
    }

    if (validationErrors.length > 0) {
      // Backstop (§8.4.4a): once per iteration, bounce to the architect instead of
      // failing — the plan itself is over-limit and PM must not drop scope. If the
      // bounce was already taken (or the record check shows it), fail with the
      // bounce noted so the journal explains the full sequence.
      if (!(await hasPmfixBounce(runsDir, iteration, taskWt))) {
        const bounceOut = await runPmfixBounce({
          bounceErrors: validationErrors,
          offenderSummary: `Offending PM output summary: ${Math.min(rawEdits.items.length, 9999)} items starting with slugs [${rawEdits.items.slice(0, 5).map((i: any) => i.slug).join(", ")}${rawEdits.items.length > 5 ? ", …" : ""}]`,
          pmStatusBlock,
          existingList,
        });
        if (bounceOut.edits) {
          edits = bounceOut.edits;
        }
        validationErrors = bounceOut.validationErrors;
      }
      if (validationErrors.length > 0) {
        await appendJournal(taskDir, {
          type: "pm_edits_validation_failed",
          iteration,
          errors: validationErrors,
          bounced: await hasPmfixBounce(runsDir, iteration, taskWt),
        });
        return {
          iteration,
          status: "failed",
          plan,
          architectSessionId,
        };
      }
    }

    await writeYamlAtomic(editsPath, edits);
    // Apply edits atomically (§6.3.5, Finding 13)
    const applied = applyEdits(edits, { taskDir, plan });
    for (const f of applied.files) {
      await fs.promises.mkdir(path.dirname(f.path), { recursive: true });
      await writeTextAtomic(f.path, f.content);
    }

    await git(taskWt, ["add", "-A"], { allowFail: true });
    await commitAll(repo, taskWt, `factory: apply plan edits iteration ${iteration}`);
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }

  // Restart bounce execution (§8.4.4a): the dead run left an ok pm-edits record,
  // no edits file, and a pm_edits_validation_failed journal. The bounce stepId
  // doubles as the once-per-iteration marker, so this runs at most once and the
  // normal PM turn above is skipped — PM re-runs inside the bounce instead.
  if (!editsDone && restartBounceErrors) {
    const restartStatusBlock = await buildTaskStatusBlock({
      taskDir, taskWt, parentBranch, itemSlugs: [], iteration, amendmentCount: 0, pipeline, rootTaskDir: params.rootTaskDir,
    });
    const restartExisting = await buildExistingList(taskDir);
    const bounceOut = await runPmfixBounce({
      bounceErrors: restartBounceErrors,
      offenderSummary: "(Pre-restart PM output is unavailable; it failed validation in the run before the restart. Revise the plan to fit limits — PM re-runs against the revised plan.)",
      pmStatusBlock: restartStatusBlock,
      existingList: restartExisting,
    });
    if (bounceOut.edits) {
      edits = bounceOut.edits;
    }
    if (bounceOut.validationErrors.length === 0 && edits) {
      await writeYamlAtomic(editsPath, edits);
      const applied = applyEdits(edits, { taskDir, plan });
      for (const f of applied.files) {
        await fs.promises.mkdir(path.dirname(f.path), { recursive: true });
        await writeTextAtomic(f.path, f.content);
      }
      await git(taskWt, ["add", "-A"], { allowFail: true });
      await commitAll(repo, taskWt, `factory: apply plan edits iteration ${iteration}`);
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    } else {
      await appendJournal(taskDir, {
        type: "pm_edits_validation_failed",
        iteration,
        errors: bounceOut.validationErrors,
        bounced: true,
      });
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }
  }
  if (!edits) {
    return {
      iteration,
      status: "failed",
      plan,
      architectSessionId,
    };
  }

  // 5. Waves execution (§8.4.5, Finding 24: restrict itemSlugs to current iteration's edits)
  let currentIterationItems = edits.items.map((i) => i.slug);
  let amendmentCount = 0;
  if (fs.existsSync(planDir)) {
    const planFiles = await fs.promises.readdir(planDir);
    for (const pf of planFiles) {
      const m = new RegExp(`^edits-${iteration}\\.(\\d+)\\.yaml$`).exec(pf);
      if (m) {
        const k = parseInt(m[1]!, 10);
        if (k > amendmentCount) {
          amendmentCount = k;
        }
        if (k >= 1) {
          const amendPath = path.join(planDir, pf);
          try {
            const prevAmend = await readYaml<PlanEditsArtifact>(amendPath);
            if (prevAmend && Array.isArray(prevAmend.items)) {
              for (const it of prevAmend.items) {
                if (it && it.slug && !currentIterationItems.includes(it.slug)) {
                  currentIterationItems.push(it.slug);
                }
              }
            }
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              throw new Error(`Corrupt plan edits amendment at ${amendPath}: ${err?.message ?? err}`);
            }
          }
        }
      }
    }
  }

  // Stranded-item recovery (§8.4.1): re-queue items whose iteration closed
  // while they were mid-flow (`running`/`pending`/`ready`-unmerged). Recovery
  // only re-adds the slug to this iteration's item list — branch, records,
  // and attempts are untouched — and journals `item_stranded` once per item.
  // The wave-report prompt then notes them so the architect sees the resume.
  currentIterationItems = await recoverStrandedItems({
    taskDir,
    task,
    taskWt,
    parentBranch,
    pipeline,
    iteration,
    currentIterationItems,
    rootTaskDir: params.rootTaskDir,
  });

  const initialStates = await Promise.all(
    currentIterationItems.map((slug) =>
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, project, rootTaskDir: params.rootTaskDir })
    )
  );

  let maxWave = initialStates.reduce((max, it) => Math.max(max, it.wave), 1);
  const waveRedrives = new Map<number, number>();
  // Pending empty-wave consult exit: set inside the wave body, honored at
  // its end (after the close-up/report ceremony always runs).
  let pendingEmptyWaveExit: "end" | "continue" | undefined;
  // Waves skipped as all-blocked: their items re-enter on answers (fix 6).
  const waveBlockedSkipped = new Set<number>();
  for (let w = 1; w <= maxWave; w++) {
    const pendingWaveReportId = `architect-wave-report-${iteration}-${w}`;
    const pendingWaveReport = await findOkCommittedRecord(runsDir, pendingWaveReportId, taskWt);
    if (
      pendingWaveReport?.output &&
      (pendingWaveReport.output as any).decision === "amend" &&
      !Array.isArray((pendingWaveReport.output as any).outlines)
    ) {
      await appendJournal(taskDir, {
        type: "wave_report_old_format_rerun",
        wave: w,
        iteration,
        recordDir: pendingWaveReport.recordDir,
      });
      for (const f of ["output.yaml", "meta.yaml", "input.md", "checks.yaml"]) {
        await fs.promises.rm(path.join(pendingWaveReport.recordDir, f), { force: true });
      }
      await fs.promises.rm(path.join(taskDir, "waves", `wave-${iteration}.${w}.yaml`), { force: true });
      await git(taskWt, ["add", "-A"], { allowFail: true });
      await commitAll(repo, taskWt, `factory: invalidate old-format wave report ${pendingWaveReportId}`);
    }
    // Check if wave close-up already completed for this wave (Finding 24).
    // Resume re-ticks unblocked stragglers: a wave artifact + ok report is
    // only a skip when every item is terminal or blocked. Non-terminal
    // unblocked items (running/pending/ready, or dep-waiting `waiting`)
    // fall through and re-enter the tick loop. A stale epic
    // child-closeup.yaml is cleared when the wave re-opens so the child
    // status re-derives from the fresh run instead of the old verdict.
    const waveArtifactPath = path.join(taskDir, "waves", `wave-${iteration}.${w}.yaml`);
    if (fs.existsSync(waveArtifactPath)) {
      const waveOk = await findOkCommittedRecord(runsDir, pendingWaveReportId, taskWt);
      if (waveOk) {
        const resumeStates = await Promise.all(
          currentIterationItems.map((slug) =>
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        const resumeWave = deriveWaveState({ wave: w, items: resumeStates });
        const resumeStragglers = [
          ...resumeWave.running,
          ...resumeWave.runnable,
          ...resumeWave.ready,
          ...resumeWave.waiting,
        ].map((it) => it.slug);
        if (resumeStragglers.length === 0) {
          continue;
        }
        await appendJournal(taskDir, {
          type: "wave_resume_reopened",
          wave: w,
          iteration,
          stragglers: resumeStragglers,
        });
        // Clear stale epic child-closeup verdicts so re-opened waves
        // re-derive the child status from the fresh child run.
        for (const slug of resumeStragglers) {
          const closeupPath = path.join(taskDir, "items", slug, "child-closeup.yaml");
          if (fs.existsSync(closeupPath)) {
            try {
              await fs.promises.rm(closeupPath, { force: true });
              await appendJournal(taskDir, { type: "epic_closeup_cleared", wave: w, iteration, item: slug });
            } catch {}
          }
        }
      }
    }

    // Collect item states
    let itemStates = await Promise.all(
      currentIterationItems.map((slug) =>
        deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
      )
    );
    let waveState = deriveWaveState({
      wave: w,
      items: itemStates,
      blockedBy: await collectRoutedBlockers(
        taskDir,
        pipeline.concerns?.minBlockingSeverity ?? "high"
      ),
    });

    // A wave whose items are ALL `blocked` (open human questions) pauses
    // without close-up work: no merges, no wave-close-up, no report — the
    // operator owns the next move. The wave does NOT count as closed (no
    // wave artifact, no report record), so the answer path re-runs this
    // same wave on restart. Journal wave_blocked distinctly so the pause
    // is visible (not a silent wave_started with no close-up).
    // Routed-concern blocks do NOT pause: the act phase already consulted
    // the architect per routed blocker (decision artifact committed), so a
    // fully routed-blocked wave proceeds to close-up/report instead of
    // parking forever on an operator move that will never come.
    // Blocked-then-answered (§8.8): poll once and re-derive before pausing —
    // answers that arrived since the last tick re-enter below instead of
    // pausing over stale state.
    if (waveState.items.length > 0 && waveState.blocked.length === waveState.items.length) {
      try {
        await processSteeringMailbox({
          taskWt: params.rootTaskWt ?? taskWt,
          taskDir: params.rootTaskDir ?? taskDir,
          harness,
          pipeline,
          prompts,
          repo,
          task: params.rootTask ?? task,
        });
      } catch {}
      itemStates = await Promise.all(
        currentIterationItems.map((slug) =>
          deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
        )
      );
      waveState = deriveWaveState({
        wave: w,
        items: itemStates,
        blockedBy: await collectRoutedBlockers(
          taskDir,
          pipeline.concerns?.minBlockingSeverity ?? "high"
        ),
      });
    }
    // Pause only when a human operator actually owns the next move: at
    // least one blocked item must hold an open steer question. Fully
    // routed-blocked waves (no open questions) proceed to close-up/report —
    // the architect consult already happened in the act phase.
    const waveBlockedByHuman = waveState.blocked.some((b) => b.openSteerQuestion);
    if (waveState.items.length > 0 && waveState.blocked.length === waveState.items.length && waveBlockedByHuman) {
      waveBlockedSkipped.add(w);
      await appendJournal(taskDir, { type: "wave_blocked", wave: w, iteration, items: waveState.blocked.map((b) => b.slug) });
      continue;
    }
    // Fully-blocked waves still run close-up/report: routed-blocked items
    // are terminally parked (not awaiting an operator), and the ceremony
    // records their status. Only a wave with zero items, or an all-merged
    // wave with no remaining work, is skipped.
    const waveAllMerged =
      waveState.items.length > 0 && waveState.items.every((it) => it.status === "merged");
    if (waveState.items.length === 0 || waveAllMerged) {
      continue;
    }
    // HEADLINE reconciler (§8.4.5): the map lives per-wave and the check
    // runs (a) here at wave top, (b) at the top of each wave-tick iteration
    // (with requeue injection into the tick set), and (c) once pre-close-up
    // (journal-only) — see both call sites below.
    const reconcileRequeues = new Map<number, { sig: string; repeats: number }>();
    {
      const { requeued, mergeDue } = await reconcileWaveOwnership({
        taskDir,
        iteration,
        wave: w,
        itemStates,
        waveState,
        reconcileRequeues,
        requeue: true,
      });
      void requeued;
      // Merge-stuck orphans route to the merge loop, never the tick set (G1):
      // redrive each via consult+bounded-merge. A merged redrive refreshes
      // states so the wave below sees it; failures stay merge-owned (the
      // helper journals terminal abandon with the evidence).
      // Orphan-redrive evidence: the latest journaled merge failure per slug
      // (fallback: the merge-stuck marker when no failure was journaled).
      const mergeErrBySlug = new Map<string, string>();
      for (const e of await readJournal(taskDir)) {
        const r = e as unknown as { type?: string; item?: string; error?: string; evidence?: string };
        if ((r.type === "item_merge_failed" || r.type === "item_merge_gates_failed") && typeof r.item === "string" && typeof (r.error ?? r.evidence) === "string") {
          mergeErrBySlug.set(r.item, (r.error ?? r.evidence) as string);
        }
      }
      for (const slug of mergeDue) {
        const it = itemStates.find((s) => s.slug === slug);
        if (!it) continue;
        const err = mergeErrBySlug.get(slug) ?? `merge-stuck orphan: integrate ok but unmerged for wave ${w}`;
        const res = await redriveMergeAfterConsult(it, err, {
          task, taskDir, taskWt, parentBranch, repo, harness, pipeline, project,
          prompts, wave: w, iteration, turnsSemaphore, architectSessionId,
          infraGates: infraArtifact?.gates, infraTestRunner: infraArtifact?.testRunner, rootTaskWt: params.rootTaskWt, rootTaskDir: params.rootTaskDir,
        });
        architectSessionId = res.sessionId ?? architectSessionId;
        if (res.merged) {
          itemStates = await Promise.all(
            currentIterationItems.map((s) =>
              deriveItemState({ taskDir, itemSlug: s, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
            )
          );
          waveState = deriveWaveState({
            wave: w,
            items: itemStates,
            blockedBy: await collectRoutedBlockers(taskDir, pipeline.concerns?.minBlockingSeverity ?? "high"),
          });
        }
      }
    }

    // Active runs poll the root mailbox during wave execution (§8.8):
    // between item steps and at least every `limits.steerPollSec` (default 60s).
    const mailboxWt = params.rootTaskWt ?? taskWt;
    const mailboxDir = params.rootTaskDir ?? taskDir;
    const mailboxTask = params.rootTask ?? task;
    const rawPollSec = pipeline.limits?.steerPollSec;
    const steerPollSec =
      typeof rawPollSec === "number" && Number.isFinite(rawPollSec) && rawPollSec > 0
        ? rawPollSec
        : 60;
    let stopRequested = false;
    // Act-phase routing (§18): each routed blocker concern blocking a pending
    // item in this wave gets one architect consult before work starts.
    const consultCtx: RoutedConsultContext = {
      task,
      taskDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      architectSessionId,
      turnsSemaphore,
      budgetTracker,
      iteration,
    };
    architectSessionId = await consultRoutedBlockers(
      consultCtx,
      waveState.blocked.map((it) => it.slug)
    );
    consultCtx.architectSessionId = architectSessionId;

    await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });

    const pollSteering = async () => {
      let res;
      try {
        res = await processSteeringMailbox({
          taskWt: mailboxWt,
          taskDir: mailboxDir,
          harness,
          pipeline,
          prompts,
          repo,
          task: mailboxTask,
        });
      } catch (err: any) {
        await appendJournal(taskDir, {
          type: "steer_poll_error",
          task,
          wave: w,
          iteration,
          error: err?.message ?? String(err),
        });
        return;
      }
      if (res.stopRequested) stopRequested = true;
      if (res.processedCount > 0 || res.skippedCount > 0) {
        await appendJournal(taskDir, {
          type: "steer_poll",
          task,
          wave: w,
          iteration,
          processed: res.processedCount,
          skipped: res.skippedCount,
        });
      }
    };

    let steerTimer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (steerTimer) return;
      steerTimer = setInterval(() => {
        pollSteering().catch(() => {});
      }, steerPollSec * 1000);
      if (typeof (steerTimer as any).unref === "function") {
        (steerTimer as any).unref();
      }
    };
    const stopTimer = () => {
      if (steerTimer) {
        clearInterval(steerTimer);
        steerTimer = undefined;
      }
    };

    try {
      startTimer();

      // Run wave items until wave can merge or complete. The 50-tick cap is
      // a stall breaker, NEVER a normal wave exit: hitting it with items
      // mid-flow journals wave_tick_cap_hit and re-drives instead of closing,
      // so mid-flow items can never strand `running` (stranded-wave fix).
      const WAVE_TICK_CAP = 50;
      let waveTicks = 0;
      // All-fail fast path (§8.4.5): when EVERY ticked item throws, the fault
      // is infra/harness (unscripted label, worktree failure), never per-item
      // verdicts — retrying the identical tick is futile. Siblings already
      // finished their ticks (allSettled), so fail the wave loudly on the
      // first all-fail tick instead of spinning.
      while (!waveState.canMerge && !waveState.isComplete && waveTicks < WAVE_TICK_CAP) {
        waveTicks++;

        // Poll mailbox at the start of each wave tick (§8.8)
        await pollSteering();
        if (stopRequested) break;

        if (budgetTracker) {
          const itBudgetCheck = budgetTracker.checkIterationBudget(iteration);
          if (itBudgetCheck.exceeded) {
            await appendJournal(taskDir, { type: "iteration_budget_exceeded", iteration });
            break;
          }
        }

        // Re-derive states after polling (answers may have unblocked items).
        // Blocked-then-answered (§8.8): newly-unblocked items re-enter their
        // wave here — the waiting bucket covers them once the wave re-opens.
        itemStates = await Promise.all(
          currentIterationItems.map((slug) =>
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        waveState = deriveWaveState({
          wave: w,
          items: itemStates,
          blockedBy: await collectRoutedBlockers(
            taskDir,
            pipeline.concerns?.minBlockingSeverity ?? "high"
          ),
        });
        if (waveState.canMerge || waveState.isComplete) break;
        // HEADLINE reconciler at the top of each wave-tick iteration:
        // ownerless past-wave stragglers are injected into this tick set.
        let reconciledExtra: DerivedItemState[] = [];
        {
          // Latest journaled merge failure per slug (orphan-redrive evidence,
          // refreshed each tick so mid-wave failures are visible).
          const tickMergeErrBySlug = new Map<string, string>();
          for (const e of await readJournal(taskDir)) {
            const r = e as unknown as { type?: string; item?: string; error?: string; evidence?: string };
            if ((r.type === "item_merge_failed" || r.type === "item_merge_gates_failed") && typeof r.item === "string" && typeof (r.error ?? r.evidence) === "string") {
              tickMergeErrBySlug.set(r.item, (r.error ?? r.evidence) as string);
            }
          }
          const { requeued, mergeDue } = await reconcileWaveOwnership({
            taskDir,
            iteration,
            wave: w,
            itemStates,
            waveState,
            reconcileRequeues,
            requeue: true,
          });
          if (requeued.length > 0) {
            const requeuedSet = new Set(requeued);
            reconciledExtra = itemStates.filter((s) => requeuedSet.has(s.slug));
          }
          // Merge-stuck orphans route to the merge loop, never the tick set
          // (G1): redrive each via consult+bounded-merge here (same helper as
          // wave-top and wave-end), grounded in the latest journaled merge
          // failure (fallback: the merge-stuck marker). A merged redrive
          // breaks to the merge gate via the re-derived state below.
          for (const slug of mergeDue) {
            const it = itemStates.find((s) => s.slug === slug);
            if (!it) continue;
            const err = tickMergeErrBySlug.get(slug) ?? `merge-stuck orphan: integrate ok but unmerged for wave ${w}`;
            const res = await redriveMergeAfterConsult(it, err, {
              task, taskDir, taskWt, parentBranch, repo, harness, pipeline, project,
              prompts, wave: w, iteration, turnsSemaphore, architectSessionId,
              infraGates: infraArtifact?.gates, infraTestRunner: infraArtifact?.testRunner, rootTaskWt: params.rootTaskWt, rootTaskDir: params.rootTaskDir,
            });
            architectSessionId = res.sessionId ?? architectSessionId;
            if (res.merged) {
              // A merged redrive changes derive inputs: refresh states so the
              // tick set below never ticks off a stale bucket.
              itemStates = await Promise.all(
                currentIterationItems.map((s) =>
                  deriveItemState({ taskDir, itemSlug: s, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
                )
              );
              waveState = deriveWaveState({
                wave: w,
                items: itemStates,
                blockedBy: await collectRoutedBlockers(taskDir, pipeline.concerns?.minBlockingSeverity ?? "high"),
              });
            }
          }
        }

        // Merge-stuck items are merge-owned, never tick-owned: filter them
        // out of the tick set even if a bucket lists them (G1). Their
        // re-drive happens via the merge loop (wave-top reconciler redrive
        // and the wave-end merge path below), bounded by the attempt ledger.
        const tickableItems = [...waveState.running, ...waveState.runnable, ...reconciledExtra].filter(
          (it) => !isMergeStuckItem(it)
        );
        const activeItems = tickableItems;
        // All remaining items are merge-owned (G1): ticks cannot advance
        // them — break to the merge gate instead of idling the tick cap.
        if (activeItems.length === 0) {
          break;
        }

        // Finding 25: Run wave items concurrently up to maxParallelItems.
        // Wave batch isolation: allSettled + per-item catch — one item's
        // throw journals `wave_tick_error` and marks the wave failed-open
        // (siblings keep ticking). After the batch, check task-level open
        // steer questions (root mailbox human-stop/human-async blocking the
        // task) and break to close-up if a task-level stop arrived.
        const itemSemaphore = new Semaphore(maxParallelItems);
        const batch = activeItems.slice(0, maxParallelItems);

        const batchResults = await Promise.allSettled(
          batch.map(async (it) => {
            const release = await itemSemaphore.acquire();
            try {
              if (stopRequested) return;
              // If epic item: run child task on parent branch (Finding 7)
              if (it.kind === "epic" && runTaskChild) {
                const childRes = await runTaskChild(it.slug);
                // Child status is reflected in deriveItemState
                return;
              }

              // Ensure child worktree
              const child = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);

              // Tick item machine
              await tickItemMachine({
                task,
                itemSlug: it.slug,
                parentBranch,
                taskWt,
                childWt: child.path,
                taskDir,
                repo,
                harness,
                pipeline,
                project,
                prompts,
                budgetTracker,
                turnsSemaphore,
                architectSessionId,
                rootTaskWt: params.rootTaskWt,
                rootTaskDir: params.rootTaskDir,
              });

              // Poll mailbox between item steps (§8.8)
              await pollSteering();
            } finally {
              release();
            }
          })
        );
        for (let bi = 0; bi < batchResults.length; bi++) {
          const r = batchResults[bi]!;
          if (r.status === "rejected") {
            await appendJournal(taskDir, {
              type: "wave_tick_error",
              wave: w,
              iteration,
              item: batch[bi]!.slug,
              error: (r.reason as any)?.message ?? String(r.reason),
            });
          }
        }
        // All-fail fast path: every ticked item threw — infra/harness fault,
        // never item verdicts. Siblings already finished (allSettled), so
        // fail the wave loudly on this first all-fail tick.
        if (batchResults.length > 0 && batchResults.every((r) => r.status === "rejected")) {
          const reasons = batchResults.map((r) => (r.status === "rejected" ? ((r.reason as any)?.message ?? String(r.reason)) : "")).join("; ");
          await appendJournal(taskDir, {
            type: "wave_all_ticks_failed",
            wave: w,
            iteration,
            ticks: 1,
            items: batch.map((b) => b.slug),
            error: reasons.slice(0, 500),
          });
          throw new Error(
            `Wave ${w} ticking failed for every item (infra/harness fault, not item verdicts): ${reasons.slice(0, 300)}`
          );
        }
        // Task-level stop: open human-stop/human-async steer question in the
        // root mailbox blocking the task breaks to close-up.
        {
          let taskStop = false;
          const stopDirs = [path.join(mailboxDir, "steer", "tousertoreview")];
          for (const dir of stopDirs) {
            if (!fs.existsSync(dir)) continue;
            let files: string[] = [];
            try {
              files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(".yaml"));
            } catch {}
            for (const f of files) {
              try {
                const q = await readYaml<SteerItemArtifact>(path.join(dir, f));
                if (!q || q.status !== "open") continue;
                if (
                  (q.disposition === "human-stop" || q.disposition === "human-async") &&
                  (q.blocks?.includes("task") || q.blocks?.includes(mailboxTask))
                ) {
                  taskStop = true;
                }
              } catch {}
            }
          }
          if (taskStop) {
            await appendJournal(taskDir, { type: "wave_task_stop", wave: w, iteration });
            break;
          }
        }

        // Refresh states after batch
        itemStates = await Promise.all(
          currentIterationItems.map((slug) =>
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        waveState = deriveWaveState({
          wave: w,
          items: itemStates,
          blockedBy: await collectRoutedBlockers(
            taskDir,
            pipeline.concerns?.minBlockingSeverity ?? "high"
          ),
        });
        await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      }
      if (stopRequested) {
        await appendJournal(taskDir, { type: "task_stopped_by_user", task });
        return {
          iteration,
          status: "stopped",
          architectSessionId,
        };
      }

      // Tick-cap re-drive: the cap is a stall breaker, never a wave exit.
      // Hitting it with the wave neither mergeable nor complete means ticks
      // stopped firing (provider stall / sham consult loop) while items are
      // mid-flow. Journal loudly and re-drive one more batch instead of
      // falling through to merge/close-up with stranded `running` items.
      if (
        waveTicks >= WAVE_TICK_CAP &&
        !waveState.canMerge &&
        !waveState.isComplete
      ) {
        const allStragglers = [...waveState.running, ...waveState.runnable].map((it) => it.slug);
        // Merge-owned items (a wave-end merge already ran for this wave) are
        // NOT re-ticked: the merge loop owns their re-drive, and ticking an
        // integrate-ok-but-unmerged item never advances it (tick-cap spin).
        const { mergeOwned } = await partitionTickStragglers(taskDir, w, waveState);
        const ownedSet = new Set(mergeOwned);
        const stragglers = allStragglers.filter((s) => !ownedSet.has(s));
        await appendJournal(taskDir, {
          type: "wave_tick_cap_hit",
          wave: w,
          iteration,
          ticks: waveTicks,
          stragglers,
          mergeOwned,
        });
        // Re-drive: re-derive and tick each straggler once more so a transient
        // stall gets another chance; the gate below still refuses close-up
        // while anything is non-terminal.
        for (const slug of stragglers) {
          try {
            const child = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, slug);
            await tickItemMachine({
              task,
              itemSlug: slug,
              parentBranch,
              taskWt,
              childWt: child.path,
              taskDir,
              repo,
              harness,
              pipeline,
              project,
              prompts,
              budgetTracker,
              architectSessionId,
              rootTaskWt: params.rootTaskWt,
              rootTaskDir: params.rootTaskDir,
            });
          } catch (err: any) {
            await appendJournal(taskDir, {
              type: "wave_redrive_error",
              wave: w,
              iteration,
              item: slug,
              error: err?.message ?? String(err),
            });
          }
        }
        itemStates = await Promise.all(
          currentIterationItems.map((s) =>
            deriveItemState({ taskDir, itemSlug: s, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        waveState = deriveWaveState({
          wave: w,
          items: itemStates,
          blockedBy: await collectRoutedBlockers(
            taskDir,
            pipeline.concerns?.minBlockingSeverity ?? "high"
          ),
        });
        await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      }

      // Refresh states after batch (routed blockers seed pending items only)
      const gateBlockedBy = await collectRoutedBlockers(
        taskDir,
        pipeline.concerns?.minBlockingSeverity ?? "high"
      );
      itemStates = await Promise.all(
        currentIterationItems.map((slug) =>
          deriveItemState({
            taskDir,
            itemSlug: slug,
            parentBranch,
            taskWt,
            pipeline,
            rootTaskDir: params.rootTaskDir,
            blockedBy: gateBlockedBy,
          })
        )
      );
      waveState = deriveWaveState({
        wave: w,
        items: itemStates,
        blockedBy: await collectRoutedBlockers(
          taskDir,
          pipeline.concerns?.minBlockingSeverity ?? "high"
        ),
      });
      architectSessionId = await consultRoutedBlockers(
        consultCtx,
        waveState.blocked.map((it) => it.slug)
      );
      consultCtx.architectSessionId = architectSessionId;
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    // Wave-complete gate (§8.4.5): the wave's tick work is done when every
    // wave item is wave-terminal (merged/failed/blocked/superseded/ready) —
    // `ready` merges right after the tick loop, so it must NOT hold the wave
    // open. Awaiting-fix-round or mid-step `running`/`pending` items DO keep
    // the wave open: journal wave_not_complete and re-drive, bounded so a
    // permanently-stalled item fails loudly instead of spinning forever.
    {
      // Merge-stuck items (merge-attempt ledger shows a wave-end merge
      // already ran for this wave) stay merge-owned: excluded from the tick
      // straggler set so the tick cap never spins on them. They fall through
      // to the wave-end merge below, which re-drives (bounded) or fails them
      // terminally with the evidence.
      const { stragglers, mergeOwned } = await partitionTickStragglers(taskDir, w, waveState);
      if (stragglers.length > 0) {
        waveRedrives.set(w, (waveRedrives.get(w) ?? 0) + 1);
        await appendJournal(taskDir, {
          type: "wave_not_complete",
          wave: w,
          iteration,
          stragglers,
          mergeOwned,
          redrive: waveRedrives.get(w),
        });
        if ((waveRedrives.get(w) ?? 0) > 5) {
          await appendJournal(taskDir, {
            type: "wave_stalled",
            wave: w,
            iteration,
            stragglers,
            mergeOwned,
          });
          throw new Error(
            `Wave ${w} stalled with non-terminal items after 5 re-drives: ${stragglers.join(", ")} (refusing close-up; fix the stall, then restart)`
          );
        }
      }
    }
    } finally {
      stopTimer();
    }
    // 6. Wave end merge path (§8.4.6, §7)
    // Scheduler-idle instrumentation (post-mortem Finding: a multi-minute gap
    // between wave_started and the close-up step with no journal explanation).
    // the semaphore wait inside the next step — leaves no trace. Timestamp both
    // ends with the engine clock (fake-clock friendly) and journal a
    // scheduler_wait event when the gap exceeds 60s so the next post-mortem
    // has a reason attached.
    const waveEndClock = getClock();
    const waveEndStartWall = waveEndClock.now();
    const waveEndStartMono = waveEndClock.monotonic();
    const mergeResults: Array<{ slug: string; ok: boolean; sha?: string }> = [];
    if (waveState.ready.length > 0) {
      for (const readyItem of waveState.ready) {
        // Idempotent: a ready item's worktree normally exists (it ticked
        // there), but restarts/prunes can drop it — ensure before merging
        // so the merge path never spawns git in a missing cwd.
        const ensured = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, readyItem.slug);
        const childWtPath = ensured.path;

        const mRes = await mergeItem({
          task,
          item: readyItem,
          parentBranch,
          taskWt,
          childWt: childWtPath,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          taskDir,
          wave: w,
          turnsSemaphore,
        });
        mergeResults.push({ slug: readyItem.slug, ok: mRes.ok, sha: mRes.sha });

        // On merge failure (integrate or post-merge gates), route to the item
        // fix loop via consult so the failure is acted on, not retried blindly (§7).
        // Then RE-DRIVE the merge itself: a retry/fix decision means the item
        // is still merge-owned — re-derive (consult may have failed it), and
        // if still `ready`, merge again in this loop iteration. Bounded: at
        // most MAX_MERGE_ATTEMPTS_PER_WAVE attempts per item per wave
        // (persisted in merge-attempts.yaml, restarts resume the bound);
        // exhaustion fails the item terminally with the evidence (abandon
        // stranding it integrate-ok-but-unmerged forever. A terminal consult
        // decision (abandon/split → derive now `failed`/`superseded`) lets
        // the wave gate absorb it; otherwise journal `merge_failed_requeued`.
        // Never close the wave over a still-`ready` item without the gate noticing.
        if (!mRes.ok) {
          await appendJournal(taskDir, {
            type: "item_merge_failed",
            item: readyItem.slug,
            error: mRes.error,
            mergeAttempt: mRes.mergeAttempt,
          });
          // Merge failure (G2/G3): one consult with the failing evidence via
          // the shared helper — unknown-gate consults once with the known
          // list and applies the corrected target; exhaustion fails the item
          // terminally (absorbed by the wave gate), never reconciler strikes.
          const redriveRes = await redriveMergeAfterConsult(readyItem, mRes.error ?? "Merge path failed", {
            task, taskDir, taskWt, parentBranch, repo, harness, pipeline, project,
            prompts, wave: w, iteration, turnsSemaphore, architectSessionId,
            infraGates: infraArtifact?.gates, infraTestRunner: infraArtifact?.testRunner, rootTaskWt: params.rootTaskWt, rootTaskDir: params.rootTaskDir,
          });
          architectSessionId = redriveRes.sessionId ?? architectSessionId;
          const redriveIdx = mergeResults.findIndex((m) => m.slug === readyItem.slug);
          if (redriveIdx >= 0) {
            mergeResults[redriveIdx] = { slug: readyItem.slug, ok: redriveRes.merged, sha: redriveRes.sha };
          }
          // The helper consults and re-drives only when the item stays
          // mergeable (`ready`). Anything else (fix-round re-entry) ticks
          // the item machine — the merge loop never claims it.
          const postConsult = await deriveItemState({
            taskDir,
            itemSlug: readyItem.slug,
            parentBranch,
            taskWt,
            pipeline,
            rootTaskDir: params.rootTaskDir,
          });
          if (postConsult.status !== "failed" && postConsult.status !== "superseded" && postConsult.status !== "ready") {
            try {
              const child = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, readyItem.slug);
              await tickItemMachine({
                task,
                itemSlug: readyItem.slug,
                parentBranch,
                taskWt,
                childWt: child.path,
                taskDir,
                repo,
                harness,
                pipeline,
                project,
                prompts,
                budgetTracker,
                turnsSemaphore,
                architectSessionId,
                rootTaskWt: params.rootTaskWt,
                rootTaskDir: params.rootTaskDir,
              });
            } catch (err: any) {
              await appendJournal(taskDir, {
                type: "wave_tick_error",
                wave: w,
                iteration,
                item: readyItem.slug,
                error: err?.message ?? String(err),
              });
            }
            await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
            await appendJournal(taskDir, {
              type: "merge_failed_requeued",
              wave: w,
              iteration,
              item: readyItem.slug,
            });
          }
        }
      }
    }

    // Empty-wave streak guard (D4): after ticking, a wave with no merges and
    // no failures is an empty-complete wave — it ran the full close-up +
    // report ceremony with no progress. At `limits.maxEmptyWaves` consecutive
    // such waves (default 3), consult the architect via the existing
    // non-item consult path — asking continue-with-direction / end-iteration
    // — instead of running another empty close-up + report ceremony.
    // Journal the streak every empty wave; a progress wave resets it to 0.
    {
      const progressed = mergeResults.some((m) => m.ok) || waveState.failed.length > 0;
      if (progressed) {
        const streakSoFar = await readEmptyStreak(taskDir, iteration);
        if (streakSoFar > 0) {
          await appendJournal(taskDir, {
            type: "empty_wave_streak",
            wave: w,
            iteration,
            streak: 0,
          });
        }
      } else {
        const streakSoFar = await readEmptyStreak(taskDir, iteration);
        const streak = streakSoFar + 1;
        await appendJournal(taskDir, {
          type: "empty_wave_streak",
          wave: w,
          iteration,
          streak,
          blocked: waveState.blocked.map((b) => b.slug),
        });
        const maxEmpty = (pipeline.limits as Record<string, unknown> | undefined)?.["maxEmptyWaves"];
        const maxEmptyWaves = typeof maxEmpty === "number" && Number.isFinite(maxEmpty) && maxEmpty > 0 ? Math.floor(maxEmpty) : 3;
        if (streak >= maxEmptyWaves) {
          const consultRes = await runNonItemConsult({
            task,
            seam: `empty-waves-${iteration}`,
            contextText: `Waves completed with no progress for ${streak} consecutive waves (latest wave ${w}). Blocked: ${waveState.blocked.map((b) => b.slug).join(", ") || "(none)"}.`,
            feedbackText: `Decide: continue with direction (fix-item), end-iteration (accept-with-debt), escalate to operator (human-async), or abort.`,
            taskDir,
            taskWt,
            repo,
            harness,
            pipeline,
            project,
            prompts,
            architectSessionId,
            turnsSemaphore,
            budgetTracker,
            iteration,
          });
          architectSessionId = consultRes.sessionId ?? architectSessionId;
          await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
          const d = consultRes.decision.decision;
          // Empty-wave exits ALWAYS run the current wave's close-up/report
          // ceremony first: record the pending exit and fall through to the
          // ceremony below. `end` (end-iteration/abort/accept-with-debt)
          // additionally stops all remaining waves explicitly at the end of
          // the wave body — never silently skipping ceremony or waves.
          if (d === "end-iteration" || d === "abort" || d === "accept-with-debt") {
            pendingEmptyWaveExit = "end";
          } else if (d === "fix-item" && consultRes.decision.outline) {
            const o = consultRes.decision.outline as unknown as Record<string, unknown>;
            const slug = typeof o["slug"] === "string" ? (o["slug"] as string) : undefined;
            if (slug) {
              // Materialize a REAL validated assignment: build a
              // PlanEditsArtifact-shaped delta from the outline (defaults:
              // kind dev, title = slug, assignment = outline text), verify
              // slug/title/assignment present and slug not already known,
              // journal-drop `phantom_outline_dropped` on failure, else write
              // items/<slug>/assignment.yaml, git add/commit, push into
              // currentIterationItems, bump maxWave. Never push a bare slug.
              const kind = typeof o["kind"] === "string" && (o["kind"] as string).length > 0 ? (o["kind"] as string) : "dev";
              const title = typeof o["title"] === "string" && (o["title"] as string).length > 0 ? (o["title"] as string) : slug;
              const assignmentText =
                typeof o["assignment"] === "string" && (o["assignment"] as string).length > 0
                  ? (o["assignment"] as string)
                  : typeof o["description"] === "string" && (o["description"] as string).length > 0
                    ? (o["description"] as string)
                    : JSON.stringify(o);
              const phantomWave = w + 1;
              if (!slug || !title || !assignmentText || currentIterationItems.includes(slug)) {
                await appendJournal(taskDir, {
                  type: "phantom_outline_dropped",
                  wave: w,
                  iteration,
                  slug: slug ?? "(missing)",
                  reason: !slug ? "outline missing slug" : currentIterationItems.includes(slug) ? "slug already known" : "slug/title/assignment incomplete",
                });
              } else {
                try {
                  // Minimum validation (spec fix 4): slug/title/assignment
                  // present, slug not already known, kind known. No
                  // outlineRef is required — the consult outline IS the
                  // source, so full validateEdits (which demands a plan
                  // outlineRef) would wrongly drop it.
                  const phantomExisting = new Set((await buildExistingList(taskDir)).map((e) => e.slug));
                  const dropReason =
                    !slug || !title || !assignmentText
                      ? "slug/title/assignment incomplete"
                      : currentIterationItems.includes(slug) || phantomExisting.has(slug)
                        ? "slug already known"
                        : !validKindNames.includes(kind)
                          ? `unknown kind "${kind}"`
                          : undefined;
                  if (dropReason) {
                    await appendJournal(taskDir, {
                      type: "phantom_outline_dropped",
                      wave: w,
                      iteration,
                      slug: slug ?? "(missing)",
                      reason: dropReason,
                    });
                  } else {
                    // applyEdits-style: write ONLY the assignment file
                    // (never the edits artifact — that would clobber
                    // plan/edits-N.yaml), then git add/commit.
                    const assignment = {
                      slug,
                      kind,
                      title,
                      assignment: assignmentText,
                      ...(phantomWave !== undefined ? { wave: phantomWave } : {}),
                      deps: [] as string[],
                    };
                    const assignmentPath = path.join(taskDir, "items", slug, "assignment.yaml");
                    await fs.promises.mkdir(path.dirname(assignmentPath), { recursive: true });
                    await writeYamlAtomic(assignmentPath, assignment);
                    await git(taskWt, ["add", "-A"], { allowFail: true });
                    await commitAll(repo, taskWt, `factory: apply empty-wave fix-item ${slug} iteration ${iteration}`);
                    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
                    currentIterationItems.push(slug);
                    maxWave = Math.max(maxWave, phantomWave);
                    await appendJournal(taskDir, {
                      type: "phantom_outline_applied",
                      wave: w,
                      iteration,
                      slug,
                      phantomWave,
                    });
                  }
                } catch (err: any) {
                  await appendJournal(taskDir, {
                    type: "phantom_outline_dropped",
                    wave: w,
                    iteration,
                    slug,
                    reason: err?.message ?? String(err),
                  });
                }
              }
            }
            pendingEmptyWaveExit = "continue";
          } else {
            pendingEmptyWaveExit = "continue";
          }
          // Empty-wave exits ALWAYS run the current wave's close-up/report
          // ceremony first: record the exit and fall through to the ceremony
          // below. `end` (end-iteration/abort/accept-with-debt) additionally
          // stops all remaining waves explicitly at the end of the wave
          // body — never silently skipping ceremony/waves.
          await appendJournal(taskDir, {
            type: "empty_wave_exit_pending",
            wave: w,
            iteration,
            decision: d,
          });
        }
      }
    }
    // Wave close-up (§8.4.6); dependents of failed items go into the report (§8.2).
    // Blocked set is the wave state's transitive `failureBlocked` set
    // (sibling-owned fixpoint over `items`), intersected with the
    // current-wave blocked slugs for the summary.
    const currentWaveBlocked = new Set(waveState.blocked.map((b) => b.slug));
    const failedSlugs = waveState.failed.map((f) => f.slug);
    const blockedByFailureSlugs = (waveState.failureBlocked ?? []).filter((s) => currentWaveBlocked.has(s));
    const waveSummary = `Wave ${w} completed. Merged items: ${mergeResults.filter((m) => m.ok).map((m) => m.slug).join(", ")}${failedSlugs.length > 0 ? ` Failed items: ${failedSlugs.join(", ")}` : ""}${blockedByFailureSlugs.length > 0 ? ` Blocked-by-failure items: ${blockedByFailureSlugs.join(", ")}` : ""}`;
    const waveCloseupStepId = `wave-close-up-${iteration}-${w}`;
    const waveCloseupAttempt = getNextStepAttempt(runsDir, waveCloseupStepId, pipeline.limits?.maxInterruptions ?? 3);
    // Engine runs gates on the merged task branch; the close-up judges ONLY from this diff table.
    let gateDiffSection = "(no infra gates configured)";
    if (infraArtifact?.gates && infraArtifact.gates.length > 0) {
      const closeupCheckCtx: CheckContext = {
        repo,
        wt: taskWt,
        base: parentBranch,
        project,
        pipeline,
        infra: infraArtifact,
        kind: "wave-close-up",
        task,
        taskWt,
        taskDir,
        limits: pipeline.limits ?? {},
        outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
      };
      const gatesOutcome = await runGates(closeupCheckCtx);
      let closeupBaseline: GatesBaselineArtifact | undefined;
      if (actualBaselinePath) {
        try {
          closeupBaseline = await readYaml<GatesBaselineArtifact>(actualBaselinePath);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt gates baseline at ${actualBaselinePath}: ${err?.message ?? err}`);
          }
        }
      }
      gateDiffSection = buildGateDiffSection(closeupBaseline, gatesOutcome.results);
    }
    const waveCloseupRes = await runAgentStep({
      task,
      attempt: waveCloseupAttempt,
      stepId: waveCloseupStepId,
      stepFragment: "steps/wave-close-up",
      agent: "wave-close-up",
      role: "alt-workhorse",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        task,
        waveReport: waveSummary,
        infra: infraYaml,
        gateDiff: gateDiffSection,
      },
      parentBranch,
      turnsSemaphore,
      budgetTracker,
      iteration,
    });
    // Idle-gap accounting: the step above returns only after its semaphore wait,
    // gates, and harness turn. Journal the reason whenever the wave-end stretch
    // exceeds 60s (wall-clock beyond monotonic = machine suspend, not engine idle).
    {
      const gapWallMs = waveEndClock.now() - waveEndStartWall;
      const gapMonoMs = waveEndClock.monotonic() - waveEndStartMono;
      const evt = buildSchedulerWaitEvent({
        wave: w,
        iteration,
        gapWallMs,
        gapActiveMs: gapMonoMs,
        readyCount: waveState.ready.length,
        hasGates: Boolean(infraArtifact?.gates && infraArtifact.gates.length > 0),
        merges: mergeResults.map((m) => m.slug),
      });
      if (evt) await appendJournal(taskDir, evt as { type: string; [key: string]: unknown });
    }



    // Architect turn on wave report (§8.4.6)
    let waveDecision = "continue";
    const waveReportStepId = `architect-wave-report-${iteration}-${w}`;
    // Surface discarded-amendment notes (this wave's predecessors) so the architect can re-decide.
    const journalEvents = await readJournal(taskDir);
    const discardedNotes = journalEvents
      .filter((e: { type?: string; iteration?: number }) => e.type === "pm_amend_discarded" && e.iteration === iteration)
      .map((e) => `- discarded amendment (wave ${(e as unknown as { wave?: number }).wave}): ${((e as unknown as { note?: string }).note ?? "PM output invalid")}`);
    // Stranded resumes: tell the architect which items re-queued this wave
    // after a prior iteration stranded them mid-flow, so the resume is
    // deliberate rather than a mystery re-appearance.
    const strandedNotes = journalEvents
      .filter((e) => e.type === "item_stranded" && (e as any).iteration === iteration)
      .map((e) => `- stranded item re-queued: ${(e as any).item} (was ${(e as any).status ?? "non-terminal"} after step ${(e as any).step ?? "?"}, stranded from iteration ${(e as any).strandedFrom ?? "?"}; branch/records preserved, fix round resumes)`);
    const waveReportWaveReportText = [
      waveCloseupRes.output ? JSON.stringify(waveCloseupRes.output, null, 2) : waveSummary,
      ...(discardedNotes.length > 0
        ? [`\nDiscarded amendments (re-decide within the amendment budget):\n${discardedNotes.join("\n")}`]
        : []),
      ...(strandedNotes.length > 0
        ? [`\nStranded items resumed this iteration (prior iteration closed mid-flow):\n${strandedNotes.join("\n")}`]
        : []),
    ].join("\n");
    const waveReportStatusBlock = await buildTaskStatusBlock({
      taskDir, taskWt, parentBranch, itemSlugs: currentIterationItems, iteration, amendmentCount, pipeline, rootTaskDir: params.rootTaskDir,
    });
    // Fresh brief for this wave's goal: wave state evolved since the plan turn.
    const waveHydrationContext = await buildArchitectBrief({
      taskDir,
      task,
      taskWt,
      parentBranch,
      pipeline,
      iteration,
      rootTaskDir: params.rootTaskDir,
      goal: `${waveReportStepId}: evaluate wave ${w} results and decide continue/amend/end-iteration`,
      harness,
      prompts,
    });
    const waveReportAttempt = getNextStepAttempt(runsDir, waveReportStepId, pipeline.limits?.maxInterruptions ?? 3);
    const waveReportRes = await runAgentStep({
      task,
      attempt: waveReportAttempt,
      stepId: waveReportStepId,
      stepFragment: "steps/architect-wave-report",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      existingSessionId: architectSessionId,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        waveReport: waveReportWaveReportText,
        debt: waveHydrationContext,
        steering: waveHydrationContext,
        contextPack: contextPackText,
        taskStatus: waveReportStatusBlock,
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
      writeArtifact: async (output: unknown) => {
        const rawWave = output as any;
        waveDecision = rawWave?.decision ?? "continue";
        const wavesFolder = path.join(taskDir, "waves");
        await fs.promises.mkdir(wavesFolder, { recursive: true });
        const waveArtifact: WaveCloseupArtifact = {
          wave: w,
          iteration,
          status: mergeResults.some((m) => !m.ok) ? "has_failures" : "complete",
          mergedItems: mergeResults.filter((m) => m.ok).map((m) => m.slug),
          failedItems: mergeResults.filter((m) => !m.ok).map((m) => m.slug),
          blockedItems: blockedByFailureSlugs,
          summary: waveSummary,
        };
        await writeYamlAtomic(waveArtifactPath, waveArtifact);
      },
    });

    if (!waveReportRes.ok) {
      await appendJournal(taskDir, {
        type: "wave_report_failed",
        wave: w,
        iteration,
        error: waveReportRes.meta.error,
      });
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
    }

    if (waveReportRes.sessionId) {
      architectSessionId = waveReportRes.sessionId;
    }

    // Handle wave-report amend decision (§8.4.6, Finding 31)
    if (waveDecision === "amend") {
      const aCheck = checkAmendments(amendmentCount, maxAmendments);
      if (aCheck.exhausted) {
        // Amendment budget exhausted: drop loudly, never silently — the
        // architect's outlines/removals are journaled with the cap so the
        // next report can re-decide within budget or end the iteration.
        const dropped = waveReportRes.output as (DecisionArtifact & { outlines?: PlanItemOutline[]; removeItemSlugs?: string[] }) | undefined;
        await appendJournal(taskDir, {
          type: "pm_amend_discarded",
          iteration,
          wave: w,
          amendment: amendmentCount + 1,
          note: `Amendment budget exhausted (${amendmentCount}/${maxAmendments}); amend decision dropped`,
          outlines: Array.isArray(dropped?.outlines) ? (dropped!.outlines as PlanItemOutline[]).map((o) => (o as PlanItemOutline)?.slug).filter(Boolean) : [],
          removeItemSlugs: Array.isArray(dropped?.removeItemSlugs) ? dropped!.removeItemSlugs : [],
        });
      }
      if (!aCheck.exhausted) {
        amendmentCount++;
        const waveDecisionArtifact = waveReportRes.output as (DecisionArtifact & { outlines?: PlanItemOutline[]; removeItemSlugs?: string[] }) | undefined;
        const decisionOutlines: PlanItemOutline[] = Array.isArray(waveDecisionArtifact?.outlines) ? (waveDecisionArtifact!.outlines as PlanItemOutline[]) : [];
        const removeItemSlugs: string[] = Array.isArray(waveDecisionArtifact?.removeItemSlugs) ? (waveDecisionArtifact!.removeItemSlugs as string[]) : [];

        // Architect owns outlines: merge decision.outlines into plan.itemOutlines (replace by slug, append new).
        const mergedOutlines: PlanItemOutline[] = [...(plan!.itemOutlines ?? [])];
        const outlineIdx = new Map<string, number>(mergedOutlines.map((o, i) => [o.slug, i]));
        for (const o of decisionOutlines) {
          const slug = (o as PlanItemOutline | undefined)?.slug;
          if (typeof slug !== "string" || slug.length === 0) {
            throw new Error(`Amend decision outlines entry missing slug (wave ${w}, iteration ${iteration})`);
          }
          const at = outlineIdx.get(slug);
          if (at !== undefined) {
            mergedOutlines[at] = o;
          } else {
            outlineIdx.set(slug, mergedOutlines.length);
            mergedOutlines.push(o);
          }
        }
        plan = { ...plan!, itemOutlines: mergedOutlines };

        const amendPlanPath = path.join(planDir, `plan-${iteration}.${amendmentCount}.yaml`);
        const amendEditsPath = path.join(planDir, `edits-${iteration}.${amendmentCount}.yaml`);
        await writeYamlAtomic(amendPlanPath, plan);

        const amendFeedback = waveDecisionArtifact?.planDelta ?? waveDecisionArtifact?.rationale ?? "Wave amendment";
        const amendStatusBlock = await buildTaskStatusBlock({
          taskDir, taskWt, parentBranch, itemSlugs: currentIterationItems, iteration, amendmentCount, pipeline, rootTaskDir: params.rootTaskDir,
        });
        // The delta's items count against maxItemsPerPlan TOGETHER with every
        // item already in task history; state the remaining budget up front so
        // the PM does not emit an arithmetically impossible amendment (one
        // turn + resumed repair wasted, then discarded).
        const amendLimitsBlock = formatAmendLimitsBlock(
          limits,
          (await buildExistingList(taskDir)).length
        );
        const amendLimitViolations = formatLimitViolationsVar(
          plan ? checkPlanCountLimits(plan, { limits }) : []
        );
        const pmAmendStepId = `pm-amend-${iteration}-${amendmentCount}`;
        const pmAmendAttempt = getNextStepAttempt(runsDir, pmAmendStepId, pipeline.limits?.maxInterruptions ?? 3);
        const pmAmendRes = await runAgentStep({
          task,
          attempt: pmAmendAttempt,
          stepId: pmAmendStepId,
          stepFragment: "steps/pm-amend",
          agent: "pm",
          role: "alt-workhorse",
          sessionMode: "reuse",
          cwd: taskWt,
          taskWt,
          taskDir,
          recordsDir: runsDir,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          promptVars: {
            plan: JSON.stringify(plan, null, 2),
            taskStatus: amendStatusBlock,
            feedback: amendFeedback,
            waveReport: waveSummary,
            limits: amendLimitsBlock,
            limitViolations: amendLimitViolations,
          },
          turnsSemaphore,
          budgetTracker,
          iteration,
        });

        const discardAmendment = async (note: string, errors?: string[]) => {
          await appendJournal(taskDir, {
            type: "pm_amend_discarded",
            iteration,
            wave: w,
            amendment: amendmentCount,
            note,
            ...(errors ? { errors } : {}),
          });
        };

        if (!pmAmendRes.ok || !pmAmendRes.output) {
          // Amendments are optional progress: a failed PM turn discards the amendment, never the iteration.
          await discardAmendment(`PM amend step failed: ${pmAmendRes.meta.error ?? "no output"}`);
        } else {
          let rawAmendEdits = pmAmendRes.output as any;
          const coerceDelta = (raw: any): PlanEditsArtifact => ({
            iteration,
            amendmentIndex: amendmentCount,
            items: Array.isArray(raw?.items) ? raw.items : [],
          });
          let amendEdits = coerceDelta(rawAmendEdits);

          // Delta semantics: defensively drop re-emitted existing slugs (never fail on them).
          const dropReemitted = async (editsToFilter: PlanEditsArtifact): Promise<PlanEditsArtifact> => {
            const known = new Set((await buildExistingList(taskDir)).map((e) => e.slug));
            const dropped = editsToFilter.items.filter((it) => it?.slug && known.has(it.slug)).map((it) => it.slug);
            if (dropped.length > 0) {
              await appendJournal(taskDir, {
                type: "amend_existing_dropped",
                iteration,
                wave: w,
                amendment: amendmentCount,
                slugs: dropped,
              });
            }
            return { ...editsToFilter, items: editsToFilter.items.filter((it) => !(it?.slug && known.has(it.slug))) };
          };
          amendEdits = await dropReemitted(amendEdits);

          const validateAmend = async (editsToValidate: PlanEditsArtifact): Promise<string[]> => {
            const existingList = await buildExistingList(taskDir);
            return validateEdits(editsToValidate, {
              plan: plan!,
              limits,
              kinds: validKindNames,
              isRootTask: !isChildTask,
              existing: existingList,
            });
          };

          let amendErrors = await validateAmend(amendEdits);

          // ONE resumed repair turn in the SAME PM session: errors only, no plan resend.
          // Recorded as the step's next attempt (same stepId, full record/commit/budget accounting).
          if (amendErrors.length > 0 && pmAmendRes.sessionId) {
            const pmAmendRepairRes = await runAgentStep({
              task,
              attempt: pmAmendAttempt + 1,
              stepId: pmAmendStepId,
              stepFragment: "steps/pm-amend",
              agent: "pm",
              role: "alt-workhorse",
              sessionMode: "reuse",
              existingSessionId: pmAmendRes.sessionId,
              resumedRepair: true,
              repairFeedback: `Your previous output failed deterministic validation with these errors (fix ONLY these; yield NEW items only, never re-emit existing ones, never invent outlineRefs):\n${amendErrors.map((e) => `- ${e}`).join("\n")}`,
              cwd: taskWt,
              taskWt,
              taskDir,
              recordsDir: runsDir,
              repo,
              harness,
              pipeline,
              project,
              prompts,
              promptVars: {
                plan: JSON.stringify(plan, null, 2),
                taskStatus: amendStatusBlock,
                feedback: amendFeedback,
                waveReport: waveSummary,
                limits: amendLimitsBlock,
                limitViolations: amendLimitViolations,
              },
              turnsSemaphore,
              budgetTracker,
              iteration,
            });
            if (pmAmendRepairRes.ok && pmAmendRepairRes.output) {
              rawAmendEdits = pmAmendRepairRes.output as any;
              amendEdits = await dropReemitted(coerceDelta(rawAmendEdits));
              amendErrors = await validateAmend(amendEdits);
            }
          }

          if (amendErrors.length > 0) {
            await appendJournal(taskDir, {
              type: "pm_amend_validation_failed",
              iteration,
              wave: w,
              amendment: amendmentCount,
              errors: amendErrors,
            });
            await discardAmendment(`PM amend output invalid after resumed repair: ${amendErrors.join("; ")}`, amendErrors);
          } else if (amendEdits.items.length === 0 && removeItemSlugs.length === 0) {
            // Empty delta discards the PM items, but the architect's outlines
            // merged into plan-N.k above still stand (D2): journal what was
            // kept vs dropped so the drop is never silent.
            await appendJournal(taskDir, {
              type: "pm_amend_discarded",
              iteration,
              wave: w,
              amendment: amendmentCount,
              note: "PM amend delta empty after dropping re-emitted existing items; architect outlines kept in plan; continuing current waves",
              keptOutlines: decisionOutlines.map((o) => (o as PlanItemOutline)?.slug).filter(Boolean),
            });
            await discardAmendment("PM amend delta empty after dropping re-emitted existing items; architect outlines kept in plan; continuing current waves");
          } else {
            // removeItemSlugs supersedes PENDING items only; running/merged are protected.
            // Already-superseded/already-removed slugs are idempotent no-ops: the
            // engine's own terminal state for prior splits/amends (Finding: the first
            // amend could never apply once its target was split). No-ops journal
            // amend_remove_noop and are excluded from the supersede decisions so
            // re-applying the same removal is a clean no-op.
            const removalErrors: string[] = [];
            const removalNoops: string[] = [];
            const slugsToSupersede: string[] = [];
            for (const slug of removeItemSlugs) {
              const st = await deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir });
              if (!st.assignment) {
                removalErrors.push(`removeItemSlugs references unknown item "${slug}"`);
              } else if (st.status === "superseded") {
                removalNoops.push(slug);
              } else if (st.status !== "pending") {
                removalErrors.push(`removeItemSlugs cannot remove "${slug}" with status "${st.status}" (pending only)`);
              } else {
                slugsToSupersede.push(slug);
              }
            }
            // Effective removals are the pending subset; no-ops never reach
            // applyEdits so re-applying the same removal writes no duplicate
            // decision files.
            const effectiveRemovals = slugsToSupersede;
            // Removal-invalid must not swallow the valid parts (D2): apply
            // the PM delta items (and any no-op-excluded valid removals) and
            // journal exactly which removal slugs were dropped and why.
            if (removalErrors.length > 0 && amendEdits.items.length === 0 && effectiveRemovals.length === 0) {
              await appendJournal(taskDir, {
                type: "pm_amend_validation_failed",
                iteration,
                wave: w,
                amendment: amendmentCount,
                errors: removalErrors,
              });
              await discardAmendment(`Amend removal invalid: ${removalErrors.join("; ")}`, removalErrors);
            } else {
              if (removalErrors.length > 0) {
                await appendJournal(taskDir, {
                  type: "pm_amend_removals_dropped",
                  iteration,
                  wave: w,
                  amendment: amendmentCount,
                  errors: removalErrors,
                  noops: removalNoops,
                  appliedItems: amendEdits.items.map((i) => i.slug),
                  appliedRemovals: effectiveRemovals,
                });
                // Fall through with the valid subset: PM items + valid removals still apply.
              }
              if (amendEdits.items.length === 0 && effectiveRemovals.length === 0) {
                // Only no-ops (or nothing at all): journal, then discard
                // without an empty commit. The architect's outlines merged
                // into plan-N.k above still stand (D2).
                if (removalNoops.length > 0) {
                  await appendJournal(taskDir, {
                    type: "amend_remove_noop",
                    iteration,
                    wave: w,
                    amendment: amendmentCount,
                    slugs: removalNoops,
                  });
                }
                await appendJournal(taskDir, {
                  type: "pm_amend_discarded",
                  iteration,
                  wave: w,
                  amendment: amendmentCount,
                  note: "Amend removal no-op (already superseded); architect outlines kept in plan; nothing to apply",
                  keptOutlines: decisionOutlines.map((o) => (o as PlanItemOutline)?.slug).filter(Boolean),
                  noops: removalNoops,
                });
                await discardAmendment(
                  removalNoops.length > 0
                    ? `Amend removal no-op: ${removalNoops.join(", ")} already superseded; architect outlines kept in plan; nothing to apply`
                    : "PM amend delta empty after dropping re-emitted existing items; architect outlines kept in plan; continuing current waves"
                );
              } else {
                if (removalNoops.length > 0 && removalErrors.length === 0) {
                  await appendJournal(taskDir, {
                    type: "amend_remove_noop",
                    iteration,
                    wave: w,
                    amendment: amendmentCount,
                    slugs: removalNoops,
                  });
                }
                await writeYamlAtomic(amendEditsPath, amendEdits);
                let nextDecisionSeq = 1;
                const amendDecisionsDir = path.join(taskDir, "decisions");
                if (effectiveRemovals.length > 0 && fs.existsSync(amendDecisionsDir)) {
                  for (const name of await fs.promises.readdir(amendDecisionsDir)) {
                    const m = /^(\d{3})-/.exec(name);
                    if (m) nextDecisionSeq = Math.max(nextDecisionSeq, parseInt(m[1]!, 10) + 1);
                  }
                }
                const applied = applyEdits(amendEdits, { taskDir, plan: plan!, removeItemSlugs: effectiveRemovals, nextDecisionSeq });
                for (const f of applied.files) {
                  await fs.promises.mkdir(path.dirname(f.path), { recursive: true });
                  await writeTextAtomic(f.path, f.content);
                }
                await git(taskWt, ["add", "-A"], { allowFail: true });
                await commitAll(repo, taskWt, `factory: apply plan amendment ${iteration}.${amendmentCount}`);
                // Re-plan remaining waves with the amended items (§8.4.6, Finding 31)
                for (const added of amendEdits.items) {
                  if (!currentIterationItems.includes(added.slug)) {
                    currentIterationItems.push(added.slug);
                  }
                }
                const amendedStates = await Promise.all(
                  currentIterationItems.map((slug) =>
                    deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, project, rootTaskDir: params.rootTaskDir })
                  )
                );
                maxWave = Math.max(maxWave, amendedStates.reduce((m, it) => Math.max(m, it.wave), 1));
                }
              }
            }
          }
        }
      }
    // HEADLINE reconciler once pre-close-up per wave (c): re-derived states
    // so the gate sees the ceremony's aftermath (amends, phantom items).
    // Journal-only: the post-loop redrive below drives any orphans found.
    {
      const preCloseupStates = await Promise.all(
        currentIterationItems.map((slug) =>
          deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
        )
      );
      const preCloseupWave = deriveWaveState({ wave: w, items: preCloseupStates });
      await reconcileWaveOwnership({
        taskDir,
        iteration,
        wave: w,
        itemStates: preCloseupStates,
        waveState: preCloseupWave,
        reconcileRequeues,
        requeue: false,
      });
    }
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    // Honor a pending empty-wave consult exit AFTER the ceremony ran.
    if (pendingEmptyWaveExit !== undefined) {
      const exitDecision = pendingEmptyWaveExit;
      pendingEmptyWaveExit = undefined;
      await appendJournal(taskDir, {
        type: "empty_wave_exit",
        wave: w,
        iteration,
        decision: exitDecision,
        reason:
          exitDecision === "end"
            ? "empty-wave consult ended the iteration after close-up ceremony; remaining waves stopped"
            : "empty-wave consult continued after close-up ceremony",
      });
      if (exitDecision === "end") {
        w = maxWave + 1;
        break;
      }
      continue;
    }
  }

  // Check if any items are blocked on human questions (§8.2).
  // Blocked-then-answered (§8.8): after `pollSteering` answers, newly
  // unblocked items must re-enter their wave instead of returning
  // `blocked`/proceeding to close-up. If a previously-blocked item is now
  // unblocked-non-terminal, continue the wave loop for its wave instead of
  // returning blocked. Also clear/re-resolve epic `child-closeup.yaml`
  // files whose blocking questions are now answered (delete stale
  // `blocked` closeup + journal `epic_closeup_cleared`).
  const haltBlockedBy = await collectRoutedBlockers(
    taskDir,
    pipeline.concerns?.minBlockingSeverity ?? "high"
  );
  const allCurrentStates = await Promise.all(
    currentIterationItems.map((slug) =>
      deriveItemState({
        taskDir,
        itemSlug: slug,
        parentBranch,
        taskWt,
        pipeline,
        rootTaskDir: params.rootTaskDir,
        blockedBy: haltBlockedBy,
      })
    )
  );
  // Previously-blocked now unblocked-non-terminal items re-enter their
  // wave: drive them (ready→merge, else tick) instead of returning
  // blocked/proceeding to close-up over them.
  {
    const reenterable = allCurrentStates.filter(
      (it) => !isIterationTerminal(it.status) && it.status !== "blocked" && waveBlockedSkipped.has(it.wave)
    );
    if (reenterable.length > 0) {
      await appendJournal(taskDir, {
        type: "wave_reopened_answered",
        iteration,
        items: reenterable.map((it) => it.slug),
        waves: [...new Set(reenterable.map((it) => it.wave))],
      });
      for (const it of reenterable) {
        try {
          if (it.status === "ready") {
            const ensured = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);
            const childWtPath = ensured.path;
            const mRes = await mergeItem({
              task,
              item: it,
              parentBranch,
              taskWt,
              childWt: childWtPath,
              repo,
              harness,
              pipeline,
              project,
              prompts,
              taskDir,
              wave: it.wave,
              turnsSemaphore,
            });
            if (!mRes.ok) {
              await appendJournal(taskDir, { type: "item_merge_failed", item: it.slug, error: mRes.error, mergeAttempt: mRes.mergeAttempt });
            }
          } else {
            const child = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);
            await tickItemMachine({
              task,
              itemSlug: it.slug,
              parentBranch,
              taskWt,
              childWt: child.path,
              taskDir,
              repo,
              harness,
              pipeline,
              project,
              prompts,
              budgetTracker,
              turnsSemaphore,
              architectSessionId,
              rootTaskWt: params.rootTaskWt,
              rootTaskDir: params.rootTaskDir,
            });
          }
        } catch (err: any) {
          await appendJournal(taskDir, {
            type: "iteration_redrive_error",
            iteration,
            item: it.slug,
            error: err?.message ?? String(err),
          });
        }
      }
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      const reStates = await Promise.all(
        currentIterationItems.map((slug) =>
          deriveItemState({
            taskDir,
            itemSlug: slug,
            parentBranch,
            taskWt,
            pipeline,
            rootTaskDir: params.rootTaskDir,
            blockedBy: haltBlockedBy,
          })
        )
      );
      const stillBlocked = reStates.filter((it) => it.status === "blocked");
      if (stillBlocked.length > 0) {
        await appendJournal(taskDir, {
          type: "iteration_blocked",
          iteration,
          items: stillBlocked.map((it) => it.slug),
          questions: stillBlocked.flatMap((it) =>
            it.openSteerQuestion
              ? [{ id: it.openSteerQuestion.id, ref: it.openSteerQuestion.ref, item: it.slug }]
              : []
          ),
        });
        return {
          iteration,
          status: "blocked",
          plan,
          architectSessionId,
        };
      }
      await appendJournal(taskDir, { type: "wave_reopened_drained", iteration });
    }
  }
  // Who owns the next move when items are blocked (§8.7, §18)? Halt
  // when the operator does: any blocked item holding an OPEN blocking
  // question (human-async or human-stop, routed or raw). An open question
  // means someone must answer before the task can complete; exiting 0
  // would strand it. Items blocked with no open question (pure routed
  // seeds whose consult already ran) flow on to close-up instead.
  const haltingBlockers = allCurrentStates.filter(
    (it) => it.status === "blocked" && it.openSteerQuestion
  );
  if (haltingBlockers.length > 0) {
    await appendJournal(taskDir, {
      type: "iteration_blocked",
      iteration,
      items: haltingBlockers.map((it) => it.slug),
      questions: haltingBlockers.flatMap((it) =>
        it.openSteerQuestion
          ? [{ id: it.openSteerQuestion.id, ref: it.openSteerQuestion.ref, item: it.slug }]
          : []
      ),
    });
    return {
      iteration,
      status: "blocked",
      plan,
      architectSessionId,
    };
  }

  // Iteration-complete gate (§8.4.7): plan-close-up runs ONLY when every
  // iteration item is terminal (merged/failed/blocked/superseded). A `ready`
  // item is wave-terminal but iteration-still-open (unmerged); `running` /
  // `pending` items are mid-flow. Refusing on `ready` is deliberate, not
  // over-strict: closing the iteration over an unmerged item strands its
  // branch off the integration branch and the close-up would report work as
  // complete that the parent tree does not contain. The redrive below MERGES
  // ready items (the same path as the wave-end merge) before re-deriving, so
  // a genuinely mergeable item clears the gate on the next round; repeated
  // refusal means its merge verify keeps failing (e.g. unknown gate target,
  // target-green, gates) — a real stall, reported with per-item evidence
  // instead of closing silently. Bounded: at most MAX_ITERATION_REDRIVES
  // re-drive rounds, then fail loudly on a true stall.
  for (let redrive = 0; redrive <= MAX_ITERATION_REDRIVES; redrive++) {
    // Routed blockers seed pending items here too: without the seed set a
    // an unscripted step instead of recognising it as `blocked`.
    const gateBlockedBy = await collectRoutedBlockers(
      taskDir,
      pipeline.concerns?.minBlockingSeverity ?? "high"
    );
    const currentStates = await Promise.all(
      currentIterationItems.map((slug) =>
        deriveItemState({
          taskDir,
          itemSlug: slug,
          parentBranch,
          taskWt,
          pipeline,
          rootTaskDir: params.rootTaskDir,
          blockedBy: gateBlockedBy,
        })
      )
    );
    // Failure-union fixpoint (mirrors deriveTaskState §5b): cascade routed
    // seeds over declared deps so a dependent of a blocked item reads
    // `blocked` here instead of being ticked into an unscripted step.
    const gateSched = currentStates.map((it) => ({
      slug: it.slug,
      wave: String(it.wave),
      deps: it.deps,
      status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
    }));
    const gateBlocked = new Set(blockedByConcern(gateSched, gateBlockedBy));
    for (let i = 0; i < currentStates.length; i++) {
      currentStates[i] = withRoutedBlocking(currentStates[i]!, gateBlocked);
    }
    const nonTerminal = currentStates.filter((it) => !isIterationTerminal(it.status));
    if (nonTerminal.length === 0) break;
    // Answered-human-async items whose stored review still carries the
    // disposition tick through the item machine (answer hydrated as
    // feedback → fix re-entry → develop a2 → review approve). A
    // `ready` item is otherwise iteration-still-open: it merges on the
    // NEXT wave pass, so advance it immediately instead of refusing.
    const tickable = nonTerminal.filter((it) => it.status === "ready" || it.status === "running" || it.status === "pending");
    if (tickable.length === 0) break;
    const slugs = nonTerminal.map((it) => it.slug);
    await appendJournal(taskDir, {
      type: "plan_closeup_refused",
      iteration,
      stragglers: slugs,
      statuses: Object.fromEntries(nonTerminal.map((it) => [it.slug, it.status])),
      redrive,
    });
    if (redrive >= MAX_ITERATION_REDRIVES) {
      const evidence = lastIterationFailureEvidence(await readJournal(taskDir), slugs);
      await appendJournal(taskDir, {
        type: "iteration_stalled",
        iteration,
        stragglers: slugs,
        statuses: Object.fromEntries(nonTerminal.map((it) => [it.slug, it.status])),
        evidence,
      });
      throw new Error(
        formatIterationStallReason(
          iteration,
          nonTerminal.map((it) => ({ slug: it.slug, status: it.status })),
          evidence
        )
      );
    }
    for (const it of nonTerminal) {
      if (it.kind === "epic" && runTaskChild) {
        try {
          await runTaskChild(it.slug);
        } catch {}
        continue;
      }
      // A `ready` item is iteration-still-open only because it hasn't
      // merged: merge it here (same path as the wave-end merge) instead
      // of ticking the item machine (which would report `ready` again).
      if (it.status === "ready") {
        try {
          const ensured = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);
          const childWtPath = ensured.path;
          const mRes = await mergeItem({
            task,
            item: it,
            parentBranch,
            taskWt,
            childWt: childWtPath,
            repo,
            harness,
            pipeline,
            project,
            prompts,
            taskDir,
            wave: it.wave,
            turnsSemaphore,
          });
          if (!mRes.ok) {
            await appendJournal(taskDir, { type: "item_merge_failed", item: it.slug, error: mRes.error, mergeAttempt: mRes.mergeAttempt });
          }
        } catch (err: any) {
          await appendJournal(taskDir, {
            type: "iteration_redrive_error",
            iteration,
            item: it.slug,
            error: err?.message ?? String(err),
          });
        }
        continue;
      }
      try {
        const child = await ensureChildWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);
        await tickItemMachine({
          task,
          itemSlug: it.slug,
          parentBranch,
          taskWt,
          childWt: child.path,
          taskDir,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          budgetTracker,
          turnsSemaphore,
          architectSessionId,
          rootTaskWt: params.rootTaskWt,
          rootTaskDir: params.rootTaskDir,
        });
      } catch (err: any) {
        await appendJournal(taskDir, {
          type: "iteration_redrive_error",
          iteration,
          item: it.slug,
          error: err?.message ?? String(err),
        });
      }
    }
  }
  // 7. Plan close-up (§8.4.7, Finding 5 & 6)
  const planCloseupStepId = `plan-close-up-${iteration}`;
  const planCloseupAttempt = getNextStepAttempt(runsDir, planCloseupStepId, pipeline.limits?.maxInterruptions ?? 3);
  const planCloseupRes = await runAgentStep({
    task,
    attempt: planCloseupAttempt,
    stepId: planCloseupStepId,
    stepFragment: "steps/plan-close-up",
    agent: "plan-close-up",
    role: "alt-workhorse",
    cwd: taskWt,
    taskWt,
    taskDir,
    recordsDir: runsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: {
      intent: intentText,
      plan: JSON.stringify(plan, null, 2),
      context: contextYaml,
    },
    parentBranch,
    turnsSemaphore,
    budgetTracker,
    iteration,
  });



  let closeupArtifact: PlanCloseupArtifact | undefined;
  const archCloseupStepId = `architect-closeup-${iteration}`;
  const archCloseupAttempt = getNextStepAttempt(runsDir, archCloseupStepId, pipeline.limits?.maxInterruptions ?? 3);
  const archCloseupStatusBlock = await buildTaskStatusBlock({
    taskDir, taskWt, parentBranch, itemSlugs: currentIterationItems, iteration, amendmentCount, pipeline, rootTaskDir: params.rootTaskDir,
  });
  const archCloseupRes = await runAgentStep({
    task,
    attempt: archCloseupAttempt,
    stepId: archCloseupStepId,
    stepFragment: "steps/architect-closeup",
    agent: "architect",
    role: "architect",
    sessionMode: "reuse",
    existingSessionId: architectSessionId,
    cwd: taskWt,
    taskWt,
    taskDir,
    recordsDir: runsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: {
      closeup: planCloseupRes.output ? JSON.stringify(planCloseupRes.output, null, 2) : "Plan close-up completed",
      plan: JSON.stringify(plan, null, 2),
      intent: intentText,
      contextPack: contextPackText,
      taskStatus: archCloseupStatusBlock,
    },
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      const rawCloseup = output as any;
      if (!rawCloseup || !rawCloseup.status) {
        throw new Error("Architect close-up output missing status");
      }
      closeupArtifact = {
        iteration,
        status: rawCloseup.status,
        summary: rawCloseup.summary ?? "Plan close-up completed",
        question: rawCloseup.question,
      };
      await writeYamlAtomic(path.join(taskDir, `closeup-${iteration}.yaml`), closeupArtifact);

      // If blocked close-up, write question to tousertoreview (Finding 6)
      if (rawCloseup.status === "blocked") {
        const qId = `closeup-${iteration}`;
        await writeQuestion(params.rootTaskWt ?? taskWt, params.rootTaskDir ?? taskDir, {
          id: qId,
          ref: "plan",
          disposition: "human-async",
          question: rawCloseup.question || "Plan close-up requires human review and guidance",
          blocks: ["task"],
        });
      }
    },
  });

  if (!archCloseupRes.ok || !closeupArtifact) {
    // Treat failed architect close-up as failure (Finding 5)
    return {
      iteration,
      status: "failed",
      plan,
      architectSessionId,
    };
  }

  await appendJournal(taskDir, { type: "closeup_written", iteration, status: closeupArtifact.status });
  // Close-up trust (§8.4.7): refuse `done` over non-terminal items.
  closeupArtifact = await enforceCloseupTrustGate({
    taskDir,
    taskWt,
    parentBranch,
    pipeline,
    rootTaskDir: params.rootTaskDir,
    iteration,
    itemSlugs: currentIterationItems,
    closeup: closeupArtifact,
  });

  // On next-iteration, clear architect session id for fresh session (§8.4.7)
  const nextSessionId = closeupArtifact.status === "next-iteration" ? undefined : archCloseupRes.sessionId;

  return {
    iteration,
    status:
      closeupArtifact.status === "complete"
        ? "done"
        : closeupArtifact.status === "blocked"
        ? "blocked"
        : "next-iteration",
    plan,
    lastCloseup: closeupArtifact,
    architectSessionId: nextSessionId,
  };
}
