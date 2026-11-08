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
  InfraArtifact,
  GatesBaselineArtifact,
  DeveloperTarget,
  SteerItemArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import { runAgentStep, type StepRunResult } from "./step-runner.js";
import { runItemConsult } from "./consults.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { writeQuestion } from "../steer.js";
import { deriveItemState, type DerivedItemState } from "../derive/item.js";
import { refreshStateYaml } from "../derive/task.js";
import {
  checkStepAttempts,
  checkFixRounds,
  checkConsultsPerItem,
  fingerprintCheckFailure,
  fingerprintSuggestions,
} from "../loops.js";
import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
import { runCheck } from "../checks/runner.js";
import type { CheckContext } from "../checks/types.js";
import type { BudgetTracker } from "../budget.js";
import type { Semaphore } from "../mutex.js";
import { readYaml, readText, writeYamlAtomic } from "../records/io.js";

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
          { id: "research", agent: "fact-finder", role: "workhorse" },
          { id: "review", agent: "reviewer", role: "alt-workhorse" },
        ],
      };
    case "poc":
      return {
        steps: [
          { id: "develop", agent: "developer", role: "workhorse" },
          { id: "review", agent: "reviewer", role: "alt-workhorse" },
        ],
      };
    case "test-assumptions":
      return {
        steps: [
          { id: "develop", agent: "developer", role: "workhorse" },
          { id: "review", agent: "reviewer", role: "alt-workhorse" },
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
 * Runs one step or transition for an item (§8.2, §8.3, §9, §12).
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
  const maxConsults = limits.maxConsultsPerItem ?? 2;

  // 1. Derive current item state
  const itemState = await deriveItemState({
    taskDir,
    itemSlug,
    parentBranch,
    taskWt,
    childWt,
    pipeline,
  });

  if (
    itemState.status === "ready" ||
    itemState.status === "merged" ||
    itemState.status === "failed" ||
    itemState.status === "superseded" ||
    itemState.status === "blocked"
  ) {
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

      // Check loop detector for consults before triggering
      const diffRes = await git(childWt, ["diff"], { allowFail: true });
      const cCheck = checkConsultsPerItem(
        itemState.consultCount,
        maxConsults,
        Boolean(diffRes.stdout.trim()),
        itemState.decisionFingerprints
      );

      if (cCheck.exhausted || cCheck.noProgress) {
        await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
        return { done: true, status: "failed" };
      }

      await runItemConsult({
        task,
        item: itemSlug,
        assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
        priorAttemptsText: "Item budget limit exceeded",
        diffText: "",
        feedbackText: `Spent $${bCheck.spent.toFixed(2)}, limit is $${bCheck.limit}`,
        afterRecord: itemState.records[itemState.records.length - 1]?.dirName,
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
  let isFixReentry = false;
  let latestReviewOutput: ReviewArtifact | undefined;
  let answeredAsyncFeedback = "";

  // Check for answered human-async questions (§8.7)
  const steerDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(steerDir)) {
    try {
      const qFiles = await fs.promises.readdir(steerDir);
      for (const qf of qFiles) {
        if (!qf.endsWith(".yaml")) continue;
        const q = await readYaml<SteerItemArtifact>(path.join(steerDir, qf));
        if ((q.ref === itemSlug || q.ref === `${task}/${itemSlug}`) && q.status === "answered" && q.answer) {
          answeredAsyncFeedback += `\nHuman answer to question "${q.question}":\n${q.answer}\n`;
        }
      }
    } catch {
      // ignore
    }
  }

  const records = itemState.records;
  if (records.length > 0) {
    const lastRecord = records[records.length - 1]!;

    if (lastRecord.meta.status === "ok") {
      let fixRequested = false;
      if (lastRecord.output && typeof lastRecord.output === "object" && "suggestions" in (lastRecord.output as any)) {
        const rev = lastRecord.output as ReviewArtifact;
        latestReviewOutput = rev;
        const fixSuggestions = rev.suggestions?.filter((s) => s.disposition === "fix");

        // Handle open human-async questions (§8.7, §8.8)
        const openAsync = rev.suggestions?.filter((s) => s.disposition === "human-async");
        if (openAsync && openAsync.length > 0 && itemState.openSteerQuestion) {
          return { done: true, status: "blocked" };
        }

        if (fixSuggestions && fixSuggestions.length > 0) {
          fixRequested = true;
        }
      }

      if (fixRequested) {
        // Fix loop! The upcoming re-entry round equals the number of fix-requesting
        // reviews seen so far (1 for the first re-entry) (§12.2).
        const upcomingRound = Math.max(1, itemState.suggestionFingerprints.length);
        const currentFp = fingerprintSuggestions(
          latestReviewOutput?.suggestions?.filter((s) => s.disposition === "fix")
        );
        const priorFps = itemState.suggestionFingerprints.slice(0, -1);
        let baseCommit = "HEAD~1";
        if (upcomingRound > 1) {
          const relTaskDir = path.relative(taskWt, taskDir);
          const currentRecordsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps");
          const devRecords = itemState.records.filter(
            (r) => r.meta.agent === "developer" || r.meta.role === "workhorse"
          );
          const targetRecord = devRecords.length >= 2 ? devRecords[devRecords.length - 2] : undefined;
          if (targetRecord) {
            const recDirRel = path.relative(childWt, path.join(currentRecordsDir, targetRecord.dirName));
            const logRes = await git(childWt, ["log", "-1", "--format=%H", "--", recDirRel], { allowFail: true });
            if (logRes.code === 0 && logRes.stdout.trim()) {
              baseCommit = logRes.stdout.trim();
            }
          } else {
            const reviewRecords = itemState.records.filter(
              (r) => r.meta.agent === "reviewer" || r.meta.role === "alt-workhorse"
            );
            if (reviewRecords.length >= 2) {
              const prevRev = reviewRecords[reviewRecords.length - 2]!;
              const recDirRel = path.relative(childWt, path.join(currentRecordsDir, prevRev.dirName));
              const logRes = await git(childWt, ["log", "-1", "--format=%H", "--", recDirRel], { allowFail: true });
              if (logRes.code === 0 && logRes.stdout.trim()) {
                baseCommit = logRes.stdout.trim();
              }
            }
          }
        }
        const orchFolderClean = (project.orchestrationFolder ?? ".factory").replace(/^\/+|\/+$/g, "");
        const codeDiffRes = await git(
          childWt,
          ["diff", baseCommit, "HEAD", "--", ":!.*", `:!${orchFolderClean}`, ":!.factory"],
          { allowFail: true }
        );
        const hasDiff = upcomingRound <= 1 || Boolean(codeDiffRes.stdout.trim());
        const fixCheck = checkFixRounds(upcomingRound, maxFixRounds, hasDiff, priorFps, upcomingRound > 1 ? currentFp : undefined);

        if (fixCheck.exhausted || fixCheck.noProgress) {
          // Check consult bounds
          const cCheck = checkConsultsPerItem(
            itemState.consultCount,
            maxConsults,
            hasDiff,
            itemState.decisionFingerprints
          );
          if (cCheck.exhausted || cCheck.noProgress) {
            await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
            return { done: true, status: "failed" };
          }

          // Consult architect (§12.2)
          await runItemConsult({
            task,
            item: itemSlug,
            assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
            priorAttemptsText: `Fix rounds exhausted (${upcomingRound}/${maxFixRounds})`,
            diffText: codeDiffRes.stdout,
            feedbackText: "Fix rounds exhausted without resolution",
            afterRecord: lastRecord.dirName,
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
          });
          return { done: false, status: "running", consulted: true };
        }

        // Jump back to fixLoopTo (§8.2). fixRound follows the {1: initial, 2+: retry}
        // convention for role resolution (§12.4 alt-on-retry) and session rotation.
        fixRound = upcomingRound + 1;
        const loopTarget = kindFlow.fixLoopTo ?? "develop";
        const idx = steps.findIndex((s) => s.id === loopTarget);
        targetStepIndex = idx >= 0 ? idx : 0;
        attempt = 1;
        isFixReentry = true;
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

      // A fresh retry-with-guidance/escalate decision starts a new attempt
      // series at attempt 1 with the decision guidance hydrated (§8.5).
      // deriveItemState scopes currentAttempt to the post-decision series.
      if (itemState.freshSeries) {
        attempt = 1;
      } else if (lastRecord.meta.status === "interrupted") {
        if (itemState.interruptionCount < maxInterruptions) {
          attempt = lastRecord.attempt;
        } else {
          attempt = lastRecord.attempt + 1;
        }
      } else if (lastRecord.meta.status === "error") {
        // §12.2: Harness/provider errors never consume attempts
        attempt = lastRecord.attempt;
      } else {
        attempt = lastRecord.attempt + 1;
      }

      // Check step attempts bound and no-progress detector (§12.2)
      const attemptsCheck = checkStepAttempts(
        attempt,
        maxStepAttempts,
        itemState.lastFailingCheckFingerprint ? [itemState.lastFailingCheckFingerprint] : []
      );

      if (attemptsCheck.exhausted || attemptsCheck.noProgress) {
        const diffRes = await git(childWt, ["diff"], { allowFail: true });
        const cCheck = checkConsultsPerItem(
          itemState.consultCount,
          maxConsults,
          Boolean(diffRes.stdout.trim()),
          itemState.decisionFingerprints
        );
        if (cCheck.exhausted || cCheck.noProgress) {
          await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
          return { done: true, status: "failed" };
        }

        await runItemConsult({
          task,
          item: itemSlug,
          assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
          priorAttemptsText: `Step attempts exhausted for ${lastRecord.name} (attempt ${attempt}/${maxStepAttempts})`,
          diffText: diffRes.stdout,
          feedbackText: lastRecord.meta.error || "Step failed repeatedly",
          afterRecord: lastRecord.dirName,
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
        });
        return { done: false, status: "running", consulted: true };
      }
    }
  }

  const currentStep = steps[targetStepIndex];
  if (!currentStep) {
    return { done: true, status: "ready" };
  }

  // 4. Prepare prompt variables and check runner wiring (§9, §10, Finding 9 & 11)
  const diffRes = await git(childWt, ["diff"], { allowFail: true });
  const assignmentYaml = itemState.assignment
    ? JSON.stringify(itemState.assignment, null, 2)
    : "";

  let intentText = "";
  const intentPath = path.join(taskDir, "INTENT.md");
  if (fs.existsSync(intentPath)) {
    intentText = await readText(intentPath);
  }

  // Find last developer target from records
  let lastDeveloperTarget: DeveloperTarget | undefined;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (r.output && typeof r.output === "object" && "target" in (r.output as any)) {
      lastDeveloperTarget = (r.output as any).target;
      break;
    }
  }

  // Load infra and baseline for check execution
  let infra: InfraArtifact | undefined;
  const infraPath = path.join(taskDir, "infra.yaml");
  if (fs.existsSync(infraPath)) {
    try {
      infra = await readYaml<InfraArtifact>(infraPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt infra artifact at ${infraPath}: ${err?.message ?? err}`);
      }
    }
  }

  let baseline: GatesBaselineArtifact | undefined;
  const baselinePath = path.join(taskDir, "gates-baseline.yaml");
  if (fs.existsSync(baselinePath)) {
    try {
      baseline = await readYaml<GatesBaselineArtifact>(baselinePath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt gates baseline at ${baselinePath}: ${err?.message ?? err}`);
      }
    }
  }

  // Build feedback for fix rounds or retries (Finding 11)
  let feedbackText = itemState.guidanceText ?? "";
  if (answeredAsyncFeedback) {
    feedbackText = feedbackText ? `${feedbackText}\n${answeredAsyncFeedback}` : answeredAsyncFeedback;
  }
  if (isFixReentry && latestReviewOutput) {
    const fixList = latestReviewOutput.suggestions
      ?.filter((s) => s.disposition === "fix")
      .map((s) => `- [FIX] ${s.summary}${s.detail ? `: ${s.detail}` : ""}${s.location?.file ? ` (${s.location.file})` : ""}`)
      .join("\n");
    const optionalList = latestReviewOutput.suggestions
      ?.filter((s) => s.disposition === "optional")
      .map((s) => `- [OPTIONAL] ${s.summary}${s.detail ? `: ${s.detail}` : ""}`)
      .join("\n");
    feedbackText = [feedbackText, fixList, optionalList].filter(Boolean).join("\n\n");
  }

  // Wire per-step checks by phase (§9, Finding 9)
  const stepChecks = currentStep.checks ?? [];
  const beforeChecksList = stepChecks.filter(
    (c) => c === "red-test" || c === "test-diff" || pipeline.checks?.[c]?.phase === "before"
  );
  const afterChecksList = stepChecks.filter((c) => !beforeChecksList.includes(c));
  // Derive testFirstCommit durably via git log on the newest ok test-first record's meta.yaml
  let testFirstCommit: string | undefined;
  const okTestFirstRecords = records.filter(
    (r) => r.name === "test-first" && r.meta.status === "ok"
  );
  if (okTestFirstRecords.length > 0) {
    okTestFirstRecords.sort((a, b) => b.seq - a.seq || b.attempt - a.attempt);
    const newest = okTestFirstRecords[0]!;
    const relTaskDir = taskWt ? path.relative(taskWt, taskDir) : path.basename(taskDir);
    const metaCandidate = path.join(childWt, relTaskDir, "items", itemSlug, "steps", newest.dirName, "meta.yaml");
    const relMetaPath = path.relative(childWt, metaCandidate);
    try {
      const logRes = await git(childWt, ["log", "-n", "1", "--format=%H", "--", relMetaPath]);
      const sha = logRes.stdout.trim();
      if (/^[0-9a-f]{40}$/i.test(sha)) {
        testFirstCommit = sha;
      }
    } catch {}
  }

  const checkCtx: CheckContext = {
    repo,
    wt: childWt,
    base: parentBranch,
    project,
    pipeline,
    infra,
    baseline,
    kind: itemState.kind,
    item: itemSlug,
    task,
    taskWt,
    target: lastDeveloperTarget,
    checkTimeoutSec: currentStep.timeoutSec,
    testFirstCommit,
    limits,
    outputBytes: limits.checkOutputBytes ?? 4096,
  };

  let failingCheckSummaries: string[] = [];

  const beforeChecks =
    beforeChecksList.length > 0
      ? async () => {
          const results: CheckItemResult[] = [];
          let ok = true;
          for (const cName of beforeChecksList) {
            const cRes = await runCheck(cName, checkCtx);
            results.push({ id: cRes.name, status: cRes.ok ? "pass" : "fail", message: cRes.summary });
            if (!cRes.ok) {
              ok = false;
              failingCheckSummaries.push(`[${cName}] ${cRes.summary}`);
            }
          }
          return { ok, checks: results };
        }
      : undefined;

  const afterChecks =
    afterChecksList.length > 0
      ? async (output?: unknown) => {
          if (output && typeof output === "object" && "target" in (output as any)) {
            const outTarget = (output as any).target;
            if (outTarget) {
              lastDeveloperTarget = outTarget;
            }
          }
          checkCtx.target = lastDeveloperTarget;
          checkCtx.testFirstCommit = testFirstCommit;
          const results: CheckItemResult[] = [];
          let ok = true;
          for (const cName of afterChecksList) {
            const cRes = await runCheck(cName, checkCtx);
            results.push({ id: cRes.name, status: cRes.ok ? "pass" : "fail", message: cRes.summary });
            if (!cRes.ok) {
              ok = false;
              failingCheckSummaries.push(`[${cName}] ${cRes.summary}`);
            }
          }
          return { ok, checks: results };
        }
      : undefined;

  // Use steps/fix-round on fix loop re-entry (Finding 11)
  const isFixRoundReentry = isFixReentry && currentStep.agent === "developer";
  const stepFragment = isFixRoundReentry
    ? "steps/fix-round"
    : (currentStep.stepFragment ?? `steps/${currentStep.id}`);

  // Criteria bundle for review prompts (§8.7); allowed dispositions mirror the
  // schema binding in step-runner so prompt and validation agree.
  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
  const reviewAllowed = resolveReviewAllowed(
    pipeline,
    currentStep.agent,
    isTriagerAgent(currentStep.agent)
  );

  const promptVars: Record<string, string> = {
    assignment: assignmentYaml,
    intent: intentText,
    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
    context: "",
    checks: failingCheckSummaries.join("\n"),
    testDiff: "",
    diff: diffRes.stdout,
    feedback: feedbackText,
    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
  };

  // If rotated round (fixRound >= 2), developer uses fresh session (§12.4)
  const isRotatedDeveloper = fixRound >= 2 && currentStep.agent === "developer";
  const sessionMode: "fresh" | "reuse" = isRotatedDeveloper
    ? "fresh"
    : (currentStep.session ?? "reuse");

  // Place records under childWt on the item branch (§6.1, Finding 3)
  const relTaskDir = path.relative(taskWt, taskDir);
  const recordsDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps");
  await fs.promises.mkdir(recordsDir, { recursive: true });

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

  // 6. Execute step with atomic question persistence (Finding 23)
  const stepRes = await runAgentStep({
    task,
    item: itemSlug,
    stepId: currentStep.id,
    stepFragment,
    agent: currentStep.agent,
    role: currentStep.role,
    retryRole: currentStep.retryRole,
    producerRetryRole: steps.find((s) => s.id === (kindFlow.fixLoopTo ?? "develop"))?.retryRole ?? null,
    escalatable: currentStep.escalatable,
    isEscalated: itemState.isEscalated,
    fixRound,
    attempt,
    sessionMode,
    cwd: childWt,
    taskWt,
    taskDir,
    recordsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars,
    turnsSemaphore,
    timeoutSec: currentStep.timeoutSec,
    budgetTracker,
    beforeChecks,
    afterChecks,
    writeArtifact: async (output: unknown) => {
      // Persist human-async questions atomically with the review record (Finding 23).
      // Concern ids are triaged separately (q-concern-*) and never use this mailbox.
      if (output && typeof output === "object" && "suggestions" in (output as any)) {
        const rev = output as ReviewArtifact;
        const concernIds = new Set<string>();
        try {
          for (const name of await fs.promises.readdir(path.join(taskDir, "concerns"))) {
            if (name.endsWith(".yaml")) concernIds.add(name.slice(0, -5));
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") throw err;
        }
        const asyncQuestions = rev.suggestions?.filter(
          (s) => s.disposition === "human-async" && !concernIds.has(s.id)
        );
        if (asyncQuestions && asyncQuestions.length > 0) {
          for (const q of asyncQuestions) {
            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
            await writeQuestion(taskWt, taskDir, {
              id: qId,
              ref: itemSlug,
              disposition: "human-async",
              question: q.detail || q.summary,
              blocks: [itemSlug],
            });
          }
        }
      }
    },
  });

  // Refresh state.yaml after every step (ToySmoke: budget/status visibility)
  await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
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

  // Check if any human-async suggestions blocked the item
  const hasAsync = (stepRes.output as any)?.suggestions?.some(
    (s: any) => s.disposition === "human-async"
  );
  if (hasAsync) {
    return { done: true, status: "blocked", stepRan: currentStep.id };
  }

  // Check if this was the last step and succeeded
  const isLastStep = targetStepIndex === steps.length - 1;
  const hasIssues = (stepRes.output as any)?.suggestions?.some(
    (s: any) => s.disposition === "fix" || s.disposition === "human-stop"
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
