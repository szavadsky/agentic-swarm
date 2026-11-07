import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initFactoryRuntimeTmp, getFactoryTmpDir } from "../src/core/runtime-tmp.js";
import { runProcess } from "../src/core/proc.js";

describe("Factory Runtime Temporary Directory (§5)", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-tmp-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it("initializes {worktreeRoot}/.factory-runtime/tmp/ and sets TMPDIR env vars", () => {
    const handle = initFactoryRuntimeTmp(tempRoot);
    try {
      const expectedTmp = path.join(tempRoot, ".factory-runtime", "tmp");
      expect(handle.tmpDir).toBe(expectedTmp);
      expect(fs.existsSync(expectedTmp)).toBe(true);
      expect(getFactoryTmpDir()).toBe(expectedTmp);
      expect(process.env.TMPDIR).toBe(expectedTmp);
      expect(process.env.TMP).toBe(expectedTmp);
      expect(process.env.TEMP).toBe(expectedTmp);
    } finally {
      handle.restore();
    }
  });

  it("purges entries older than runStartTime and preserves newer entries", () => {
    const expectedTmp = path.join(tempRoot, ".factory-runtime", "tmp");
    fs.mkdirSync(expectedTmp, { recursive: true });

    const oldFile = path.join(expectedTmp, "old-pytest.tmp");
    fs.writeFileSync(oldFile, "old content");
    // Set old mtime (10 seconds ago)
    const tenSecAgo = new Date(Date.now() - 10_000);
    fs.utimesSync(oldFile, tenSecAgo, tenSecAgo);

    const oldDir = path.join(expectedTmp, "old-dir");
    fs.mkdirSync(oldDir);
    fs.utimesSync(oldDir, tenSecAgo, tenSecAgo);

    const runStartTime = Date.now() - 1_000; // 1 second ago

    const newFile = path.join(expectedTmp, "new-file.tmp");
    fs.writeFileSync(newFile, "new content");

    const handle = initFactoryRuntimeTmp(tempRoot, runStartTime);
    try {
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(oldDir)).toBe(false);
      expect(fs.existsSync(newFile)).toBe(true);
    } finally {
      handle.restore();
    }
  });

  it("runProcess inherits factory TMPDIR environment variables", async () => {
    const handle = initFactoryRuntimeTmp(tempRoot);
    try {
      const res = await runProcess({
        cmd: ["bash", "-c", "echo $TMPDIR"],
        cwd: tempRoot,
      });
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(handle.tmpDir);
    } finally {
      handle.restore();
    }
  });

  it("runAgentStep succeeds when path contains /.factory-runtime/tmp (fix 1)", async () => {
    // Set up repo and task inside a directory structure with .factory-runtime/tmp
    const nestedDir = path.join(tempRoot, "wt", ".factory-runtime", "tmp", "work-repo");
    fs.mkdirSync(nestedDir, { recursive: true });

    const { Repo } = await import("../src/core/git/repo.js");
    const { runAgentStep } = await import("../src/core/flows/step-runner.js");
    const { FakeHarness } = await import("../src/harness/fake/fake-harness.js");
    const { loadPromptLibrary } = await import("../src/core/prompts.js");
    const { git } = await import("../src/core/git/exec.js");

    await git(nestedDir, ["init"]);
    await git(nestedDir, ["config", "user.name", "Test"]);
    await git(nestedDir, ["config", "user.email", "test@test.local"]);
    fs.writeFileSync(path.join(nestedDir, "README.md"), "# Repo\n");
    await git(nestedDir, ["add", "README.md"]);
    await git(nestedDir, ["commit", "-m", "initial commit"]);

    const task = "test-task";
    const taskDir = path.join(nestedDir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const repo = new Repo({ mainRoot: nestedDir, worktreeRoot: path.join(tempRoot, "wt-root") });
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Quick fix",
        citations: [
          {
            file: "README.md",
            lines: "1-1",
            anchors: ["Repo"],
            summary: "Title citation",
          },
        ],
      },
    });

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../agents"),
      overrideDirs: [],
    });

    const res = await runAgentStep({
      task,
      stepId: "triage",
      stepFragment: "steps/triage",
      agent: "triage",
      cwd: nestedDir,
      taskWt: nestedDir,
      taskDir,
      recordsDir,
      repo,
      harness,
      pipeline: {
        models: { roles: { workhorse: { model: "m" } } },
        agents: { triage: { role: "workhorse" } },
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: {},
      },
      project: { orchestrationFolder: ".factory", worktreeRoot: "../wt" },
      prompts,
      promptVars: { task, intent: "fix", triageCriteria: "crit" },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
  });
});
