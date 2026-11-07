import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { parseCliArgs, resolveTaskSlug } from "../../src/cli/index.js";
import { runInit } from "../../src/cli/init.js";
import { runSteer } from "../../src/cli/steer.js";
import { runStatus } from "../../src/cli/status.js";
import { runPreflight } from "../../src/cli/preflight.js";
import { acquireRunLock, isRunLockFree, getRunLockPath, resolveRuntimeDir } from "../../src/cli/lock.js";

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

  it("enforces lock exclusivity under concurrent acquisitions", async () => {
    const tmp = createTmpRepo();
    try {
      const task = "concurrent-lock-task";
      // Simulate two concurrent acquisition attempts
      const [h1, h2] = await Promise.all([
        Promise.resolve().then(() => acquireRunLock(tmp.dir, task)),
        Promise.resolve().then(() => acquireRunLock(tmp.dir, task)),
      ]);

      // Exactly one must succeed, the other must be null
      const acquiredCount = (h1 ? 1 : 0) + (h2 ? 1 : 0);
      expect(acquiredCount).toBe(1);

      const winner = h1 ?? h2;
      winner!.release();
      expect(isRunLockFree(tmp.dir, task).free).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  it("takes over stale lock from dead PID on same host and journals takeover", () => {
    const tmp = createTmpRepo();
    try {
      const task = "stale-lock-task";
      const lockPath = getRunLockPath(tmp.dir, task);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      // Stale lock with dead PID on current host
      const stalePayload = {
        pid: 9999999, // Guaranteed dead PID
        host: os.hostname(),
        start: new Date(Date.now() - 3600_000).toISOString(),
      };
      fs.writeFileSync(lockPath, JSON.stringify(stalePayload), "utf8");

      expect(isRunLockFree(tmp.dir, task).free).toBe(true);

      const taskDir = path.join(tmp.dir, ".factory/tasks", task);
      let takeoverNotified = false;
      const handle = acquireRunLock(tmp.dir, task, {
        taskDir,
        onTakeover: (info) => {
          takeoverNotified = true;
          expect(info.previousLock?.pid).toBe(9999999);
        },
      });

      expect(handle).not.toBeNull();
      expect(takeoverNotified).toBe(true);

      // Verify journal entry written
      const journalPath = path.join(taskDir, "journal.ndjson");
      expect(fs.existsSync(journalPath)).toBe(true);
      const journalContent = fs.readFileSync(journalPath, "utf8");
      expect(journalContent).toContain("lock_takeover");
      expect(journalContent).toContain("9999999");

      handle!.release();
    } finally {
      tmp.cleanup();
    }
  });

  it("refuses takeover when lock is held on a different host", () => {
    const tmp = createTmpRepo();
    try {
      const task = "remote-lock-task";
      const lockPath = getRunLockPath(tmp.dir, task);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      // Lock written by different host
      const remotePayload = {
        pid: 9999999,
        host: "foreign-host-worker.internal",
        start: new Date().toISOString(),
      };
      fs.writeFileSync(lockPath, JSON.stringify(remotePayload), "utf8");

      expect(isRunLockFree(tmp.dir, task).free).toBe(false);

      const handle = acquireRunLock(tmp.dir, task);
      expect(handle).toBeNull();
    } finally {
      tmp.cleanup();
    }
  });
});

describe("Runtime Directory & Untracked Files", () => {
  it("resolves runtime dir outside the main checkout and never writes inside repo", () => {
    const tmp = createTmpRepo();
    try {
      const runtimeDir = resolveRuntimeDir(tmp.dir);
      // Must be outside the repoRoot
      expect(runtimeDir.startsWith(tmp.dir)).toBe(false);

      const lockPath = getRunLockPath(tmp.dir, "test-task");
      expect(lockPath.startsWith(tmp.dir)).toBe(false);
      expect(lockPath).toContain(".factory-runtime");

      // Acquire lock and verify repo remains clean
      const handle = acquireRunLock(tmp.dir, "test-task");
      expect(handle).not.toBeNull();

      // Ensure no .factory-runtime was created inside tmp.dir
      expect(fs.existsSync(path.join(tmp.dir, ".factory-runtime"))).toBe(false);

      handle!.release();
    } finally {
      tmp.cleanup();
    }
  });

  it("factory init leaves no untracked files beyond .factory/project.yaml", async () => {
    const tmp = createTmpRepo();
    try {
      const code = await runInit({
        repoRoot: tmp.dir,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });
      expect(code).toBe(0);

      // Verify git status is completely clean (project.yaml committed)
      const status = execFileSync("git", ["status", "--porcelain", "-uall"], {
        cwd: tmp.dir,
        encoding: "utf8",
      }).trim();
      expect(status).toBe("");

      // Verify no untracked files
      const untracked = status.split("\n").filter((l) => l.startsWith("??"));
      expect(untracked.length).toBe(0);
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
  it("factory preflight fails when prompt fragments are missing or fail render", async () => {
    const tmp = createTmpRepo();
    try {
      await runInit({ repoRoot: tmp.dir, pluginRoot: PLUGIN_ROOT, silent: true });

      const task = "bad-prompt-task";
      const taskDir = path.join(tmp.dir, ".factory/tasks", task);
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Intent\nTest goal.", "utf8");

      // Task pipeline references a non-existent step fragment
      fs.writeFileSync(
        path.join(taskDir, "pipeline.yaml"),
        "flows:\n  simple:\n    steps:\n      - id: missing-step\n        agent: developer\n        stepFragment: steps/nonexistent-fragment-xyz\n",
        "utf8"
      );

      const res = await runPreflight({
        repoRoot: tmp.dir,
        task,
        pluginRoot: PLUGIN_ROOT,
        silent: true,
      });

      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.includes("nonexistent-fragment-xyz"))).toBe(true);
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
