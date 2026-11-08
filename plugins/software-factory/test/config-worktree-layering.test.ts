import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { runInit } from "../src/cli/init.js";
import { runPreflight } from "../src/cli/preflight.js";
import { runFactory } from "../src/cli/run.js";
import { taskBranch, worktreePath } from "../src/core/git/naming.js";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");

function getTaskWorktreePath(repoDir: string, task: string): string {
  const projectYaml = yaml.parse(
    fs.readFileSync(path.join(repoDir, ".factory/project.yaml"), "utf8")
  );
  const absWtRoot = path.resolve(repoDir, projectYaml.worktreeRoot);
  return worktreePath(absWtRoot, taskBranch(task));
}

describe("Task worktree pipeline configuration layering (Item B)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("factory preflight fails when task worktree's pipeline.yaml has invalid schema", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "wt-pipeline-invalid";
    const orchFolder = ".factory/tasks";

    // Create task INTENT in main repo
    const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "# Intent\nTest intent.", "utf8");

    // Simulate existing task worktree created after first run
    const branch = taskBranch(task);
    tmpRepo.createBranch(branch);
    const wtPath = getTaskWorktreePath(tmpRepo.dir, task);
    tmpRepo.createWorktree(branch, wtPath);

    // Operator edits {orchestrationFolder}/{task}/pipeline.yaml inside the task worktree
    const wtTaskDir = path.join(wtPath, orchFolder, task);
    fs.mkdirSync(wtTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(wtTaskDir, "pipeline.yaml"),
      "limits:\n  maxIterations: 'not-an-integer'\n", // invalid according to schema (must be integer)
      "utf8"
    );

    // Preflight must load and validate from the TASK WORKTREE and fail!
    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: () => 10000,
    });

    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    const hasConfigError = res.errors.some(
      (e) => e.includes("Pipeline config loading failed") || e.includes("Pipeline config error")
    );
    expect(hasConfigError).toBe(true);
  });

  it("factory preflight fails when task worktree's pipeline.yaml has invalid YAML syntax", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "wt-pipeline-syntax-err";
    const orchFolder = ".factory/tasks";

    // Create task INTENT in main repo
    const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "# Intent\nTest intent.", "utf8");

    // Create task worktree
    const branch = taskBranch(task);
    tmpRepo.createBranch(branch);
    const wtPath = getTaskWorktreePath(tmpRepo.dir, task);
    tmpRepo.createWorktree(branch, wtPath);

    // Invalid YAML syntax inside task worktree
    const wtTaskDir = path.join(wtPath, orchFolder, task);
    fs.mkdirSync(wtTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(wtTaskDir, "pipeline.yaml"),
      "::: invalid yaml :::",
      "utf8"
    );

    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: () => 10000,
    });

    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Pipeline config loading failed"))).toBe(true);
  });

  it("factory preflight passes when task worktree's pipeline.yaml is valid", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "wt-pipeline-valid";
    const orchFolder = ".factory/tasks";

    const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "# Intent\nTest intent.", "utf8");

    // Create task worktree
    const branch = taskBranch(task);
    tmpRepo.createBranch(branch);
    const wtPath = getTaskWorktreePath(tmpRepo.dir, task);
    tmpRepo.createWorktree(branch, wtPath);

    // Valid YAML with valid limit override inside task worktree
    const wtTaskDir = path.join(wtPath, orchFolder, task);
    fs.mkdirSync(wtTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(wtTaskDir, "pipeline.yaml"),
      "limits:\n  maxIterations: 10\n",
      "utf8"
    );

    const res = await runPreflight({
      repoRoot: tmpRepo.dir,
      task,
      pluginRoot: PLUGIN_ROOT,
      silent: true,
      diskSpaceProbe: () => 10000,
    });

    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("factory run rejects invalid pipeline.yaml from task worktree at startup", async () => {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const task = "wt-run-invalid";
    const orchFolder = ".factory/tasks";

    const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "# Intent\nTest intent.", "utf8");

    const branch = taskBranch(task);
    tmpRepo.createBranch(branch);
    const wtPath = getTaskWorktreePath(tmpRepo.dir, task);
    tmpRepo.createWorktree(branch, wtPath);

    // Invalid pipeline schema inside task worktree
    const wtTaskDir = path.join(wtPath, orchFolder, task);
    fs.mkdirSync(wtTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(wtTaskDir, "pipeline.yaml"),
      "limits:\n  maxIterations: 'bad'\n",
      "utf8"
    );

    const exitCode = await runFactory({
      repoRoot: tmpRepo.dir,
      taskOrIntent: task,
      pluginRoot: PLUGIN_ROOT,
    });

    // Fails (exit 1) because preflight / config load catches the invalid pipeline from task worktree
    expect(exitCode).toBe(1);
  });
});
