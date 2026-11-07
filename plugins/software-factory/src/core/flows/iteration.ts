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
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import { childBranch } from "../git/naming.js";
import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
import { runAgentStep } from "./step-runner.js";
import { runItemConsult } from "./consults.js";
import { mergeItem } from "./merge-path.js";
import { tickItemMachine } from "./item-machine.js";
import { deriveItemState } from "../derive/item.js";
import { deriveWaveState } from "../derive/wave.js";
import { appendJournal } from "../journal.js";
import { checkPlanReviewRounds, checkIterations } from "../loops.js";
import type { BudgetTracker } from "../budget.js";
import type { Semaphore } from "../mutex.js";

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
  runTaskChild?: (taskName: string) => Promise<any>;
  log?: (msg: string) => void;
}

export interface IterationResult {
  iteration: number;
  status: "done" | "next_iteration" | "blocked" | "failed";
  plan?: PlanArtifact;
  lastCloseup?: PlanCloseupArtifact;
  architectSessionId?: string;
}

/**
 * Creates child worktree for an item (§7).
 */
async function ensureItemWorktree(
  repo: any,
  parent: { branch: string; path: string },
  slug: string
): Promise<{ branch: string; path: string }> {
  try {
    const { ensureChildWorktree } = await import("../git/worktrees.js" as any);
    return await ensureChildWorktree(repo, parent, slug);
  } catch {
    const branch = childBranch(parent.branch, slug);
    const wtPath = path.join(repo?.worktreeRoot ?? path.dirname(parent.path), branch.replace(/\//g, "_"));
    if (!fs.existsSync(wtPath)) {
      await git(parent.path, ["worktree", "add", "-B", branch, wtPath, "HEAD"], { allowFail: true });
    }
    return { branch, path: wtPath };
  }
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
  } = params;

  let architectSessionId = params.architectSessionId;
  const parentBranch = params.parentBranch ?? `topic/${task}`;
  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(runsDir, { recursive: true });

  // 1. Determine iteration number N (§8.4.1)
  let existingCloseups = 0;
  try {
    const entries = await fs.promises.readdir(taskDir);
    for (const name of entries) {
      if (name.startsWith("closeup-") && name.endsWith(".yaml")) {
        existingCloseups++;
      }
    }
  } catch {
    // ignore
  }

  const iteration = existingCloseups + 1;
  const limits = pipeline.limits ?? {};
  const maxIterations = limits.maxIterations ?? 3;
  const maxPlanReviewRounds = limits.maxPlanReviewRounds ?? 3;
  const maxParallelItems = limits.maxParallelItems ?? 2;

  await appendJournal(taskDir, { type: "iteration_started", iteration });

  // 2. Fresh plan or resume plan (§8.4.2)
  const planDir = path.join(taskDir, "plan");
  await fs.promises.mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, `plan-${iteration}.yaml`);
  let plan: PlanArtifact | undefined;

  if (fs.existsSync(planPath)) {
    try {
      plan = await readYaml<PlanArtifact>(planPath);
    } catch {
      // ignore
    }
  }

  const intentText = fs.existsSync(path.join(taskDir, "INTENT.md"))
    ? await readText(path.join(taskDir, "INTENT.md"))
    : "";
  const contextYaml = fs.existsSync(path.join(taskDir, "context.yaml"))
    ? await readText(path.join(taskDir, "context.yaml"))
    : "";
  const infraYaml = fs.existsSync(path.join(taskDir, "infra.yaml"))
    ? await readText(path.join(taskDir, "infra.yaml"))
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
        infra: infraYaml,
        debt: "",
        steering: "",
        limits: JSON.stringify(limits, null, 2),
      },
      turnsSemaphore,
    });

    if (planStepRes.sessionId) {
      architectSessionId = planStepRes.sessionId;
    }

    const rawPlan = (planStepRes.output as any) ?? {};
    plan = {
      iteration,
      milestones: rawPlan.milestones ?? [
        { id: "m1", title: "Milestone 1", scenarios: ["Scenario 1"] },
      ],
      uncertainties: rawPlan.uncertainties,
      itemOutlines: rawPlan.itemOutlines ?? [
        { slug: "story-1", kind: "dev", title: "Core story item", milestone: "m1" },
      ],
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

    // 3. Plan review rounds (§8.4.3)
    let reviewRound = 1;
    const reviewFingerprints: string[] = [];

    while (reviewRound <= maxPlanReviewRounds) {
      const revStepRes = await runAgentStep({
        task,
        stepId: `plan-review-${iteration}-${reviewRound}`,
        stepFragment: "steps/plan-review",
        agent: "plan-reviewer",
        role: "alt-architect",
        cwd: taskWt,
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
        },
        turnsSemaphore,
      });

      const revOutput = revStepRes.output as ReviewArtifact | undefined;
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
        },
        turnsSemaphore,
      });

      if (reviseRes.sessionId) {
        architectSessionId = reviseRes.sessionId;
      }
      if (reviseRes.output && typeof reviseRes.output === "object") {
        plan = { ...plan, ...(reviseRes.output as any), iteration };
        await writeYamlAtomic(planPath, plan);
      }

      reviewRound++;
    }

    // 4. PM edits (§8.4.4)
    const pmStepRes = await runAgentStep({
      task,
      stepId: `pm-edits-${iteration}`,
      stepFragment: "steps/pm-edits",
      agent: "pm",
      role: "alt-workhorse",
      cwd: taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        kinds: "dev, no-behavior, test-only, simple",
        citations: contextYaml,
        limits: JSON.stringify(limits, null, 2),
      },
      turnsSemaphore,
    });

    const rawEdits = pmStepRes.output as any;
    const edits: PlanEditsArtifact = {
      iteration,
      amendmentIndex: 0,
      items: rawEdits?.items ?? (plan?.itemOutlines ?? []).map((o) => ({
        slug: o.slug,
        kind: o.kind ?? "dev",
        title: o.title,
        assignment: o.description ?? o.title,
        milestone: o.milestoneId ?? "m1",
        wave: 1,
        deps: o.deps ?? [],
      })),
    };
    await writeYamlAtomic(path.join(planDir, `edits-${iteration}.0.yaml`), edits);

    // Apply edits atomically (§6.3.5)
    for (const item of edits.items) {
      const itemDir = path.join(taskDir, "items", item.slug);
      await fs.promises.mkdir(itemDir, { recursive: true });
      const assignment: AssignmentArtifact = {
        slug: item.slug,
        kind: item.kind,
        title: item.title,
        assignment: item.assignment,
        milestone: item.milestone,
        wave: item.wave ?? 1,
        deps: item.deps ?? [],
      };
      await writeYamlAtomic(path.join(itemDir, "assignment.yaml"), assignment);
    }

    // Write epic INTENTs (§8.6)
    if (plan?.epics) {
      for (const ep of plan.epics) {
        const epicDir = path.join(taskDir, ep.slug);
        await fs.promises.mkdir(epicDir, { recursive: true });
        await writeTextAtomic(path.join(epicDir, "INTENT.md"), ep.intent);
      }
    }

    // Atomic commit (§6.3.5)
    await git(taskWt, ["add", "-A"], { allowFail: true });
    await git(taskWt, ["commit", "-m", `factory: apply plan edits iteration ${iteration}`], { allowFail: true });
  }

  // 5. Waves execution (§8.4.5)
  // Read all items under {taskDir}/items/
  const itemsDir = path.join(taskDir, "items");
  const itemSlugs = fs.existsSync(itemsDir)
    ? (await fs.promises.readdir(itemsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  const initialStates = await Promise.all(
    itemSlugs.map((slug) => deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt }))
  );
  const maxWave = initialStates.reduce((max, it) => Math.max(max, it.wave), 1);

  for (let w = 1; w <= maxWave; w++) {
    // Collect item states
    let itemStates = await Promise.all(
      itemSlugs.map((slug) => deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt }))
    );
    let waveState = deriveWaveState({ wave: w, items: itemStates });

    if (waveState.items.length === 0 || waveState.items.every((it) => it.status === "merged")) {
      continue;
    }

    await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });

    // Run wave items until wave is ready to merge or complete
    let waveTicks = 0;
    while (!waveState.canMerge && !waveState.isComplete && waveTicks < 50) {
      waveTicks++;

      // Check if budget exceeded for iteration (§12.5)
      if (budgetTracker) {
        const itBudgetCheck = budgetTracker.checkIterationBudget(iteration);
        if (itBudgetCheck.exceeded) {
          await appendJournal(taskDir, { type: "iteration_budget_exceeded", iteration });
          break; // End iteration
        }
      }

      // Pick runnable items up to maxParallelItems
      const activeItems = [...waveState.running, ...waveState.runnable];
      const batch = activeItems.slice(0, maxParallelItems);
      if (batch.length === 0) {
        break;
      }

      for (const it of batch) {
        // If epic item: run child task in-process (§8.6)
        if (it.kind === "epic" && runTaskChild) {
          await runTaskChild(it.slug);
          continue;
        }

        // Ensure item worktree
        const child = await ensureItemWorktree(repo, { branch: parentBranch, path: taskWt }, it.slug);

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
      }

      // Refresh states
      itemStates = await Promise.all(
        itemSlugs.map((slug) => deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt }))
      );
      waveState = deriveWaveState({ wave: w, items: itemStates });
    }

    // 6. Wave end merge path (§8.4.6, §7)
    if (waveState.ready.length > 0) {
      for (const readyItem of waveState.ready) {
        const childBranchName = childBranch(parentBranch, readyItem.slug);
        const childWtPath = path.join(
          repo?.worktreeRoot ?? path.dirname(taskWt),
          childBranchName.replace(/\//g, "_")
        );

        await mergeItem({
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
      }
    }

    // Wave close-up (§8.4.6)
    const waveCloseupRes = await runAgentStep({
      task,
      stepId: `wave-close-up-${iteration}-${w}`,
      stepFragment: "steps/wave-close-up",
      agent: "wave-close-up",
      role: "alt-workhorse",
      cwd: taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        task,
        waveReport: `Wave ${w} completed. Merged items: ${waveState.ready.map((r) => r.slug).join(", ")}`,
        infra: infraYaml,
      },
      turnsSemaphore,
    });

    // Architect turn on wave report (§8.4.6)
    const waveReportRes = await runAgentStep({
      task,
      stepId: `architect-wave-report-${iteration}-${w}`,
      stepFragment: "steps/architect-wave-report",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      existingSessionId: architectSessionId,
      cwd: taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        waveReport: JSON.stringify(waveCloseupRes.output ?? {}, null, 2),
        debt: "",
        steering: "",
      },
      turnsSemaphore,
    });

    if (waveReportRes.sessionId) {
      architectSessionId = waveReportRes.sessionId;
    }

    const waveDecision = (waveReportRes.output as any)?.decision ?? "continue";
    if (waveDecision === "end-iteration") {
      break;
    }
  }
  // Check if any items are blocked on human questions (§8.2)
  const allCurrentStates = await Promise.all(
    itemSlugs.map((slug) => deriveItemState({ taskDir, itemSlug: slug, parentBranch, taskWt }))
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


  // 7. Plan close-up (§8.4.7)
  const planCloseupRes = await runAgentStep({
    task,
    stepId: `plan-close-up-${iteration}`,
    stepFragment: "steps/plan-close-up",
    agent: "plan-close-up",
    role: "alt-workhorse",
    cwd: taskWt,
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
  });

  // Architect turn for plan close-up decision
  const archCloseupRes = await runAgentStep({
    task,
    stepId: `architect-closeup-${iteration}`,
    stepFragment: "steps/architect-closeup",
    agent: "architect",
    role: "architect",
    sessionMode: "reuse",
    existingSessionId: architectSessionId,
    cwd: taskWt,
    taskDir,
    recordsDir: runsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: {
      closeup: JSON.stringify(planCloseupRes.output ?? {}, null, 2),
      plan: JSON.stringify(plan, null, 2),
      intent: intentText,
    },
    turnsSemaphore,
  });

  if (archCloseupRes.sessionId) {
    architectSessionId = archCloseupRes.sessionId;
  }

  const rawCloseup = (archCloseupRes.output as any) ?? {};
  const closeupStatus = rawCloseup.status ?? "complete";
  const closeupArtifact: PlanCloseupArtifact = {
    iteration,
    status: closeupStatus,
    summary: rawCloseup.summary ?? "Plan close-up completed",
    question: rawCloseup.question,
  };

  await writeYamlAtomic(path.join(taskDir, `closeup-${iteration}.yaml`), closeupArtifact);
  await appendJournal(taskDir, { type: "closeup_written", iteration, status: closeupStatus });

  return {
    iteration,
    status: closeupStatus === "complete" ? "done" : closeupStatus === "blocked" ? "blocked" : "next_iteration",
    plan,
    lastCloseup: closeupArtifact,
    architectSessionId,
  };
}
