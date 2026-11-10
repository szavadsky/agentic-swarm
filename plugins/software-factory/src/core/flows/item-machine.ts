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
import { buildConsultFailureContext } from "./consult-context.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { questionBlocks, writeQuestion } from "../steer.js";
import { listConcernIds } from "../concerns.js";
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
import { normalizeDeveloperTarget } from "../checks/gate-target.js";
import { tailCap, type CheckContext } from "../checks/types.js";
import type { BudgetTracker } from "../budget.js";
import type { Semaphore } from "../mutex.js";
import { commitAll } from "../git/commit.js";
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
  rootTaskWt?: string;
  rootTaskDir?: string;
}

export interface ItemMachineTickResult {
  done: boolean;
  status: "pending" | "running" | "ready" | "merged" | "failed" | "blocked" | "superseded";
  stepRan?: string;
  attempt?: number;
  fixRound?: number;
  consulted?: boolean;
}

const DEFAULT_REVIEW_ALLOWED = ["fix", "optional", "architect", "human-awareness", "human-async", "human-stop"];

/**
 * Persists a terminal `abandon` decision for an item whose consults are
 * exhausted (§12.2). No `afterRecord` pointer: the decision stays fresh and
 * sticky (derive maps it to `failed`), so the wave loop re-derives the item
 * as `failed` instead of looping it `running` forever. Journal, refresh
 * state.yaml (lags journal by design), return failed. Callers MUST keep
 * their existing journal event too.
 */
export async function persistTerminalAbandon(opts: {
  taskDir: string;
  task: string;
  parentBranch: string;
  taskWt: string;
  pipeline: PipelineConfig;
  itemSlug: string;
  repo: any;
  reason: string;
  rationale: string;
  commitMessage: string;
}): Promise<void> {
  const { taskDir, task, parentBranch, taskWt, pipeline, itemSlug, repo } = opts;
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });
  let nextSeq = 1;
  const existing = await fs.promises.readdir(decisionsDir);
  for (const name of existing) {
    const m = /^(\d{3})-/.exec(name);
    if (m) nextSeq = Math.max(nextSeq, parseInt(m[1]!, 10) + 1);
  }
  const decisionFileName = `${String(nextSeq).padStart(3, "0")}-item-${itemSlug}-abandon.yaml`;
  const decisionPath = path.join(decisionsDir, decisionFileName);
  await writeYamlAtomic(decisionPath, {
    id: `decision-${itemSlug}-${Date.now()}`,
    context: "item",
    item: itemSlug,
    decision: "abandon",
    reason: opts.reason,
    rationale: opts.rationale,
    timestamp: new Date().toISOString(),
  });
  await git(taskWt, ["add", "-A"], { allowFail: true });
  await commitAll(repo, taskWt, opts.commitMessage);
  await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
}

async function persistConsultsExhaustedAbandon(opts: {
  taskDir: string;
  task: string;
  parentBranch: string;
  taskWt: string;
  pipeline: PipelineConfig;
  itemSlug: string;
  repo: any;
}): Promise<void> {
  await persistTerminalAbandon({
    ...opts,
    reason: "consults-exhausted",
    rationale: "Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed",
    commitMessage: `factory(${opts.itemSlug}): consults exhausted, abandon`,
  });
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
        fixLoopTo: "research",
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

const DEFAULT_RETRY_PROD_GLOBS = ["src/**", "lib/**", "*.ts", "*.js", "*.mjs", "*.cjs", "*.py", "*.go", "*.rs", "*.java", "*.c", "*.cpp", "*.h", "pkg/**", "app/**"];

function getGlobsFromProject(project: ProjectConfig): string[] {
  const configured = project.paths?.prod;
  if (!configured) return DEFAULT_RETRY_PROD_GLOBS;
  return Array.isArray(configured) ? configured : [configured];
}

async function sizeChangedLinesForRetry(wt: string, base: string, globs: string[]) {
  const { changedLines } = await import("../git/diff.js");
  const { countUntrackedLines } = await import("../git/untracked-lines.js");
  const lines = await changedLines(wt, base, undefined, globs);
  const extra = await countUntrackedLines(wt, globs);
  return { total: lines.total + extra.added };
}

/**
 * Maps a live CheckResult into the persisted CheckItemResult form: structured
 * details (command, JUnit ids, line counts) plus a bounded output tail on
 * failures so checks.yaml is diagnosable without re-running checks.
 */
function toCheckItemResult(cRes: {
  name: string;
  ok: boolean;
  summary: string;
  output: string;
  details?: unknown;
}): CheckItemResult {
  const item: CheckItemResult = {
    id: cRes.name,
    status: cRes.ok ? "pass" : "fail",
    message: cRes.summary,
  };
  if (cRes.details !== undefined) {
    item.details = cRes.details;
  }
  if (!cRes.ok && cRes.output) {
    item.output = tailCap(cRes.output, 2000);
  }
  return item;
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
    rootTaskDir: opts.rootTaskDir,
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

      // Check loop detector for consults before triggering. Diff basis is the
      // committed branch diff (base..HEAD), never bare unstaged `git diff`.
      const budgetCtx = await buildConsultFailureContext({
        wt: childWt,
        base: parentBranch,
        recordDir: path.join(childWt, path.relative(taskWt, taskDir), "items", itemSlug, "steps"),
      });
      const cCheck = checkConsultsPerItem(
        itemState.consultCount,
        maxConsults,
        Boolean(budgetCtx.diffstat.trim()),
        itemState.decisionFingerprints,
        itemState.decisionFingerprints[itemState.decisionFingerprints.length - 1]
      );

      if (cCheck.exhausted || cCheck.noProgress) {
        await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
        await persistConsultsExhaustedAbandon({ taskDir, task, parentBranch, taskWt, pipeline, itemSlug, repo });
        return { done: true, status: "failed" };
      }

      await runItemConsult({
        task,
        item: itemSlug,
        assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
        priorAttemptsText: "Item budget limit exceeded",
        diffText: budgetCtx.diffstat,
        feedbackText: `Spent $${bCheck.spent.toFixed(2)}, limit is $${bCheck.limit}`,
        afterRecord: itemState.records[itemState.records.length - 1]?.dirName,
        taskDir,
        taskWt,
        rootTaskWt: opts.rootTaskWt,
        rootTaskDir: opts.rootTaskDir,
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
  let hasAsyncReview = false;

  // Check for answered human-async questions (§8.7)
  const steerDirs = [path.join(taskDir, "steer", "tousertoreview")];
  if (opts.rootTaskDir && path.resolve(opts.rootTaskDir) !== path.resolve(taskDir)) {
    steerDirs.push(path.join(opts.rootTaskDir, "steer", "tousertoreview"));
  }
  for (const steerDir of steerDirs) {
    if (fs.existsSync(steerDir)) {
      try {
        const qFiles = await fs.promises.readdir(steerDir);
        for (const qf of qFiles) {
          if (!qf.endsWith(".yaml")) continue;
          const q = await readYaml<SteerItemArtifact>(path.join(steerDir, qf));
          const isBlockingDisposition = q.disposition === "human-async" || q.disposition === "human-stop";
          if (
            (q.blocks?.includes(itemSlug) ||
              (!Array.isArray(q.blocks) &&
                isBlockingDisposition &&
                (q.ref === itemSlug ||
                  q.ref === `${task}/${itemSlug}` ||
                  (opts.rootTaskDir && q.ref === `${path.basename(opts.rootTaskDir)}/${itemSlug}`)))) &&
            q.status === "answered" &&
            q.answer
          ) {
            answeredAsyncFeedback += `\nHuman answer to question "${q.question}":\n${q.answer}\n`;
          }
        }
      } catch {
        // ignore
      }
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

        // Handle open human-async questions (§8.7, §8.8). An ANSWERED
        // async question unblocks: fall through to the answered-feedback
        // re-entry below so the step re-runs with the answer hydrated.
        const openAsync = rev.suggestions?.filter((s) => s.disposition === "human-async");
        if (openAsync && openAsync.length > 0 && itemState.openSteerQuestion) {
          return { done: true, status: "blocked" };
        }
        if (openAsync && openAsync.length > 0) {
          hasAsyncReview = true;
        }

        if (fixSuggestions && fixSuggestions.length > 0) {
          fixRequested = true;
        }
      }

      if (fixRequested || (answeredAsyncFeedback && hasAsyncReview)) {
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
            itemState.decisionFingerprints,
            itemState.decisionFingerprints[itemState.decisionFingerprints.length - 1]
          );
          if (cCheck.exhausted || cCheck.noProgress) {
            await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
            await persistConsultsExhaustedAbandon({ taskDir, task, parentBranch, taskWt, pipeline, itemSlug, repo });
            return { done: true, status: "failed" };
          }

          // Consult architect (§12.2). Feedback hydrates the latest fix-list
          // plus failing check summaries so the architect sees what the fix
          // rounds attempted — never a bare "exhausted without resolution".
          const fixSuggestions = latestReviewOutput?.suggestions?.filter((s) => s.disposition === "fix") ?? [];
          const fixSummary = fixSuggestions.map((s) => `- [FIX] ${s.summary}${s.detail ? `: ${s.detail}` : ""}`).join("\n");
          const fixRetryCtx = await buildConsultFailureContext({
            wt: childWt,
            base: parentBranch,
            recordDir: path.join(childWt, path.relative(taskWt, taskDir), "items", itemSlug, "steps", lastRecord.dirName),
          });
          const fixFeedback = [
            `Fix rounds exhausted (${upcomingRound}/${maxFixRounds}) without resolution.`,
            fixSummary ? `Latest fix requests:\n${fixSummary}` : "",
            fixRetryCtx.failingCheckSummaries.length > 0
              ? `Failing checks on last round:\n${fixRetryCtx.failingCheckSummaries.join("\n")}`
              : "",
            fixRetryCtx.feedbackText && fixRetryCtx.feedbackText !== "Step failed repeatedly"
              ? fixRetryCtx.feedbackText
              : "",
          ].filter(Boolean).join("\n\n");
          await runItemConsult({
            task,
            item: itemSlug,
            assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
            priorAttemptsText: `Fix rounds exhausted (${upcomingRound}/${maxFixRounds})`,
            diffText: codeDiffRes.stdout,
            feedbackText: fixFeedback,
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

      // Check step attempts bound and no-progress detector (§12.2). The series
      // fingerprints end with the current (last-record) failure: pass it as the
      // current fingerprint so same-failure-twice short-circuits to consult.
      const seriesFps = itemState.failingCheckFingerprints ?? [];
      const currentFp = seriesFps.length > 0 ? seriesFps[seriesFps.length - 1] : undefined;
      const attemptsCheck = checkStepAttempts(
        attempt,
        maxStepAttempts,
        seriesFps.slice(0, -1),
        currentFp
      );

      if (attemptsCheck.exhausted || attemptsCheck.noProgress) {
        // Grounded consult context (PsPost5 items 2/3): committed diffstat on
        // the checks base (never bare unstaged `git diff`, empty post-commit),
        // failing check summaries, and hydrated last-failure feedback.
        const relTaskDir = path.relative(taskWt, taskDir);
        const lastRecordDir = path.join(childWt, relTaskDir, "items", itemSlug, "steps", lastRecord.dirName);
        const failureCtx = await buildConsultFailureContext({
          wt: childWt,
          base: parentBranch,
          recordDir: lastRecordDir,
          fallbackError: lastRecord.meta.error,
        });
        const cCheck = checkConsultsPerItem(
          itemState.consultCount,
          maxConsults,
          Boolean(failureCtx.diffstat.trim()),
          itemState.decisionFingerprints,
          itemState.decisionFingerprints[itemState.decisionFingerprints.length - 1]
        );
        if (cCheck.exhausted || cCheck.noProgress) {
          await appendJournal(taskDir, { type: "item_failed_consults_exhausted", item: itemSlug });
          await persistConsultsExhaustedAbandon({ taskDir, task, parentBranch, taskWt, pipeline, itemSlug, repo });
          return { done: true, status: "failed" };
        }

        // Exhaustion phrasing names completed attempts (never "attempt 3/2").
        const completedAttempts = Math.max(0, attempt - 1);
        const attemptsPhrase = attemptsCheck.noProgress && !attemptsCheck.exhausted
          ? `Same failing check twice in a row for ${lastRecord.name} (no progress; next would be attempt ${attempt})`
          : `${completedAttempts} attempt${completedAttempts === 1 ? "" : "s"} recorded for ${lastRecord.name} (all rejected); next would be ${attempt} > max ${maxStepAttempts}`;
        const priorAttemptsText = [
          attemptsPhrase,
          failureCtx.failingCheckSummaries.length > 0
            ? `Failing checks:\n${failureCtx.failingCheckSummaries.join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n");

        await runItemConsult({
          task,
          item: itemSlug,
          assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
          priorAttemptsText,
          diffText: failureCtx.diffstat,
          feedbackText: failureCtx.feedbackText,
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
  // Step `diff` shows the committed branch diff against the checks base plus
  // any uncommitted work — never bare unstaged `git diff` alone (empty
  // post-commit, which blinded reviewers and consults).
  const stepDiffRes = await git(childWt, ["diff", `${parentBranch}..HEAD`], { allowFail: true });
  const stepPendingRes = await git(childWt, ["diff"], { allowFail: true });
  const stepDiffText = [stepDiffRes.stdout, stepPendingRes.stdout].filter((s) => s && s.trim()).join("\n");
  const diffRes = { stdout: stepDiffText };
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

  // A recorded `{gate: <command>}` target is mapped to the configured gate id
  // here so target-red/target-green resolution, prompts, and merge overrides
  // all see the same canonical target (records stay as the agent wrote them).
  lastDeveloperTarget = normalizeDeveloperTarget(lastDeveloperTarget, infra);

  // Build feedback for fix rounds or retries (Finding 11; ShPost3 retry gap).
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
  // Check-reject retry: hydrate the failing check (id+message+detail) plus the
  // current prod-line budget so the retry fixes the failure instead of
  // re-verifying from scratch. Failing-check detail includes the executed
  // command and JUnit case ids for target checks.
  if (isRetrying && records.length > 0) {
    const lastRec = records[records.length - 1]!;
    if (lastRec.meta.status === "rejected") {
      const retryCtx = await buildConsultFailureContext({
        wt: childWt,
        base: parentBranch,
        recordDir: path.join(childWt, path.relative(taskWt, taskDir), "items", itemSlug, "steps", lastRec.dirName),
        fallbackError: lastRec.meta.error,
      });
      const retryParts = [retryCtx.feedbackText];
      // Size-budget position: current prod lines vs limit (live worktree).
      try {
        const prodGlobs = getGlobsFromProject(project);
        const lines = await sizeChangedLinesForRetry(childWt, parentBranch, prodGlobs);
        const isSimple = itemState.kind === "simple";
        const limitName = isSimple ? "simpleMaxProdLines" : "storyMaxProdLines";
        const limit = isSimple
          ? (limits.simpleMaxProdLines ?? 20)
          : (limits.storyMaxProdLines ?? 300);
        retryParts.push(
          `Budget: ${lines.total} prod lines changed vs ${limitName} ${limit} (kind ${itemState.kind}). ` +
          `Shrink the diff or escalate; do not re-verify green checks from scratch.`
        );
      } catch {
        // Budget position is advisory; never block the retry on git errors.
      }
      retryParts.push(
        `Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.`
      );
      const retryBlock = retryParts.filter(Boolean).join("\n\n");
      feedbackText = feedbackText ? `${feedbackText}\n\n${retryBlock}` : retryBlock;
    }
  }

  // Wire per-step checks by phase (§9, Finding 9)
  const stepChecks = currentStep.checks ?? [];
  // Red-test is vacuous for kinds whose contract forbids prod changes
  // (tests-only, no-behavior): no prod change is possible by design, so the
  // check always "passes without prod change" — a false failure (D6).
  // Exempt via the flows config contract (tests-only check absent from the
  // kind's steps, i.e. no step promises prod behavior), never a hardcoded
  // kind list: any kind whose steps never include target-red/target-green is
  // prod-read-only and skips red-test with a journaled exemption.
  const kindSteps = kindFlow.steps ?? [];
  const kindPromisesProdBehavior = kindSteps.some((s) =>
    (s.checks ?? []).some((c) => c === "target-red" || c === "target-green")
  );
  const redTestExempt = !kindPromisesProdBehavior;
  if (redTestExempt && stepChecks.includes("red-test")) {
    await appendJournal(taskDir, {
      type: "red_test_exempt",
      item: itemSlug,
      kind: itemState.kind,
      reason: "kind contract forbids prod changes (no target-red/target-green in kind steps); red-test vacuous",
    });
  }
  const effectiveStepChecks = redTestExempt ? stepChecks.filter((c) => c !== "red-test") : stepChecks;
  const beforeChecksList = effectiveStepChecks.filter(
    (c) => c === "red-test" || c === "test-diff" || pipeline.checks?.[c]?.phase === "before"
  );
  const afterChecksList = effectiveStepChecks.filter((c) => !beforeChecksList.includes(c));
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
            results.push(toCheckItemResult(cRes));
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
              lastDeveloperTarget = normalizeDeveloperTarget(outTarget, infra);
            }
          }
          checkCtx.target = lastDeveloperTarget;
          checkCtx.testFirstCommit = testFirstCommit;
          const results: CheckItemResult[] = [];
          let ok = true;
          for (const cName of afterChecksList) {
            const cRes = await runCheck(cName, checkCtx);
            results.push(toCheckItemResult(cRes));
            if (!cRes.ok) {
              ok = false;
              failingCheckSummaries.push(`[${cName}] ${cRes.summary}`);
            }
          }
          return { ok, checks: results };
        }
      : undefined;

  // Fix-round re-entry for ANY agent (PsPost5 item 4): the step fragment stays
  // agent-specific, but the re-entry prompt carries the Review Feedback section
  // (see promptVars.feedback below) so non-developer agents (fact-finder,
  // researcher) do not re-run the byte-identical original prompt. Developer
  // re-entry keeps the dedicated steps/fix-round fragment.
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

  // Concern-id human dispositions are owned by the single triage router; the
  // raw item-machine question path must not double-write them.
  const concernIds = new Set(await listConcernIds(taskDir));

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
    rootTaskWt: opts.rootTaskWt,
    rootTaskDir: opts.rootTaskDir,
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
      // Persist raw human-* questions atomically with the review record
      // (Finding 23). Concern-id dispositions are routed once by triage
      // (q-concern-*/q-escalated-*), so this raw path skips them entirely.
      // Human-stop blocks the item AND the task (blocking table); human-async
      // blocks the item; human-awareness is digest-only (blocks: []).
      if (output && typeof output === "object" && "suggestions" in (output as any)) {
        const rev = output as ReviewArtifact;
        const humanSuggestions = rev.suggestions?.filter(
          (s) =>
            (s.disposition === "human-stop" ||
              s.disposition === "human-awareness" ||
              s.disposition === "human-async") &&
            !concernIds.has(s.id)
        );
        for (const q of humanSuggestions ?? []) {
          const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
          const blocks =
            q.disposition === "human-stop"
              ? [itemSlug, "task"]
              : q.disposition === "human-async"
                ? [itemSlug]
                : [];
          const targetWt = opts.rootTaskWt ?? taskWt;
          const targetDir = opts.rootTaskDir ?? taskDir;
          await writeQuestion(targetWt, targetDir, {
            id: `q-${itemSlug}-${cleanSuggestionId}`,
            ref: itemSlug,
            disposition: q.disposition,
            question: q.detail || q.summary,
            blocks,
          });
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

  // Route `architect`-disposition suggestions to the consult path: when a
  // review carries architect suggestions and no fix, trigger a consult with
  // the suggestion text as feedback (never silently merge).
  {
    const out: any = stepRes.output;
    const suggestions: any[] | undefined = out?.suggestions;
    const hasFix = Array.isArray(suggestions) && suggestions.some((s) => s?.disposition === "fix");
    const architectNotes = Array.isArray(suggestions) ? suggestions.filter((s) => s?.disposition === "architect") : [];
    if (stepRes.ok && architectNotes.length > 0 && !hasFix) {
      const feedbackText = architectNotes.map((s) => `- [ARCHITECT] ${s.summary ?? ""}${s.detail ? `: ${s.detail}` : ""}`).join("\n");
      const lastDir = itemState.records[itemState.records.length - 1]?.dirName;
      await runItemConsult({
        task,
        item: itemSlug,
        assignmentYaml: JSON.stringify(itemState.assignment ?? {}),
        priorAttemptsText: `Review requested architect input on ${currentStep.id}`,
        diffText: "",
        feedbackText,
        ...(lastDir ? { afterRecord: lastDir } : {}),
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
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      return { done: false, status: "running", stepRan: currentStep.id, consulted: true };
    }
  }
  // Concern-id human dispositions block only when the router wrote an open
  // blocking question (severity downgrade/suppression keeps the item moving).
  const routedQuestions: SteerItemArtifact[] = [];
  for (const id of stepRes.triage?.mailboxIds ?? []) {
    try {
      routedQuestions.push(
        await readYaml<SteerItemArtifact>(
          path.join(taskDir, "steer", "tousertoreview", `${id}.yaml`)
        )
      );
    } catch {
      // A missing question file cannot block.
    }
  }
  const routedBlocksItem = routedQuestions.some((q) => questionBlocks(q, itemSlug));
  const suggestions = ((stepRes.output as any)?.suggestions ?? []) as Array<{
    id: string;
    disposition?: string;
  }>;

  // Human dispositions block the item; human-awareness is digest-only.
  const hasHumanBlock = suggestions.some((s) =>
    (s.disposition === "human-async" || s.disposition === "human-stop") &&
    (concernIds.has(s.id) ? routedBlocksItem : true)
  );
  if (hasHumanBlock) {
    return { done: true, status: "blocked", stepRan: currentStep.id };
  }


  // Check if this was the last step and succeeded
  const isLastStep = targetStepIndex === steps.length - 1;
  const hasIssues = suggestions.some(
    (s) =>
      s.disposition === "fix" ||
      (s.disposition === "human-stop" && !concernIds.has(s.id))
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
