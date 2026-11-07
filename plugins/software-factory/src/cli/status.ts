import fs from "node:fs";
import path from "node:path";
import { loadProjectConfig } from "../core/config/loader.js";
import { taskBranch, worktreePath } from "../core/git/naming.js";
import { deriveTaskState } from "../core/derive/task.js";

export interface StatusOptions {
  repoRoot: string;
  task: string;
}

/**
 * Prints compact derived state for a task (§11).
 */
export async function runStatus(opts: StatusOptions): Promise<number> {
  const repoRoot = path.resolve(opts.repoRoot);
  const task = opts.task;

  const projectYamlPath = path.join(repoRoot, ".factory", "project.yaml");
  let orchestrationFolder = ".factory/tasks";
  let worktreeRoot = "../repo.factory-wt";

  if (fs.existsSync(projectYamlPath)) {
    try {
      const proj = loadProjectConfig(projectYamlPath);
      orchestrationFolder = proj.orchestrationFolder;
      worktreeRoot = proj.worktreeRoot;
    } catch {
      // ignore
    }
  }

  const absWtRoot = path.resolve(repoRoot, worktreeRoot);
  const wtPath = worktreePath(absWtRoot, taskBranch(task));
  const mainTaskDir = path.join(repoRoot, orchestrationFolder, task);

  const hasWt = fs.existsSync(wtPath);
  const taskWt = hasWt ? wtPath : repoRoot;
  const taskDir = hasWt
    ? path.join(wtPath, orchestrationFolder, task)
    : mainTaskDir;

  if (!fs.existsSync(taskDir)) {
    console.error(`[factory status] Task "${task}" not found (checked "${taskDir}")`);
    return 1;
  }

  const derived = await deriveTaskState({
    taskDir,
    task,
    taskWt,
    parentBranch: taskBranch(task),
  });

  const configPath = hasWt
    ? path.join(wtPath, orchestrationFolder, task, "pipeline.yaml")
    : path.join(repoRoot, ".factory", "pipeline.yaml");

  console.log(`================================================================`);
  console.log(`Task: ${derived.task} [${derived.status.toUpperCase()}]`);
  console.log(`Kind: ${derived.kind ?? "unclassified"} | Iteration: ${derived.iteration} | Wave: ${derived.currentWave ?? "none"}`);
  console.log(`Worktree: ${hasWt ? taskWt : "(none - main checkout)"}`);
  console.log(`Config path: ${configPath}`);
  console.log(`Budget spent: $${derived.budgetSpentUsd.toFixed(4)}`);
  console.log(`----------------------------------------------------------------`);

  if (derived.waves && derived.waves.length > 0) {
    console.log(`Waves & Items:`);
    for (const wave of derived.waves) {
      console.log(`  Wave ${wave.wave}:`);
      for (const item of wave.items) {
        console.log(`    - ${item.slug} [${item.status}] (${item.kind ?? "item"})`);
      }
    }
  } else if (derived.items && derived.items.length > 0) {
    console.log(`Items:`);
    for (const item of derived.items) {
      console.log(`  - ${item.slug} [${item.status}] (${item.kind ?? "item"})`);
    }
  } else {
    console.log(`Items: None scheduled yet`);
  }

  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Open Operator Questions (tousertoreview):`);
    for (const q of derived.openSteerQuestions) {
      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
      console.log(`    Question: ${q.question}`);
      if (q.draftDecision) {
        console.log(`    Draft Decision: ${q.draftDecision}`);
      }
      if (q.blocks && q.blocks.length > 0) {
        console.log(`    Blocks: ${q.blocks.join(", ")}`);
      }
      console.log(`    To answer: factory steer ${task} "answer to ${q.id}: <your answer>"`);
    }
  }

  if (derived.debt && derived.debt.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Recorded Technical Debt:`);
    for (const d of derived.debt) {
      console.log(`  - ${d}`);
    }
  }
  console.log(`================================================================`);

  return 0;
}
