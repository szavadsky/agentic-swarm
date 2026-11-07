import fs from "node:fs";
import path from "node:path";
import { loadProjectConfig } from "../core/config/loader.js";
import { taskBranch, worktreePath } from "../core/git/naming.js";

export interface SteerOptions {
  repoRoot: string;
  task: string;
  text: string;
  silent?: boolean;
}

/**
 * Writes an operator steering message to `steer/fromuserpending/{ts}.md` (§8.8, §11).
 */
export async function runSteer(opts: SteerOptions): Promise<number> {
  const repoRoot = path.resolve(opts.repoRoot);
  const task = opts.task;
  const text = opts.text;

  // Load project configuration to determine orchestration folder and worktree root
  const projectYamlPath = path.join(repoRoot, ".factory", "project.yaml");
  let orchestrationFolder = ".factory/tasks";
  let worktreeRoot = "../repo.factory-wt";

  if (fs.existsSync(projectYamlPath)) {
    try {
      const proj = loadProjectConfig(projectYamlPath);
      orchestrationFolder = proj.orchestrationFolder;
      worktreeRoot = proj.worktreeRoot;
    } catch {
      // Use defaults if load fails
    }
  }

  // Check task worktree first, fallback to main repo task folder
  const absWtRoot = path.resolve(repoRoot, worktreeRoot);
  const wtPath = worktreePath(absWtRoot, taskBranch(task));
  const mainTaskDir = path.join(repoRoot, orchestrationFolder, task);

  let steerDir: string;
  if (fs.existsSync(path.join(wtPath, ".git"))) {
    steerDir = path.join(wtPath, orchestrationFolder, task, "steer", "fromuserpending");
  } else {
    steerDir = path.join(mainTaskDir, "steer", "fromuserpending");
  }

  fs.mkdirSync(steerDir, { recursive: true });

  const fileName = `${Date.now()}.md`;
  const filePath = path.join(steerDir, fileName);

  fs.writeFileSync(filePath, text.trim() + "\n", "utf8");

  if (!opts.silent) {
    console.log(`[factory steer] Wrote steering directive to ${filePath}`);
  }

  return 0;
}
