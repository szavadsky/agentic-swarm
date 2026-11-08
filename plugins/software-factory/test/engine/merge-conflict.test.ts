import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { mergeItem } from "../../src/core/flows/merge-path.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { DerivedItemState } from "../../src/core/derive/item.js";

describe("Engine: Merge path conflict -> integrate (§7)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("handles merge conflict when merging parent into child and resolves via developer integrate step", async () => {
    const task = "merge-conflict-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-conflict";

    // 1. Base commit on main
    tmpRepo.writeFile("shared.txt", "Base initial content\n");
    tmpRepo.commit("Add shared.txt on main");

    // 2. Create child worktree from main BEFORE parent commits
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "shared.txt"), "Child line 1\nChild line 2\n", "utf8");
    await execGit(childWt, ["add", "shared.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit on shared.txt"]);

    // 3. Now branch parentBranch from main and make conflicting commit
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("shared.txt", "Parent line 1\nParent line 2\n");
    tmpRepo.commit("Parent commit modifying shared.txt");

    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: {},
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // Script developer integrate step to resolve conflict in childWt
    let integrateRan = false;
    harness.scriptOutcome(`${task}/items/${itemSlug}/integrate#a1`, async (run) => {
      integrateRan = true;
      // Developer resolves conflict in working tree
      fs.writeFileSync(
        path.join(run.cwd, "shared.txt"),
        "Resolved: Parent line 1 + Child line 2\n",
        "utf8"
      );
      return {
        ok: true,
        data: { status: "ok", summary: "Conflict resolved" },
      };
    });

    const item: DerivedItemState = {
      slug: itemSlug,
      kind: "dev",
      title: "Conflict item",
      wave: 1,
      deps: [],
      status: "ready",
      branch: childBranch,
      records: [],
      currentAttempt: 1,
      currentFixRound: 1,
      isEscalated: false,
      freshSeries: false,
      interruptionCount: 0,
      suggestionFingerprints: [],
      decisionFingerprints: [],
      failingCheckFingerprints: [],
      consultCount: 0,
    };

    const taskWt = tmpRepo.dir;
    tmpRepo.git(["checkout", parentBranch]);

    const result = await mergeItem({
      task,
      item,
      parentBranch,
      taskWt,
      childWt,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(true);
    expect(result.conflictResolved).toBe(true);
    expect(integrateRan).toBe(true);
    // Verify parent branch has the resolved content
    const mergedContent = fs.readFileSync(path.join(taskWt, "shared.txt"), "utf8");
    expect(mergedContent).toContain("Resolved: Parent line 1 + Child line 2");

    // Verify no commit on child branch ever contained conflict markers
    const commits = tmpRepo.git(["log", "--format=%H", childBranch]).stdout.trim().split("\n");
    for (const c of commits) {
      const show = tmpRepo.git(["show", `${c}:shared.txt`], { allowFail: true });
      if (show.code === 0) {
        expect(show.stdout).not.toContain("<<<<<<<");
        expect(show.stdout).not.toContain("=======");
        expect(show.stdout).not.toContain(">>>>>>>");
      }
    }
  });

  it("aborts merge and restores pre-merge tip when integrate fails or leaves conflict markers", async () => {
    const task = "merge-abort-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-fail";

    // 1. Base commit on main
    tmpRepo.writeFile("conflict.txt", "Initial content\n");
    tmpRepo.commit("Add conflict.txt on main");

    // 2. Child worktree from main
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "conflict.txt"), "Child unique content\n", "utf8");
    await execGit(childWt, ["add", "conflict.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit"]);
    const preMergeHeadRes = await execGit(childWt, ["rev-parse", "HEAD"]);
    const preMergeHead = preMergeHeadRes.stdout.trim();

    // 3. Parent commit on topic branch
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("conflict.txt", "Conflicting parent content\n");
    tmpRepo.commit("Parent conflicting commit");

    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };
    const pipeline: PipelineConfig = {
      models: { roles: { workhorse: { model: "m" } } },
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
      limits: {},
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();
    // Script integrate to fail
    harness.scriptOutcome(`${task}/items/${itemSlug}/integrate#a1`, {
      ok: false,
      error: "Could not resolve conflicts",
    });

    const item: DerivedItemState = {
      slug: itemSlug,
      kind: "dev",
      title: "Fail item",
      wave: 1,
      deps: [],
      status: "ready",
      branch: childBranch,
      records: [],
      currentAttempt: 1,
      currentFixRound: 1,
      isEscalated: false,
      freshSeries: false,
      interruptionCount: 0,
      suggestionFingerprints: [],
      decisionFingerprints: [],
      failingCheckFingerprints: [],
      consultCount: 0,
    };

    const result = await mergeItem({
      task,
      item,
      parentBranch,
      taskWt: tmpRepo.dir,
      childWt,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(false);

    // MERGE_HEAD must be gone (aborted)
    const mhCheck = await execGit(childWt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { allowFail: true });
    expect(mhCheck.code).not.toBe(0);

    // Pre-merge tip restored
    const currentHeadRes = await execGit(childWt, ["rev-parse", "HEAD"]);
    expect(currentHeadRes.stdout.trim()).toBe(preMergeHead);
    expect(fs.readFileSync(path.join(childWt, "conflict.txt"), "utf8")).toBe("Child unique content\n");

    // No commit on child branch contains conflict markers
    const commits = tmpRepo.git(["log", "--format=%H", childBranch]).stdout.trim().split("\n");
    for (const c of commits) {
      const show = tmpRepo.git(["show", `${c}:conflict.txt`], { allowFail: true });
      if (show.code === 0) {
        expect(show.stdout).not.toContain("<<<<<<<");
      }
    }
  });

  it("runs target-green on post-merge tree using target populated from developer record", async () => {
    const task = "merge-target-green-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-target";
    fs.mkdirSync(taskDir, { recursive: true });

    // Infra artifact with testRunner
    fs.writeFileSync(
      path.join(taskDir, "infra.yaml"),
      JSON.stringify({
        setup: [],
        gates: [{ id: "lint", command: "true" }],
        testRunner: { command: "exit 0", selectorArgs: [], junitArg: "" },
      })
    );

    // Base on main
    tmpRepo.writeFile("base.txt", "Base\n");
    tmpRepo.commit("Add base.txt on main");

    // Child branch from main
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const { git: execGit } = await import("../../src/core/git/exec.js");
    fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
    await execGit(childWt, ["add", "child.txt"]);
    await execGit(childWt, ["commit", "-m", "Child commit"]);

    // Parent branch with non-conflicting change (so tree changes on merge)
    const parentBranch = `topic/${task}`;
    tmpRepo.createBranch(parentBranch, "main");
    tmpRepo.git(["checkout", parentBranch]);
    tmpRepo.writeFile("parent.txt", "Parent new content\n");
    tmpRepo.commit("Parent new file modifying tree");

    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };
    const pipeline: PipelineConfig = {
      models: { roles: { workhorse: { model: "m" } } },
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
      limits: {},
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
    const harness = new FakeHarness();

    // Item with developer record containing target
    const item: DerivedItemState = {
      slug: itemSlug,
      kind: "dev",
      title: "Target item",
      wave: 1,
      deps: [],
      status: "ready",
      branch: childBranch,
      records: [
        {
          dirName: "001-develop-r1-a1",
          seq: 1,
          name: "develop",
          attempt: 1,
          fixRound: 1,
          meta: { seq: 1, name: "develop", attempt: 1, fixRound: 1, agent: "developer", role: "workhorse", models: ["m"], status: "ok", startedAt: new Date().toISOString() },
          output: {
            status: "ok",
            summary: "Done",
            target: { command: "true", selector: "test-feature" },
          },
        },
      ],
      currentAttempt: 1,
      currentFixRound: 1,
      isEscalated: false,
      freshSeries: false,
      interruptionCount: 0,
      suggestionFingerprints: [],
      decisionFingerprints: [],
      failingCheckFingerprints: [],
      consultCount: 0,
    };

    const result = await mergeItem({
      task,
      item,
      parentBranch,
      taskWt: tmpRepo.dir,
      childWt,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      taskDir,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpRepo.dir, "child.txt"))).toBe(true);
  });
});
