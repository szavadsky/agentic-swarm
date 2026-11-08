import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { tickItemMachine } from "../../src/core/flows/item-machine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

// PsPost5 items 2/3/6 + ShPost3 retry feedback: consult inputs carry the
// committed diffstat + failing check summaries + hydrated feedback; retry
// inputs carry the failing check + budget position; same-failure-twice
// consults early via the no-progress detector.

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
      developer: { role: "workhorse" },
      reviewer: { role: "alt-workhorse" },
      architect: { role: "architect" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {
        dev: {
          fixLoopTo: "develop",
          steps: [
            { id: "develop", agent: "developer", role: "workhorse", checks: ["size"] },
            { id: "review", agent: "reviewer", role: "alt-workhorse" },
          ],
        },
      },
      spike: {},
    },
    limits: { maxStepAttempts: 3, maxFixRounds: 3, maxConsultsPerItem: 3, storyMaxProdLines: 5 },
  };
}

describe("Engine: grounded consult and retry feedback (PsPost5 2/3/6, ShPost3)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function setup(task: string, itemSlug: string) {
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "dev", title: "Sized item", assignment: "Work", milestone: "m1", wave: 1, deps: [] }, null, 2)
    );
    tmpRepo.commit("task scaffolding");
    tmpRepo.createBranch(`topic/${task}`);
    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    return { taskDir, childWt, repoObj, project, prompts };
  }

  function tickOpts(s: ReturnType<typeof setup>, task: string, itemSlug: string, harness: FakeHarness, pipeline: PipelineConfig) {
    return {
      task, itemSlug, parentBranch: `topic/${task}`, taskWt: tmpRepo.dir,
      childWt: s.childWt, taskDir: s.taskDir, repo: s.repoObj, harness, pipeline, project: s.project, prompts: s.prompts,
    };
  }

  it("check-reject retry input contains the failing check and budget numbers", async () => {
    const task = "retry-feedback-test";
    const itemSlug = "item-retry";
    const s = setup(task, itemSlug);
    const harness = new FakeHarness();
    const pipeline = makePipeline();
    fs.mkdirSync(path.join(s.childWt, "src"), { recursive: true });

    let attempt = 0;
    const developScript = (run: { cwd: string }) => {
      attempt++;
      // Over-budget change: 10 prod lines vs limit 5.
      const code = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
      fs.writeFileSync(path.join(run.cwd, "src", "big.ts"), code, "utf8");
      return { ok: true as const, data: { status: "ok", summary: `attempt ${attempt}` } };
    };
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, developScript);
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a2`, developScript);

    const tick = () => tickItemMachine(tickOpts(s, task, itemSlug, harness, pipeline));
    await tick(); // develop a1 → rejected by size
    await tick(); // develop a2 retry (feedback hydrated) → rejected again

    const runs = harness.calls.filter((c) => c.type === "run");
    expect(runs.length).toBe(2);
    const retryPrompt = (runs[1] as { type: "run"; run: { prompt: string } }).run.prompt;
    expect(retryPrompt).toContain("Failing check: size");
    expect(retryPrompt).toContain("10 prod lines changed vs storyMaxProdLines 5");
    expect(retryPrompt).toContain("Fix-or-escalate");
  });

  it("same-failure-twice consults early with grounded diff and feedback", async () => {
    const task = "consult-ground-test";
    const itemSlug = "item-consult";
    const s = setup(task, itemSlug);
    const harness = new FakeHarness();
    const pipeline = makePipeline();
    fs.mkdirSync(path.join(s.childWt, "src"), { recursive: true });

    const bigScript = (run: { cwd: string }) => {
      const code = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
      fs.writeFileSync(path.join(run.cwd, "src", "big.ts"), code, "utf8");
      return { ok: true as const, data: { status: "ok", summary: "big change" } };
    };
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, bigScript);
    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a2`, bigScript);
    let consultPrompt = "";
    harness.scriptOutcome(`${task}/runs/consult-${itemSlug}#a1`, (run) => {
      consultPrompt = (run as { prompt: string }).prompt;
      return {
        ok: true as const,
        data: { id: "dec-1", context: "item", decision: "retry-with-guidance", text: "shrink", rationale: "r", timestamp: new Date().toISOString() },
      };
    });

    const tick = () => tickItemMachine(tickOpts(s, task, itemSlug, harness, pipeline));
    await tick(); // develop a1 → rejected (size 10/5)
    await tick(); // develop a2 → rejected, same failure recorded
    const third = await tick(); // same-failure-twice → consult fires
    expect(third.consulted).toBe(true);

    // Consult prompt shows the committed diffstat (not empty) + failing check + feedback.
    expect(consultPrompt).toContain("src/big.ts");
    expect(consultPrompt).toContain("[size]");
    expect(consultPrompt).toContain("Failing check: size");
    expect(consultPrompt).not.toMatch(/## Review Feedback\n\nStep failed repeatedly/);
    // No-progress phrasing (not "attempt 3/2").
    expect(consultPrompt).toContain("Same failing check twice");
  });

  it("checks.yaml persists details for failing checks", async () => {
    const task = "checks-detail-test";
    const itemSlug = "item-checks";
    const s = setup(task, itemSlug);
    const harness = new FakeHarness();
    const pipeline = makePipeline();
    fs.mkdirSync(path.join(s.childWt, "src"), { recursive: true });

    harness.scriptOutcome(`${task}/items/${itemSlug}/develop#a1`, (run) => {
      const code = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
      fs.writeFileSync(path.join(run.cwd, "src", "big.ts"), code, "utf8");
      return { ok: true, data: { status: "ok", summary: "big" } };
    });

    await tickItemMachine(tickOpts(s, task, itemSlug, harness, pipeline));

    const relTaskDir = path.relative(tmpRepo.dir, s.taskDir);
    const stepsDir = path.join(s.childWt, relTaskDir, "items", itemSlug, "steps");
    const recDirs = fs.readdirSync(stepsDir);
    expect(recDirs.length).toBe(1);
    const checksYaml = fs.readFileSync(path.join(stepsDir, recDirs[0]!, "checks.yaml"), "utf8");
    expect(checksYaml).toContain("size");
    expect(checksYaml).toContain("changedLines");
    expect(checksYaml).toContain("limit");
  });
});
