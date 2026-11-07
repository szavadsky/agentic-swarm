import fs from "node:fs";
import path from "node:path";
import { loadProjectConfig, loadPipelineConfig } from "../core/config/loader.js";
import { loadPromptLibrary } from "../core/prompts.js";
import { Repo } from "../core/git/repo.js";
import { runTask, type EngineDeps, type RunResult } from "../core/engine.js";
import { OmpHarness } from "../harness/omp/harness.js";
import { acquireRunLock } from "./lock.js";
import { runPreflight } from "./preflight.js";

export interface RunCliOptions {
  repoRoot: string;
  taskOrIntent: string;
  maxIterations?: number;
  pluginRoot?: string;
  ompBinary?: string;
}

/**
 * Resolves the task slug from either a task name or a path to INTENT.md (§11).
 * If a path like `tasks/my-task/INTENT.md` is provided, slug is "my-task".
 */
export function resolveTaskSlug(taskOrIntent: string): string {
  const normalized = taskOrIntent.replace(/\\/g, "/");
  if (normalized.endsWith("/INTENT.md") || normalized === "INTENT.md") {
    const parentDir = path.basename(path.dirname(path.resolve(taskOrIntent)));
    return parentDir;
  }
  if (normalized.includes("/")) {
    return path.basename(path.dirname(taskOrIntent));
  }
  return taskOrIntent;
}

/**
 * Drives a task run to completion via the engine derive-act-commit loop (§2, §11).
 * Exit codes: 0 = done, 10 = blocked on operator, 1 = failed/error.
 */
export async function runFactory(opts: RunCliOptions): Promise<number> {
  const repoRoot = path.resolve(opts.repoRoot);
  const pluginRoot = opts.pluginRoot
    ? path.resolve(opts.pluginRoot)
    : path.resolve(import.meta.dir ?? __dirname, "../..");
  const task = resolveTaskSlug(opts.taskOrIntent);

  const projectYamlPath = path.join(repoRoot, ".factory", "project.yaml");
  let projectConfig = loadProjectConfig(
    fs.existsSync(projectYamlPath) ? projectYamlPath : path.join(pluginRoot, "config/project.template.yaml"),
    { pluginRoot }
  );

  const orchestrationFolder = projectConfig.orchestrationFolder ?? ".factory/tasks";

  // Ensure INTENT.md exists at {orchestrationFolder}/{task}/INTENT.md on first run
  const defaultIntentPath = path.join(repoRoot, orchestrationFolder, task, "INTENT.md");
  if (opts.taskOrIntent.endsWith("INTENT.md") && fs.existsSync(opts.taskOrIntent)) {
    const sourceIntentPath = path.resolve(opts.taskOrIntent);
    if (sourceIntentPath !== defaultIntentPath && !fs.existsSync(defaultIntentPath)) {
      fs.mkdirSync(path.dirname(defaultIntentPath), { recursive: true });
      fs.copyFileSync(sourceIntentPath, defaultIntentPath);
    }
  }

  // 1. Preflight
  const preflightRes = await runPreflight({
    repoRoot,
    task,
    pluginRoot,
    ompBinary: opts.ompBinary,
  });

  if (!preflightRes.ok) {
    return 1;
  }

  // 2. Acquire run lock
  const lockHandle = acquireRunLock(repoRoot, task);
  if (!lockHandle) {
    console.error(`[factory run] Task "${task}" is already running by another process.`);
    return 1;
  }

  try {
    // 3. Build engine dependencies
    const loadedPipeline = loadPipelineConfig({
      pluginRoot,
      repoRoot,
    });
    const pipelineConfig = loadedPipeline.config;

    const runtimeDir = path.join(repoRoot, ".factory-runtime");
    const harness = new OmpHarness({
      ompBinary: opts.ompBinary,
      pipeline: pipelineConfig,
      runtimeDir,
    });

    const repo = new Repo({
      mainRoot: repoRoot,
      worktreeRoot: path.resolve(repoRoot, projectConfig.worktreeRoot),
    });

    const builtinDir = path.join(pluginRoot, "agents");
    const prompts = loadPromptLibrary({
      builtinDir,
      overrideDirs: pipelineConfig.prompts?.extraSkillDirs ?? [],
      overrides: pipelineConfig.prompts?.overrides,
    });

    const pipelineFor = async (taskDir: string) => {
      const taskPipelinePath = path.join(taskDir, "pipeline.yaml");
      return loadPipelineConfig({
        pluginRoot,
        repoRoot,
        taskYamlPath: fs.existsSync(taskPipelinePath) ? taskPipelinePath : undefined,
      }).config;
    };

    const deps: EngineDeps = {
      harness,
      repo,
      project: projectConfig,
      pipelineFor,
      prompts,
      log: (line: string) => console.log(line),
    };

    // 4. Run task loop
    const result: RunResult = await runTask(deps, task, {
      maxTicks: opts.maxIterations,
    });

    console.log(`[factory run] Task "${task}" completed with status "${result.status}": ${result.summary}`);
    return result.exitCode;
  } finally {
    lockHandle.release();
  }
}
