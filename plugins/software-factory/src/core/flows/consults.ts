import fs from "node:fs";
import path from "node:path";
import type {
  DecisionArtifact,
  DecisionContext,
  DeveloperTarget,
  PipelineConfig,
  ProjectConfig,
  SteerItemArtifact,
  StoredConcernArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { writeYamlAtomic, readText } from "../records/io.js";
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
  /** Merge-verify consult correction pass: when set, the architect is told
   * the merge verify failed on an unknown gate id and MUST return a corrected
   * `target` chosen from `knownTargetsText` (or omit `target` for terminal
   * fail). Only the unknown-gate redrive path sets this. */
  unknownGateRetry?: { badId: string; knownTargetsText: string };
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
  rootTaskWt?: string;
  rootTaskDir?: string;
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
    unknownGateRetry,
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
    rootTaskWt,
    rootTaskDir,
  } = params;

  const contextPackPath = path.join(taskDir, "context-pack.md");
  const contextPackText = fs.existsSync(contextPackPath)
    ? await readText(contextPackPath)
    : "";

  const promptVars: Record<string, string> = {
    item,
    assignment: assignmentYaml,
    priorAttempts: priorAttemptsText,
    // Consult callers pass the committed branch diffstat (base..HEAD) plus
    // failing check summaries — never bare unstaged `git diff` (empty
    // post-commit) or generic "Step failed repeatedly" text. ShPost3 showed
    // blind consults hallucinate evidence ("empty diff, scope paralysis").
    diff: diffText,
    feedback: feedbackText,
    debt: debtText ?? "",
    contextPack: contextPackText,
    // Unknown-gate correction pass: the merge verify failed naming a gate id
    // that does not exist. The architect MUST return a corrected `target`
    // chosen from `knownTargetsText` — {gate: <known id>}, {selectors: [...]},
    // or {command, customTarget: true} — or omit `target` for terminal fail.
    ...(unknownGateRetry
      ? {
          unknownGate: `The merge verify failed with an unknown gate target: "${unknownGateRetry.badId}". That gate id does not exist — do NOT return it again. Return a corrected "target" chosen from the known targets below, or omit "target" (retry-with-guidance is wrong here; recommend abandon if nothing fits). Known targets:\n${unknownGateRetry.knownTargetsText}`,
        }
      : {}),
  };

  const runsDir = path.join(taskDir, "runs");
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });

  let decisionArtifact: (DecisionArtifact & { item?: string; afterRecord?: string }) | undefined;
  let decisionPath = "";

  // Sequenced stepId: consults never hit the step-runner done-ness reuse
  // (S3/S4) — every consult fires a fresh architect turn and writes a new
  // sequential decision file. Sequence from existing decision files for the
  // same item so restarts resume without clobbering committed decisions.
  let consultSeq = 1;
  if (fs.existsSync(decisionsDir)) {
    const existing = await fs.promises.readdir(decisionsDir);
    for (const name of existing) {
      const m = new RegExp(`^\\d{3}-item-${item}-(\\d+)\\.yaml$`).exec(name);
      if (m) consultSeq = Math.max(consultSeq, parseInt(m[1]!, 10) + 1);
    }
  }

  const consultStepId = `consult-${item}-${consultSeq}`;
  const consultAttempt = 1;

  const stepRes = await runAgentStep({
    task,
    attempt: consultAttempt,
    stepId: consultStepId,
    stepFragment: "steps/architect-consult-item",
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
    promptVars,
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      const raw = output as any;
      const decisionVal = raw?.decision ?? "retry-with-guidance";
      // One decision file per consult turn: no clobber, no load-and-return
      // of a prior decision. Sequenced consults each write their own file,
      // so consultCount grows and consultCount/afterRecord stay truthful.
      if (decisionArtifact) return;
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
        // Corrected developer target (merge-verify unknown-gate recovery):
        // passed through when the architect supplies an object; the caller
        // sanitizes and validates before applying. Non-objects are dropped.
        ...(raw?.target && typeof raw.target === "object" && !Array.isArray(raw.target)
          ? { target: raw.target as DeveloperTarget }
          : {}),
      };

      const decisionFileName = `${String(nextSeq).padStart(3, "0")}-item-${item}-${consultSeq}.yaml`;
      decisionPath = path.join(decisionsDir, decisionFileName);
      await writeYamlAtomic(decisionPath, decisionArtifact);
      if (decisionVal === "human-async" && raw?.question) {
        const qId = `q-${item}-${String(nextSeq).padStart(3, "0")}`;
        await writeQuestion(params.rootTaskWt ?? taskWt, params.rootTaskDir ?? taskDir, {
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

  const contextPackPath = path.join(taskDir, "context-pack.md");
  const contextPackText = fs.existsSync(contextPackPath)
    ? await readText(contextPackPath)
    : "";

  const promptVars: Record<string, string> = {
    task,
    context: contextText,
    feedback: feedbackText,
    debt: debtText ?? "",
    contextPack: contextPackText,
  };

  const runsDir = path.join(taskDir, "runs");
  const decisionsDir = path.join(taskDir, "decisions");
  await fs.promises.mkdir(decisionsDir, { recursive: true });

  let decisionArtifact: DecisionArtifact | undefined;
  let decisionPath = "";

  // Sequenced stepId per seam (S3/S4): consults never hit the step-runner
  // done-ness reuse — every consult fires a fresh architect turn and writes
  // a new sequential decision file. Sequence from existing decision files
  // for the same seam so restarts resume without clobbering.
  const seamClean = seam.replace(/[^a-zA-Z0-9_-]/g, "_");
  let consultSeq = 1;
  if (fs.existsSync(decisionsDir)) {
    const existing = await fs.promises.readdir(decisionsDir);
    for (const name of existing) {
      const m = new RegExp(`^\\d{3}-nonitem-${seamClean}-(\\d+)\\.yaml$`).exec(name);
      if (m) consultSeq = Math.max(consultSeq, parseInt(m[1]!, 10) + 1);
    }
  }

  const consultStepId = `consult-${seamClean}-${consultSeq}`;
  const consultAttempt = 1;

  const stepRes = await runAgentStep({
    task,
    attempt: consultAttempt,
    stepId: consultStepId,
    stepFragment: "steps/architect-consult-nonitem",
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
    promptVars,
    turnsSemaphore,
    budgetTracker,
    iteration,
    writeArtifact: async (output: unknown) => {
      const raw = output as any;
      const decisionVal = raw?.decision ?? "accept-with-debt";
      // One decision file per consult turn: no clobber, no load-and-return
      // of a prior decision. Sequenced consults each write their own file,
      // so consultCount stays truthful.
      if (decisionArtifact) return;
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
        outline: raw?.outline,
        outlines: raw?.outlines,
      };

      const decisionFileName = `${String(nextSeq).padStart(3, "0")}-nonitem-${seamClean}-${consultSeq}.yaml`;
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
  const contextPackPath = path.join(taskDir, "context-pack.md");
  const contextPackText = fs.existsSync(contextPackPath)
    ? await readText(contextPackPath)
    : "";
  const promptVars: Record<string, string> = {
    task,
    contextPack: contextPackText,
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
    taskWt,
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
        ...(raw?.concernResolution ? { concernResolution: raw.concernResolution } : {}),
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
