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
import { resolveStepRole, type ResolvedRole } from "../config/roles.js";
import { git } from "../git/exec.js";
import { appendJournal } from "../journal.js";
import type { Semaphore } from "../mutex.js";

export interface StepRunOptions {
  task: string;
  item?: string;
  stepId: string;
  stepFragment?: string;
  agent: string;
  role?: string;
  retryRole?: string;
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
  turnsSemaphore?: Semaphore;
  customSchema?: JSONSchema;
  log?: (msg: string) => void;
  beforeChecks?: () => Promise<{ ok: boolean; checks: CheckItemResult[] }>;
  afterChecks?: () => Promise<{ ok: boolean; checks: CheckItemResult[] }>;
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
  if (agent === "reviewer" || agent === "qa" || agent === "plan-reviewer" || stepId === "review" || stepId === "plan-review") {
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
 * Captures git HEAD and branch (§7).
 */
export async function captureHeadSafe(wt: string): Promise<{ branch: string; sha: string }> {
  try {
    const { captureHead } = await import("../git/guard.js" as any);
    return await captureHead(wt);
  } catch {
    const branchRes = await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
    const shaRes = await git(wt, ["rev-parse", "HEAD"], { allowFail: true });
    return {
      branch: branchRes.stdout.trim() || "unknown",
      sha: shaRes.stdout.trim() || "unknown",
    };
  }
}

/**
 * Enforces HEAD guard around agent turn (§7).
 */
export async function enforceHeadSafe(
  repo: any,
  wt: string,
  before: { branch: string; sha: string }
): Promise<{ branchChanged: boolean; headMoved: boolean }> {
  try {
    const { enforceHead } = await import("../git/guard.js" as any);
    return await enforceHead(repo, wt, before);
  } catch {
    let branchChanged = false;
    let headMoved = false;

    const currentBranchRes = await git(wt, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
    const currentShaRes = await git(wt, ["rev-parse", "HEAD"], { allowFail: true });

    const currentBranch = currentBranchRes.stdout.trim();
    const currentSha = currentShaRes.stdout.trim();

    if (currentBranch && before.branch && currentBranch !== before.branch) {
      branchChanged = true;
      // Checkout back, keeping working tree changes
      await git(wt, ["checkout", before.branch], { allowFail: true });
    }

    if (currentSha && before.sha && currentSha !== before.sha) {
      headMoved = true;
      // Soft reset to keep changes uncommitted/staged
      await git(wt, ["reset", "--soft", before.sha], { allowFail: true });
    }

    return { branchChanged, headMoved };
  }
}

/**
 * Commits worktree changes safely (§6.3 Invariant 3).
 */
export async function commitWorktreeSafe(
  repo: any,
  wt: string,
  message: string
): Promise<string | null> {
  try {
    const { commitAll } = await import("../git/commit.js" as any);
    return await commitAll(repo, wt, message);
  } catch {
    try {
      await git(wt, ["add", "-A"], { allowFail: true });
      const statusRes = await git(wt, ["status", "--porcelain"], { allowFail: true });
      if (!statusRes.stdout.trim()) {
        return null;
      }
      const commitRes = await git(wt, ["commit", "-m", message], { allowFail: true });
      if (commitRes.code === 0) {
        const rev = await git(wt, ["rev-parse", "HEAD"], { allowFail: true });
        return rev.stdout.trim();
      }
    } catch {
      // ignore
    }
    return null;
  }
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
    producerRetryRole: "alt-workhorse",
    rolesConfig: pipeline.models.roles,
    agentsConfig: pipeline.agents,
  });

  // 2. Render prompt and agent definition
  const fragment = stepFragment ?? `steps/${stepId}`;
  let promptText: string;
  try {
    promptText = prompts.render(fragment, promptVars);
  } catch (err: any) {
    // If specific fragment not found, fallback to agent definition or basic prompt
    promptText = `Step ${stepId} for ${item ?? task}\n\n${JSON.stringify(promptVars, null, 2)}`;
  }

  let agentDef = { body: "", tools: ["edit", "bash"], description: agent };
  try {
    agentDef = prompts.agentDefinition(agent);
  } catch {
    // fallback
  }

  // 3. Resolve schema
  const pluginRoot = path.resolve(import.meta.dir ?? __dirname, "../../..");
  const allowedDispositions = pipeline.reviewPolicy?.allowedDispositions;
  const outputSchema =
    opts.customSchema ??
    resolveStepSchema(pluginRoot, agent, stepId, allowedDispositions);

  // 4. Determine next sequence number for step record
  let nextSeq = 1;
  if (fs.existsSync(recordsDir)) {
    try {
      const existing = await fs.promises.readdir(recordsDir);
      for (const name of existing) {
        const match = /^(\d{3})-/.exec(name);
        if (match) {
          const num = parseInt(match[1]!, 10);
          if (num >= nextSeq) nextSeq = num + 1;
        }
      }
    } catch {
      // ignore
    }
  }

  const dirName = `${String(nextSeq).padStart(3, "0")}-${stepId}-a${attempt}`;
  const recordDir = path.join(recordsDir, dirName);

  // 5. Invariant §6.3.1: input.md + meta(status: started) committed before launch
  const keepSession = opts.sessionMode === "reuse";
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
    },
    inputPrompt: promptText,
  });

  if (item) {
    await commitWorktreeSafe(
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
      if (item) {
        await commitWorktreeSafe(
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
  const headBefore = await captureHeadSafe(cwd);

  // 8. Launch harness with semaphore (§2 maxParallelTurns)
  const label = item
    ? `${task}/items/${item}/${stepId}#a${attempt}`
    : `${task}/runs/${stepId}#a${attempt}`;

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
  };

  let outcome: AgentOutcome;
  const releaseSemaphore = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
  try {
    outcome = await harness.run(agentRun);
  } finally {
    releaseSemaphore();
  }

  // 9. HEAD guard after turn (§7)
  const { branchChanged, headMoved } = await enforceHeadSafe(repo, cwd, headBefore);

  // 10. Output validation & repair (§6.4)
  let finalStatus: StepMetaStatus = "ok";
  let validatedData: unknown = outcome.ok ? outcome.data : undefined;
  let validationError: string | undefined = outcome.ok ? undefined : outcome.error;

  if (outcome.ok || outcome.data !== undefined) {
    const validationSchema = { ...outputSchema };
    delete (validationSchema as any).$id;

    const repairRes = await validateAndRepair({
      rawOutput: outcome.data,
      schema: validationSchema,
      askSession: keepSession && outcome.sessionId
        ? async (retryPrompt, sch) => {
            const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
            try {
              return await harness.run({
                ...agentRun,
                prompt: retryPrompt,
                outputSchema: sch,
                label: `${label}#repair-ask`,
                session: { resume: outcome.sessionId, keep: keepSession },
              });
            } finally {
              rel();
            }
          }
        : undefined,
      completeSimpler: async (repairPrompt, sch) => {
        return await harness.complete({
          role: "simpler",
          models: pipeline.models.roles["simpler"] ? [
            "model" in pipeline.models.roles["simpler"]
              ? (pipeline.models.roles["simpler"] as any).model
              : "deepseek-chat"
          ] : ["deepseek-chat"],
          system: "Output valid JSON according to schema.",
          prompt: repairPrompt,
          schema: sch,
        });
      },
      relaunch: async () => {
        const rel = turnsSemaphore ? await turnsSemaphore.acquire() : () => {};
        try {
          return await harness.run({
            ...agentRun,
            label: `${label}#relaunch`,
            session: { resume: undefined, keep: keepSession },
          });
        } finally {
          rel();
        }
      },
    });

    if (repairRes.ok) {
      validatedData = repairRes.data;
    } else {
      finalStatus = "rejected";
      validationError = repairRes.error;
    }
  } else {
    finalStatus = outcome.transient ? "error" : "rejected";
  }

  // 11. Run after checks if any
  if (finalStatus === "ok" && opts.afterChecks) {
    const aRes = await opts.afterChecks();
    collectedChecks.push(...aRes.checks);
    if (!aRes.ok) {
      finalStatus = "rejected";
    }
  }

  // 12. Invariant §6.3.2: Finish step record with final meta
  const finalMeta = await finishStepRecord({
    recordDir,
    status: finalStatus,
    outputData: validatedData,
    checksData: collectedChecks.length > 0 ? { checks: collectedChecks } : undefined,
    usage: outcome.usage,
  });

  // 13. Invariant §6.3.3: Engine commits worktree after every item step
  if (item) {
    await commitWorktreeSafe(
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
    usage: outcome.usage,
  });

  return {
    ok: finalStatus === "ok",
    status: finalStatus,
    output: validatedData,
    meta: finalMeta,
    checks: collectedChecks,
    sessionId: outcome.sessionId,
    usage: outcome.usage,
    branchChanged,
    headMoved,
  };
}
