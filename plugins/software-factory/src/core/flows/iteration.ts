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
import { writeQuestion, processSteeringMailbox } from "../steer.js";
import { runItemConsult, runNonItemConsult } from "./consults.js";
import { isContextPackStale, isContextPackEnabled, runContextPackStep } from "./ingest.js";
import { mergeItem } from "./merge-path.js";
import { tickItemMachine } from "./item-machine.js";
import { deriveItemState } from "../derive/item.js";
import { deriveWaveState } from "../derive/wave.js";
import { refreshStateYaml } from "../derive/task.js";
import { appendJournal, readJournal } from "../journal.js";
import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
import { validateEdits } from "../plan/limits.js";
import { applyEdits } from "../plan/apply.js";
import { getClock } from "../clock.js";
import { buildGateDiffSection, runGates } from "../checks/gates.js";
import type { CheckContext } from "../checks/types.js";
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

  // 1. Determine iteration number N (§8.4.1)
  let existingCloseups = 0;
  if (fs.existsSync(taskDir)) {
    const entries = await fs.promises.readdir(taskDir);
    for (const name of entries) {
      if (name.startsWith("closeup-") && name.endsWith(".yaml")) {
        const m = /^closeup-(\d+)\.yaml$/.exec(name);
        if (m) {
          const cIter = parseInt(m[1]!, 10);
          const closeupOk = await findOkCommittedRecord(runsDir, `architect-closeup-${cIter}`, taskWt);
          if (closeupOk) {
            existingCloseups++;
          }
        }
      }
    }
  }

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

        // Write ADRs if specified (§8.4.2)
        if (plan.adrs && project.adrFolder) {
          const adrDir = path.join(taskWt, project.adrFolder);
          await fs.promises.mkdir(adrDir, { recursive: true });
          for (const adr of plan.adrs) {
            const adrFile = path.join(adrDir, `${adr.id}.md`);
            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
          }
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
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
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

  // 3. Plan review rounds (§8.4.3, Finding 12: restart safe)
  if (!editsDone) {
    let reviewRound = 1;
    const reviewFingerprints: string[] = [];

    while (reviewRound <= maxPlanReviewRounds) {
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
        limits: JSON.stringify(limits, null, 2),
        dispositionsCriteria: formatDispositionsSection(
          loadCriteriaBundle(pipeline.criteria).dispositions,
          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
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
    const awarenessSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "human-awareness");
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
    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
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
          plan = { ...plan, ...(output as any), iteration };
          await writeYamlAtomic(planPath, plan);
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
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    }
  }

  // 4. PM edits (§8.4.4, Finding 12 & 13)
  const { kindsDescription, validKindNames } = buildKindsPromptVar(pipeline, !isChildTask);
  if (!editsDone) {
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
      await appendJournal(taskDir, {
        type: "pm_edits_validation_failed",
        errors: validationErrors,
      });
      return {
        iteration,
        status: "failed",
        plan,
        architectSessionId,
      };
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

  const initialStates = await Promise.all(
    currentIterationItems.map((slug) =>
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, project, rootTaskDir: params.rootTaskDir })
    )
  );

  let maxWave = initialStates.reduce((max, it) => Math.max(max, it.wave), 1);
  for (let w = 1; w <= maxWave; w++) {
    // Restart-safety: an ok amend record WITHOUT structural outlines is old-format — re-run, never reuse.
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
    // Check if wave close-up already completed for this wave (Finding 24)
    const waveArtifactPath = path.join(taskDir, "waves", `wave-${iteration}.${w}.yaml`);
    if (fs.existsSync(waveArtifactPath)) {
      const waveOk = await findOkCommittedRecord(runsDir, pendingWaveReportId, taskWt);
      if (waveOk) {
        continue;
      }
    }

    // Collect item states
    let itemStates = await Promise.all(
      currentIterationItems.map((slug) =>
        deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
      )
    );
    let waveState = deriveWaveState({ wave: w, items: itemStates });

    if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
      continue;
    }

    await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });

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

      // Run wave items until wave can merge or complete
      let waveTicks = 0;
      while (!waveState.canMerge && !waveState.isComplete && waveTicks < 50) {
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

        // Re-derive states after polling (answers may have unblocked items)
        itemStates = await Promise.all(
          currentIterationItems.map((slug) =>
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        waveState = deriveWaveState({ wave: w, items: itemStates });
        if (waveState.canMerge || waveState.isComplete) break;

        const activeItems = [...waveState.running, ...waveState.runnable];
        if (activeItems.length === 0) {
          break;
        }

        // Finding 25: Run wave items concurrently up to maxParallelItems
        const itemSemaphore = new Semaphore(maxParallelItems);
        const batch = activeItems.slice(0, maxParallelItems);

        await Promise.all(
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

        // Refresh states after batch
        itemStates = await Promise.all(
          currentIterationItems.map((slug) =>
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
          )
        );
        waveState = deriveWaveState({ wave: w, items: itemStates });
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
    } finally {
      stopTimer();
    }

    // 6. Wave end merge path (§8.4.6, §7)
    // Scheduler-idle instrumentation (post-mortem Finding: a multi-minute gap
    // between wave_started and the close-up step with no journal explanation).
    // Whatever runs between — ready-item merges, gates on the merged branch,
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
        const childBranchName = childBranch(parentBranch, readyItem.slug);
        const childWtPath = path.join(
          repo.worktreeRoot ?? path.dirname(taskWt),
          childBranchName.replace(/\//g, "_")
        );

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
          turnsSemaphore,
        });
        mergeResults.push({ slug: readyItem.slug, ok: mRes.ok, sha: mRes.sha });

        // On merge failure (integrate or post-merge gates), route to the item
        // fix loop via consult so the failure is acted on, not retried blindly (§7).
        if (!mRes.ok) {
          await appendJournal(taskDir, {
            type: "item_merge_failed",
            item: readyItem.slug,
            error: mRes.error,
          });
          const diffRes = await git(childWtPath, ["diff", parentBranch], { allowFail: true });
          await runItemConsult({
            task,
            item: readyItem.slug,
            assignmentYaml: JSON.stringify(readyItem.assignment ?? {}),
            priorAttemptsText: `Merge path failed for ${readyItem.slug}`,
            diffText: diffRes.stdout,
            feedbackText: mRes.error ?? "Merge path failed",
            afterRecord: readyItem.records[readyItem.records.length - 1]?.dirName,
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
            rootTaskWt: params.rootTaskWt,
            rootTaskDir: params.rootTaskDir,
          });
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
            blocked: waveState.blocked.map((b) => b.slug),
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
          const d = consultRes.decision.decision;
          if (d === "end-iteration" || d === "abort" || d === "accept-with-debt") break;
          if (d === "fix-item" && consultRes.decision.outline) {
            const o = consultRes.decision.outline as unknown as Record<string, unknown>;
            const slug = typeof o["slug"] === "string" ? (o["slug"] as string) : undefined;
            if (slug && !currentIterationItems.includes(slug)) currentIterationItems.push(slug);
          }
          continue;
        }
      }
    }

    // Wave close-up (§8.4.6); dependents of failed items go into the report (§8.2)
    const failedSlugs = waveState.failed.map((f) => f.slug);
    const blockedByFailureSlugs = waveState.blocked
      .filter((b) => b.status === "pending" && b.deps.some((d) => failedSlugs.includes(d) || waveState.blocked.some((x) => x.slug === d)))
      .map((b) => b.slug);
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
      .filter((e) => e.type === "pm_amend_discarded" && (e as any).iteration === iteration)
      .map((e) => `- discarded amendment (wave ${(e as any).wave}): ${(e as any).note ?? "PM output invalid"}`);
    const waveReportWaveReportText = [
      waveCloseupRes.output ? JSON.stringify(waveCloseupRes.output, null, 2) : waveSummary,
      ...(discardedNotes.length > 0
        ? [`\nDiscarded amendments (re-decide within the amendment budget):\n${discardedNotes.join("\n")}`]
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
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }

  // Check if any items are blocked on human questions (§8.2)
  const allCurrentStates = await Promise.all(
    currentIterationItems.map((slug) =>
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, rootTaskDir: params.rootTaskDir })
    )
  );
  const blockedItems = allCurrentStates.filter((it) => it.status === "blocked");
  if (blockedItems.length > 0) {
    await appendJournal(taskDir, {
      type: "iteration_blocked",
      iteration,
      items: blockedItems.map((it) => it.slug),
      questions: blockedItems.flatMap((it) =>
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
  await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });

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
