import fs from "node:fs";
import path from "node:path";
import type {
  PipelineConfig,
  PipelineLimits,
  ProjectConfig,
  StateArtifact,
  SteerClassificationArtifact,
  SteerItemArtifact,
  StepMetaArtifact,
} from "./artifacts.js";
import type { Harness } from "../harness/types.js";
import { Semaphore } from "./mutex.js";
import { git } from "./git/exec.js";
import { taskBranch } from "./git/naming.js";
import { appendJournal } from "./journal.js";
import { BudgetTracker } from "./budget.js";
import { deriveTaskState, materializeStateYaml, type DerivedTaskState } from "./derive/task.js";
import { runIngest } from "./flows/ingest.js";
import { runIteration } from "./flows/iteration.js";
import { runSeamHooks } from "./flows/seams.js";
import { readYaml, writeYamlAtomic, readText } from "./records/io.js";

export interface EngineDeps {
  harness: Harness;
  repo: any;
  project: ProjectConfig;
  pipelineFor(taskDir: string): Promise<PipelineConfig>;
  prompts: any;
  clock?: () => Date;
  log?: (line: string) => void;
}

export type RunResult = {
  status: "done" | "blocked" | "failed" | "stopped";
  exitCode: 0 | 10 | 1;
  summary: string;
};

/**
 * Ensures task worktree exists (§7).
 */
async function ensureTaskWorktreeSafe(
  repo: any,
  task: string,
  opts: { intentPath: string; orchestrationFolder: string }
): Promise<{ branch: string; path: string; created: boolean }> {
  try {
    const { ensureTaskWorktree } = await import("./git/worktrees.js" as any);
    return await ensureTaskWorktree(repo, task, opts);
  } catch {
    const branch = taskBranch(task);
    const wtPath = path.join(repo.worktreeRoot, branch.replace(/\//g, "_"));
    let created = false;
    if (!fs.existsSync(wtPath)) {
      await git(repo.mainRoot, ["branch", branch], { allowFail: true });
      await git(repo.mainRoot, ["worktree", "add", wtPath, branch], { allowFail: true });
      created = true;
    }
    const dest = path.join(wtPath, opts.orchestrationFolder, task, "INTENT.md");
    if (!fs.existsSync(dest) && fs.existsSync(opts.intentPath)) {
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(opts.intentPath, dest);
      await git(wtPath, ["add", "-A"], { allowFail: true });
      await git(wtPath, ["commit", "-m", `factory: initialize ${task}`], { allowFail: true });
    }
    return { branch, path: wtPath, created };
  }
}

/**
 * Runs start-up repair across worktrees (§6.3.6).
 */
async function repairWorktreeSafe(
  repo: any,
  wt: string,
  kind: "task" | "item",
  opts: { operatorEditable: string[] }
): Promise<{ actions: string[] }> {
  try {
    const { repairWorktree } = await import("./git/repair.js" as any);
    return await repairWorktree(repo, wt, kind, opts);
  } catch {
    const actions: string[] = [];
    const statusRes = await git(wt, ["status", "--porcelain"], { allowFail: true });
    if (statusRes.stdout.trim()) {
      if (kind === "task") {
        await git(wt, ["add", "-A"], { allowFail: true });
        await git(wt, ["commit", "-m", "factory: operator edits"], { allowFail: true });
        actions.push("commit_operator_edits");
      } else {
        await git(wt, ["add", "-A"], { allowFail: true });
        await git(wt, ["commit", "-m", "interrupted"], { allowFail: true });
        actions.push("commit_interrupted");
      }
    }
    return { actions };
  }
}

/**
 * Repairs uncompleted step records (§6.3.6):
 * Record with `started` and no final meta -> mark `interrupted`.
 */
async function repairInterruptedRecords(taskDir: string): Promise<void> {
  const dirsToScan: string[] = [];

  const runsDir = path.join(taskDir, "runs");
  if (fs.existsSync(runsDir)) {
    dirsToScan.push(runsDir);
  }

  const itemsDir = path.join(taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
    for (const ent of itemEntries) {
      if (ent.isDirectory()) {
        const stepsDir = path.join(itemsDir, ent.name, "steps");
        if (fs.existsSync(stepsDir)) {
          dirsToScan.push(stepsDir);
        }
      }
    }
  }

  for (const dir of dirsToScan) {
    const stepDirs = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const sdir of stepDirs) {
      if (!sdir.isDirectory()) continue;
      const recordDir = path.join(dir, sdir.name);
      const metaPath = path.join(recordDir, "meta.yaml");
      const outputPath = path.join(recordDir, "output.yaml");

      if (fs.existsSync(metaPath) && !fs.existsSync(outputPath)) {
        try {
          const meta = await readYaml<StepMetaArtifact>(metaPath);
          if (meta.status === "started") {
            meta.status = "interrupted";
            meta.endedAt = new Date().toISOString();
            await writeYamlAtomic(metaPath, meta);
            await appendJournal(taskDir, {
              type: "record_marked_interrupted",
              recordDir,
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * Processes steering mailbox single-flight (§8.8).
 */
async function processSteeringMailbox(
  taskDir: string,
  harness: Harness,
  pipeline: PipelineConfig
): Promise<{ stopRequested: boolean }> {
  const pendingDir = path.join(taskDir, "steer", "fromuserpending");
  if (!fs.existsSync(pendingDir)) {
    return { stopRequested: false };
  }

  const entries = await fs.promises.readdir(pendingDir, { withFileTypes: true });
  const pendingFiles = entries.filter((e) => e.isFile() && !e.name.startsWith("."));
  if (pendingFiles.length === 0) {
    return { stopRequested: false };
  }

  const takenDir = path.join(taskDir, "steer", "fromusertaken");
  await fs.promises.mkdir(takenDir, { recursive: true });
  const touserDir = path.join(taskDir, "steer", "tousertoreview");

  let stopRequested = false;

  for (const pf of pendingFiles) {
    const srcPath = path.join(pendingDir, pf.name);
    const text = await readText(srcPath);

    // Classify using @simpler (§8.8)
    let classification: SteerClassificationArtifact = {
      refs: ["task"],
      kind: "directive",
      urgency: "now",
      summary: text.slice(0, 100),
    };

    try {
      const classified = (await harness.complete({
        role: "simpler",
        models: ["deepseek-chat"],
        system: "Classify user steering message into refs, kind (answer|directive|stop), urgency (now|next-architect-call), summary.",
        prompt: `Steering message:\n${text}`,
        schema: {
          type: "object",
          required: ["refs", "kind", "urgency", "summary"],
          properties: {
            refs: { type: "array", items: { type: "string" } },
            kind: { type: "string", enum: ["answer", "directive", "stop"] },
            urgency: { type: "string", enum: ["now", "next-architect-call"] },
            summary: { type: "string" },
          },
        },
      })) as SteerClassificationArtifact;

      if (classified && classified.kind) {
        classification = classified;
      }
    } catch {
      // Fallback
      if (text.toLowerCase().includes("stop")) {
        classification.kind = "stop";
      }
    }

    // Move pending to taken
    const destPath = path.join(takenDir, pf.name);
    await fs.promises.rename(srcPath, destPath);
    await writeYamlAtomic(`${destPath}.classification.yaml`, classification);

    if (classification.kind === "stop") {
      stopRequested = true;
    } else if (classification.kind === "answer") {
      // Answer closes / unblocks items in tousertoreview
      if (fs.existsSync(touserDir)) {
        const qFiles = await fs.promises.readdir(touserDir);
        for (const qf of qFiles) {
          if (!qf.endsWith(".yaml")) continue;
          const qPath = path.join(touserDir, qf);
          try {
            const q = await readYaml<SteerItemArtifact>(qPath);
            if (q.status === "open" && classification.refs.some((r) => q.ref.includes(r))) {
              q.status = "answered";
              q.answer = text;
              await writeYamlAtomic(qPath, q);
            }
          } catch {
            // ignore
          }
        }
      }
    }

    await appendJournal(taskDir, {
      type: "steer_processed",
      file: pf.name,
      classification,
    });
  }

  return { stopRequested };
}

/**
 * Drives a task to completion using the derive -> act -> commit loop (§2).
 * Exit codes: 0 done, 10 blocked on human, 1 failed/stopped/error.
 */
export async function runTask(
  deps: EngineDeps,
  task: string,
  opts?: { maxTicks?: number }
): Promise<RunResult> {
  const { harness, repo, project, pipelineFor, prompts, log } = deps;

  const orchFolder = project.orchestrationFolder ?? ".factory";
  const intentPath = path.join(repo.mainRoot, orchFolder, task, "INTENT.md");

  // 1. Ensure task worktree (§7)
  const taskWtInfo = await ensureTaskWorktreeSafe(repo, task, {
    intentPath,
    orchestrationFolder: orchFolder,
  });

  const taskWt = taskWtInfo.path;
  const taskDir = path.join(taskWt, orchFolder, task);
  await fs.promises.mkdir(taskDir, { recursive: true });

  const parentBranch = `topic/${task}`;

  // 2. Start-up repair (§6.3.6)
  await repairWorktreeSafe(repo, taskWt, "task", {
    operatorEditable: [
      "**/INTENT.md",
      "**/*.yaml",
      "**/*.yml",
      "**/pipeline.yaml",
      "**/steer/**",
      `${orchFolder}/**`,
    ],
  });
  await repairInterruptedRecords(taskDir);

  // 3. Load pipeline config and setup semaphores (§2)
  const pipeline = await pipelineFor(taskDir);
  const limits = pipeline.limits ?? {};
  const maxParallelTurns = limits.maxParallelTurns ?? 4;
  const turnsSemaphore = new Semaphore(maxParallelTurns);

  // Budget tracker (§12.5)
  const budgetTracker = new BudgetTracker(pipeline.budget);
  await budgetTracker.reconcileFromDisk(taskDir);

  await appendJournal(taskDir, { type: "task_started", task, branch: parentBranch });

  // 4. Derive -> Act -> Commit loop (§2)
  let ticks = 0;
  const maxTicks = opts?.maxTicks ?? 100;
  let architectSessionId: string | undefined;

  while (ticks < maxTicks) {
    ticks++;

    // a. Process steering mailbox (§8.8)
    const steerRes = await processSteeringMailbox(taskDir, harness, pipeline);
    if (steerRes.stopRequested) {
      await appendJournal(taskDir, { type: "task_stopped_by_user", task });
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} stopped by steering command`,
      };
    }

    // b. Budget limit check (§12.5)
    const taskBudgetCheck = budgetTracker.checkTaskBudget();
    if (taskBudgetCheck.exceeded) {
      // Create human-stop item in tousertoreview and exit 10 (§12.5)
      const steerDir = path.join(taskDir, "steer", "tousertoreview");
      await fs.promises.mkdir(steerDir, { recursive: true });
      const qId = `budget-stop-${Date.now()}`;
      await writeYamlAtomic(path.join(steerDir, `${qId}.yaml`), {
        id: qId,
        ref: task,
        disposition: "human-stop",
        question: `Task spend $${taskBudgetCheck.spent.toFixed(2)} exceeded budget limit $${taskBudgetCheck.limit}.`,
        status: "open",
      });
      await appendJournal(taskDir, { type: "task_budget_exceeded", spent: taskBudgetCheck.spent });
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} budget exceeded ($${taskBudgetCheck.spent.toFixed(2)})`,
      };
    }

    // c. Derive current state (§6.3 Invariant 4)
    const taskState = await deriveTaskState({
      taskDir,
      task,
      parentBranch,
      taskWt,
    });

    // Materialize state.yaml for humans (Invariant 4)
    await materializeStateYaml(taskDir, taskState.toStateArtifact());

    // Check terminal conditions
    if (taskState.status === "done") {
      await appendJournal(taskDir, { type: "task_done", task });
      await runSeamHooks({
        phase: "after",
        seam: "task.done",
        cwd: taskWt,
        baseRef: parentBranch,
        taskKind: taskState.kind,
        pipeline,
        project,
        repo,
        harness,
        prompts,
        taskDir,
      });
      return {
        status: "done",
        exitCode: 0,
        summary: `Task ${task} completed successfully`,
      };
    }

    if (taskState.status === "blocked") {
      await appendJournal(taskDir, { type: "task_blocked", task });
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} blocked on human input or decision`,
      };
    }

    if (taskState.status === "failed") {
      await appendJournal(taskDir, { type: "task_failed", task });
      return {
        status: "failed",
        exitCode: 1,
        summary: `Task ${task} failed`,
      };
    }

    // d. Act: Phase progression
    // Phase 1: Ingest if triage is missing
    const triagePath = path.join(taskDir, "triage.yaml");
    if (!fs.existsSync(triagePath)) {
      const ingestRes = await runIngest({
        task,
        taskDir,
        taskWt,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        turnsSemaphore,
        log,
        budgetTracker,
      });

      if (ingestRes.simpleDone) {
        return {
          status: "done",
          exitCode: 0,
          summary: `Simple task ${task} completed and merged`,
        };
      }
      continue;
    }

    // Phase 2: Iterations / Waves
    const itRes = await runIteration({
      task,
      taskDir,
      taskWt,
      parentBranch,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      budgetTracker,
      turnsSemaphore,
      architectSessionId,
      runTaskChild: async (childSlug: string) => {
        return await runTask(deps, `${task}--${childSlug}`, opts);
      },
      log,
    });

    if (itRes.architectSessionId) {
      architectSessionId = itRes.architectSessionId;
    }

    if (itRes.status === "done") {
      return {
        status: "done",
        exitCode: 0,
        summary: `Task ${task} completed successfully`,
      };
    } else if (itRes.status === "blocked") {
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} blocked at iteration ${itRes.iteration}`,
      };
    } else if (itRes.status === "failed") {
      return {
        status: "failed",
        exitCode: 1,
        summary: `Task ${task} failed at iteration ${itRes.iteration}`,
      };
    }
  }

  return {
    status: "stopped",
    exitCode: 1,
    summary: `Task ${task} stopped: exceeded max ticks (${maxTicks})`,
  };
}
