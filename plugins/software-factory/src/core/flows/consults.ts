import fs from "node:fs";
import path from "node:path";
import type {
  DecisionArtifact,
  DecisionContext,
  PipelineConfig,
  ProjectConfig,
  SteerItemArtifact,
  StoredConcernArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { writeYamlAtomic } from "../records/io.js";
import { writeQuestion } from "../steer.js";
import { runAgentStep } from "./step-runner.js";
import { appendJournal } from "../journal.js";
import { KeyedMutex, type Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";

/** Serializes routed-concern consults so one decision file is written once. */
const concernLocks = new KeyedMutex();

export interface ItemConsultParams {
  task: string;
  item: string;
  assignmentYaml: string;
  priorAttemptsText: string;
  diffText: string;
  feedbackText: string;
  debtText?: string;
  /** Newest item record dir name at decision time; durable series pointer (§8.5). */
  afterRecord?: string;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  architectSessionId?: string;
  turnsSemaphore?: Semaphore;
  budgetTracker?: BudgetTracker;
  iteration?: number;
}

export interface NonItemConsultParams {
  task: string;
  seam: string;
  contextText: string;
  feedbackText: string;
  debtText?: string;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  architectSessionId?: string;
  turnsSemaphore?: Semaphore;
  budgetTracker?: BudgetTracker;
  iteration?: number;
}

/**
 * Runs an architect consult for an item (§8.5).
 */
export async function runItemConsult(
  params: ItemConsultParams
): Promise<{ decision: DecisionArtifact; sessionId?: string }> {
  const {
    task,
    item,
    assignmentYaml,
    priorAttemptsText,
    diffText,
    feedbackText,
    debtText,
    afterRecord,
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
  } = params;

  const promptVars: Record<string, string> = {
    item,
    assignment: assignmentYaml,
    priorAttempts: priorAttemptsText,
    diff: diffText,
    feedback: feedbackText,
    debt: debtText ?? "",
  };

  const runsDir = path.join(taskDir, "runs");
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });

  let decisionArtifact: (DecisionArtifact & { item?: string; afterRecord?: string }) | undefined;
  let decisionPath = "";

  const stepRes = await runAgentStep({
    task,
    stepId: `consult-${item}`,
    stepFragment: "steps/architect-consult-item",
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
    promptVars,
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      const raw = output as any;
      const decisionVal = raw?.decision ?? "retry-with-guidance";
      let nextSeq = 1;
      if (fs.existsSync(decisionsDir)) {
        const existing = await fs.promises.readdir(decisionsDir);
        for (const name of existing) {
          const match = /^(\d{3})-/.exec(name);
          if (match) {
            const num = parseInt(match[1]!, 10);
            if (num >= nextSeq) nextSeq = num + 1;
          }
        }
      }

      decisionArtifact = {
        id: `decision-${item}-${Date.now()}`,
        context: "item",
        item,
        afterRecord,
        decision: decisionVal,
        timestamp: new Date().toISOString(),
        rationale: raw?.rationale ?? raw?.summary ?? "Architect consult decision",
        text: raw?.text ?? raw?.guidance,
        persist: raw?.persist,
        outlines: raw?.outlines,
        debt: raw?.debt,
        reason: raw?.reason,
        question: raw?.question,
      };

      const decisionFileName = `${String(nextSeq).padStart(3, "0")}-item-${item}.yaml`;
      decisionPath = path.join(decisionsDir, decisionFileName);
      await writeYamlAtomic(decisionPath, decisionArtifact);

      if (decisionVal === "human-async" && raw?.question) {
        const qId = `q-${item}-${String(nextSeq).padStart(3, "0")}`;
        await writeQuestion(taskWt, taskDir, {
          id: qId,
          ref: item,
          disposition: "human-async",
          question: raw.question,
          blocks: [item],
        });
      }
    },
  });

  if (!stepRes.ok || !decisionArtifact) {
    throw new Error(`Item consult for ${item} failed: ${stepRes.meta.error || "no output"}`);
  }

  await appendJournal(taskDir, {
    type: "decision_made",
    context: "item",
    item,
    decision: decisionArtifact.decision,
    decisionPath,
  });

  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
}

/**
 * Runs an architect consult for a non-item failure (§8.5).
 */
export async function runNonItemConsult(
  params: NonItemConsultParams
): Promise<{ decision: DecisionArtifact; sessionId?: string }> {
  const {
    task,
    seam,
    contextText,
    feedbackText,
    debtText,
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
  } = params;

  const promptVars: Record<string, string> = {
    task,
    context: contextText,
    feedback: feedbackText,
    debt: debtText ?? "",
  };

  const runsDir = path.join(taskDir, "runs");
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });

  let decisionArtifact: DecisionArtifact | undefined;
  let decisionPath = "";

  const stepRes = await runAgentStep({
    task,
    stepId: `consult-${seam.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    stepFragment: "steps/architect-consult-nonitem",
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
    promptVars,
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      const raw = output as any;
      const decisionVal = raw?.decision ?? "accept-with-debt";
      let nextSeq = 1;
      if (fs.existsSync(decisionsDir)) {
        const existing = await fs.promises.readdir(decisionsDir);
        for (const name of existing) {
          const match = /^(\d{3})-/.exec(name);
          if (match) {
            const num = parseInt(match[1]!, 10);
            if (num >= nextSeq) nextSeq = num + 1;
          }
        }
      }

      decisionArtifact = {
        id: `decision-nonitem-${Date.now()}`,
        context: "non-item",
        decision: decisionVal,
        timestamp: new Date().toISOString(),
        rationale: raw?.rationale ?? raw?.summary ?? "Architect non-item consult decision",
        debt: raw?.debt,
        reason: raw?.reason,
        question: raw?.question,
      };

      const decisionFileName = `${String(nextSeq).padStart(3, "0")}-nonitem.yaml`;
      decisionPath = path.join(decisionsDir, decisionFileName);
      await writeYamlAtomic(decisionPath, decisionArtifact);
    },
  });

  if (!stepRes.ok || !decisionArtifact) {
    throw new Error(`Non-item consult for ${seam} failed: ${stepRes.meta.error || "no output"}`);
  }

  await appendJournal(taskDir, {
    type: "decision_made",
    context: "non-item",
    seam,
    decision: decisionArtifact.decision,
    decisionPath,
  });

  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
}

export interface ConcernConsultParams {
  task: string;
  concern: StoredConcernArtifact;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  architectSessionId?: string;
  turnsSemaphore?: Semaphore;
  budgetTracker?: BudgetTracker;
  iteration?: number;
}

/**
 * Runs one architect consult for a routed blocker concern (§18,
 * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
 * artifact; its existence is the idempotency guard, so a restarted act phase
 * neither repeats the turn nor rewrites the decision.
 */
export async function runConcernConsult(
  params: ConcernConsultParams
): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
  const decisionPath = path.join(params.taskDir, "decisions", `concern-${params.concern.id}.yaml`);
  return concernLocks.runExclusive(decisionPath, () => consultConcernOnce(params, decisionPath));
}

async function consultConcernOnce(
  params: ConcernConsultParams,
  decisionPath: string
): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
  const {
    task,
    concern,
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
  } = params;

  if (fs.existsSync(decisionPath)) {
    return { sessionId: architectSessionId };
  }

  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
  const affects = (concern.affects ?? []).join(", ");
  const promptVars: Record<string, string> = {
    task,
    context: [
      `Routed blocker concern ${concern.id}`,
      `Summary: ${concern.summary}`,
      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
    ].join("\n"),
    feedback: concern.detail ?? concern.summary,
    debt: "",
  };

  let decisionArtifact: DecisionArtifact | undefined;
  const stepRes = await runAgentStep({
    task,
    stepId: `consult-concern-${concern.id}`,
    stepFragment: "steps/architect-consult-nonitem",
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
    promptVars,
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      if (fs.existsSync(decisionPath)) return;
      const raw = output as any;
      decisionArtifact = {
        id: String(raw?.id ?? `decision-concern-${concern.id}`),
        context: (raw?.context ?? "wave") as DecisionContext,
        decision: String(raw?.decision ?? "continue"),
        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
        rationale: raw?.rationale,
        text: raw?.text,
        persist: raw?.persist,
        outlines: raw?.outlines,
        outline: raw?.outline,
        debt: raw?.debt,
        reason: raw?.reason,
        question: raw?.question,
        planDelta: raw?.planDelta,
      };
      await writeYamlAtomic(decisionPath, decisionArtifact);
    },
  });

  if (!stepRes.ok || !decisionArtifact) {
    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
  }

  await appendJournal(taskDir, {
    type: "decision_made",
    context: "concern",
    concern: concern.id,
    decision: decisionArtifact.decision,
    decisionPath,
  });

  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
}
