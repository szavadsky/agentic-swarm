import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { tickItemMachine } from "../../src/core/flows/item-machine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

// PsPost5 item 4: fix-round re-entry for ANY agent. A fact-finder fix round
// must carry the Review Feedback section — never the byte-identical original
// prompt (which re-ran the full probe and diverged in launch 5).

function makePipeline(): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "deepseek-chat" },
        "alt-workhorse": { model: "deepseek-chat" },
        architect: { model: "deepseek-reasoner" },
        simpler: { model: "deepseek-chat" },
      },
    },
    agents: {
      "fact-finder": { role: "workhorse" },
      reviewer: { role: "alt-workhorse" },
    },
    flows: {
      simple: { steps: [] },
      story: {},
      spike: {
        "fact-finder": {
          fixLoopTo: "research",
          steps: [
            { id: "research", agent: "fact-finder", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "alt-workhorse" },
          ],
        },
      },
    },
    limits: { maxStepAttempts: 3, maxFixRounds: 3, maxConsultsPerItem: 3 },
  };
}

describe("Engine: fact-finder fix-round re-entry carries feedback (PsPost5 item 4)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("research fix round input differs from round 1 and contains the fix list", async () => {
    const task = "fixround-test";
    const itemSlug = "item-probe";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "fact-finder", title: "Probe", assignment: "Probe X", milestone: "m1", wave: 1, deps: [] }, null, 2)
    );
    tmpRepo.commit("task scaffolding");
    tmpRepo.createBranch(`topic/${task}`);
    const childWt = tmpRepo.createWorktree(`topic/${task}--${itemSlug}`);
    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const pipeline = makePipeline();
    const harness = new FakeHarness();

    const researchPrompts: string[] = [];
    harness.scriptOutcome(`${task}/items/${itemSlug}/research#a1`, (run) => {
      researchPrompts.push((run as { prompt: string }).prompt);
      return { ok: true, data: { status: "ok", summary: "probe done", findings: "f" } };
    });
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "needs fixes",
        suggestions: [{ id: "s1", disposition: "fix", summary: "Cover the unparsed-tool case" }],
      },
    });

    const tick = () =>
      tickItemMachine({
        task, itemSlug, parentBranch: `topic/${task}`, taskWt: tmpRepo.dir,
        childWt, taskDir, repo: repoObj, harness, pipeline, project, prompts,
      });
    await tick(); // research a1
    await tick(); // review a1 → fix requested
    const fixTick = await tick(); // research fix round
    expect(fixTick.stepRan).toBe("research");

    expect(researchPrompts.length).toBe(2);
    expect(researchPrompts[1]).not.toBe(researchPrompts[0]);
    expect(researchPrompts[1]).toContain("Review Feedback");
    expect(researchPrompts[1]).toContain("[FIX] Cover the unparsed-tool case");
  });
});
