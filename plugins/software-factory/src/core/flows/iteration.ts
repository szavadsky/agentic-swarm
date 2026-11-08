import fs from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  PlanArtifact,
  PlanCloseupArtifact,
  PlanEditsArtifact,
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
import { runAgentStep } from "./step-runner.js";
import { writeQuestion } from "../steer.js";
import { runItemConsult } from "./consults.js";
import { isContextPackStale, isContextPackEnabled, runContextPackStep } from "./ingest.js";
import { mergeItem } from "./merge-path.js";
import { tickItemMachine } from "./item-machine.js";
import { deriveItemState } from "../derive/item.js";
import { deriveWaveState } from "../derive/wave.js";
import { refreshStateYaml } from "../derive/task.js";
import { appendJournal } from "../journal.js";
import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
import { validateEdits } from "../plan/limits.js";
import { applyEdits } from "../plan/apply.js";
import { resolveRole } from "../config/roles.js";
import { PersistentAgent } from "../sessions.js";
import { Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";

async function hasOkRecord(recordsDir: string, stepPrefix: string): Promise<boolean> {
  if (!fs.existsSync(recordsDir)) return false;
  try {
    const entries = await fs.promises.readdir(recordsDir);
    for (const ent of entries) {
      if (ent.includes(stepPrefix)) {
        const metaPath = path.join(recordsDir, ent, "meta.yaml");
        if (fs.existsSync(metaPath)) {
          const meta = await readYaml<StepMetaArtifact>(metaPath);
          if (meta && meta.status === "ok") return true;
        }
      }
    }
  } catch {}
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
 * Builds a structured hydration summary capped at hydrationBytes (§4, §8.4.2).
 */
async function buildArchitectHydration(
  taskDir: string,
  maxBytes: number
): Promise<string> {
  const parts: string[] = [];

  // 1. Prior plans
  const planDir = path.join(taskDir, "plan");
  if (fs.existsSync(planDir)) {
    const files = (await fs.promises.readdir(planDir)).sort();
    for (const f of files) {
      if (f.startsWith("plan-") && f.endsWith(".yaml")) {
        const content = await readText(path.join(planDir, f));
        parts.push(`--- Prior Plan ${f} ---\n${content}`);
      }
    }
  }

  if (fs.existsSync(taskDir)) {
    const entries = (await fs.promises.readdir(taskDir)).sort();
    for (const f of entries) {
      if (f.startsWith("closeup-") && f.endsWith(".yaml")) {
        const content = await readText(path.join(taskDir, f));
        parts.push(`--- Prior Close-up ${f} ---\n${content}`);
      }
    }
  }

  // 3. Taken steering answers
  const takenDir = path.join(taskDir, "steer", "fromusertaken");
  if (fs.existsSync(takenDir)) {
    const sfiles = (await fs.promises.readdir(takenDir)).sort();
    for (const sf of sfiles) {
      if (!sf.endsWith(".yaml")) {
        const text = await readText(path.join(takenDir, sf));
        parts.push(`--- Steering Directive/Answer (${sf}) ---\n${text}`);
      }
    }
  }

  // 4. Decisions
  const decisionsDir = path.join(taskDir, "decisions");
  if (fs.existsSync(decisionsDir)) {
    const dfiles = (await fs.promises.readdir(decisionsDir)).sort();
    for (const df of dfiles) {
      if (df.endsWith(".yaml")) {
        const text = await readText(path.join(decisionsDir, df));
        parts.push(`--- Decision ${df} ---\n${text}`);
      }
    }
  }

  const combined = parts.join("\n\n");
  if (combined.length <= maxBytes) {
    return combined;
  }
  return combined.slice(combined.length - maxBytes);
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
          const closeupOk = await hasOkRecord(runsDir, `architect-closeup-${cIter}`);
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
  const hydrationBytes = limits.hydrationBytes ?? 65536;

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
          const st = await deriveItemState({ taskDir, itemSlug: it.slug, parentBranch, taskWt, pipeline });
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
  // Build hydration context
  const hydrationContext = await buildArchitectHydration(taskDir, hydrationBytes);

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
    (await hasOkRecord(runsDir, `architect-plan-${iteration}`)) ||
    (await hasOkRecord(runsDir, `architect-revise-${iteration}`));

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
    // Architect generates plan-N (§8.4.2)
    const planStepRes = await runAgentStep({
      task,
      stepId: `architect-plan-${iteration}`,
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
      const pmOk = await hasOkRecord(runsDir, `pm-edits-${iteration}`);
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
    const revStepRes = await runAgentStep({
      task,
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
        await writeQuestion(taskWt, taskDir, {
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
    const reviseRes = await runAgentStep({
      task,
      stepId: `architect-revise-${iteration}-${reviewRound}`,
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
    const pmStepRes = await runAgentStep({
      task,
      stepId: `pm-edits-${iteration}`,
      stepFragment: "steps/pm-edits",
      agent: "pm",
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
        plan: JSON.stringify(plan, null, 2),
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

    const rawEdits = pmStepRes.output as any;
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
    const existingList: { slug: string; status: string; wave?: string | number }[] = [];
    const itemsDir = path.join(taskDir, "items");
    if (fs.existsSync(itemsDir)) {
      const existingSlugs = await fs.promises.readdir(itemsDir);
      for (const es of existingSlugs) {
        existingList.push({ slug: es, status: "existing" });
      }
    }

    const validationErrors = validateEdits(edits, {
      plan,
      limits,
      kinds: validKindNames,
      isRootTask: !isChildTask,
      existing: existingList,
    });

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
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, project })
    )
  );

  let maxWave = initialStates.reduce((max, it) => Math.max(max, it.wave), 1);
  for (let w = 1; w <= maxWave; w++) {
    // Check if wave close-up already completed for this wave (Finding 24)
    const waveArtifactPath = path.join(taskDir, "waves", `wave-${iteration}.${w}.yaml`);
    if (fs.existsSync(waveArtifactPath)) {
      const waveOk = await hasOkRecord(runsDir, `architect-wave-report-${iteration}-${w}`);
      if (waveOk) {
        continue;
      }
    }

    // Collect item states
    let itemStates = await Promise.all(
      currentIterationItems.map((slug) =>
        deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
      )
    );
    let waveState = deriveWaveState({ wave: w, items: itemStates });

    if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
      continue;
    }

    await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });

    // Run wave items until wave can merge or complete
    let waveTicks = 0;
    while (!waveState.canMerge && !waveState.isComplete && waveTicks < 50) {
      waveTicks++;

      if (budgetTracker) {
        const itBudgetCheck = budgetTracker.checkIterationBudget(iteration);
        if (itBudgetCheck.exceeded) {
          await appendJournal(taskDir, { type: "iteration_budget_exceeded", iteration });
          break;
        }
      }

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
            });
          } finally {
            release();
          }
        })
      );

      // Refresh states after batch
      itemStates = await Promise.all(
        currentIterationItems.map((slug) =>
          deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
        )
      );
      waveState = deriveWaveState({ wave: w, items: itemStates });
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    }

    // 6. Wave end merge path (§8.4.6, §7)
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
          });
        }
      }
    }

    // Wave close-up (§8.4.6); dependents of failed items go into the report (§8.2)
    const failedSlugs = waveState.failed.map((f) => f.slug);
    const blockedByFailureSlugs = waveState.blocked
      .filter((b) => b.status === "pending" && b.deps.some((d) => failedSlugs.includes(d) || waveState.blocked.some((x) => x.slug === d)))
      .map((b) => b.slug);
    const waveSummary = `Wave ${w} completed. Merged items: ${mergeResults.filter((m) => m.ok).map((m) => m.slug).join(", ")}${failedSlugs.length > 0 ? ` Failed items: ${failedSlugs.join(", ")}` : ""}${blockedByFailureSlugs.length > 0 ? ` Blocked-by-failure items: ${blockedByFailureSlugs.join(", ")}` : ""}`;
    const waveCloseupRes = await runAgentStep({
      task,
      stepId: `wave-close-up-${iteration}-${w}`,
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
      },
      turnsSemaphore,
      budgetTracker,
      iteration,
    });



    // Architect turn on wave report (§8.4.6)
    let waveDecision = "continue";
    const waveReportRes = await runAgentStep({
      task,
      stepId: `architect-wave-report-${iteration}-${w}`,
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
        waveReport: waveCloseupRes.output ? JSON.stringify(waveCloseupRes.output, null, 2) : waveSummary,
        debt: hydrationContext,
        steering: hydrationContext,
        contextPack: contextPackText,
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
      if (!aCheck.exhausted) {
        amendmentCount++;
        const amendPlanPath = path.join(planDir, `plan-${iteration}.${amendmentCount}.yaml`);
        const amendEditsPath = path.join(planDir, `edits-${iteration}.${amendmentCount}.yaml`);
        await writeYamlAtomic(amendPlanPath, plan);

        const pmAmendRes = await runAgentStep({
          task,
          stepId: `pm-amend-${iteration}-${amendmentCount}`,
          stepFragment: "steps/pm-amend",
          agent: "pm",
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
            plan: JSON.stringify(plan, null, 2),
            feedback: (waveReportRes.output as any)?.rationale ?? "Wave amendment",
            waveReport: waveSummary,
          },
          turnsSemaphore,
          budgetTracker,
          iteration,
        });

        if (!pmAmendRes.ok || !pmAmendRes.output) {
          await appendJournal(taskDir, {
            type: "pm_amend_failed",
            error: pmAmendRes.meta.error ?? "PM amend step failed",
          });
          return {
            iteration,
            status: "failed",
            plan,
            architectSessionId,
          };
        }

        const rawAmendEdits = pmAmendRes.output as any;
        const amendEdits: PlanEditsArtifact = {
          iteration,
          amendmentIndex: amendmentCount,
          items: rawAmendEdits.items ?? [],
        };

        const existingList: { slug: string; status: string; wave?: string | number }[] = [];
        const itemsDir = path.join(taskDir, "items");
        if (fs.existsSync(itemsDir)) {
          const existingSlugs = await fs.promises.readdir(itemsDir);
          for (const es of existingSlugs) {
            existingList.push({ slug: es, status: "existing" });
          }
        }

        const validationErrors = validateEdits(amendEdits, {
          plan,
          limits,
          kinds: validKindNames,
          isRootTask: !isChildTask,
          existing: existingList,
        });

        if (validationErrors.length > 0) {
          await appendJournal(taskDir, {
            type: "pm_amend_validation_failed",
            errors: validationErrors,
          });
          return {
            iteration,
            status: "failed",
            plan,
            architectSessionId,
          };
        }

        await writeYamlAtomic(amendEditsPath, amendEdits);
        const applied = applyEdits(amendEdits, { taskDir, plan });
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
            deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline, project })
          )
        );
        maxWave = Math.max(maxWave, amendedStates.reduce((m, it) => Math.max(m, it.wave), 1));
      }
    } else if (waveDecision === "end-iteration") {
      break;
    }
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }

  // Check if any items are blocked on human questions (§8.2)
  const allCurrentStates = await Promise.all(
    currentIterationItems.map((slug) =>
      deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt, pipeline })
    )
  );
  const hasBlockedItems = allCurrentStates.some((it) => it.status === "blocked");
  if (hasBlockedItems) {
    return {
      iteration,
      status: "blocked",
      plan,
      architectSessionId,
    };
  }

  // 7. Plan close-up (§8.4.7, Finding 5 & 6)
  const planCloseupRes = await runAgentStep({
    task,
    stepId: `plan-close-up-${iteration}`,
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
  const archCloseupRes = await runAgentStep({
    task,
    stepId: `architect-closeup-${iteration}`,
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
        await writeQuestion(taskWt, taskDir, {
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
