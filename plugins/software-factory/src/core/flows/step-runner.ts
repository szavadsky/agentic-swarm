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
  parseStepRecordDirName,
  formatStepRecordDirName,
  findOkCommittedRecord,
  getNextStepAttempt,
  type StartStepRecordParams,
  type OkCommittedStepRecord,
} from "../records/step-record.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";
import { validateAndRepair } from "../records/repair.js";
import { resolveAgentTools, FILE_TOOL_IDS } from "../prompts.js";
import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
import { generateReviewSchema } from "../records/review-schema.js";
import { captureHead, enforceHead } from "../git/guard.js";
import { commitAll } from "../git/commit.js";
import { git } from "../git/exec.js";
import { appendJournal } from "../journal.js";
import { registerActiveStep, unregisterActiveStep, type ActiveStepRecord } from "../shutdown.js";
import { getClock, detectSuspend } from "../clock.js";
import type { Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";
 import { writeQuestion } from "../steer.js";
import { assertDiskSpace } from "../disk-space.js";
export const TIMEOUT_NUDGE_PROMPT =
  "time budget exhausted: stop exploring, yield your result now from what you have; record unknowns as uncertainties";

export const INTERRUPTED_RESUME_PROMPT =
  "you were interrupted; continue and yield";

export { findOkCommittedRecord, getNextStepAttempt, type OkCommittedStepRecord };
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
  /** Resumed validation-repair turn: send ONLY repairFeedback as the prompt on the resumed session (no fragment render, no done-ness reuse). */
  resumedRepair?: boolean;
  repairFeedback?: string;
  cwd: string;
  taskDir: string;
  recordsDir: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  promptVars: Record<string, string>;
  turnsSemaphore?: Semaphore;
  customSchema?: JSONSchema;
  log?: (msg: string) => void;
  taskWt: string;
  rootTaskWt?: string;
  rootTaskDir?: string;
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
  else if (stepId.startsWith("context-pack")) fileName = "fact-finder-output.schema.json";
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

  // 0. For orchestration steps (item is undefined): derive done-ness from an ok committed record (§8.4)
  // Resumed-repair turns never reuse: they repair the previous output, so a committed ok must not shadow them.
  if (!item && !opts.resumedRepair) {
    let existingOk = await findOkCommittedRecord(recordsDir, stepId, opts.taskWt);
    if (existingOk) {
      let artifactWritten = true;
      if (opts.writeArtifact) {
        try {
          await opts.writeArtifact(existingOk.output);
        } catch (err: any) {
          artifactWritten = false;
        }
      }
      if (artifactWritten) {
        await appendJournal(taskDir, {
          type: "step_reused",
          task,
          step: stepId,
          recordDir: existingOk.recordDir,
        });
        return {
          ok: true,
          status: "ok",
          output: existingOk.output,
          meta: existingOk.meta,
          sessionId: existingOk.meta.session,
        };
      }
    }
  }

  // Disk-space guard check before step execution (§limits.minFreeDiskMb)
  const repoRoot = repo?.mainRoot ?? cwd ?? process.cwd();
  const worktreeRoot = repo?.worktreeRoot ?? project?.worktreeRoot;
  await assertDiskSpace({
    repoRoot,
    worktreeRoot,
    pipeline,
    task,
    taskDir,
    taskWt: opts.taskWt,
    repo,
  });
  const attempt =
    opts.attempt ??
    (!item
      ? getNextStepAttempt(recordsDir, stepId, pipeline.limits?.maxInterruptions ?? 3)
      : 1);
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

  // Item steps encode the fix round in the record name so a restarted
  // series after a fix round is unambiguous (`NNN-<step>-rR-aA`).
  const dirName = formatStepRecordDirName({
    seq: nextSeq,
    stepId,
    attempt,
    ...(item ? { fixRound } : {}),
  });
  const recordDir = path.join(recordsDir, dirName);

  // Identify worktree that contains recordDir
  const taskWt = opts.taskWt;
  const wtToCommit = recordDir.startsWith(cwd) ? cwd : taskWt;

  // 3. Resolve schema
  const pluginRoot = path.resolve(import.meta.dir ?? __dirname, "../../..");
  const allowedDispositions = pipeline.reviewPolicy?.allowedDispositions;
  const outputSchema =
    opts.customSchema ??
    resolveStepSchema(pluginRoot, agent, stepId, allowedDispositions);

  // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
  // Resumed-repair: errors-only prompt on the live session — never re-render the full fragment.
  const fragment = stepFragment ?? `steps/${stepId}`;
  let promptText: string;
  let agentDef: { body: string; tools: string[]; description: string };
  try {
    if (opts.resumedRepair) {
      if (!opts.repairFeedback) {
        throw new Error(`Resumed-repair turn for step ${stepId} requires repairFeedback`);
      }
      if (!opts.existingSessionId) {
        throw new Error(`Resumed-repair turn for step ${stepId} requires existingSessionId`);
      }
      promptText = opts.repairFeedback;
      agentDef = prompts.agentDefinition(agent);
    } else {
      promptText = prompts.renderStepPrompt
        ? prompts.renderStepPrompt(fragment, promptVars, outputSchema)
        : prompts.render(fragment, promptVars);
      agentDef = prompts.agentDefinition(agent);
    }
  } catch (err: any) {
    const errorMsg = `Prompt or agent definition error for step ${stepId}: ${err?.message || err}`;
    const startMeta = await startStepRecord({
      recordDir,
      meta: {
        seq: nextSeq,
        name: stepId,
        attempt,
        ...(item ? { fixRound } : {}),
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

  // Look for a prior interrupted record for this step that has a session id (§6.3, restart resilience)
  let resumeInterruptedSessionId: string | undefined;
  if (fs.existsSync(recordsDir)) {
    const existingEntries = await fs.promises.readdir(recordsDir);
    const matching = existingEntries
      .map((e) => {
        const parsed = parseStepRecordDirName(e);
        return parsed ? { dir: e, ...parsed } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.name === stepId)
      .sort((a, b) => b.seq - a.seq);

    for (const prev of matching) {
      const prevMetaPath = path.join(recordsDir, prev.dir, "meta.yaml");
      if (fs.existsSync(prevMetaPath)) {
        try {
          const prevMeta = await readYaml<StepMetaArtifact>(prevMetaPath);
          if (prevMeta.status === "interrupted" && prevMeta.session) {
            resumeInterruptedSessionId = prevMeta.session;
            break;
          }
        } catch {}
      }
    }
  }

  // 5. Invariant §6.3.1: input.md + meta(status: started) committed before launch
  const keepSession = opts.sessionMode === "reuse";
  const isResumingInterrupted = Boolean(resumeInterruptedSessionId);

  // Resolve effective per-step timeout early so it is recorded in meta:
  // step config first, then per-agent config default (ToySmoke).
  const effectiveTimeoutSec = opts.timeoutSec ?? pipeline.agents?.[agent]?.timeoutSec;
  const timeoutNudge =
    (pipeline.limits?.timeoutNudgeSec as number | undefined) ??
    (effectiveTimeoutSec ? Math.max(1, Math.floor(effectiveTimeoutSec / 2)) : 300);

  const initialTimeoutSec = isResumingInterrupted ? timeoutNudge : effectiveTimeoutSec;
  const initialSession = resumeInterruptedSessionId ?? (keepSession ? opts.existingSessionId : undefined);
  const initialPrompt = isResumingInterrupted ? INTERRUPTED_RESUME_PROMPT : promptText;

  const startMeta = await startStepRecord({
    recordDir,
    meta: {
      seq: nextSeq,
      name: stepId,
      attempt,
      ...(item ? { fixRound } : {}),
      agent,
      role: resolvedRole.role,
      models: resolvedRole.models,
      session: initialSession,
      timeoutSec: initialTimeoutSec,
    },
    inputPrompt: initialPrompt,
  });

  const priorUsage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  let currentTurnUsage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };

  function getCurrentTotalUsage(): Usage {
    return {
      inputTokens: (priorUsage.inputTokens ?? 0) + (currentTurnUsage.inputTokens ?? 0),
      outputTokens: (priorUsage.outputTokens ?? 0) + (currentTurnUsage.outputTokens ?? 0),
      costUsd: (priorUsage.costUsd ?? 0) + (currentTurnUsage.costUsd ?? 0),
    };
  }

  function onTurnUsage(u?: Usage) {
    if (!u) return;
    currentTurnUsage = {
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      costUsd: u.costUsd ?? 0,
    };
  }

  function commitTurnUsage(outcomeUsage?: Usage) {
    const finalTurnUsage = outcomeUsage ?? currentTurnUsage;
    priorUsage.inputTokens = (priorUsage.inputTokens ?? 0) + (finalTurnUsage.inputTokens ?? 0);
    priorUsage.outputTokens = (priorUsage.outputTokens ?? 0) + (finalTurnUsage.outputTokens ?? 0);
    priorUsage.costUsd = (priorUsage.costUsd ?? 0) + (finalTurnUsage.costUsd ?? 0);
    currentTurnUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }

  let currentSessionId: string | undefined = initialSession;

  const activeStep: ActiveStepRecord = {
    recordDir,
    metaPath: path.join(recordDir, "meta.yaml"),
    taskDir,
    sessionId: currentSessionId,
    getUsage: () => getCurrentTotalUsage(),
  };
  registerActiveStep(activeStep);

  const onSession = async (sid: string) => {
    currentSessionId = sid;
    activeStep.sessionId = sid;
    const metaFile = path.join(recordDir, "meta.yaml");
    if (fs.existsSync(metaFile)) {
      try {
        const meta = await readYaml<StepMetaArtifact>(metaFile);
        if (meta && meta.session !== sid) {
          meta.session = sid;
          await writeYamlAtomic(metaFile, meta);
          if (!(await isMerging(wtToCommit))) {
            const relMeta = path.relative(wtToCommit, metaFile).replace(/\\/g, "/");
            await commitAll(
              repo,
              wtToCommit,
              `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [session]`,
              { paths: [relMeta] }
            );
          }
        }
      } catch {}
    }
  };
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
    type: "step_timeout_armed",
    task,
    item,
    step: stepId,
    timeoutSec: effectiveTimeoutSec ?? "harness-default",
  });

  if (isResumingInterrupted) {
    await appendJournal(taskDir, {
      type: "interrupted_step_resumed",
      task,
      item,
      step: stepId,
      attempt,
      sessionId: resumeInterruptedSessionId,
      timeoutSec: initialTimeoutSec,
    });
  }

  // Pipeline agents.<name>.tools overrides frontmatter tools (§5, §10); empty = yield-only.
  // Definitions without a tools list fall back to pipeline.tools.defaults (default config: [edit, bash]).
  const resolvedTools = resolveAgentTools(agent, agentDef.tools ?? pipeline.tools?.defaults ?? ["edit", "bash"], pipeline);
  if (agent === "pm") {
    const fileTools = resolvedTools.filter((t) => FILE_TOOL_IDS.has(t));
    if (fileTools.length > 0) {
      const guardError = `PM agent step "${stepId}" carries file tools [${fileTools.join(", ")}] after tool resolution; PM is yield-only by construction`;
      const finalMeta = await finishStepRecord({ recordDir, status: "error", error: guardError });
      await commitAll(repo, wtToCommit, `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [error]`);
      await appendJournal(taskDir, { type: "pm_tools_guard_rejected", task, item, step: stepId, tools: fileTools });
      unregisterActiveStep(recordDir);
      return { ok: false, status: "error", meta: finalMeta };
    }
  }

  const agentRun: AgentRun = {
    agent,
    definition: agentDef.body || agentDef.description || agent,
    prompt: initialPrompt,
    role: resolvedRole.role,
    models: resolvedRole.models,
    tools: resolvedTools,
    cwd,
    outputSchema,
    label,
    session: {
      resume: initialSession,
      keep: keepSession,
    },
    timeoutSec: initialTimeoutSec,
    onSession,
    onUsage: (u) => onTurnUsage(u),
    onModelFallback: async ({ from, to, reason }) => {
      try {
        await appendJournal(taskDir, {
          type: "harness_model_fallback",
          task,
          item,
          step: stepId,
          from,
          to,
          reason,
        });
      } catch {}
    },
  };

  let outcome: AgentOutcome;
  const releaseSemaphore = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
  const clock = getClock();
  const turnStartWall = clock.now();
  const turnStartMono = clock.monotonic();
  try {
    outcome = await harness.run(agentRun);
  } catch (err) {
    const curUsage = getCurrentTotalUsage();
    const metaPath = path.join(recordDir, "meta.yaml");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = await readYaml<StepMetaArtifact>(metaPath);
        let changed = false;
        if (!meta.session && currentSessionId) {
          meta.session = currentSessionId;
          changed = true;
        }
        if (curUsage.inputTokens || curUsage.outputTokens || curUsage.costUsd) {
          meta.usage = { ...curUsage };
          changed = true;
        }
        if (changed) {
          await writeYamlAtomic(metaPath, meta);
        }
      } catch {}
    }
    throw err;
  } finally {
    releaseSemaphore();
  }

  commitTurnUsage(outcome.usage);
  if (outcome.sessionId) {
    currentSessionId = outcome.sessionId;
    activeStep.sessionId = outcome.sessionId;
  }

  const { suspendDetected, gapMs } = detectSuspend(turnStartWall, turnStartMono, clock);
  if (suspendDetected) {
    await appendJournal(taskDir, {
      type: "system_suspend_detected",
      task,
      item,
      step: stepId,
      gapMs: Math.round(gapMs),
    });
    if (!outcome.ok) {
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

  // Exploration-budget warning (PsPost5 item 10): probe transcripts showed
  // 60-90 tool calls with heavy re-reads. Advisory only — never blocks.
  const toolCallThreshold: number =
    typeof pipeline.limits?.stepToolCallWarning === "number"
      ? pipeline.limits.stepToolCallWarning
      : 60;
  const stepToolCalls = outcome.toolCallCount ?? 0;
  if (stepToolCalls > toolCallThreshold) {
    await appendJournal(taskDir, {
      type: "step_tool_call_warning",
      task,
      item,
      step: stepId,
      attempt,
      toolCalls: stepToolCalls,
      threshold: toolCallThreshold,
      traceRef: outcome.traceRef,
    });
    opts.log?.(
      `[warning] Step "${stepId}" made ${stepToolCalls} tool calls (threshold ${toolCallThreshold})`
    );
  }

  function isTimeoutOutcome(o: AgentOutcome): boolean {
    if (o.ok) return false;
    if ((o as any).timedOut) return true;
    const err = o.error || "";
    return /timed?\s*out|timeout|deadline\s*exceeded/i.test(err);
  }

  // On sessionLost with a kept session or resumed interrupted session, retry once with a fresh session
  if (!outcome.ok && outcome.sessionLost && (keepSession || isResumingInterrupted)) {
    await appendJournal(taskDir, {
      type: "session_lost_rehydrated",
      task,
      item,
      step: stepId,
    });
    currentSessionId = undefined;
    activeStep.sessionId = undefined;
    const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
    const rehydratedWall = clock.now();
    const rehydratedMono = clock.monotonic();
    try {
      outcome = await harness.run({
        ...agentRun,
        label: `${label}#rehydrated`,
        prompt: promptText,
        session: { resume: undefined, keep: keepSession },
        timeoutSec: effectiveTimeoutSec,
        onSession,
        onUsage: (u) => onTurnUsage(u),
      });
      commitTurnUsage(outcome.usage);
      if (outcome.sessionId) {
        currentSessionId = outcome.sessionId;
        activeStep.sessionId = outcome.sessionId;
      }
    } finally {
      rel();
    }
    const { suspendDetected: rehydratedSuspend, gapMs: rehydratedGap } = detectSuspend(
      rehydratedWall,
      rehydratedMono,
      clock
    );
    if (rehydratedSuspend) {
      await appendJournal(taskDir, {
        type: "system_suspend_detected",
        task,
        item,
        step: stepId,
        gapMs: Math.round(rehydratedGap),
      });
      if (!outcome.ok) {
        outcome = {
          ...outcome,
          transient: true,
        };
      }
    }
  }

  // Retry transient harness errors up to maxInfraRetries with exponential backoff (§12.2)
  const expensiveRoles = pipeline.budget?.expensiveRoles ?? ["architect", "task-escalation"];
  const isExpensiveRole =
    expensiveRoles.includes(resolvedRole.role) ||
    expensiveRoles.includes(agent) ||
    (opts.role ? expensiveRoles.includes(opts.role) : false);

  const maxInfraRetries = isExpensiveRole
    ? (pipeline.limits?.maxInfraRetriesExpensive ?? 1)
    : (pipeline.limits?.maxInfraRetries ?? 3);
  const perStepUsdCap = pipeline.budget?.perStepUsd ?? 8;
  let infraRetries = 0;

  while (!outcome.ok && outcome.transient) {
    const currentCost = getCurrentTotalUsage().costUsd ?? 0;
    const costCapExceeded = currentCost >= perStepUsdCap;
    const retriesExhausted = infraRetries >= maxInfraRetries;

    if (costCapExceeded || retriesExhausted) {
      const reason = costCapExceeded
        ? `cost_cap_exceeded (${currentCost.toFixed(2)} USD >= ${perStepUsdCap} USD)`
        : `retries_exhausted (${infraRetries}/${maxInfraRetries})`;
      const escalationQId = `escalation-${item ? `${item}-` : ""}${stepId}-a${attempt}`;
      await writeQuestion(opts.rootTaskWt ?? wtToCommit, opts.rootTaskDir ?? taskDir, {
        id: escalationQId,
        ref: item ?? stepId,
        disposition: "human-async",
        question: `Step "${stepId}" ${item ? `for item "${item}" ` : ""}stopped due to ${reason}. Error: ${outcome.error ?? "transient failure"}`,
        blocks: [item ?? stepId],
      });
      await appendJournal(taskDir, {
        type: "infra_retry_escalated",
        task,
        item,
        step: stepId,
        attempt,
        reason: costCapExceeded ? "cost_cap_exceeded" : "retries_exhausted",
        costUsd: currentCost,
        retries: infraRetries,
        maxRetries: maxInfraRetries,
        questionId: escalationQId,
      });
      break;
    }

    infraRetries++;
    const backoffMs = Math.min(1000 * Math.pow(2, infraRetries - 1), 10000);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    const isResumable = Boolean(currentSessionId && (keepSession || Boolean(outcome.sessionId)));
    const wasTimeout = isTimeoutOutcome(outcome);

    let retryPrompt = agentRun.prompt;
    let retryTimeoutSec = agentRun.timeoutSec;
    let resumeSessionId: string | undefined = undefined;

    if (isResumable) {
      resumeSessionId = currentSessionId;
      if (wasTimeout) {
        retryPrompt = TIMEOUT_NUDGE_PROMPT;
        const reduced =
          (pipeline.limits?.timeoutNudgeSec as number | undefined) ??
          (effectiveTimeoutSec ? Math.max(1, Math.floor(effectiveTimeoutSec / 2)) : 300);
        retryTimeoutSec = reduced;
        await appendJournal(taskDir, {
          type: "turn_timeout_nudge",
          task,
          item,
          step: stepId,
          attempt,
          sessionId: currentSessionId,
          timeoutSec: retryTimeoutSec,
        });
      }
    }

    await appendJournal(taskDir, {
      type: "infra_retry_started",
      task,
      item,
      step: stepId,
      attempt,
      retry: infraRetries,
      maxRetries: maxInfraRetries,
      sessionId: resumeSessionId,
      costUsd: getCurrentTotalUsage().costUsd,
    });

    const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
    const retryStartWall = clock.now();
    const retryStartMono = clock.monotonic();
    try {
      outcome = await harness.run({
        ...agentRun,
        label: `${label}#infra-retry-${infraRetries}`,
        prompt: retryPrompt,
        session: {
          resume: resumeSessionId,
          keep: keepSession,
        },
        timeoutSec: retryTimeoutSec,
        onSession,
        onUsage: (u) => onTurnUsage(u),
      });
      commitTurnUsage(outcome.usage);
      if (outcome.sessionId) {
        currentSessionId = outcome.sessionId;
        activeStep.sessionId = outcome.sessionId;
      }
    } finally {
      rel();
    }

    await appendJournal(taskDir, {
      type: "infra_retry_finished",
      task,
      item,
      step: stepId,
      attempt,
      retry: infraRetries,
      ok: outcome.ok,
      transient: !outcome.ok ? outcome.transient : false,
      costUsd: getCurrentTotalUsage().costUsd,
    });

    // Only fall back to a fresh session on sessionLost
    if (!outcome.ok && outcome.sessionLost) {
      await appendJournal(taskDir, {
        type: "session_lost_rehydrated",
        task,
        item,
        step: stepId,
      });
      currentSessionId = undefined;
      activeStep.sessionId = undefined;
      const relFresh = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
      const freshStartWall = clock.now();
      const freshStartMono = clock.monotonic();
      try {
        outcome = await harness.run({
          ...agentRun,
          label: `${label}#rehydrated`,
          session: { resume: undefined, keep: keepSession },
          prompt: agentRun.prompt,
          timeoutSec: effectiveTimeoutSec,
          onSession,
        onUsage: (u) => onTurnUsage(u),
        });
        commitTurnUsage(outcome.usage);
        if (outcome.sessionId) {
          currentSessionId = outcome.sessionId;
          activeStep.sessionId = outcome.sessionId;
        }
      } finally {
        relFresh();
      }
      const freshSuspend = detectSuspend(freshStartWall, freshStartMono, clock);
      if (freshSuspend.suspendDetected) {
        await appendJournal(taskDir, {
          type: "system_suspend_detected",
          task,
          item,
          step: stepId,
          gapMs: Math.round(freshSuspend.gapMs),
        });
        if (!outcome.ok) {
          outcome = { ...outcome, transient: true };
        }
      }
    }

    const { suspendDetected, gapMs } = detectSuspend(retryStartWall, retryStartMono, clock);
    if (suspendDetected) {
      await appendJournal(taskDir, {
        type: "system_suspend_detected",
        task,
        item,
        step: stepId,
        gapMs: Math.round(gapMs),
      });
      if (!outcome.ok) {
        outcome = {
          ...outcome,
          transient: true,
        };
      }
    }
  }

  if (currentSessionId && !outcome.sessionId) {
    outcome.sessionId = currentSessionId;
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
                onSession,
                onUsage: (u) => onTurnUsage(u),
              });
              commitTurnUsage(res.usage);
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
          onModelFallback: agentRun.onModelFallback,
        });
      },
      relaunch: async () => {
        const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
        try {
          const res = await harness.run({
            ...agentRun,
            label: `${label}#relaunch`,
            session: { resume: undefined, keep: keepSession },
            onSession,
            onUsage: (u) => onTurnUsage(u),
            onModelFallback: agentRun.onModelFallback,
          });
          commitTurnUsage(res.usage);
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
        // ShPost3 #3: a non-direct accept (e.g. unknown-key strip by repair)
        // is journaled explicitly — never silently kept.
        await appendJournal(taskDir, {
          type: "step_output_repaired",
          task,
          item,
          step: stepId,
          attempt,
          method: repairRes.method,
        });
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

  // Ensure session is written into meta.yaml before finishing
  const metaFile = path.join(recordDir, "meta.yaml");
  if (currentSessionId && fs.existsSync(metaFile)) {
    try {
      const curMeta = await readYaml<StepMetaArtifact>(metaFile);
      if (!curMeta.session) {
        curMeta.session = currentSessionId;
        await writeYamlAtomic(metaFile, curMeta);
      }
    } catch {}
  }

  // 13. Invariant §6.3.2: Finish step record with final meta
  const finalMeta = await finishStepRecord({
    recordDir,
    status: finalStatus,
    outputData: validatedData,
    checksData: collectedChecks.length > 0 ? { checks: collectedChecks } : undefined,
    usage: getCurrentTotalUsage(),
    error: validationError,
    repairedFrom,
    traceRef: outcome.traceRef,
  });

  // Record usage centrally in budget tracker (§12.5)
  if (opts.budgetTracker) {
    opts.budgetTracker.recordUsage({
      item,
      iteration: opts.iteration,
      role: resolvedRole.role,
      usage: getCurrentTotalUsage(),
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
    usage: getCurrentTotalUsage(),
  });
  unregisterActiveStep(recordDir);
  return {
    ok: finalStatus === "ok",
    status: finalStatus,
    output: validatedData,
    meta: finalMeta,
    checks: collectedChecks,
    sessionId: outcome.sessionId,
    usage: getCurrentTotalUsage(),
    branchChanged,
    headMoved,
  };
}
