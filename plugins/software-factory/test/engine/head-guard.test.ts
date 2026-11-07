import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { git } from "../../src/core/git/exec.js";
import { AsyncMutex } from "../../src/core/mutex.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

describe("Engine: HEAD guard resilience (§7)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("detects when an agent commits and resets --soft to before.sha, keeping changes staged", async () => {
    const task = "guard-commit-test";
    const itemSlug = "item-commit";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const recordsDir = path.join(taskDir, "items", itemSlug, "steps");
    fs.mkdirSync(recordsDir, { recursive: true });

    const itemBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(itemBranch);

    const initialShaRes = await git(childWt, ["rev-parse", "HEAD"]);
    const initialSha = initialShaRes.stdout.trim();

    const harness = new FakeHarness();

    // Script agent to perform an unauthorized git commit during its turn
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, async (run) => {
      fs.writeFileSync(path.join(run.cwd, "illegal.txt"), "agent created content\n");
      await git(run.cwd, ["add", "illegal.txt"]);
      await git(run.cwd, ["commit", "-m", "agent unauthorized commit"]);
      return { ok: true, data: { status: "ok", summary: "Finished work" } };
    });

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {},
        spike: {},
      },
      limits: {},
    };

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const repoObj = {
      mainRoot: tmpRepo.dir,
      worktreeRoot: project.worktreeRoot,
      writeLock: new AsyncMutex(),
    };

    const stepRes = await runAgentStep({
      task,
      item: itemSlug,
      stepId: "develop",
      agent: "developer",
      cwd: childWt,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {},
    });

    expect(stepRes.headMoved).toBe(true);
    expect(stepRes.ok).toBe(true);

    // Verify file content is kept and committed properly by engine
    const fileContent = fs.readFileSync(path.join(childWt, "illegal.txt"), "utf8");
    expect(fileContent).toBe("agent created content\n");

    // Verify the latest commit message is the engine's canonical commit (§6.3 Invariant 3)
    const logRes = await git(childWt, ["log", "-1", "--format=%s"]);
    expect(logRes.stdout.trim()).toBe(`factory(${itemSlug}): develop a1 [ok]`);
  });

  it("detects when an agent switches branch and restores original branch, keeping changes", async () => {
    const task = "guard-branch-test";
    const itemSlug = "item-branch";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const recordsDir = path.join(taskDir, "items", itemSlug, "steps");
    fs.mkdirSync(recordsDir, { recursive: true });

    const itemBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(itemBranch);

    const harness = new FakeHarness();

    // Script agent to switch branch illegally during turn
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, async (run) => {
      fs.writeFileSync(path.join(run.cwd, "modified.txt"), "some changes\n");
      // Create and checkout an unauthorized rogue branch
      await git(run.cwd, ["checkout", "-b", "rogue-branch"]);
      return { ok: true, data: { status: "ok", summary: "Finished work on rogue branch" } };
    });

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {},
        spike: {},
      },
      limits: {},
    };

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    };

    const prompts = {
      agentDefinition: (ag: string) => ({ body: `Agent ${ag}`, tools: ["edit", "bash"], description: ag }),
      render: (frag: string, vars: Record<string, string>) => `${frag}\n${JSON.stringify(vars)}`,
      placeholders: () => [],
    };

    const repoObj = {
      mainRoot: tmpRepo.dir,
      worktreeRoot: project.worktreeRoot,
      writeLock: new AsyncMutex(),
    };

    const stepRes = await runAgentStep({
      task,
      item: itemSlug,
      stepId: "develop",
      agent: "developer",
      cwd: childWt,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {},
    });

    expect(stepRes.branchChanged).toBe(true);

    // Verify branch was restored to itemBranch
    const branchRes = await git(childWt, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(branchRes.stdout.trim()).toBe(itemBranch);

    // Verify changes are kept
    expect(fs.existsSync(path.join(childWt, "modified.txt"))).toBe(true);
  });
});
