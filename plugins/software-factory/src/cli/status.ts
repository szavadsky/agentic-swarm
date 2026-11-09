import fs from "node:fs";
import path from "node:path";
import { loadProjectConfig } from "../core/config/loader.js";
import { taskBranch, worktreePath } from "../core/git/naming.js";
import { deriveTaskState } from "../core/derive/task.js";
import { questionBlocks } from "../core/steer.js";

export interface StatusOptions {
  repoRoot: string;
  task: string;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
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
  const roleEntries = Object.entries(derived.spendByRole).sort((a, b) => b[1].costUsd - a[1].costUsd);
  if (roleEntries.length > 0) {
    console.log(`  by role: ${roleEntries.map(([role, t]) => `${role} $${t.costUsd.toFixed(4)}`).join(" | ")}`);
  }
  const itemEntries = Object.entries(derived.spendByItem).sort((a, b) => b[1].costUsd - a[1].costUsd);
  if (itemEntries.length > 0) {
    console.log(`  by item: ${itemEntries.map(([item, t]) => `${item} $${t.costUsd.toFixed(4)}`).join(" | ")}`);
  }
  console.log(`----------------------------------------------------------------`);

  if (derived.runningSteps.length > 0) {
    console.log(`Running:`);
    for (const r of derived.runningSteps) {
      const where = r.item ? `${r.item}/${r.step}` : r.step;
      console.log(`  - ${where} [${r.record}] ${r.agent}/${r.role}${r.model ? ` (${r.model})` : ""} elapsed ${formatElapsed(r.elapsedMs)}`);
    }
    console.log(`----------------------------------------------------------------`);
  }

  if (derived.waves && derived.waves.length > 0) {
    console.log(`Waves & Items:`);
    for (const wave of derived.waves) {
      console.log(`  Wave ${wave.wave}:`);
      for (const item of wave.items) {
        const spend = derived.spendByItem[item.slug]?.costUsd ?? 0;
        const step = item.currentStepId ? ` step=${item.currentStepId}` : "";
        const strandedMark = derived.strandedItems?.includes(item.slug) ? " [stranded→resumed]" : "";
        console.log(`    - ${item.slug} [${item.status}]${strandedMark} (${item.kind ?? "item"}) $${spend.toFixed(4)}${step}`);
      }
    }
  } else if (derived.items && derived.items.length > 0) {
    console.log(`Items:`);
    for (const item of derived.items) {
      const spend = derived.spendByItem[item.slug]?.costUsd ?? 0;
      const step = item.currentStepId ? ` step=${item.currentStepId}` : "";
      console.log(`  - ${item.slug} [${item.status}] (${item.kind ?? "item"}) $${spend.toFixed(4)}${step}`);
    }
  } else {
    console.log(`Items: None scheduled yet`);
  }

  const isBlocking = (q: (typeof derived.openSteerQuestions)[number]) =>
    q.disposition === "human-stop" ||
    (q.blocks?.length ?? 0) > 0 ||
    questionBlocks(q, "task");
  const printQuestions = (questions: typeof derived.openSteerQuestions): void => {
    if (questions.length === 0) {
      console.log(`  (none)`);
      return;
    }
    for (const q of questions) {
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
  };

  console.log(
    `Concerns: open ${derived.concerns.open} | dismissed ${derived.concerns.dismissed} | routed ${derived.concerns.routed} | resolved ${derived.concerns.resolved}`
  );

  console.log(`----------------------------------------------------------------`);
  console.log(`Blocking Questions:`);
  printQuestions(derived.openSteerQuestions.filter(isBlocking));

  console.log(`----------------------------------------------------------------`);
  console.log(`Digest Questions:`);
  printQuestions(derived.openSteerQuestions.filter((q) => !isBlocking(q)));

  if (derived.deadSteerFiles && derived.deadSteerFiles.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`DEAD STEERING MAILBOX (operator input never processed):`);
    for (const d of derived.deadSteerFiles) {
      console.log(`  ! ${d.file} dead after ${d.errors} consecutive classify errors — fix the classifier model, then re-drop the message`);
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
