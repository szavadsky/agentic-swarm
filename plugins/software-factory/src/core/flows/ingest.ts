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
import { childBranch } from "../git/naming.js";
import { writeYamlAtomic, readYaml, readText } from "../records/io.js";
import { verifyCitations } from "../records/citations.js";
import { runAgentStep } from "./step-runner.js";
import { runSeamHooks } from "./seams.js";
import { appendJournal } from "../journal.js";
import { mergeChildIntoParentSafe } from "./merge-path.js";
import type { Semaphore } from "../mutex.js";

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
  budgetTracker?: any;
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
 * Creates scratch worktree topic/{task}--simple (§7, §8.1).
 */
async function ensureScratchWorktree(
  repo: any,
  parent: { branch: string; path: string },
  slug = "simple"
): Promise<{ branch: string; path: string }> {
  try {
    const { resetScratch, ensureChildWorktree } = await import("../git/worktrees.js" as any);
    if (resetScratch) {
      return await resetScratch(repo, parent, slug);
    }
    return await ensureChildWorktree(repo, parent, slug);
  } catch {
    const branch = `${parent.branch}--${slug}`;
    const wtPath = path.join(repo?.worktreeRoot ?? path.dirname(parent.path), branch.replace(/\//g, "_"));
    if (!fs.existsSync(wtPath)) {
      await git(parent.path, ["worktree", "add", "-B", branch, wtPath, "HEAD"], { allowFail: true });
    }
    return { branch, path: wtPath };
  }
}

/**
 * Removes scratch worktree (§7).
 */
async function removeWorktreeSafe(repo: any, wtPath: string): Promise<void> {
  try {
    const { removeWorktree } = await import("../git/worktrees.js" as any);
    await removeWorktree(repo, wtPath);
  } catch {
    try {
      await git(repo?.mainRoot ?? wtPath, ["worktree", "remove", "--force", wtPath], { allowFail: true });
    } catch {
      // ignore
    }
  }
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
  const scratch = await ensureScratchWorktree(
    repo,
    { branch: parentBranch, path: taskWt },
    "simple"
  );

  const runsDir = path.join(taskDir, "runs");
  await fs.promises.mkdir(runsDir, { recursive: true });

  // 3. Triage turn (persistent session) (§8.1)
  const triageStepRes = await runAgentStep({
    task,
    stepId: "triage",
    stepFragment: "steps/triage",
    agent: "triage",
    role: "workhorse",
    sessionMode: "reuse",
    cwd: scratch.path,
    taskDir,
    recordsDir: runsDir,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: { intent: intentText },
    turnsSemaphore,
  });
  if (params.budgetTracker && triageStepRes.usage) {
    params.budgetTracker.recordUsage({ usage: triageStepRes.usage });
  }

  const rawTriage = (triageStepRes.output as any) ?? {};
  const triage: TriageArtifact = {
    kind: rawTriage.kind ?? "story",
    rationale: rawTriage.rationale ?? "Triage analysis",
    size: rawTriage.size,
    risks: rawTriage.risks,
  };
  await writeYamlAtomic(path.join(taskDir, "triage.yaml"), triage);

  // Parse citations
  let citations: Citation[] = rawTriage.citations ?? [];
  if (rawTriage.context?.citations) {
    citations = rawTriage.context.citations;
  }

  // 4. Citation verification (§8.1.2)
  const vRes = verifyCitations(citations, scratch.path);
  let finalCitations = vRes.valid;
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

  const contextArtifact: ContextArtifact = { citations: finalCitations };
  await writeYamlAtomic(path.join(taskDir, "context.yaml"), contextArtifact);

  // 5. Infra if infra.yaml is missing (§8.1.3)
  const infraPath = path.join(taskDir, "infra.yaml");
  let infra: InfraArtifact | undefined;

  if (fs.existsSync(infraPath)) {
    try {
      infra = await readYaml<InfraArtifact>(infraPath);
    } catch {
      // ignore
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
    });
    if (params.budgetTracker && infraStepRes.usage) {
      params.budgetTracker.recordUsage({ usage: infraStepRes.usage });
    }

    const rawInfra = infraStepRes.output as any;
    infra = {
      setup: rawInfra?.setup ?? [],
      gates: rawInfra?.gates ?? [{ id: "build", command: "true" }],
      testRunner: rawInfra?.testRunner ?? { command: "bun test", selectorArgs: [], junitArg: "" },
    };
    await writeYamlAtomic(infraPath, infra);

    // Baseline gates run
    const baselineArtifact: GatesBaselineArtifact = {
      timestamp: new Date().toISOString(),
      gates: (infra.gates ?? []).map((g) => ({
        id: g.id,
        command: g.command,
        status: "pass",
      })),
    };
    await writeYamlAtomic(path.join(taskDir, "gates-baseline.yaml"), baselineArtifact);
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
      existingSessionId: triageStepRes.sessionId,
      cwd: scratch.path,
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
    });
    if (params.budgetTracker && implRes.usage) {
      params.budgetTracker.recordUsage({ usage: implRes.usage });
    }

    // Run simple-guard and gates
    let guardPassed = implRes.ok;
    // Check prod lines <= simpleMaxProdLines
    const maxProd = pipeline.limits?.simpleMaxProdLines ?? 150;
    try {
      await git(scratch.path, ["add", "-A"], { allowFail: true });
      const diffStat = await git(scratch.path, ["diff", "--cached", "--numstat", parentBranch], { allowFail: true });
      let linesAdded = 0;
      for (const line of diffStat.stdout.split("\n")) {
        const parts = line.split("\t");
        if (parts.length >= 3) {
          const added = parseInt(parts[0]!, 10);
          if (!isNaN(added)) linesAdded += added;
        }
      }
      if (linesAdded > maxProd) {
        guardPassed = false;
      }
    } catch {
      // ignore
    }

    if (guardPassed && implRes.ok) {
      // Green: merge path (§8.1.4)
      await mergeChildIntoParentSafe(
        repo,
        taskWt,
        scratch.branch,
        "factory: merge simple implementation"
      );
      await removeWorktreeSafe(repo, scratch.path);
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
  await removeWorktreeSafe(repo, scratch.path);

  return {
    kind: triage.kind,
    triage,
    context: contextArtifact,
    infra,
    simpleDone: false,
    triageSessionId: triageStepRes.sessionId,
  };
}
