import fs from "node:fs";
import path from "node:path";
import type {
  Citation,
  ContextArtifact,
  GatesBaselineArtifact,
  InfraArtifact,
  PipelineConfig,
  ProjectConfig,
  TriageArtifact,
  StepMetaArtifact,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { git } from "../git/exec.js";
import {
  resetScratch,
  removeWorktree,
  mergeChildIntoParent,
  commitAll,
  headOf,
  changedLines,
  areFilesCommitted,
  childBranch,
} from "../git/index.js";
import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
import { verifyCitations } from "../records/citations.js";
import { parseStepRecordDirName } from "../records/step-record.js";
import { runAgentStep, type StepRunResult } from "./step-runner.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { refreshStateYaml } from "../derive/task.js";
import { loadCriteriaBundle } from "../prompts.js";
import { runGates } from "../checks/gates.js";
import { runCheck } from "../checks/runner.js";
import type { CheckContext } from "../checks/types.js";
import type { Semaphore } from "../mutex.js";
import type { BudgetTracker } from "../budget.js";

export interface IngestParams {
  task: string;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  turnsSemaphore?: Semaphore;
  log?: (msg: string) => void;
  budgetTracker?: BudgetTracker;
}

export interface IngestResult {
  kind: string;
  triage: TriageArtifact;
  context?: ContextArtifact;
  infra?: InfraArtifact;
  simpleDone?: boolean;
  convertedToItem?: boolean;
  triageSessionId?: string;
}

/**
 * Determines whether triage has completed and is committed with an ok record.
 */
export async function isTriageDone(taskDir: string, taskWt: string): Promise<boolean> {
  const triagePath = path.join(taskDir, "triage.yaml");
  const contextPath = path.join(taskDir, "context.yaml");

  if (!fs.existsSync(triagePath) || !fs.existsSync(contextPath)) {
    return false;
  }
  try {
    const triage = await readYaml<TriageArtifact>(triagePath);
    if (!triage || !triage.kind) return false;
    const context = await readYaml<ContextArtifact>(contextPath);
    if (!context) return false;
  } catch {
    return false;
  }

  // Check for an ok triage step record in runs/
  const runsDir = path.join(taskDir, "runs");
  if (!fs.existsSync(runsDir)) return false;
  const entries = await fs.promises.readdir(runsDir);
  const triageRecords = entries
    .filter((e) => /^(\d{3})-triage-a(\d+)$/.test(e))
    .sort();
  if (triageRecords.length === 0) return false;

  let hasOkRecord = false;
  let okMetaPath = "";
  for (const rec of triageRecords) {
    const metaPath = path.join(runsDir, rec, "meta.yaml");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = await readYaml<StepMetaArtifact>(metaPath);
        if (meta && meta.status === "ok") {
          hasOkRecord = true;
          okMetaPath = metaPath;
          break;
        }
      } catch {}
    }
  }
  if (!hasOkRecord) return false;

  if (taskWt) {
    const committed = await areFilesCommitted(taskWt, [triagePath, contextPath, okMetaPath]);
    if (!committed) return false;
  }

  return true;
}

/**
 * Determines whether infra and gates-baseline have completed and are committed.
 * For epic child tasks: inherited infra counts.
 */
export async function isInfraDone(taskDir: string, taskWt: string): Promise<boolean> {
  const infraPath = path.join(taskDir, "infra.yaml");
  const baselinePath = path.join(taskDir, "gates-baseline.yaml");

  if (fs.existsSync(infraPath) && fs.existsSync(baselinePath)) {
    try {
      const infra = await readYaml<InfraArtifact>(infraPath);
      const baseline = await readYaml<GatesBaselineArtifact>(baselinePath);
      if (infra && baseline) {
        const committed = await areFilesCommitted(taskWt, [infraPath, baselinePath]);
        if (committed) return true;
      }
    } catch {}
  }

  // Epic child tasks: inherited infra counts
  const parentTaskDir = path.dirname(taskDir);
  const relParent = path.relative(taskWt, parentTaskDir);
  if (relParent && !relParent.startsWith("..") && !path.isAbsolute(relParent)) {
    const parentInfra = path.join(parentTaskDir, "infra.yaml");
    const parentBaseline = path.join(parentTaskDir, "gates-baseline.yaml");
    if (fs.existsSync(parentInfra) && fs.existsSync(parentBaseline)) {
      try {
        const pInfra = await readYaml<InfraArtifact>(parentInfra);
        const pBaseline = await readYaml<GatesBaselineArtifact>(parentBaseline);
        if (pInfra && pBaseline) {
          const committed = await areFilesCommitted(taskWt, [parentInfra, parentBaseline]);
          if (committed) return true;
        }
      } catch {}
    }
  }

  return false;
}

/**
 * Determines whether context-pack.md has completed and is committed.
 */
export async function isContextPackDone(taskDir: string, taskWt: string): Promise<boolean> {
  const packPath = path.join(taskDir, "context-pack.md");
  if (!fs.existsSync(packPath)) return false;
  try {
    const stat = await fs.promises.stat(packPath);
    if (stat.size === 0) return false;
    if (taskWt) {
      const committed = await areFilesCommitted(taskWt, [packPath]);
      if (!committed) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Determines whether context-pack.md is stale and should be regenerated.
 * - If missing or uncommitted: stale (true).
 * - For iteration <= 1: stale if not done.
 * - For iteration > 1: stale if non-factory code files have changed on taskWt since context-pack.md was last committed.
 */
export async function isContextPackStale(
  taskDir: string,
  taskWt: string,
  iteration = 1
): Promise<boolean> {
  const packPath = path.join(taskDir, "context-pack.md");
  if (!fs.existsSync(packPath)) return true;

  if (iteration <= 1) {
    return !(await isContextPackDone(taskDir, taskWt));
  }

  try {
    const logRes = await git(taskWt, [
      "log",
      "-1",
      "--format=%H",
      "--",
      packPath,
    ]);
    const lastCommit = logRes.stdout.trim();
    if (!lastCommit) return true;

    const diffRes = await git(taskWt, ["diff", "--name-only", lastCommit, "HEAD"]);
    const changed = diffRes.stdout
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    return changed.some((f) => !f.startsWith(".factory/") && !f.startsWith(".factory"));
  } catch {
    return true;
  }
}

/**
 * Returns whether context pack step is enabled in pipeline config (default on).
 */
export function isContextPackEnabled(pipeline: PipelineConfig): boolean {
  return pipeline.contextPack === true;
}

export interface ContextPackParams {
  task: string;
  taskDir: string;
  taskWt: string;
  repo: any;
  harness: any;
  pipeline: PipelineConfig;
  project: any;
  prompts: any;
  intentText: string;
  contextArtifact: any;
  turnsSemaphore?: Semaphore;
  budgetTracker?: BudgetTracker;
  stepId?: string;
}

export async function runContextPackStep(params: ContextPackParams): Promise<StepRunResult> {
  const {
    task,
    taskDir,
    taskWt,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    intentText,
    contextArtifact,
    turnsSemaphore,
    budgetTracker,
  } = params;

  const stepId = params.stepId ?? "context-pack";
  const runsDir = path.join(taskDir, "runs");
  const attempt = getNextStepAttempt(runsDir, stepId, pipeline.limits?.maxInterruptions ?? 3);
  const maxBytes =
    (pipeline.limits?.contextPackBytes as number | undefined) ??
    (pipeline.limits?.hydrationBytes as number | undefined) ??
    40000;

  const packPath = path.join(taskDir, "context-pack.md");

  const contextStr =
    typeof contextArtifact === "string"
      ? contextArtifact
      : JSON.stringify(contextArtifact, null, 2);

  const res = await runAgentStep({
    task,
    stepId,
    stepFragment: "steps/context-pack",
    agent: "fact-finder",
    role: "workhorse",
    attempt,
    sessionMode: "fresh",
    cwd: taskWt,
    taskWt,
    taskDir,
    recordsDir: runsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: {
      task,
      intent: intentText,
      context: contextStr,
      maxBytes: String(maxBytes),
    },
    turnsSemaphore,
    budgetTracker,
    writeArtifact: async (output: unknown) => {
      let content = "";
      if (output && typeof output === "object") {
        const raw = output as Record<string, unknown>;
        content =
          (typeof raw.findings === "string" ? raw.findings : "") ||
          (typeof raw.contextPack === "string" ? raw.contextPack : "") ||
          (typeof raw.summary === "string" ? raw.summary : "");
      } else if (typeof output === "string") {
        content = output;
      }
      if (!content) {
        content = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      }
      if (Buffer.byteLength(content, "utf8") > maxBytes) {
        const buf = Buffer.from(content, "utf8");
        content = buf.subarray(0, maxBytes).toString("utf8");
      }
      await writeTextAtomic(packPath, content);
    },
  });

  return res;
}

export function getNextStepAttempt(runsDir: string, stepId: string, maxInterruptions = 3): number {
  if (!fs.existsSync(runsDir)) return 1;
  try {
    const entries = fs.readdirSync(runsDir);
    const matching = entries
      .map(parseStepRecordDirName)
      .filter((p): p is { seq: number; name: string; attempt: number } => p !== null && p.name === stepId)
      .sort((a, b) => b.seq - a.seq || b.attempt - a.attempt);

    if (matching.length === 0) return 1;
    const latest = matching[0]!;
    const metaPath = path.join(
      runsDir,
      `${String(latest.seq).padStart(3, "0")}-${stepId}-a${latest.attempt}`,
      "meta.yaml"
    );
    let status: string | undefined;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = readYamlSync(metaPath) as any;
        status = meta?.status;
      } catch {}
    }

    if (status === "interrupted") {
      let interruptions = 0;
      for (const m of matching) {
        const mPath = path.join(
          runsDir,
          `${String(m.seq).padStart(3, "0")}-${stepId}-a${m.attempt}`,
          "meta.yaml"
        );
        try {
          const meta = readYamlSync(mPath) as any;
          if (meta?.status === "interrupted") interruptions++;
        } catch {}
      }
      if (interruptions < maxInterruptions) {
        return latest.attempt;
      } else {
        return latest.attempt + 1;
      }
    } else if (status === "error") {
      return latest.attempt;
    } else if (status === "ok") {
      return latest.attempt;
    } else {
      return latest.attempt + 1;
    }
  } catch {
    return 1;
  }
}

function readYamlSync(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf8");
  const yaml = require("yaml");
  return yaml.parse(content);
}

/**
 * Runs the ingest flow: triage -> citation verification -> infra -> routing (§8.1).
 */
export async function runIngest(params: IngestParams): Promise<IngestResult> {
  const {
    task,
    taskDir,
    taskWt,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    turnsSemaphore,
  } = params;

  await appendJournal(taskDir, { type: "ingest_started", task });

  // 1. Read task INTENT.md
  const intentPath = path.join(taskDir, "INTENT.md");
  let intentText = "";
  if (fs.existsSync(intentPath)) {
    intentText = await readText(intentPath);
  }

  const parentBranch = `topic/${task}`;
  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(runsDir, { recursive: true });

  const triageDone = await isTriageDone(taskDir, taskWt);
  let triage: TriageArtifact | undefined;
  let rawTriageOutput: any;
  let finalCitations: Citation[] = [];
  let contextArtifact: ContextArtifact = { citations: [] };
  let triageSessionId: string | undefined;

  const triagePath = path.join(taskDir, "triage.yaml");
  const contextPath = path.join(taskDir, "context.yaml");
  let scratch: { branch: string; path: string } | undefined;

  if (triageDone) {
    triage = await readYaml<TriageArtifact>(triagePath);
    if (fs.existsSync(contextPath)) {
      contextArtifact = await readYaml<ContextArtifact>(contextPath);
      finalCitations = Array.isArray(contextArtifact)
        ? contextArtifact
        : (contextArtifact.citations ?? []);
    }
  }
  if (!triage) {
    scratch = await resetScratch(
      repo,
      { branch: parentBranch, path: taskWt },
      "scratch"
    );
    // 3. Triage turn (persistent session) (§8.1)
    const triageAttempt = getNextStepAttempt(runsDir, "triage", pipeline.limits?.maxInterruptions ?? 3);
    const triageStepRes = await runAgentStep({
      task,
      stepId: "triage",
      stepFragment: "steps/triage",
      agent: "triage",
      role: "workhorse",
      attempt: triageAttempt,
      sessionMode: "reuse",
      cwd: scratch ? scratch.path : taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { task, intent: intentText, triageCriteria: loadCriteriaBundle(pipeline.criteria).triage ?? "" },
      turnsSemaphore,
      budgetTracker: params.budgetTracker,
      writeArtifact: async (output: unknown) => {
        rawTriageOutput = output as any;
        if (!rawTriageOutput || !rawTriageOutput.kind) {
          throw new Error("Triage step failed: missing kind in output");
        }
        triage = {
          kind: rawTriageOutput.kind,
          rationale: rawTriageOutput.rationale ?? "Triage analysis",
          citations: rawTriageOutput.citations ?? rawTriageOutput.context?.citations ?? [],
          size: rawTriageOutput.size,
          risks: rawTriageOutput.risks,
        };
        await writeYamlAtomic(path.join(taskDir, "triage.yaml"), triage);

        // Parse and verify citations right here so context.yaml lands in the same commit (§6.2)
        let citations: Citation[] = rawTriageOutput?.citations ?? [];
        if (rawTriageOutput?.context?.citations) {
          citations = rawTriageOutput.context.citations;
        }
        const vRes = verifyCitations(citations, scratch!.path);
        finalCitations = vRes.valid;
        if (vRes.failed.length > 0) {
          await appendJournal(taskDir, {
            type: "citations_dropped",
            dropped: vRes.failed.map((f) => ({
              file: f.citation.file,
              reason: f.reason,
              message: f.message,
            })),
          });
        }
        contextArtifact = { citations: finalCitations };
        await writeYamlAtomic(path.join(taskDir, "context.yaml"), contextArtifact);
      },
    });

    if (!triageStepRes.ok || !triage) {
      if (scratch) await removeWorktree(repo, scratch.path);
      throw new Error(`Triage step failed: ${triageStepRes.meta.error || "no triage output produced"}`);
    }

    triageSessionId = triageStepRes.sessionId;
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }
  // 5. Infra if infra is not done (§8.1.3)
  const infraDone = await isInfraDone(taskDir, taskWt);
  const infraPath = path.join(taskDir, "infra.yaml");
  const baselinePath = path.join(taskDir, "gates-baseline.yaml");
  let infra: InfraArtifact | undefined;
  let baselineArtifact: GatesBaselineArtifact | undefined;

  if (infraDone) {
    if (fs.existsSync(infraPath)) {
      infra = await readYaml<InfraArtifact>(infraPath);
    }
    if (fs.existsSync(baselinePath)) {
      baselineArtifact = await readYaml<GatesBaselineArtifact>(baselinePath);
    }
    // Inherited infra if direct is absent
    if (!infra) {
      const parentTaskDir = path.dirname(taskDir);
      if (parentTaskDir && parentTaskDir !== taskDir) {
        const pInfra = path.join(parentTaskDir, "infra.yaml");
        const pBaseline = path.join(parentTaskDir, "gates-baseline.yaml");
        if (fs.existsSync(pInfra)) {
          infra = await readYaml<InfraArtifact>(pInfra);
          await fs.promises.copyFile(pInfra, infraPath);
        }
        if (fs.existsSync(pBaseline)) {
          baselineArtifact = await readYaml<GatesBaselineArtifact>(pBaseline);
          await fs.promises.copyFile(pBaseline, baselinePath);
        }
      }
    }
  } else {
    // Run infra step
    const infraAttempt = getNextStepAttempt(runsDir, "infra", pipeline.limits?.maxInterruptions ?? 3);
    const infraStepRes = await runAgentStep({
      task,
      stepId: "infra",
      stepFragment: "steps/infra",
      agent: "infra",
      role: "workhorse",
      attempt: infraAttempt,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        task,
        intent: intentText,
        context: JSON.stringify(contextArtifact, null, 2),
      },
      turnsSemaphore,
      budgetTracker: params.budgetTracker,
      writeArtifact: async (output: unknown) => {
        const rawInfra = output as any;
        if (!rawInfra || !rawInfra.gates || !rawInfra.testRunner) {
          throw new Error("Infra step failed: missing gates or testRunner in output");
        }
        infra = {
          setup: rawInfra.setup ?? [],
          gates: rawInfra.gates,
          testRunner: rawInfra.testRunner,
          ...(rawInfra.notes ? { notes: rawInfra.notes } : {}),
        };
        await writeYamlAtomic(infraPath, infra);

        // Run real baseline gates (§8.1.3, §9)
        const checkCtx: CheckContext = {
          repo,
          wt: taskWt,
          base: "HEAD",
          project,
          pipeline,
          infra,
          task,
          taskWt,
          taskDir,
          limits: pipeline.limits ?? {},
          outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
        };
        const gatesOutcome = await runGates(checkCtx, { record: true });
        baselineArtifact = {
          timestamp: new Date().toISOString(),
          gates: gatesOutcome.results,
        };
        await writeYamlAtomic(path.join(taskDir, "gates-baseline.yaml"), baselineArtifact);
      },
    });

    if (!infraStepRes.ok || !infra) {
      if (scratch) await removeWorktree(repo, scratch.path);
      throw new Error(`Infra step failed: ${infraStepRes.meta.error || "no infra output produced"}`);
    }
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }

  // 5.5. Context pack if enabled and not simple (§8.1)
  if (triage.kind !== "simple" && isContextPackEnabled(pipeline)) {
    const packDone = await isContextPackDone(taskDir, taskWt);
    if (!packDone) {
      const packRes = await runContextPackStep({
        task,
        taskDir,
        taskWt,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        intentText,
        contextArtifact,
        turnsSemaphore,
        budgetTracker: params.budgetTracker,
        stepId: "context-pack",
      });
      if (!packRes.ok) {
        if (scratch) await removeWorktree(repo, scratch.path);
        throw new Error(`Context pack step failed: ${packRes.meta.error || "no context pack produced"}`);
      }
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
    }
  }

  // 6. Routing (§8.1.4)
  if (triage.kind === "simple") {
    if (!scratch) {
      scratch = await resetScratch(
        repo,
        { branch: parentBranch, path: taskWt },
        "scratch"
      );
    }
    const implRes = await runAgentStep({
      task,
      stepId: "simple-implement",
      stepFragment: "steps/simple-implement",
      agent: "developer",
      role: "workhorse",
      sessionMode: "reuse",
      existingSessionId: triageSessionId,
      cwd: scratch.path,
      taskWt,
      taskDir,
      recordsDir: runsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        intent: intentText,
        citations: JSON.stringify(finalCitations, null, 2),
      },
      turnsSemaphore,
      budgetTracker: params.budgetTracker,
    });

    // Commit simple-implementation work before running checks or merging (Finding 1)
    await git(scratch.path, ["add", "-A"], { allowFail: true });
    await commitAll(repo, scratch.path, "factory(simple): implement");
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });

    // Run configured simple flow checks (gates, simple-guard) (§8.1.4)
    const checkCtx: CheckContext = {
      repo,
      wt: scratch.path,
      base: parentBranch,
      project,
      pipeline,
      infra,
      baseline: baselineArtifact,
      kind: "simple",
      task,
      taskWt,
      taskDir,
      limits: pipeline.limits ?? {},
      outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
    };

    const configuredChecks = pipeline.flows?.simple?.steps?.[0]?.checks ?? ["gates", "simple-guard"];
    let guardPassed = implRes.ok;
    for (const cName of configuredChecks) {
      if (!guardPassed) break;
      const cRes = await runCheck(cName, checkCtx);
      if (!cRes.ok) {
        guardPassed = false;
        await appendJournal(taskDir, {
          type: "simple_check_failed",
          check: cName,
          summary: cRes.summary,
        });
      }
    }
    if (guardPassed && implRes.ok) {
      // Green: merge through merge path under merge lock (§8.1.4)
      await repo.mergeLocks.runExclusive(parentBranch, async () => {
        await mergeChildIntoParent(
          repo,
          taskWt,
          scratch!.branch,
          "factory: merge simple implementation"
        );
      });
      await removeWorktree(repo, scratch!.path);
      return {
        kind: "simple",
        triage,
        context: contextArtifact,
        infra,
        simpleDone: true,
      };
    } else {
      // Guard failure or gate attempts exhausted: scratch branch becomes no-behavior item (§8.1.4)
      await appendJournal(taskDir, {
        type: "simple_guard_fallback",
        task,
        reason: "simple guard failed, converting to no-behavior item",
      });

      // Write assignment for simple item
      const itemDir = path.join(taskDir, "items", "simple");
      await fs.promises.mkdir(itemDir, { recursive: true });
      await writeYamlAtomic(path.join(itemDir, "assignment.yaml"), {
        slug: "simple",
        kind: "no-behavior",
        title: "Simple implementation fallback",
        assignment: "Complete simple implementation fallback",
        wave: 1,
        deps: [],
      });
      await git(taskWt, ["add", "-A"], { allowFail: true });
      await commitAll(repo, taskWt, "factory: convert simple task to no-behavior item");

      // Remove scratch worktree registration while keeping the branch
      await removeWorktree(repo, scratch!.path);
      const itemBranch = childBranch(parentBranch, "simple", { allowReserved: true });
      if (scratch!.branch !== itemBranch) {
        await git(repo.mainRoot, ["branch", "-M", scratch!.branch, itemBranch], { allowFail: true });
      }
      return {
        kind: "simple",
        triage,
        context: contextArtifact,
        infra,
        simpleDone: false,
        convertedToItem: true,
      };
    }
  }

  // Non-simple: scratch worktree removed (§8.1.4)
  if (scratch) await removeWorktree(repo, scratch.path);

  return {
    kind: triage.kind,
    triage,
    context: contextArtifact,
    infra,
    simpleDone: false,
    triageSessionId,
  };
}
