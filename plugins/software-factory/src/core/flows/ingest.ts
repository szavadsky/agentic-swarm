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
} from "../git/index.js";
import { writeYamlAtomic, readYaml, readText } from "../records/io.js";
import { verifyCitations } from "../records/citations.js";
import { runAgentStep } from "./step-runner.js";
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

  // 2. Scratch worktree on topic/{task}--simple from task tip (§8.1)
  const parentBranch = `topic/${task}`;
  const scratch = await resetScratch(
    repo,
    { branch: parentBranch, path: taskWt },
    "simple"
  );

  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(runsDir, { recursive: true });

  let triage: TriageArtifact | undefined;
  let rawTriageOutput: any;
  let finalCitations: Citation[] = [];
  let contextArtifact: ContextArtifact = { citations: [] };
  let triageSessionId: string | undefined;

  const triagePath = path.join(taskDir, "triage.yaml");
  const contextPath = path.join(taskDir, "context.yaml");

  if (fs.existsSync(triagePath)) {
    try {
      triage = await readYaml<TriageArtifact>(triagePath);
      if (fs.existsSync(contextPath)) {
        contextArtifact = await readYaml<ContextArtifact>(contextPath);
        finalCitations = Array.isArray(contextArtifact)
          ? contextArtifact
          : (contextArtifact.citations ?? []);
      }
    } catch {
      // ignore
    }
  }

  if (!triage) {
    // 3. Triage turn (persistent session) (§8.1)
    const triageStepRes = await runAgentStep({
      task,
      stepId: "triage",
      stepFragment: "steps/triage",
      agent: "triage",
      role: "workhorse",
      sessionMode: "reuse",
      cwd: scratch.path,
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
      },
    });

    if (!triageStepRes.ok || !triage) {
      await removeWorktree(repo, scratch.path);
      throw new Error(`Triage step failed: ${triageStepRes.meta.error || "no triage output produced"}`);
    }

    triageSessionId = triageStepRes.sessionId;

    // Parse citations
    let citations: Citation[] = rawTriageOutput?.citations ?? [];
    if (rawTriageOutput?.context?.citations) {
      citations = rawTriageOutput.context.citations;
    }

    // 4. Citation verification (§8.1.2)
    const vRes = verifyCitations(citations, scratch.path);
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
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }
  // 5. Infra if infra.yaml is missing (§8.1.3)
  const infraPath = path.join(taskDir, "infra.yaml");
  let infra: InfraArtifact | undefined;
  let baselineArtifact: GatesBaselineArtifact | undefined;

  if (fs.existsSync(infraPath)) {
    try {
      infra = await readYaml<InfraArtifact>(infraPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt infra artifact at ${infraPath}: ${err?.message ?? err}`);
      }
    }
    const baselinePath = path.join(taskDir, "gates-baseline.yaml");
    if (fs.existsSync(baselinePath)) {
      try {
        baselineArtifact = await readYaml<GatesBaselineArtifact>(baselinePath);
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt gates baseline at ${baselinePath}: ${err?.message ?? err}`);
        }
      }
    }
  } else {
    // Run infra step
    const infraStepRes = await runAgentStep({
      task,
      stepId: "infra",
      stepFragment: "steps/infra",
      agent: "infra",
      role: "workhorse",
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
      await removeWorktree(repo, scratch.path);
      throw new Error(`Infra step failed: ${infraStepRes.meta.error || "no infra output produced"}`);
    }
    await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  }

  // 6. Routing (§8.1.4)
  if (triage.kind === "simple") {
    // Resumed triage turn (implement) in the same worktree (§8.1.4)
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
          scratch.branch,
          "factory: merge simple implementation"
        );
      });
      await removeWorktree(repo, scratch.path);
      await appendJournal(taskDir, { type: "simple_merged", task });
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
      await removeWorktree(repo, scratch.path);
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
  await removeWorktree(repo, scratch.path);

  return {
    kind: triage.kind,
    triage,
    context: contextArtifact,
    infra,
    simpleDone: false,
    triageSessionId,
  };
}
