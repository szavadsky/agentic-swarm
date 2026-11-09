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
  TriageArtifact,
} from "./artifacts.js";
import type { Harness } from "../harness/types.js";
import { KeyedMutex, Semaphore } from "./mutex.js";
import { git } from "./git/exec.js";
import { taskBranch, childBranch } from "./git/naming.js";
import {
  ensureTaskWorktree,
  ensureChildWorktree,
  repairWorktree,
  commitAll,
  removeWorktree,
} from "./git/index.js";
import { appendJournal } from "./journal.js";
import { BudgetTracker } from "./budget.js";
import { deriveTaskState, materializeStateYaml, refreshStateYaml, type DerivedTaskState } from "./derive/task.js";
import { deriveItemState } from "./derive/item.js";
import { tickItemMachine } from "./flows/item-machine.js";
import { mergeItem } from "./flows/merge-path.js";
import { runIngest, isTriageDone, isInfraDone } from "./flows/ingest.js";
import { runIteration } from "./flows/iteration.js";
import { propagateEpicConcerns } from "./flows/epic-propagation.js";
import { runSeamHooks } from "./flows/seams.js";
import { readYaml, writeYamlAtomic, readText } from "./records/io.js";
import { reconcileConcerns } from "./concerns.js";
import { listPending, classify, takenPaths } from "./steer.js";
import { resolveRole } from "./config/roles.js";
import { installShutdownHandlers } from "./shutdown.js";
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
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt step record meta at ${metaPath}: ${err?.message ?? err}`);
          }
        }
      }
    }
  }
}

/**
 * Processes steering mailbox single-flight using steer.ts API (§8.8, Finding 17).
 */
async function processSteeringMailbox(
  taskWt: string,
  taskDir: string,
  harness: Harness,
  pipeline: PipelineConfig,
  prompts: any,
  repo: any,
  task: string
): Promise<{ stopRequested: boolean }> {
  const relTaskDir = path.relative(taskWt, taskDir);
  const pending = await listPending(taskWt, relTaskDir);
  if (pending.length === 0) {
    return { stopRequested: false };
  }

  // Load currently open questions for context
  const openQuestions: SteerItemArtifact[] = [];
  const touserDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(touserDir)) {
    const qFiles = await fs.promises.readdir(touserDir);
    for (const qf of qFiles) {
      if (!qf.endsWith(".yaml")) continue;
      const qPath = path.join(touserDir, qf);
      try {
        const q = await readYaml<SteerItemArtifact>(qPath);
        if (q && q.status === "open") openQuestions.push(q);
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt steer question at ${qPath}: ${err?.message ?? err}`);
        }
      }
    }
  }

  const simplerRole = resolveRole("simpler", pipeline.models.roles);
  let stopRequested = false;

  for (const item of pending) {
    const classification = await classify(harness, item, {
      openQuestions,
      role: simplerRole.role,
      models: simplerRole.models,
      prompts,
    });

    const { from, to } = takenPaths(item.file, relTaskDir);
    const absTo = path.join(taskWt, to);
    await fs.promises.mkdir(path.dirname(absTo), { recursive: true });
    // One atomic commit per §8.8: git mv to fromusertaken/, classification yaml, effects
    await git(taskWt, ["mv", from, to]);
    await writeYamlAtomic(`${absTo}.classification.yaml`, classification);

    if (classification.kind === "stop") {
      stopRequested = true;
    } else if (classification.kind === "answer") {
      // Answer matching questions exactly (Finding 16)
      if (fs.existsSync(touserDir)) {
        const qFiles = await fs.promises.readdir(touserDir);
        for (const qf of qFiles) {
          if (!qf.endsWith(".yaml")) continue;
          const qPath = path.join(touserDir, qf);
          try {
            const q = await readYaml<SteerItemArtifact>(qPath);
            const matches = classification.refs.some(
              (r) => q.ref === r || q.ref === `${task}/${r}` || q.id === r
            );
            if (q && q.status === "open" && matches) {
              q.status = "answered";
              q.answer = item.text;
              await writeYamlAtomic(qPath, q);
            }
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              throw new Error(`Corrupt steer question at ${qPath}: ${err?.message ?? err}`);
            }
          }
        }
      }
    }

    // Atomic commit for mailbox processing (§8.8, Finding 17)
    await git(taskWt, ["add", "-A"], { allowFail: true });
    await commitAll(repo, taskWt, `factory: process steering message ${item.file}`);

    await appendJournal(taskDir, {
      type: "steer_processed",
      file: item.file,
      classification,
    });
  }

  return { stopRequested };
}

/** Serializes parent-side propagation + child-closeup commit per parent worktree. */
const parentCloseupLocks = new KeyedMutex();

/**
 * Runs an epic as a child task on the parent branch (§8.6, Finding 7).
 */
export async function runChildTask(
  deps: EngineDeps,
  parent: { branch: string; path: string; taskDir: string },
  epicSlug: string,
  opts?: {
    maxTicks?: number;
    maxIterations?: number;
    budgetTracker?: BudgetTracker;
    rootTaskDir?: string;
  }
): Promise<RunResult> {
  const { harness, repo, project, pipelineFor, prompts, log } = deps;
  const parentBranch = parent.branch;
  const childBranchName = childBranch(parentBranch, epicSlug);

  // 1. Child worktree from parent tip (§8.6, §7: from the parent tip after the
  // previous wave's merges; the epic INTENT written by the edits commit is on it)
  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
  const childWt = childWtInfo.path;
  const orchFolder = project.orchestrationFolder ?? ".factory";
  const parentTaskSlug = parent.taskDir.split("/").pop()!;
  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
  await fs.promises.mkdir(childTaskDir, { recursive: true });

  // Epic child tasks inherit infra from parent task (§8.1.3)
  const parentInfra = path.join(parent.taskDir, "infra.yaml");
  const parentBaseline = path.join(parent.taskDir, "gates-baseline.yaml");
  if (fs.existsSync(parentInfra) && !fs.existsSync(path.join(childTaskDir, "infra.yaml"))) {
    await fs.promises.copyFile(parentInfra, path.join(childTaskDir, "infra.yaml"));
  }
  if (fs.existsSync(parentBaseline) && !fs.existsSync(path.join(childTaskDir, "gates-baseline.yaml"))) {
    await fs.promises.copyFile(parentBaseline, path.join(childTaskDir, "gates-baseline.yaml"));
  }
  // 2. Child shares root budget and mailbox (§8.6, §8.8)
  const pipeline = await pipelineFor(childTaskDir);
  const budgetTracker = opts?.budgetTracker ?? new BudgetTracker(pipeline.budget);

  // 3. Child iterations (child skips classification; kind fixed by parent plan)
  const itRes = await runIteration({
    task: `${parentTaskSlug}--${epicSlug}`,
    taskDir: childTaskDir,
    taskWt: childWt,
    parentBranch: childBranchName,
    repo,
    harness,
    pipeline,
    project,
    prompts,
    budgetTracker,
    isChildTask: true,
    log,
  });

  // 4. Push open/routed child concerns and blocked questions to the parent,
  // then record the child's final close-up as the parent item status so derive
  // and the merge path see it (§8.6, Finding 7). One lock and one commit cover
  // the copies plus the close-up; copies stay open, so only forwarded
  // questions can block the parent.
  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
  await parentCloseupLocks.runExclusive(parent.path, async () => {
    await propagateEpicConcerns({
      childTaskDir,
      parentTaskDir: parent.taskDir,
      parentWt: parent.path,
      epic: epicSlug,
    });
    await fs.promises.mkdir(parentItemDir, { recursive: true });
    const childStatus =
      itRes.status === "done" ? "done" : itRes.status === "blocked" ? "blocked" : "failed";
    await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
      epic: epicSlug,
      status: childStatus,
      iteration: itRes.iteration,
      summary: `Epic child task finished: ${itRes.status}`,
    });
    await git(parent.path, ["add", "-A"], { allowFail: true });
    await commitAll(repo, parent.path, `factory: record epic ${epicSlug} child status ${childStatus}`);
  });

  return {
    status: itRes.status === "done" ? "done" : itRes.status === "blocked" ? "blocked" : "failed",
    exitCode: itRes.status === "done" ? 0 : itRes.status === "blocked" ? 10 : 1,
    summary: `Epic ${epicSlug} child task ${itRes.status}`,
  };
}

/**
 * Drives a task to completion using the derive -> act -> commit loop (§2).
 * Exit codes: 0 done, 10 blocked on human, 1 failed/stopped/error.
 */
export async function runTask(
  deps: EngineDeps,
  task: string,
  opts?: {
    maxTicks?: number;
    maxIterations?: number;
    lockTakeoverEvent?: {
      previousLock?: { pid?: number; host?: string };
      newLock: { pid: number; host: string };
    };
  }
): Promise<RunResult> {
  const { harness, repo, project, pipelineFor, prompts, log } = deps;
  let taskDir: string | undefined;
  let taskWt: string | undefined;
  let parentBranch: string | undefined;
  let pipeline: PipelineConfig | undefined;

  const uninstallShutdown = installShutdownHandlers(async () => {
    if (taskDir) {
      await repairInterruptedRecords(taskDir);
    }
  });

  try {
    const orchFolder = project.orchestrationFolder ?? ".factory";
    const intentPath = path.join(repo.mainRoot, orchFolder, task, "INTENT.md");
  // 1. Ensure task worktree (§7)
  const taskWtInfo = await ensureTaskWorktree(repo, task, {
    intentPath,
    orchestrationFolder: orchFolder,
  });

    taskWt = taskWtInfo.path;
    taskDir = path.join(taskWt, orchFolder, task);
    await fs.promises.mkdir(taskDir, { recursive: true });
    parentBranch = `topic/${task}`;

  // 2. Start-up repair restricted to §6.3.6 list (Finding 1 & 19)
  // Concerns are engine-owned: commit them before stray-dirt repair stashes them.
  if (fs.existsSync(path.join(taskDir, "concerns"))) {
    await commitAll(repo, taskWt, "factory: concern store recovery", {
      paths: [`${orchFolder}/${task}/concerns`],
    });
  }
  await repairWorktree(repo, taskWt, "task", {
    operatorEditable: [
      "INTENT.md",
      "**/INTENT.md",
      `${orchFolder}/${task}/INTENT.md`,
      `${orchFolder}/${task}/pipeline.yaml`,
      `${orchFolder}/*.yaml`,
      `${orchFolder}/${task}/steer/fromuserpending/**`,
    ],
  });

  // Repair existing item worktrees at start-up (Finding 19)
  const itemsDir = path.join(taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    try {
      const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
      for (const ent of itemEntries) {
        if (ent.isDirectory()) {
          const itemBranchName = childBranch(parentBranch, ent.name);
          const itemWtPath = path.join(
            repo.worktreeRoot,
            itemBranchName.replace(/\//g, "_")
          );
          if (fs.existsSync(itemWtPath)) {
            await repairWorktree(repo, itemWtPath, "item", { operatorEditable: [] });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  await repairInterruptedRecords(taskDir);

  // Rebuild concerns lost in a crash from committed step records (§18).
  try {
    await reconcileConcerns({ taskDir, taskWt, repo });
  } catch (err: any) {
    try {
      await appendJournal(taskDir, {
        type: "concern_reconcile_error",
        task,
        error: err?.message || String(err),
      });
    } catch { /* Journal failure must not crash startup. */ }
  }

  // 3. Load pipeline config and setup semaphores (§2)
  pipeline = await pipelineFor(taskDir);
  if (opts?.maxIterations !== undefined) {
    if (!pipeline.limits) pipeline.limits = {};
    pipeline.limits.maxIterations = opts.maxIterations;
  }

  const limits = pipeline.limits ?? {};
  const maxParallelTurns = limits.maxParallelTurns ?? 4;
  const turnsSemaphore = new Semaphore(maxParallelTurns);

  // Budget tracker (§12.5)
  const budgetTracker = new BudgetTracker(pipeline.budget);
  await budgetTracker.reconcileFromDisk(taskDir);

  if (opts?.lockTakeoverEvent) {
    await appendJournal(taskDir, {
      type: "lock_takeover",
      task,
      previousPid: opts.lockTakeoverEvent.previousLock?.pid,
      previousHost: opts.lockTakeoverEvent.previousLock?.host,
      newPid: opts.lockTakeoverEvent.newLock.pid,
      newHost: opts.lockTakeoverEvent.newLock.host,
    });
  }

  await appendJournal(taskDir, { type: "task_started", task, branch: parentBranch });

  // 4. Derive -> Act -> Commit loop (§2)
  let ticks = 0;
  const maxTicks = opts?.maxTicks ?? 100;
  let architectSessionId: string | undefined;

  while (ticks < maxTicks) {
    ticks++;

    // a. Process steering mailbox single-flight (§8.8, Finding 17)
    const steerRes = await processSteeringMailbox(
      taskWt,
      taskDir,
      harness,
      pipeline,
      prompts,
      repo,
      task
    );
    if (steerRes.stopRequested) {
      await appendJournal(taskDir, { type: "task_stopped_by_user", task });
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} stopped by steering command`,
      };
    }

    // b. Budget limit check (§12.5, Finding 32: idempotent and committed)
    const taskBudgetCheck = budgetTracker.checkTaskBudget();
    if (taskBudgetCheck.exceeded) {
      const steerDir = path.join(taskDir, "steer", "tousertoreview");
      await fs.promises.mkdir(steerDir, { recursive: true });
      const budgetStopPath = path.join(steerDir, "budget-stop.yaml");
      let alreadyAnswered = false;

      if (fs.existsSync(budgetStopPath)) {
        try {
          const q = await readYaml<SteerItemArtifact>(budgetStopPath);
          if (q.status === "answered") {
            alreadyAnswered = true;
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt budget-stop file at ${budgetStopPath}: ${err?.message ?? err}`);
          }
        }
      }

      if (!alreadyAnswered) {
        if (!fs.existsSync(budgetStopPath)) {
          await writeYamlAtomic(budgetStopPath, {
            id: "budget-stop",
            ref: task,
            disposition: "human-stop",
            question: `Task spend $${taskBudgetCheck.spent.toFixed(2)} exceeded budget limit $${taskBudgetCheck.limit}.`,
            blocks: ["task"],
            status: "open",
          });
          await git(taskWt, ["add", "-A"], { allowFail: true });
          await commitAll(repo, taskWt, "factory: raise budget-stop question");
        }
        await appendJournal(taskDir, {
          type: "task_budget_exceeded",
          spent: taskBudgetCheck.spent,
        });
        return {
          status: "blocked",
          exitCode: 10,
          summary: `Task ${task} budget exceeded ($${taskBudgetCheck.spent.toFixed(2)})`,
        };
      }
    }

    // c. Derive current state (§6.3 Invariant 4)
    const taskState = await deriveTaskState({
      taskDir,
      task,
      parentBranch,
      taskWt,
      pipeline,
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
    // Phase 1: Ingest (resumable per sub-step)
    const triageDone = await isTriageDone(taskDir, taskWt);
    const infraDone = await isInfraDone(taskDir, taskWt);

    const triagePath = path.join(taskDir, "triage.yaml");
    let triageArtifact: TriageArtifact | undefined;
    if (triageDone && fs.existsSync(triagePath)) {
      try {
        triageArtifact = await readYaml<TriageArtifact>(triagePath);
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt triage file at ${triagePath}: ${err?.message ?? err}`);
        }
      }
    }

    const simpleAssignmentExists = fs.existsSync(
      path.join(taskDir, "items", "simple", "assignment.yaml")
    );
    const needsIngest =
      !triageDone ||
      !infraDone ||
      (triageArtifact?.kind === "simple" && !simpleAssignmentExists);
    if (needsIngest) {
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
        await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
        return {
          status: "done",
          exitCode: 0,
          summary: `Simple task ${task} completed and merged`,
        };
      }
      continue;
    }

    if (simpleAssignmentExists) {
      const childWtInfo = await ensureChildWorktree(
        repo,
        { branch: parentBranch, path: taskWt },
        "simple"
      );
      const childWt = childWtInfo.path;
      let simpleItemState = await deriveItemState({
        taskDir,
        itemSlug: "simple",
        parentBranch,
        taskWt,
        childWt,
        pipeline,
        project,
      });

      let itemTicks = 0;
      const maxItemTicks = 50;
      while (
        simpleItemState.status !== "ready" &&
        simpleItemState.status !== "merged" &&
        simpleItemState.status !== "failed" &&
        simpleItemState.status !== "blocked" &&
        itemTicks < maxItemTicks
      ) {
        itemTicks++;
        const tickRes = await tickItemMachine({
          task,
          taskDir,
          taskWt,
          childWt,
          parentBranch,
          itemSlug: "simple",
          repo,
          harness,
          pipeline,
          project,
          prompts,
          turnsSemaphore,
          budgetTracker,
        });
        simpleItemState = await deriveItemState({
          taskDir,
          itemSlug: "simple",
          parentBranch,
          taskWt,
          childWt,
          pipeline,
          project,
        });
        if (tickRes.status === "failed" || tickRes.status === "blocked") {
          break;
        }
      }

      if (simpleItemState.status === "ready") {
        const mRes = await mergeItem({
          item: simpleItemState,
          parentBranch,
          taskWt,
          childWt,
          repo,
          harness,
          pipeline,
          project,
          prompts,
          task,
          taskDir,
          turnsSemaphore,
        });
        if (mRes.ok) {
          await removeWorktree(repo, childWt);
          await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
          return {
            status: "done",
            exitCode: 0,
            summary: `Simple task ${task} completed and merged via converted no-behavior item`,
          };
        }
      }

      if (simpleItemState.status === "merged") {
        await removeWorktree(repo, childWt);
        await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
        return {
          status: "done",
          exitCode: 0,
          summary: `Simple task ${task} completed and merged via converted no-behavior item`,
        };
      }

      if (simpleItemState.status === "blocked") {
        await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
        return {
          status: "blocked",
          exitCode: 10,
          summary: `Simple task ${task} blocked`,
        };
      }

      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      return {
        status: "failed",
        exitCode: 1,
        summary: `Simple task ${task} failed during converted no-behavior execution`,
      };
    }
    // Invariant: never start the architect before infra is done
    const infraReady = await isInfraDone(taskDir, taskWt);
    if (!infraReady) {
      throw new Error(`Cannot start architect: infra step is not done for task ${task}`);
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
      runTaskChild: async (epicSlug: string) => {
        return await runChildTask(
          deps,
          { branch: parentBranch!, path: taskWt!, taskDir: taskDir! },
          epicSlug,
          {
            maxTicks: opts?.maxTicks,
            maxIterations: opts?.maxIterations,
            budgetTracker,
            rootTaskDir: taskDir!,
          }
        );
      },
      log,
    });

    architectSessionId = itRes.architectSessionId;

    if (itRes.status === "done") {
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      return {
        status: "done",
        exitCode: 0,
        summary: `Task ${task} completed successfully`,
      };
    } else if (itRes.status === "blocked") {
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      return {
        status: "blocked",
        exitCode: 10,
        summary: `Task ${task} blocked at iteration ${itRes.iteration}`,
      };
    } else if (itRes.status === "failed") {
      await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
      return {
        status: "failed",
        exitCode: 1,
        summary: `Task ${task} failed at iteration ${itRes.iteration}`,
      };
    }
  }

  await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
  return {
    status: "stopped",
    exitCode: 1,
    summary: `Task ${task} stopped: exceeded max ticks (${maxTicks})`,
  };
  } catch (err: any) {
    if (taskDir && fs.existsSync(taskDir)) {
      if (parentBranch && taskWt && pipeline) {
        try {
          await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
        } catch {}
      }
      try {
        await appendJournal(taskDir, { type: "task_error", error: err?.message ?? String(err) });
      } catch {}
    }
    return {
      status: "failed",
      exitCode: 1,
      summary: `Task ${task} error: ${err?.message ?? String(err)}`,
    };
  } finally {
    uninstallShutdown();
  }
}
