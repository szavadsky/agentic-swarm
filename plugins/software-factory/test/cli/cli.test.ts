import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { parseCliArgs, resolveTaskSlug } from "../../src/cli/index.js";
import { runInit } from "../../src/cli/init.js";
import { runSteer } from "../../src/cli/steer.js";
import { runStatus } from "../../src/cli/status.js";
import { runPreflight } from "../../src/cli/preflight.js";
import { acquireRunLock, isRunLockFree } from "../../src/cli/lock.js";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");

describe("CLI Argument Parsing & Slug Resolution", () => {
  it("resolves task slugs from paths or names", () => {
    expect(resolveTaskSlug("tasks/feature-alpha/INTENT.md")).toBe("feature-alpha");
    expect(resolveTaskSlug(".factory/tasks/feature-beta/INTENT.md")).toBe("feature-beta");
    expect(resolveTaskSlug("feature-gamma")).toBe("feature-gamma");
  });

  it("parses CLI flags and positional commands", () => {
    const parsedRun = parseCliArgs([
      "run",
      "tasks/feature-1/INTENT.md",
      "--repo=/tmp/my-repo",
      "--max-iterations",
      "10",
    ]);
    expect(parsedRun.command).toBe("run");
    expect(parsedRun.taskOrIntent).toBe("tasks/feature-1/INTENT.md");
    expect(parsedRun.repo).toBe("/tmp/my-repo");
    expect(parsedRun.maxIterations).toBe(10);

    const parsedSteer = parseCliArgs(["steer", "my-task", "Proceed with plan B"]);
    expect(parsedSteer.command).toBe("steer");
    expect(parsedSteer.taskOrIntent).toBe("my-task");
    expect(parsedSteer.steerText).toBe("Proceed with plan B");

    const parsedHelp = parseCliArgs(["--help"]);
    expect(parsedHelp.help).toBe(true);
  });
});

describe("Run Lock Management", () => {
  it("manages exclusive lock acquisition and release", () => {
    const tmp = createTmpRepo();
    try {
      const task = "lock-test-task";
      expect(isRunLockFree(tmp.dir, task).free).toBe(true);

      const handle1 = acquireRunLock(tmp.dir, task);
      expect(handle1).not.toBeNull();
      expect(isRunLockFree(tmp.dir, task).free).toBe(false);

      // Second acquire fails
      const handle2 = acquireRunLock(tmp.dir, task);
      expect(handle2).toBeNull();

      // Release frees the lock
      handle1!.release();
      expect(isRunLockFree(tmp.dir, task).free).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("CLI Commands Integration", () => {
  it("factory init creates .factory/project.yaml and commits it", async () => {
    const tmp = createTmpRepo();
    try {
      const code = await runInit({
        repoRoot: tmp.dir,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });
      expect(code).toBe(0);

      const projectPath = path.join(tmp.dir, ".factory", "project.yaml");
      expect(fs.existsSync(projectPath)).toBe(true);

      // Verify idempotent second run
      const code2 = await runInit({
        repoRoot: tmp.dir,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });
      expect(code2).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });

  it("factory steer writes timestamped markdown file to fromuserpending", async () => {
    const tmp = createTmpRepo();
    try {
      await runInit({ repoRoot: tmp.dir, pluginRoot: PLUGIN_ROOT, silent: true });

      const task = "steer-test-task";
      const directive = "Please prioritize edge case tests.";
      const code = await runSteer({
        repoRoot: tmp.dir,
        task,
        text: directive,
        silent: true,
      });
      expect(code).toBe(0);

      // Default orchestrationFolder is .factory/tasks
      const steerDir = path.join(tmp.dir, ".factory/tasks", task, "steer/fromuserpending");
      expect(fs.existsSync(steerDir)).toBe(true);

      const files = fs.readdirSync(steerDir);
      expect(files.length).toBe(1);
      const file = files[0];
      expect(file).toBeDefined();
      expect(file!.endsWith(".md")).toBe(true);

      const content = fs.readFileSync(path.join(steerDir, file!), "utf8");
      expect(content).toContain(directive);
    } finally {
      tmp.cleanup();
    }
  });

  it("factory preflight validates cleanliness and configuration", async () => {
    const tmp = createTmpRepo();
    try {
      await runInit({ repoRoot: tmp.dir, pluginRoot: PLUGIN_ROOT, silent: true });

      const task = "preflight-test-task";
      const intentPath = path.join(tmp.dir, ".factory/tasks", task, "INTENT.md");
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, "# Intent\nTest goal.", "utf8");

      const res = await runPreflight({
        repoRoot: tmp.dir,
        task,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });

      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);

      // Introduce an uncommitted dirty file outside INTENT.md
      tmp.writeFile("dirty-code.ts", "const x = 1;");
      const dirtyRes = await runPreflight({
        repoRoot: tmp.dir,
        task,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });

      expect(dirtyRes.ok).toBe(false);
      expect(dirtyRes.errors.some((e) => e.includes("cleanliness"))).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  it("factory status outputs derived state", async () => {
    const tmp = createTmpRepo();
    try {
      await runInit({ repoRoot: tmp.dir, pluginRoot: PLUGIN_ROOT, silent: true });

      const task = "status-test-task";
      const taskDir = path.join(tmp.dir, ".factory/tasks", task);
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Intent\nTest goal.", "utf8");

      const code = await runStatus({
        repoRoot: tmp.dir,
        task,
      });
      expect(code).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });
});
