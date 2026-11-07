import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { tickItemMachine } from "../../src/core/flows/item-machine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, ReviewArtifact } from "../../src/core/artifacts.js";
import { deriveItemState } from "../../src/core/derive/item.js";

describe("Engine: Fix loop, consult, and alt-on-retry (§8.2, §8.5, §12.4)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("handles fix loop leading to consult decision and escalation", async () => {
    const task = "fix-loop-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-fix";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });

    // Initial assignment
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify(
        {
          slug: itemSlug,
          kind: "dev",
          title: "Fix loop item",
          assignment: "Implement feature",
          milestone: "m1",
          wave: 1,
          deps: [],
        },
        null,
        2
      )
    );

    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);

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
          "alt-workhorse": { model: "deepseek-chat" },
          architect: { model: "deepseek-reasoner" },
          simpler: { model: "deepseek-chat" },
          "task-escalation": { model: "claude-sonnet" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
        qa: { role: "alt-workhorse" },
        reviewer: { role: "alt-workhorse" },
        architect: { role: "architect" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "test-first", agent: "developer", role: "workhorse" },
              { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxFixRounds: 1, // Only 1 fix round before consult
        maxConsultsPerItem: 3,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // 1. test-first step ok
    harness.scriptOutcome(`${task}/items/${itemSlug}/test-first#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "test.ts"), "test code");
      return { ok: true, data: { status: "ok", summary: "Tests created" } };
    });

    // 2. develop step ok, then fix-round develop with changes
    let developCalls = 0;
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, (run) => {
      developCalls++;
      fs.writeFileSync(path.join(run.cwd, "impl.ts"), `code version ${developCalls}`);
      return { ok: true, data: { status: "ok", summary: `Code written v${developCalls}` } };
    });

    // 3. review step requests fix twice (second fix exhausts maxFixRounds=1)
    let reviewCalls = 0;
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, () => {
      reviewCalls++;
      return {
        ok: true,
        data: {
          status: "changes_requested",
          summary: `Needs changes round ${reviewCalls}`,
          suggestions: [
            { id: `s${reviewCalls}`, disposition: "fix", summary: `Fix implementation bug round ${reviewCalls}` },
          ],
        },
      };
    });

    // 4. Architect consult: decides "escalate"
    harness.scriptOutcome(`${task}/runs/consult-${itemSlug}#a1`, {
      ok: true,
      data: {
        id: "dec-1",
        context: "item",
        decision: "escalate",
        rationale: "Escalate to advanced role",
        timestamp: new Date().toISOString(),
      },
    });

    // Execute step 1: test-first
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Execute step 2: develop
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Execute step 3: review (requests fix)
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Next tick: first fix re-entry runs develop (round 1 of maxFixRounds=1)
    const fixTick = await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });
    expect(fixTick.stepRan).toBe("develop");
    expect(fixTick.consulted).toBeUndefined();

    // Next tick: review requests fix again
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Next tick: upcoming round 2 exceeds maxFixRounds=1 -> consult -> escalate
    const consultTick = await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });
    expect(consultTick.consulted).toBe(true);

    // Verify item is now derived as escalated (§8.5, §12.4)
    const derived = await deriveItemState({
      taskDir,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
    });

    expect(derived.isEscalated).toBe(true);
  });

  it("performs alt-on-retry role swap from fix round 2 (§12.4)", async () => {
    const task = "role-swap-test";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "item-swap";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });

    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify(
        {
          slug: itemSlug,
          kind: "dev",
          title: "Role swap item",
          assignment: "Implement feature",
          milestone: "m1",
          wave: 1,
          deps: [],
        },
        null,
        2
      )
    );

    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);

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
          workhorse: { model: "model-workhorse" },
          "alt-workhorse": { model: "model-alt-workhorse" },
          architect: { model: "model-architect" },
          simpler: { model: "model-simpler" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
        reviewer: { role: "alt-workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse", retryRole: "alt-workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxFixRounds: 3,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // Round 1: develop (workhorse)
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, (run) => {
      expect(run.role).toBe("workhorse");
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "v1");
      return { ok: true, data: { status: "ok", summary: "v1 done" } };
    });

    // Round 1: review (alt-workhorse) requests fix
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "Need fix",
        suggestions: [{ id: "s1", disposition: "fix", summary: "Please fix" }],
      },
    });

    // Round 2: develop with retryRole (alt-workhorse) (§12.4)
    let round2DevRole: string | undefined;
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, (run) => {
      round2DevRole = run.role;
      fs.writeFileSync(path.join(run.cwd, "file.txt"), "v2");
      return { ok: true, data: { status: "ok", summary: "v2 done" } };
    });

    // Run Round 1 develop
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Run Round 1 review
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // Run Round 2 develop (alt-on-retry)
    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    // In Round 2, developer rotated to retryRole "alt-workhorse"
    expect(round2DevRole).toBe("alt-workhorse");
  });
});
