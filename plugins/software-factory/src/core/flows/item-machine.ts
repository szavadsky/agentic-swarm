import fs from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  FlowKindConfig,
  FlowStep,
  PipelineConfig,
  PipelineLimits,
  ProjectConfig,
  ReviewArtifact,
  CheckItemResult,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import { runAgentStep, type StepRunResult } from "./step-runner.js";
import { runItemConsult } from "./consults.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { deriveItemState, type DerivedItemState } from "../derive/item.js";
import {
  checkStepAttempts,
  checkFixRounds,
  fingerprintCheckFailure,
  fingerprintSuggestions,
} from "../loops.js";
import type { BudgetTracker } from "../budget.js";
import type { Semaphore } from "../mutex.js";

export interface ItemMachineOptions {
  task: string;
  itemSlug: string;
  parentBranch: string;
  taskWt: string;
  childWt: string;
  taskDir: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  budgetTracker?: BudgetTracker;
  turnsSemaphore?: Semaphore;
  architectSessionId?: string;
  log?: (msg: string) => void;
}

export interface ItemMachineTickResult {
  done: boolean;
  status: "pending" | "running" | "ready" | "merged" | "failed" | "blocked" | "superseded";
  stepRan?: string;
  attempt?: number;
  fixRound?: number;
  consulted?: boolean;
}

/**
 * Returns default flow configuration for a given kind (§8.3).
 */
export function getDefaultFlowForKind(kind: string, pipeline: PipelineConfig): FlowKindConfig {
  const configured =
    pipeline.flows?.story?.[kind] ??
    pipeline.flows?.spike?.[kind] ??
    (kind === "simple" ? { steps: pipeline.flows?.simple?.steps ?? [] } : undefined);
  if (configured && configured.steps && configured.steps.length > 0) {
    return configured;
  }

  switch (kind) {
    case "dev":
      return {
        fixLoopTo: "develop",
        steps: [
          { id: "test-first", agent: "developer", role: "workhorse", escalatable: true },
          { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse", escalatable: true },
          { id: "qa", agent: "qa", role: "alt-workhorse", escalatable: true },
          { id: "review", agent: "reviewer", role: "alt-workhorse", escalatable: true },
        ],
      };
    case "no-behavior":
      return {
        fixLoopTo: "develop",
        steps: [
          { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse", escalatable: true },
          { id: "qa", agent: "qa", role: "alt-workhorse", escalatable: true },
          { id: "review", agent: "reviewer", role: "alt-workhorse", escalatable: true },
        ],
      };
    case "test-only":
      return {
        fixLoopTo: "test-first",
        steps: [
          { id: "test-first", agent: "developer", role: "workhorse", escalatable: true },
          { id: "qa", agent: "qa", role: "alt-workhorse", escalatable: true },
          { id: "review", agent: "reviewer", role: "alt-workhorse", escalatable: true },
        ],
      };
    case "simple":
      return {
        fixLoopTo: "develop",
        steps: [
          { id: "develop", agent: "developer", role: "workhorse" },
        ],
      };
    case "fact-finder":
      return {
        steps: [
          { id: "fact-finder", agent: "fact-finder", role: "workhorse" },
        ],
      };
    case "poc":
      return {
        steps: [
          { id: "poc", agent: "developer", role: "workhorse" },
        ],
      };
    case "test-assumptions":
      return {
        steps: [
          { id: "test-assumptions", agent: "developer", role: "workhorse" },
        ],
      };
    default:
      return {
        fixLoopTo: "develop",
        steps: [
          { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse", escalatable: true },
          { id: "review", agent: "reviewer", role: "alt-workhorse", escalatable: true },
        ],
      };
  }
}

/**
 * Runs one step or transition for an item (§8.2, §8.3).
 */
export async function tickItemMachine(opts: ItemMachineOptions): Promise<ItemMachineTickResult> {
  const {
    task,
    itemSlug,
    parentBranch,
    taskWt,
    childWt,
    taskDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    budgetTracker,
    turnsSemaphore,
    architectSessionId,
  } = opts;

  const limits = pipeline.limits ?? {};
  const maxStepAttempts = limits.maxStepAttempts ?? 3;
  const maxFixRounds = limits.maxFixRounds ?? 3;
  const maxInterruptions = limits.maxInterruptions ?? 3;

  // 1. Derive current item state
  const itemState = await deriveItemState({
    taskDir,
    itemSlug,
    parentBranch,
    taskWt,
  });

  if (itemState.status === "ready" || itemState.status === "merged" || itemState.status === "failed" || itemState.status === "superseded" || itemState.status === "blocked") {
    return {
      done: true,
      status: itemState.status,
    };
  }

  // 2. Check item budget (§12.5)
  if (budgetTracker) {
    const bCheck = budgetTracker.checkItemBudget(itemSlug);
    if (bCheck.exceeded) {
      await appendJournal(taskDir, {
        type: "item_budget_exceeded",
        item: itemSlug,
        spent: bCheck.spent,
        limit: bCheck.limit,
      });
      // Trigger consult
      await runItemConsult({
        task,
        item: itemSlug,
        assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
        priorAttemptsText: "Item budget limit exceeded",
        diffText: "",
        feedbackText: `Spent $${bCheck.spent.toFixed(2)}, limit is $${bCheck.limit}`,
        taskDir,
        taskWt,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        architectSessionId,
        turnsSemaphore,
      });
      return { done: false, status: "running", consulted: true };
    }
  }

  const kindFlow = getDefaultFlowForKind(itemState.kind, pipeline);
  const steps = kindFlow.steps;

  // 3. Determine next step and attempt
  let targetStepIndex = 0;
  let attempt = 1;
  let fixRound = itemState.currentFixRound;
  let isRetrying = false;
  let lastFailingCheckSummary: string | undefined;

  const records = itemState.records;
  if (records.length > 0) {
    const lastRecord = records[records.length - 1]!;

    if (lastRecord.meta.status === "ok") {
      // Check if last step was a review that requested fix
      let fixRequested = false;
      if (lastRecord.output && typeof lastRecord.output === "object" && "suggestions" in (lastRecord.output as any)) {
        const rev = lastRecord.output as ReviewArtifact;
        const fixSuggestions = rev.suggestions?.filter((s) => s.disposition === "fix");

        // Handle human-async questions (§8.7, §8.8)
        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
        if (asyncQuestions && asyncQuestions.length > 0) {
          if (itemState.openSteerQuestion) {
            return { done: true, status: "blocked" };
          }
          // Question was answered! Loop back to develop/fix with the answer (§8.7)
          fixRequested = true;
        }
        if (fixSuggestions && fixSuggestions.length > 0) {
          fixRequested = true;
        }
      }

      if (fixRequested) {
        // Fix loop! Check fix round bounds (§12.2)
        const diffRes = await git(childWt, ["diff", "HEAD~1"], { allowFail: true });
        const hasDiff = Boolean(diffRes.stdout.trim());
        const fixCheck = checkFixRounds(fixRound, maxFixRounds, hasDiff, itemState.suggestionFingerprints);

        if (fixCheck.exhausted || fixCheck.noProgress) {
          // Exhausted fix rounds -> consult now (§12.2)
          await runItemConsult({
            task,
            item: itemSlug,
            assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
            priorAttemptsText: `Fix rounds exhausted (${fixRound}/${maxFixRounds})`,
            diffText: diffRes.stdout,
            feedbackText: "Fix rounds exhausted without resolution",
            taskDir,
            taskWt,
            repo,
            harness,
            pipeline,
            project,
            prompts,
            architectSessionId,
            turnsSemaphore,
          });
          return { done: false, status: "running", consulted: true };
        }

        // Jump back to fixLoopTo (§8.2)
        const loopTarget = kindFlow.fixLoopTo ?? "develop";
        const idx = steps.findIndex((s) => s.id === loopTarget);
        targetStepIndex = idx >= 0 ? idx : 0;
        attempt = 1;
      } else {
        // Step succeeded without fix! Advance to next step in flow
        const lastStepIdx = steps.findIndex((s) => s.id === lastRecord.name);
        if (lastStepIdx >= 0 && lastStepIdx + 1 < steps.length) {
          targetStepIndex = lastStepIdx + 1;
          attempt = 1;
        } else {
          // All steps complete! Item is ready for merge
          return { done: true, status: "ready" };
        }
      }
    } else {
      // Last step was rejected, error, or interrupted
      const stepIdx = steps.findIndex((s) => s.id === lastRecord.name);
      targetStepIndex = stepIdx >= 0 ? stepIdx : 0;
      isRetrying = true;

      if (lastRecord.meta.status === "interrupted") {
        // Invariant §6.3.6: Next attempt does not count toward maxStepAttempts until maxInterruptions
        if (itemState.interruptionCount < maxInterruptions) {
          attempt = lastRecord.attempt; // keep attempt count
        } else {
          attempt = lastRecord.attempt + 1;
        }
      } else {
        attempt = lastRecord.attempt + 1;
      }

      // Check step attempts bound and no-progress detector (§12.2)
      const attemptsCheck = checkStepAttempts(
        attempt,
        maxStepAttempts,
        itemState.lastFailingCheckFingerprint ? [itemState.lastFailingCheckFingerprint] : []
      );

      if (attemptsCheck.exhausted) {
        // Consult now (§12.2)
        const diffRes = await git(childWt, ["diff"], { allowFail: true });
        await runItemConsult({
          task,
          item: itemSlug,
          assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
          priorAttemptsText: `Step attempts exhausted for ${lastRecord.name} (attempt ${attempt}/${maxStepAttempts})`,
          diffText: diffRes.stdout,
          feedbackText: lastRecord.meta.error || "Step failed repeatedly",
          taskDir,
          taskWt,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          architectSessionId,
          turnsSemaphore,
        });
        return { done: false, status: "running", consulted: true };
      }
    }
  }

  const currentStep = steps[targetStepIndex];
  if (!currentStep) {
    return { done: true, status: "ready" };
  }

  // 4. Prepare prompt variables
  const diffRes = await git(childWt, ["diff"], { allowFail: true });
  const assignmentYaml = itemState.assignment
    ? JSON.stringify(itemState.assignment, null, 2)
    : "";

  const promptVars: Record<string, string> = {
    assignment: assignmentYaml,
    target: "tests",
    citations: "",
    context: "",
    checks: "",
    testDiff: "",
    diff: diffRes.stdout,
    feedback: itemState.guidanceText ?? "",
  };

  // If rotated round (fixRound >= 2), developer uses fresh session (§12.4)
  const isRotatedDeveloper = fixRound >= 2 && currentStep.agent === "developer";
  const sessionMode: "fresh" | "reuse" = isRotatedDeveloper
    ? "fresh"
    : (currentStep.session ?? "reuse");

  const recordsDir = path.join(taskDir, "items", itemSlug, "steps");

  // 5. Run seam hooks before:item.step.{id} (§8.10)
  await runSeamHooks({
    phase: "before",
    seam: `item.step.${currentStep.id}`,
    cwd: childWt,
    baseRef: parentBranch,
    kind: itemState.kind,
    isEscalated: itemState.isEscalated,
    pipeline,
    project,
    repo,
    harness,
    prompts,
    taskDir,
    item: itemSlug,
  });

  // 6. Execute step
  const stepRes = await runAgentStep({
    task,
    item: itemSlug,
    stepId: currentStep.id,
    stepFragment: currentStep.stepFragment,
    agent: currentStep.agent,
    role: currentStep.role,
    retryRole: currentStep.retryRole,
    escalatable: currentStep.escalatable,
    isEscalated: itemState.isEscalated,
    fixRound,
    attempt,
    sessionMode,
    cwd: childWt,
    taskDir,
    recordsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars,
    turnsSemaphore,
  });

  // Record usage in budget tracker
  if (budgetTracker && stepRes.usage) {
    budgetTracker.recordUsage({
      item: itemSlug,
      usage: stepRes.usage,
    });
  }

  // 7. Run seam hooks after:item.step.{id} (§8.10)
  await runSeamHooks({
    phase: "after",
    seam: `item.step.${currentStep.id}`,
    cwd: childWt,
    baseRef: parentBranch,
    kind: itemState.kind,
    isEscalated: itemState.isEscalated,
    pipeline,
    project,
    repo,
    harness,
    prompts,
    taskDir,
    item: itemSlug,
  });

  // Check for human-async questions immediately (§8.7, §8.8)
  if (stepRes.output && typeof stepRes.output === "object" && "suggestions" in (stepRes.output as any)) {
    const rev = stepRes.output as ReviewArtifact;
    const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
    if (asyncQuestions && asyncQuestions.length > 0) {
      const steerDir = path.join(taskDir, "steer", "tousertoreview");
      await fs.promises.mkdir(steerDir, { recursive: true });
      for (const q of asyncQuestions) {
        const qId = `q-${itemSlug}-${q.id}`;
        const { writeYamlAtomic } = await import("../records/io.js");
        await writeYamlAtomic(path.join(steerDir, `${qId}.yaml`), {
          id: qId,
          ref: itemSlug,
          disposition: "human-async",
          question: q.detail || q.summary,
          blocks: [itemSlug],
          status: "open",
        });
      }
      await git(taskWt, ["add", "-A"], { allowFail: true });
      await git(taskWt, ["commit", "-m", `factory: raise question for ${itemSlug}`], { allowFail: true });
      return { done: true, status: "blocked", stepRan: currentStep.id };
    }
  }

  // Check if this was the last step and succeeded
  const isLastStep = targetStepIndex === steps.length - 1;
  const hasIssues = (stepRes.output as any)?.suggestions?.some(
    (s: any) => s.disposition === "fix" || s.disposition === "human-async" || s.disposition === "human-stop"
  );
  const isTerminalSuccess = isLastStep && stepRes.ok && !hasIssues;
  return {
    done: isTerminalSuccess,
    status: isTerminalSuccess ? "ready" : "running",
    stepRan: currentStep.id,
    attempt,
    fixRound,
  };
}
