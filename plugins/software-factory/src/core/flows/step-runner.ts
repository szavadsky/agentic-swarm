import fs from "node:fs";
import path from "node:path";
import type {
  AgentRun,
  AgentOutcome,
  Harness,
  Usage,
  JSONSchema,
} from "../../harness/types.js";
import type {
  AgentConfig,
  PipelineConfig,
  PipelineLimits,
  ProjectConfig,
  StepMetaArtifact,
  StepMetaStatus,
  CheckItemResult,
} from "../artifacts.js";
import {
  startStepRecord,
  finishStepRecord,
  type StartStepRecordParams,
} from "../records/step-record.js";
import { validateAndRepair } from "../records/repair.js";
import { generateReviewSchema } from "../records/review-schema.js";
import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
import {
  aggregateConcerns,
  applyCloseupResolutions,
} from "../concerns.js";
import {
  applyReviewTriage,
  hydrateStepConcerns,
  TriageValidationError,
  type ReviewTriageOutcome,
} from "../triage.js";
import { KNOWN_VARS } from "../prompt-vars.js";
import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
import { captureHead, enforceHead } from "../git/guard.js";
import { commitAll } from "../git/commit.js";
import { git } from "../git/exec.js";
import { appendJournal } from "../journal.js";
import { loadCriteriaBundle, formatHumanInvolvementCriteria } from "../prompts.js";
import { registerActiveStep, unregisterActiveStep } from "../shutdown.js";
import { getClock, detectSuspend } from "../clock.js";
import type { Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";

export interface StepRunOptions {
  task: string;
  item?: string;
  stepId: string;
  stepFragment?: string;
  agent: string;
  role?: string;
  retryRole?: string;
  producerRetryRole?: string | null;
  escalatable?: boolean;
  isEscalated?: boolean;
  fixRound?: number;
  attempt?: number;
  sessionMode?: "fresh" | "reuse";
  existingSessionId?: string;
  cwd: string;
  taskDir: string;
  recordsDir: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  promptVars: Record<string, string>;
  parentBranch?: string;
  gitFn?: typeof git;
  turnsSemaphore?: Semaphore;
  customSchema?: JSONSchema;
  log?: (msg: string) => void;
  taskWt?: string;
  timeoutSec?: number;
  budgetTracker?: BudgetTracker;
  iteration?: number;
  writeArtifact?: (output: unknown) => Promise<void>;
  beforeChecks?: () => Promise<{ ok: boolean; checks: CheckItemResult[] }>;
  afterChecks?: (output?: unknown) => Promise<{ ok: boolean; checks: CheckItemResult[] }>;
}

export interface StepRunResult {
  ok: boolean;
  status: StepMetaStatus;
  output?: unknown;
  meta: StepMetaArtifact;
  checks?: CheckItemResult[];
  sessionId?: string;
  usage?: Usage;
  branchChanged?: boolean;
  headMoved?: boolean;
  triage?: ReviewTriageOutcome;
}

/**
 * Loads JSON schema for a given agent and step.
 */
export function resolveStepSchema(
  pluginRoot: string,
  agent: string,
  stepId: string,
  allowedDispositions?: string[]
): Record<string, unknown> {
  if (
    agent === "reviewer" ||
    agent === "qa" ||
    agent === "plan-reviewer" ||
    stepId === "review" ||
    stepId === "plan-review"
  ) {
    return generateReviewSchema(
      allowedDispositions && allowedDispositions.length > 0
        ? allowedDispositions
        : ["fix", "optional", "architect", "human-awareness", "human-async"]
    );
  }

  const schemaFileMap: Record<string, string> = {
    developer: "developer-output.schema.json",
    triage: "triage.schema.json",
    infra: "infra.schema.json",
    pm: "plan-edits.schema.json",
    "pm-edits": "plan-edits.schema.json",
    "pm-single-item": "plan-edits.schema.json",
    "pm-amend": "plan-edits.schema.json",
    "plan-close-up": "plan-closeup.schema.json",
    "wave-close-up": "wave-closeup.schema.json",
    "fact-finder": "fact-finder-output.schema.json",
    architect: "plan.schema.json",
    "architect-plan": "plan.schema.json",
    "architect-revise": "plan.schema.json",
    "architect-closeup": "plan-closeup.schema.json",
    "architect-consult-item": "decisions.schema.json",
    "architect-consult-nonitem": "decisions.schema.json",
    "architect-wave-report": "decisions.schema.json",
  };

  let fileName: string | undefined;
  if (stepId.startsWith("architect-wave-report")) fileName = "decisions.schema.json";
  else if (stepId.startsWith("architect-closeup")) fileName = "plan-closeup.schema.json";
  else if (stepId.startsWith("architect-plan") || stepId.startsWith("architect-revise")) fileName = "plan.schema.json";
  else if (stepId.startsWith("plan-close-up")) fileName = "plan-closeup.schema.json";
  else if (stepId.startsWith("wave-close-up")) fileName = "wave-closeup.schema.json";
  else if (stepId.startsWith("pm-edits") || stepId.startsWith("pm-")) fileName = "plan-edits.schema.json";
  else if (stepId.startsWith("consult-")) fileName = "decisions.schema.json";
  else fileName = schemaFileMap[stepId] ?? schemaFileMap[agent] ?? `${agent}.schema.json`;
  const schemaPath = path.resolve(pluginRoot, "config/schemas", fileName);

  if (fs.existsSync(schemaPath)) {
    try {
      return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    } catch {
      // fallback
    }
  }

  // Permissive fallback
  return {
    type: "object",
    properties: {
      status: { type: "string" },
      summary: { type: "string" },
    },
    additionalProperties: true,
  };
}

/**
 * Infers the task worktree from `<taskWt>/<orchestrationFolder>/<task>`.
 * Matches the folder boundary rather than the first `/.factory` substring so
 * temp roots such as `.factory-runtime/tmp` are not mistaken for it.
 */
function inferTaskWorktree(taskDir: string, task: string, orchestrationFolder: string): string {
  const tail = [...orchestrationFolder.split(/[\\/]/).filter(Boolean), task];
  const parts = taskDir.split(/[\\/]/);
  const matches = tail.every((seg, i) => parts[parts.length - tail.length + i] === seg);
  return matches ? path.resolve(taskDir, ...tail.map(() => "..")) : taskDir;
}

/** Feeds a step's producer fields into the taskWt concern store (§18). */
async function ingestStepConcerns(opts: {
  taskDir: string; taskWt: string; repo: any; output: unknown;
  source: { record: string; agent: string; step: string; item?: string; iteration?: number };
}): Promise<ReviewTriageOutcome | undefined> {
  const data = (opts.output ?? {}) as Record<string, any>;
  const concerns = ["concerns", "newConcerns"].flatMap((f) => (Array.isArray(data[f]) ? data[f] : []));
  const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
  if (!concerns.length && !remarkables.length && !suggestions.length && !resolutions.length) return undefined;

  // Triage only ids that existed before this step, so new concerns cannot self-dismiss.
  let existing: string[] = [];
  try {
    existing = (await fs.promises.readdir(path.join(opts.taskDir, "concerns")))
      .filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  const ctx = { taskDir: opts.taskDir, taskWt: opts.taskWt, repo: opts.repo };
  if (concerns.length || remarkables.length) await aggregateConcerns({ ...ctx, source: opts.source }, concerns, remarkables);
  const triage = suggestions.length > 0
    ? await applyReviewTriage({
        ...ctx,
        suggestions,
        concernIds: existing,
        isTriager: isTriagerAgent(opts.source.agent),
        ...(opts.source.item ? { item: opts.source.item } : {}),
      })
    : undefined;
  if (resolutions.length) await applyCloseupResolutions({ ...ctx, resolutions, by: opts.source.agent });
  return triage;
}

/**
 * Runs a single agent turn/step per §6.1, §6.3, §6.4.
 */
export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult> {
  const {
    task,
    item,
    stepId,
    stepFragment,
    agent,
    cwd,
    taskDir,
    recordsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars,
    turnsSemaphore,
  } = opts;

  const attempt = opts.attempt ?? 1;
  const fixRound = opts.fixRound ?? 1;
  const isEscalated = opts.isEscalated ?? false;

  // 1. Resolve role and models (§12.4)
  const resolvedRole = resolveStepRole({
    step: {
      id: stepId,
      agent,
      role: opts.role,
      retryRole: opts.retryRole,
      escalatable: opts.escalatable,
    },
    isEscalated,
    fixRound,
    baseProducerRole: "workhorse",
    producerRetryRole: opts.producerRetryRole ?? null,
    rolesConfig: pipeline.models.roles,
    agentsConfig: pipeline.agents,
  });

  // 2. Determine sequence number for step record
  let nextSeq = 1;
  if (fs.existsSync(recordsDir)) {
    const existing = await fs.promises.readdir(recordsDir);
    for (const name of existing) {
      const match = /^(\d{3})-/.exec(name);
      if (match) {
        const num = parseInt(match[1]!, 10);
        if (num >= nextSeq) nextSeq = num + 1;
      }
    }
  }

  const dirName = `${String(nextSeq).padStart(3, "0")}-${stepId}-a${attempt}`;
  const recordDir = path.join(recordsDir, dirName);

  // Identify worktree that contains recordDir
  const taskWt =
    opts.taskWt ?? inferTaskWorktree(taskDir, task, project.orchestrationFolder ?? ".factory");
  const wtToCommit = recordDir.startsWith(cwd) ? cwd : taskWt;

  // 3. Resolve schema
  const pluginRoot = path.resolve(import.meta.dir ?? __dirname, "../../..");
  const allowedDispositions = resolveReviewAllowed(
    pipeline,
    agent,
    isTriagerAgent(agent)
  );
  const outputSchema =
    opts.customSchema ??
    resolveStepSchema(pluginRoot, agent, stepId, allowedDispositions);

  // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
  const fragment = stepFragment ?? `steps/${stepId}`;
  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
  const effectivePromptVars: Record<string, string> = {
    humanInvolvementCriteria: formatHumanInvolvementCriteria(
      criteriaBundle.humanInvolvement,
      pipeline.humanInvolvement
    ),
    ...promptVars,
  };
  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
    const stepRole = fragment.replace(/^steps\//, "");
    if (stepRole === "review" || stepRole === "qa") {
      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
        stepRole,
        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
      });
    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
        stepRole,
        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
      });
    } else {
      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
      const inputBytes = knownVars
        .filter((key) => !excluded.has(key))
        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
    }
  }
  let promptText: string;
  let agentDef: { body: string; tools: string[]; description: string };
  try {
    promptText = prompts.renderStepPrompt
      ? prompts.renderStepPrompt(fragment, effectivePromptVars, outputSchema)
      : prompts.render(fragment, effectivePromptVars);
    agentDef = prompts.agentDefinition(agent);
  } catch (err: any) {
    const errorMsg = `Prompt or agent definition error for step ${stepId}: ${err?.message || err}`;
    const startMeta = await startStepRecord({
      recordDir,
      meta: {
        seq: nextSeq,
        name: stepId,
        attempt,
        agent,
        role: resolvedRole.role,
        models: resolvedRole.models,
      },
      inputPrompt: `FAILED RENDERING: ${errorMsg}`,
    });
    const finalMeta = await finishStepRecord({
      recordDir,
      status: "error",
      error: errorMsg,
    });
    await commitAll(repo, wtToCommit, `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [error]`);
    return {
      ok: false,
      status: "error",
      meta: finalMeta,
    };
  }

  // 5. Invariant §6.3.1: input.md + meta(status: started) committed before launch
  const keepSession = opts.sessionMode === "reuse";
  // Resolve effective per-step timeout early so it is recorded in meta:
  // step config first, then per-agent config default (ToySmoke).
  const effectiveTimeoutSec = opts.timeoutSec ?? pipeline.agents?.[agent]?.timeoutSec;
  const startMeta = await startStepRecord({
    recordDir,
    meta: {
      seq: nextSeq,
      name: stepId,
      attempt,
      agent,
      role: resolvedRole.role,
      models: resolvedRole.models,
      session: keepSession ? opts.existingSessionId : undefined,
      timeoutSec: effectiveTimeoutSec,
    },
    inputPrompt: promptText,
  });
  registerActiveStep({
    recordDir,
    metaPath: path.join(recordDir, "meta.yaml"),
    taskDir,
  });
  const isMerging = async (wt: string) => {
    const res = await git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
    return res.code === 0;
  };

  if (!(await isMerging(wtToCommit))) {
    await commitAll(
      repo,
      wtToCommit,
      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [started]`
    );
  }
  if (item && cwd !== wtToCommit && !(await isMerging(cwd))) {
    await commitAll(
      repo,
      cwd,
      `factory(${item}): ${stepId} a${attempt} [started]`
    );
  }

  await appendJournal(taskDir, {
    type: "step_started",
    task,
    item,
    step: stepId,
    attempt,
    recordDir,
  });

  // 6. Run before checks if any
  let collectedChecks: CheckItemResult[] = [];
  if (opts.beforeChecks) {
    const bRes = await opts.beforeChecks();
    collectedChecks.push(...bRes.checks);
    if (!bRes.ok) {
      // Before check failed -> Invariant §6.3.2 finish record rejected
      const finalMeta = await finishStepRecord({
        recordDir,
        status: "rejected",
        checksData: { checks: collectedChecks },
      });
      await commitAll(
        repo,
        wtToCommit,
        `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [rejected]`
      );
      if (item && cwd !== wtToCommit) {
        await commitAll(
          repo,
          cwd,
          `factory(${item}): ${stepId} a${attempt} [rejected]`
        );
      }
      return {
        ok: false,
        status: "rejected",
        meta: finalMeta,
        checks: collectedChecks,
      };
    }
  }

  // 7. HEAD guard before launch (§7)
  const headBefore = await captureHead(cwd);

  // 8. Launch harness with semaphore (§2 maxParallelTurns)
  const label = item
    ? `${task}/items/${item}/${stepId}#a${attempt}`
    : `${task}/runs/${stepId}#a${attempt}`;

  await appendJournal(taskDir, {
    type: "step_timeout",
    task,
    item,
    step: stepId,
    timeoutSec: effectiveTimeoutSec ?? "harness-default",
  });

  const agentRun: AgentRun = {
    agent,
    definition: agentDef.body || agentDef.description || agent,
    prompt: promptText,
    role: resolvedRole.role,
    models: resolvedRole.models,
    tools: agentDef.tools ?? ["edit", "bash"],
    cwd,
    outputSchema,
    label,
    session: {
      resume: keepSession ? opts.existingSessionId : undefined,
      keep: keepSession,
    },
    timeoutSec: effectiveTimeoutSec,
  };

  let outcome: AgentOutcome;
  const releaseSemaphore = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
  const clock = getClock();
  const turnStartWall = clock.now();
  const turnStartMono = clock.monotonic();
  try {
    outcome = await harness.run(agentRun);
  } finally {
    releaseSemaphore();
  }
  if (!outcome.ok) {
    const { suspendDetected, gapMs } = detectSuspend(turnStartWall, turnStartMono, clock);
    if (suspendDetected) {
      await appendJournal(taskDir, {
        type: "system_suspend_detected",
        task,
        item,
        step: stepId,
        gapMs: Math.round(gapMs),
      });
      outcome = {
        ...outcome,
        transient: true,
      };
    }
  }

  // Check transcript / stdout size against limit threshold (§4)
  const thresholdBytes: number =
    typeof pipeline.limits?.stepTranscriptWarningBytes === "number"
      ? pipeline.limits.stepTranscriptWarningBytes
      : 5 * 1024 * 1024;
  const stepSizeBytes = Math.max(outcome.transcriptBytes ?? 0, outcome.stdoutBytes ?? 0);
  if (stepSizeBytes > thresholdBytes) {
    await appendJournal(taskDir, {
      type: "step_transcript_size_warning",
      task,
      item,
      step: stepId,
      attempt,
      sizeBytes: stepSizeBytes,
      thresholdBytes,
      traceRef: outcome.traceRef,
    });
    opts.log?.(
      `[warning] Step "${stepId}" transcript/stdout size (${stepSizeBytes} bytes) exceeded threshold of ${thresholdBytes} bytes`
    );
  }

  // Accumulate total token/cost usage across ALL turns of the step (primary,
  // sessionLost rehydration, infra retries, repair ask-turns, relaunch).
  const totalUsage: Usage = {
    inputTokens: outcome.usage?.inputTokens ?? 0,
    outputTokens: outcome.usage?.outputTokens ?? 0,
    costUsd: outcome.usage?.costUsd ?? 0,
  };

  function addUsage(u?: Usage) {
    if (!u) return;
    totalUsage.inputTokens = (totalUsage.inputTokens ?? 0) + (u.inputTokens ?? 0);
    totalUsage.outputTokens = (totalUsage.outputTokens ?? 0) + (u.outputTokens ?? 0);
    totalUsage.costUsd = (totalUsage.costUsd ?? 0) + (u.costUsd ?? 0);
  }

  // On sessionLost with a kept session, retry once with a fresh session
  // (§6.3.7: resume failure → fresh session with hydration; the prompt already
  // carries hydration context built by the caller).
  if (!outcome.ok && outcome.sessionLost && keepSession) {
    await appendJournal(taskDir, {
      type: "session_lost_rehydrated",
      task,
      item,
      step: stepId,
    });
    const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
    try {
      outcome = await harness.run({
        ...agentRun,
        label: `${label}#rehydrated`,
        session: { resume: undefined, keep: keepSession },
      });
      addUsage(outcome.usage);
    } finally {
      rel();
    }
  }

  // Retry transient harness errors up to maxInfraRetries with exponential backoff (§12.2)
  const maxInfraRetries = pipeline.limits?.maxInfraRetries ?? 3;
  let infraRetries = 0;
  while (!outcome.ok && outcome.transient && infraRetries < maxInfraRetries) {
    infraRetries++;
    const backoffMs = Math.min(1000 * Math.pow(2, infraRetries - 1), 10000);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
    const retryStartWall = clock.now();
    const retryStartMono = clock.monotonic();
    try {
      outcome = await harness.run({
        ...agentRun,
        label: `${label}#infra-retry-${infraRetries}`,
      });
      addUsage(outcome.usage);
    } finally {
      rel();
    }
    if (!outcome.ok) {
      const { suspendDetected, gapMs } = detectSuspend(retryStartWall, retryStartMono, clock);
      if (suspendDetected) {
        await appendJournal(taskDir, {
          type: "system_suspend_detected",
          task,
          item,
          step: stepId,
          gapMs: Math.round(gapMs),
        });
        outcome = {
          ...outcome,
          transient: true,
        };
      }
    }
  }
  // 9. HEAD guard after turn (§7)
  const { branchChanged, headMoved, foreignCommit } = await enforceHead(repo, cwd, headBefore);
  if (foreignCommit) {
    await appendJournal(taskDir, {
      type: "head_guard_foreign_commit",
      task,
      item,
      step: stepId,
      branch: foreignCommit.branch,
      sha: foreignCommit.sha,
    });
  }


  // 10. Output validation & repair (§6.4)
  let finalStatus: StepMetaStatus = "ok";
  let validatedData: unknown = outcome.ok ? outcome.data : undefined;
  let validationError: string | undefined = outcome.ok ? undefined : outcome.error;
  let repairedFrom: string | undefined;

  if (branchChanged) {
    // §7: Branch changed during agent turn -> error, branch was restored by enforceHead
    finalStatus = "error";
    validationError = "HEAD guard detected branch change during agent turn";
    await appendJournal(taskDir, {
      type: "head_guard_branch_restored",
      task,
      item,
      step: stepId,
    });
  } else if (outcome.ok || outcome.data !== undefined) {
    const validationSchema = { ...outputSchema };

    const simplerRole = resolveRole("simpler", pipeline.models.roles);

    const repairRes = await validateAndRepair({
      rawOutput: outcome.data,
      schema: validationSchema,
      askSession: keepSession && outcome.sessionId
        ? async (retryPrompt, sch) => {
            const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
            try {
              const res = await harness.run({
                ...agentRun,
                prompt: retryPrompt,
                outputSchema: sch,
                label: `${label}#repair-ask`,
                session: { resume: outcome.sessionId, keep: keepSession },
              });
              addUsage(res.usage);
              return res;
            } finally {
              rel();
            }
          }
        : undefined,
      completeSimpler: async (repairPrompt, sch) => {
        return await harness.complete({
          role: simplerRole.role,
          models: simplerRole.models,
          system: "Output valid JSON according to schema.",
          prompt: repairPrompt,
          schema: sch,
        });
      },
      relaunch: async () => {
        const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
        try {
          const res = await harness.run({
            ...agentRun,
            label: `${label}#relaunch`,
            session: { resume: undefined, keep: keepSession },
          });
          addUsage(res.usage);
          return res;
        } finally {
          rel();
        }
      },
    });

    if (repairRes.ok) {
      validatedData = repairRes.data;
      validationError = undefined;
      if (repairRes.method !== "direct") {
        repairedFrom = repairRes.method;
      }
    } else {
      finalStatus = "rejected";
      validationError = repairRes.error;
    }
  } else {
    finalStatus = outcome.transient ? "error" : "rejected";
  }

  // 11. Run after checks if any
  if (finalStatus === "ok" && opts.afterChecks) {
    const aRes = await opts.afterChecks(validatedData);
    collectedChecks.push(...aRes.checks);
    if (!aRes.ok) {
      finalStatus = "rejected";
    }
  }

  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
  if (finalStatus === "ok" && opts.writeArtifact) {
    try {
      await opts.writeArtifact(validatedData);
    } catch (err: any) {
      finalStatus = "error";
      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
    }
  }

  // Producer concerns feed the taskWt store after the canonical artifact write.
  let triageOutcome: ReviewTriageOutcome | undefined;
  if (finalStatus === "ok") {
    try {
      triageOutcome = await ingestStepConcerns({
        taskDir, taskWt, repo, output: validatedData,
        source: {
          record: dirName, agent, step: stepId,
          ...(item ? { item } : {}),
          ...(opts.iteration !== undefined ? { iteration: opts.iteration } : {}),
        },
      });
    } catch (err: any) {
      if (err instanceof TriageValidationError) {
        finalStatus = "error";
        validationError = `Review triage failed: ${err.message}`;
      } else {
        try { await appendJournal(taskDir, { type: "concern_ingest_error", task, item, step: stepId, error: err?.message || String(err) }); } catch { /* Journal failure must not change step status. */ }
      }
    }
  }

  // 13. Invariant §6.3.2: Finish step record with final meta
  const finalMeta = await finishStepRecord({
    recordDir,
    status: finalStatus,
    outputData: validatedData,
    checksData: collectedChecks.length > 0 ? { checks: collectedChecks } : undefined,
    usage: totalUsage,
    error: validationError,
    repairedFrom,
    traceRef: outcome.traceRef,
  });

  // Record usage centrally in budget tracker (§12.5)
  if (opts.budgetTracker && totalUsage) {
    opts.budgetTracker.recordUsage({
      item,
      iteration: opts.iteration,
      usage: totalUsage,
    });
  }

  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
  if (!(await isMerging(wtToCommit))) {
    await commitAll(
      repo,
      wtToCommit,
      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
    );
  }
  if (item && cwd !== wtToCommit && !(await isMerging(cwd))) {
    await commitAll(
      repo,
      cwd,
      `factory(${item}): ${stepId} a${attempt} [${finalStatus}]`
    );
  }

  await appendJournal(taskDir, {
    type: "step_finished",
    task,
    item,
    step: stepId,
    attempt,
    status: finalStatus,
    sessionId: outcome.sessionId,
    usage: totalUsage,
  });
  unregisterActiveStep(recordDir);
  return {
    ok: finalStatus === "ok",
    status: finalStatus,
    output: validatedData,
    meta: finalMeta,
    checks: collectedChecks,
    sessionId: outcome.sessionId,
    usage: totalUsage,
    branchChanged,
    headMoved,
    ...(triageOutcome ? { triage: triageOutcome } : {}),
  };
}
