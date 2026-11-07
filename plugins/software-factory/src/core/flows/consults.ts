import fs from "node:fs";
import path from "node:path";
import type {
  DecisionArtifact,
  DecisionContext,
  PipelineConfig,
  ProjectConfig,
  SteerItemArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { writeYamlAtomic } from "../records/io.js";
import { runAgentStep } from "./step-runner.js";
import { appendJournal } from "../journal.js";
import type { Semaphore } from "../mutex.js";

export interface ItemConsultParams {
  task: string;
  item: string;
  assignmentYaml: string;
  priorAttemptsText: string;
  diffText: string;
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
    taskDir,
    taskWt,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    architectSessionId,
    turnsSemaphore,
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
  });

  const raw = stepRes.output as any;
  const decisionVal = raw?.decision ?? "retry-with-guidance";
  const decisionArtifact: DecisionArtifact = {
    id: `decision-${item}-${Date.now()}`,
    context: "item",
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

  // Determine next seq number for decisions folder
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });
  let nextSeq = 1;
  const existing = await fs.promises.readdir(decisionsDir);
  for (const name of existing) {
    const match = /^(\d{3})-/.exec(name);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num >= nextSeq) nextSeq = num + 1;
    }
  }

  const decisionFileName = `${String(nextSeq).padStart(3, "0")}-item-${item}.yaml`;
  const decisionPath = path.join(decisionsDir, decisionFileName);
  await writeYamlAtomic(decisionPath, decisionArtifact);

  // If decision is human-async, write question to tousertoreview (§8.8)
  if (decisionVal === "human-async" && raw?.question) {
    const steerDir = path.join(taskDir, "steer", "tousertoreview");
    await fs.promises.mkdir(steerDir, { recursive: true });
    const qId = `q-${item}-${Date.now()}`;
    const steerItem: SteerItemArtifact = {
      id: qId,
      ref: item,
      disposition: "human-async",
      question: raw.question,
      blocks: [item],
      status: "open",
    };
    await writeYamlAtomic(path.join(steerDir, `${qId}.yaml`), steerItem);
  }

  await appendJournal(taskDir, {
    type: "decision_made",
    context: "item",
    item,
    decision: decisionVal,
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
  } = params;

  const promptVars: Record<string, string> = {
    task,
    context: contextText,
    feedback: feedbackText,
    debt: debtText ?? "",
  };

  const runsDir = path.join(taskDir, "runs");
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
  });

  const raw = stepRes.output as any;
  const decisionVal = raw?.decision ?? "accept-with-debt";
  const decisionArtifact: DecisionArtifact = {
    id: `decision-nonitem-${Date.now()}`,
    context: "non-item",
    decision: decisionVal,
    timestamp: new Date().toISOString(),
    rationale: raw?.rationale ?? raw?.summary ?? "Architect non-item consult decision",
    debt: raw?.debt,
    reason: raw?.reason,
    question: raw?.question,
  };

  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });
  let nextSeq = 1;
  const existing = await fs.promises.readdir(decisionsDir);
  for (const name of existing) {
    const match = /^(\d{3})-/.exec(name);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num >= nextSeq) nextSeq = num + 1;
    }
  }

  const decisionFileName = `${String(nextSeq).padStart(3, "0")}-nonitem.yaml`;
  const decisionPath = path.join(decisionsDir, decisionFileName);
  await writeYamlAtomic(decisionPath, decisionArtifact);

  await appendJournal(taskDir, {
    type: "decision_made",
    context: "non-item",
    seam,
    decision: decisionVal,
    decisionPath,
  });

  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
}
