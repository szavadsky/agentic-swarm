import fs from "node:fs";
import path from "node:path";
import type {
  ConcernCounts,
  ConcernSeverity,
  DecisionArtifact,
  PlanArtifact,
  PlanCloseupArtifact,
  PipelineConfig,
  ProjectConfig,
  SpendBreakdown,
  StateArtifact,
  StateItemInfo,
  StepMetaArtifact,
  SteerItemArtifact,
  TriageArtifact,
} from "../artifacts.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";
import { findOkCommittedRecord } from "../records/step-record.js";
import { deriveItemState, withRoutedBlocking, type DerivedItemState } from "./item.js";
import { deriveWaveState, type DerivedWaveState } from "./wave.js";
import { scanSpendFromDisk, type SpendTotals } from "../budget.js";
import { countConcerns, listConcerns, severityAtLeast } from "../concerns.js";
import { isDebtConcern } from "../triage.js";
import { questionBlocks } from "../steer.js";
import { blockedByConcern } from "../plan/scheduler.js";
import { git } from "../git/exec.js";
import { isAncestor } from "../git/commit.js";
import { readJournal } from "../journal.js";

/** Mirrors MAX_MERGE_ATTEMPTS_PER_WAVE in flows/merge-path.ts (import would cycle: merge-path → step-runner → derive/task). */
const TASK_MERGE_ATTEMPTS_BOUND = 2;

export interface DerivedRunningStep {
  item?: string;
  step: string;
  record: string;
  agent: string;
  role: string;
  model?: string;
  startedAt: string;
  elapsedMs: number;
}

export interface TaskFailureDetails {
  /** Slugs deriving `failed` (abandon decisions, epic child failure, merge-exhaustion). */
  failedItems: string[];
  /** Non-terminal slugs that can still move: pending/running/ready (+stranded requeue candidates). */
  recoverableItems: string[];
  /** True when any blocked item still has an open steering question outstanding. */
  hasOpenBlockers: boolean;
  /** True when an item carries an `item_stranded` journal event for this iteration but is absent from the live plan. */
  hasUnrequeuedStranded: boolean;
  /** Slugs stuck in `ready` with merge attempts left (merge redrive available). */
  mergeRetryAvailable: string[];
  /** Slugs whose journaled `item_stranded` event for this iteration never re-queued them into the live item list. */
  unrequeuedStranded: string[];
}

 export interface DerivedTaskState {
   task: string;
   kind?: string;
   status: "active" | "blocked" | "done" | "failed";
   iteration: number;
   currentWave?: number;
   plan?: PlanArtifact;
   items: DerivedItemState[];
   itemMap: Record<string, DerivedItemState>;
   waves: DerivedWaveState[];
   debt: string[];
   budgetSpentUsd: number;
   spendByRole: Record<string, SpendTotals>;
   spendByItem: Record<string, SpendTotals>;
   runningSteps: DerivedRunningStep[];
   concerns: ConcernCounts;
   hasOpenSteerQuestions: boolean;
   openSteerQuestions: SteerItemArtifact[];
   deadSteerFiles: Array<{ file: string; errors: number }>;
   lastCloseup?: PlanCloseupArtifact;
  toStateArtifact(): StateArtifact;
  /** Items re-queued this iteration after a prior iteration stranded them mid-flow. */
  strandedItems: string[];
  /** Populated only when status === "failed": why derive concluded nothing recoverable remains. */
  failureDetails?: TaskFailureDetails;
}

/**
 * Counts committed close-up iterations (§8.4): the number of `closeup-N.yaml`
 * files backed by an ok committed `architect-closeup-N` record — the same
 * done-ness rule the engine uses (§8.4.1). An uncommitted or missing record
 * means the close-up never landed, so it does not advance the iteration.
 */
export async function countCommittedCloseupIterations(opts: {
  taskDir: string;
  taskWt?: string;
}): Promise<number> {
  const { taskDir, taskWt } = opts;
  if (!fs.existsSync(taskDir)) return 0;
  const runsDir = path.join(taskDir, "runs");
  const entries = await fs.promises.readdir(taskDir, { withFileTypes: true });
  let count = 0;
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.startsWith("closeup-") || !ent.name.endsWith(".yaml")) continue;
    const m = /^closeup-(\d+)\.yaml$/.exec(ent.name);
    // Skip non-canonical names (closeup-latest.yaml) and N < 1: engine
    // iterations start at 1.
    if (!m) continue;
    const n = parseInt(m[1]!, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const closeupOk = await findOkCommittedRecord(runsDir, `architect-closeup-${n}`, taskWt);
    if (closeupOk) count++;
  }
  return count;
}

/**
 * Collects item slugs named by routed blocker concerns at or above
 * `minBlockingSeverity` (adr-routing-derived-state, adr-severity-policy-active).
 * Defaults to high; pure read, the concern store is authoritative.
 */
export async function collectRoutedBlockers(
  taskDir: string,
  minBlockingSeverity: ConcernSeverity = "high"
): Promise<Set<string>> {
  const affected = new Set<string>();
  for (const concern of await listConcerns(taskDir)) {
    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
    for (const slug of concern.affects ?? []) {
      affected.add(slug);
    }
  }
  return affected;
}

/**
 * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
 * Pure derivation; state.yaml is a materialized view never read for decisions.
 */
export async function deriveTaskState(opts: {
  taskDir: string;
  task: string;
  parentBranch?: string;
  taskWt: string;
  pipeline?: PipelineConfig;
  project?: ProjectConfig;
}): Promise<DerivedTaskState> {
  const { taskDir, task, taskWt, pipeline, project } = opts;
  const parentBranch = opts.parentBranch ?? `topic/${task}`;

  // 1. Triage
  let triage: TriageArtifact | undefined;
  const triagePath = path.join(taskDir, "triage.yaml");
  if (fs.existsSync(triagePath)) {
    try {
      triage = await readYaml<TriageArtifact>(triagePath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt triage file at ${triagePath}: ${err?.message ?? err}`);
      }
    }
  }

  // 2. Iteration count from committed close-ups (§8.4): only a closeup-N.yaml
  // backed by an ok committed architect-closeup-N record advances the
  // iteration — the same done-ness rule the engine uses (§8.4.1).
  const existingCloseupsCount = await countCommittedCloseupIterations({ taskDir, taskWt });
  let lastCloseup: PlanCloseupArtifact | undefined;
  if (fs.existsSync(taskDir)) {
    const entries = await fs.promises.readdir(taskDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.startsWith("closeup-") && ent.name.endsWith(".yaml")) {
        const cuPath = path.join(taskDir, ent.name);
        try {
          const cu = await readYaml<PlanCloseupArtifact>(cuPath);
          if (!lastCloseup || (cu.iteration && cu.iteration >= (lastCloseup.iteration ?? 0))) {
            lastCloseup = cu;
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt closeup file at ${cuPath}: ${err?.message ?? err}`);
          }
        }
      }
    }
  }

  const iteration = existingCloseupsCount + 1;

  // Stranded marker: items whose journal shows `item_stranded` for this
  // iteration, re-queued after a prior iteration closed mid-flow. Audit
  // journal only (never read for decisions); status surfaces them distinctly
  // so operators see the resume, not a mystery re-run.
  const strandedSlugs = new Set<string>();
  try {
    const journalEvents = await readJournal(taskDir);
    for (const e of journalEvents) {
      if (e.type === "item_stranded" && (e as { iteration?: number }).iteration === iteration) {
        const slug = (e as { item?: string }).item;
        if (typeof slug === "string" && slug) strandedSlugs.add(slug);
      }
    }
  } catch {}


  // 3. Plan for current iteration
  let plan: PlanArtifact | undefined;
  const planPath = path.join(taskDir, "plan", `plan-${iteration}.yaml`);
  if (fs.existsSync(planPath)) {
    try {
      plan = await readYaml<PlanArtifact>(planPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt plan file at ${planPath}: ${err?.message ?? err}`);
      }
    }
  }

  // 4. Steer mailbox questions
  const openSteerQuestions: SteerItemArtifact[] = [];
  const steerDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(steerDir)) {
    const sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
    for (const sent of sentries) {
      if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
      const qPath = path.join(steerDir, sent.name);
      try {
        const q = await readYaml<SteerItemArtifact>(qPath);
        if (q && q.status === "open") {
          openSteerQuestions.push(q);
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt steer question file at ${qPath}: ${err?.message ?? err}`);
        }
      }
    }
  }

  // 5. Items
  const items: DerivedItemState[] = [];
  const itemsDir = path.join(taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
    for (const ent of itemEntries) {
      if (!ent.isDirectory()) continue;
      items.push(
        await deriveItemState({
          taskDir,
          itemSlug: ent.name,
          parentBranch,
          taskWt,
          pipeline,
          project,
        })
      );
    }
  }

  // 5b. Routed blockers (adr-routing-derived-state): a routed blocker concern
  // blocks the pending items it affects and their declared dependents,
  // transitively. The failure-union fixpoint has one owner
  // (blockedByConcern); task only maps derive statuses onto scheduler
  // inputs. Pending-only seeding matches §8.2 and keeps itemMap consistent
  // with deriveWaveState/iteration.
  const routedNames = await collectRoutedBlockers(
    taskDir,
    pipeline?.concerns?.minBlockingSeverity ?? "high"
  );
  const schedItems = items.map((it) => ({
    slug: it.slug,
    wave: String(it.wave),
    deps: it.deps,
    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
  }));
  const routedBlocked = new Set<string>(blockedByConcern(schedItems, routedNames));
  const itemMap: Record<string, DerivedItemState> = {};
  for (let i = 0; i < items.length; i++) {
    const blocked = withRoutedBlocking(items[i]!, routedBlocked);
    items[i] = blocked;
    itemMap[blocked.slug] = blocked;
  }

  // Sort items deterministically by wave then slug
  items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));

  // 6. Waves
  const waves: DerivedWaveState[] = [];
  const maxWave = items.reduce((max, it) => Math.max(max, it.wave), 1);
  let currentWave: number | undefined;

  // Items are already routed-blocked above, so wave calls intentionally omit
  // blockedBy (seeds now carry status blocked, not pending).
  for (let w = 1; w <= maxWave; w++) {
    const waveState = deriveWaveState({ wave: w, items });
    waves.push(waveState);
    if (currentWave === undefined && !waveState.isComplete) {
      currentWave = w;
    }
  }
  if (currentWave === undefined && waves.length > 0) {
    currentWave = waves[waves.length - 1]!.wave;
  }

  // 7. Tech debt collection
  const debtSet = new Set<string>();
  if (plan?.techDebt) {
    for (const d of plan.techDebt) {
      debtSet.add(d.description);
    }
  }
  // From decisions: accept-with-debt
  const decisionsDir = path.join(taskDir, "decisions");
  if (fs.existsSync(decisionsDir)) {
    const dentries = await fs.promises.readdir(decisionsDir, { withFileTypes: true });
    for (const dent of dentries) {
      if (!dent.isFile() || !dent.name.endsWith(".yaml")) continue;
      const dPath = path.join(decisionsDir, dent.name);
      try {
        const d = await readYaml<DecisionArtifact>(dPath);
        if (d && d.decision === "accept-with-debt" && d.debt) {
          debtSet.add(d.debt);
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt decision file at ${dPath}: ${err?.message ?? err}`);
        }
      }
    }
  }
  // From concerns: debt predicate (routed/resolved tech-debt, routed optional)
  for (const concern of await listConcerns(taskDir)) {
    if (!isDebtConcern(concern)) continue;
    const item = concern.source?.item ?? concern.affects?.[0];
    debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
  }
  // From review suggestions with disposition optional
  for (const it of items) {
    for (const rec of it.records) {
      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
        const suggestions = (rec.output as any).suggestions as Array<{ disposition?: string; summary?: string }>;
        for (const sug of suggestions ?? []) {
          if (sug.disposition === "optional" && sug.summary) {
            debtSet.add(`[${it.slug}] ${sug.summary}`);
          }
        }
      }
    }
  }

  // 8. Budget spent from ALL records (task runs, live item worktrees, epic children)
  const spendScan = await scanSpendFromDisk({ taskDir, taskWt, parentBranch });
  const budgetSpentUsd = spendScan.total.costUsd;
  const spendByRole: Record<string, SpendTotals> = Object.fromEntries(
    [...spendScan.byRole.entries()].map(([k, v]) => [k, { ...v }])
  );
  const spendByItem: Record<string, SpendTotals> = Object.fromEntries(
    [...spendScan.byItem.entries()].map(([k, v]) => [k, { ...v }])
  );

  // 8b. Currently running steps (meta.status === "started", not yet finished).
  const runningSteps: DerivedRunningStep[] = [];
  const nowMs = Date.now();
  const runsDir = path.join(taskDir, "runs");
  if (fs.existsSync(runsDir)) {
    const rEntries = await fs.promises.readdir(runsDir, { withFileTypes: true });
    for (const ent of rEntries) {
      if (!ent.isDirectory()) continue;
      const metaPath = path.join(runsDir, ent.name, "meta.yaml");
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = await readYaml<StepMetaArtifact>(metaPath);
        if (meta?.status === "started" && meta.startedAt) {
          const startedMs = Date.parse(meta.startedAt);
          runningSteps.push({
            step: meta.name ?? ent.name,
            record: ent.name,
            agent: meta.agent,
            role: meta.role,
            model: meta.models?.[0],
            startedAt: meta.startedAt,
            elapsedMs: Number.isNaN(startedMs) ? 0 : Math.max(0, nowMs - startedMs),
          });
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt step record meta at ${metaPath}: ${err?.message ?? err}`);
        }
      }
    }
  }
  for (const it of items) {
    for (const rec of it.records) {
      if (rec.meta.status === "started" && rec.meta.startedAt) {
        const startedMs = Date.parse(rec.meta.startedAt);
        runningSteps.push({
          item: it.slug,
          step: rec.meta.name ?? rec.name,
          record: rec.dirName,
          agent: rec.meta.agent,
          role: rec.meta.role,
          model: rec.meta.models?.[0],
          startedAt: rec.meta.startedAt,
          elapsedMs: Number.isNaN(startedMs) ? 0 : Math.max(0, nowMs - startedMs),
        });
      }
    }
  }
  runningSteps.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  // 9. Overall task status determination (§6.3 Invariant 4)
  let status: "active" | "blocked" | "done" | "failed" = "active";
  let failureDetails: TaskFailureDetails | undefined;
  const hasTaskLevelOpenQuestion = openSteerQuestions.some((q) =>
    questionBlocks(q, "task")
  );

  if (hasTaskLevelOpenQuestion) {
    status = "blocked";
  } else if (lastCloseup?.status === "complete") {
    status = "done";
  } else if (lastCloseup?.status === "blocked") {
    // Finding 6: An answered blocked close-up starts iteration N+1
    const closeupQuestion = openSteerQuestions.find(
      (q) => questionBlocks(q, "task") || q.id === `closeup-${iteration}`
    );
    if (closeupQuestion && closeupQuestion.status === "open") {
      status = "blocked";
    } else {
      // Closed/answered -> active to start iteration N+1
      status = "active";
    }
  } else if (items.length > 0 && items.every((it) => it.status === "blocked")) {
    // human-async parks an item, not the task; only mixed/other blocks halt it.
    const blockedByNonAsync = items.some(
      (it) => it.status === "blocked" && it.openSteerQuestion?.disposition !== "human-async"
    );
    if (blockedByNonAsync) status = "blocked";
  } else if (items.length > 0 && items.some((it) => it.status === "failed")) {
    // Task-level `failed` means NOTHING recoverable remains — not any-item-failed.
    // Failed siblings must never kill the task at derive time while recovery,
    // waves, or re-queues can still move (§8.4.1, §7 redrive).
    const failedItems = items.filter((it) => it.status === "failed").map((it) => it.slug);
    const liveSlugs = new Set(items.map((it) => it.slug));
    const recoverableItems = items
      .filter((it) => it.status === "pending" || it.status === "running" || it.status === "ready")
      .map((it) => it.slug);
    const hasOpenBlockers = items.some(
      (it) => it.status === "blocked" && it.openSteerQuestion?.status === "open"
    );
    // Stranded-but-unrequeued: journaled `item_stranded` for this iteration for
    // a slug absent from the live item list. On restart the engine re-queues
    // these via recoverStrandedItems before the wave loop runs; deriving
    // `failed` first would exit before that recovery ever fires.
    const unrequeuedStranded = [...strandedSlugs].filter((s) => !liveSlugs.has(s));
    // Merge redrive available: `ready` items with merge attempts left under
    // MAX_MERGE_ATTEMPTS_PER_WAVE. The ledger lives at
    // items/<slug>/merge-attempts.yaml keyed by wave; unreadable ledger reads
    // as attempts available (fail-open, same as the iteration tick).
    const mergeRetryAvailable: string[] = [];
    for (const it of items) {
      if (it.status !== "ready") continue;
      try {
        const ledgerPath = path.join(taskDir, "items", it.slug, "merge-attempts.yaml");
        let attempts = 0;
        if (fs.existsSync(ledgerPath)) {
          const ledger = await readYaml<{ attempts?: Record<string, number> }>(ledgerPath);
          attempts = ledger?.attempts?.[String(it.wave)] ?? 0;
        }
        if (attempts < TASK_MERGE_ATTEMPTS_BOUND) mergeRetryAvailable.push(it.slug);
      } catch {
        mergeRetryAvailable.push(it.slug);
      }
    }
    const nothingRecoverable =
      recoverableItems.length === 0 &&
      !hasOpenBlockers &&
      unrequeuedStranded.length === 0 &&
      mergeRetryAvailable.length === 0;
    if (nothingRecoverable) {
      status = "failed";
      failureDetails = {
        failedItems,
        recoverableItems,
        hasOpenBlockers,
        hasUnrequeuedStranded: unrequeuedStranded.length > 0,
        mergeRetryAvailable,
        unrequeuedStranded,
      };
    } else {
      status = "active";
    }
  } else if (triage?.kind === "simple") {
    // Finding 2 & 3: Simple task completion requires merged commit on parent
    const simpleAssignmentPath = path.join(taskDir, "items", "simple", "assignment.yaml");
    if (fs.existsSync(simpleAssignmentPath)) {
      // Converted to item: defer to items state
      if (items.length > 0 && items.every((it) => it.status === "merged")) {
        status = "done";
      } else if (items.some((it) => it.status === "failed")) {
        // Same rule as the general branch: failed siblings must not kill the
        // task while recoverable work remains.
        const stillLive = items.some(
          (it) => it.status === "pending" || it.status === "running" || it.status === "ready"
        );
        status = stillLive ? "active" : "failed";
      } else if (items.some((it) => it.status === "blocked")) {
        status = "blocked";
      } else {
        status = "active";
      }
    } else {
      // Direct simple flow: check newest simple-implement record has meta.status === "ok"
      // AND topic/{task}--scratch (or legacy topic/{task}--simple) has commits that are an ancestor of task HEAD
      const runsDir = path.join(taskDir, "runs");
      let newestSimpleOk = false;
      if (fs.existsSync(runsDir)) {
        const rEntries = (await fs.promises.readdir(runsDir))
          .filter((r) => r.includes("simple-implement"))
          .sort();
        if (rEntries.length > 0) {
          const lastSimpleDir = path.join(runsDir, rEntries[rEntries.length - 1]!);
          const metaPath = path.join(lastSimpleDir, "meta.yaml");
          if (fs.existsSync(metaPath)) {
            try {
              const meta = await readYaml<StepMetaArtifact>(metaPath);
              if (meta && meta.status === "ok") {
                newestSimpleOk = true;
              }
            } catch (err: any) {
              if (err?.code !== "ENOENT") {
                throw new Error(`Corrupt meta file at ${metaPath}: ${err?.message ?? err}`);
              }
            }
          }
        }
      }
      let isScratchMerged = false;
      if (newestSimpleOk && taskWt) {
        try {
          const scratchBranch = `topic/${task}--scratch`;
          let scratchShaRes = await git(taskWt, ["rev-parse", scratchBranch], { allowFail: true });
          if (scratchShaRes.code !== 0) {
            // Tolerate legacy topic/{task}--simple scratch if it exists
            scratchShaRes = await git(taskWt, ["rev-parse", `topic/${task}--simple`], { allowFail: true });
          }
          const taskHeadRes = await git(taskWt, ["rev-parse", "HEAD"], { allowFail: true });
          if (scratchShaRes.code === 0 && taskHeadRes.code === 0) {
            const scratchSha = scratchShaRes.stdout.trim();
            const taskHeadSha = taskHeadRes.stdout.trim();
            if (scratchSha && taskHeadSha) {
              const isAnc = await isAncestor(taskWt, scratchSha, taskHeadSha);
              if (isAnc) {
                isScratchMerged = true;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (newestSimpleOk && isScratchMerged) {
        status = "done";
      }
    }
  } else if (items.length > 0 && items.every((it) => it.status === "merged")) {
    status = "active";
  }

  const concerns = await countConcerns(taskDir);

  const toStateArtifact = (): StateArtifact => {
    const itemsRecord: Record<string, StateItemInfo> = {};
    for (const it of items) {
      itemsRecord[it.slug] = {
        kind: it.kind,
        status: it.status,
        branch: it.branch,
        attempts: it.currentAttempt,
        fixRounds: it.currentFixRound,
        spendUsd: spendByItem[it.slug]?.costUsd ?? 0,
        currentStep: it.currentStepId,
        mergedAt: it.mergedAt,
      };
    }
    const toBreakdown = (totals: SpendTotals): SpendBreakdown => ({
      costUsd: totals.costUsd,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
    });
    return {
      task,
      kind: triage?.kind,
      status,
      iteration,
      currentWave,
      items: itemsRecord,
      concerns,
      debt: Array.from(debtSet),
      budgetSpentUsd,
      spendByRole: Object.fromEntries(Object.entries(spendByRole).map(([k, v]) => [k, toBreakdown(v)])),
      spendByItem: Object.fromEntries(Object.entries(spendByItem).map(([k, v]) => [k, toBreakdown(v)])),
      lastUpdated: new Date().toISOString(),
    };
  };

  return {
    task,
    kind: triage?.kind,
    status,
    iteration,
    currentWave,
    plan,
    items,
    itemMap,
    waves,
    debt: Array.from(debtSet),
    budgetSpentUsd,
    spendByRole,
    spendByItem,
    runningSteps,
    concerns,
    hasOpenSteerQuestions: openSteerQuestions.length > 0,
    openSteerQuestions,
    deadSteerFiles: await deriveDeadSteerFiles(taskDir),
    lastCloseup,
    strandedItems: [...strandedSlugs],
    failureDetails,
    toStateArtifact,
  };
}

/**
 * Derives the operator-visible steer dead-letter set (D3): every
 * `steer_poll_dead` file with no later `steer_processed` for the same file.
 * Pure journal scan; never throws (corrupt journal reads as empty).
 */
export async function deriveDeadSteerFiles(
  taskDir: string
): Promise<Array<{ file: string; errors: number }>> {
  let events: Array<{ type?: string; file?: string; errors?: number }>;
  try {
    events = (await readJournal(taskDir)) as Array<{ type?: string; file?: string; errors?: number }>;
  } catch {
    return [];
  }
  const dead = new Map<string, number>();
  for (const e of events) {
    if (e.type === "steer_poll_dead" && e.file) {
      dead.set(e.file, typeof e.errors === "number" ? e.errors : 0);
    } else if (e.type === "steer_processed" && e.file) {
      dead.delete(e.file);
    }
  }
  return [...dead.entries()].map(([file, errors]) => ({ file, errors }));
}

/**
 * Materializes state.yaml for humans (§6.3 Invariant 4).
 * Never read for decisions.
 *
 * state.yaml is a lagging materialized view: it refreshes only at
 * tick/step/batch boundaries (via {@link refreshStateYaml}), never after
 * every journal or decision write. Readers may see a state that predates the
 * latest on-disk records by up to one boundary — always re-derive from
 * records + git for decisions.
 */
export async function materializeStateYaml(taskDir: string, state: StateArtifact): Promise<void> {
  const statePath = path.join(taskDir, "state.yaml");
  await writeYamlAtomic(statePath, state);
}

/**
 * Derives current task state and refreshes state.yaml (ToySmoke: state.yaml
 * must refresh after every step, since a whole iteration runs within one tick).
 * Never read for decisions: like {@link materializeStateYaml}, the written
 * file is a lagging view refreshed here, not after every journal/decision
 * write — decisions always re-derive from records + git.
 */
export async function refreshStateYaml(opts: {
  taskDir: string;
  task: string;
  parentBranch: string;
  taskWt: string;
  pipeline: PipelineConfig;
}): Promise<DerivedTaskState> {
  const state = await deriveTaskState(opts);
  await materializeStateYaml(opts.taskDir, state.toStateArtifact());
  return state;
}
