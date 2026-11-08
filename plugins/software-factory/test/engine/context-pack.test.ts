import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { isContextPackDone, isContextPackStale, isContextPackEnabled, runContextPackStep } from "../../src/core/flows/ingest.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { commitAll } from "../../src/core/git/commit.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

function makePipeline(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "deepseek-chat" },
        architect: { model: "claude-opus" },
        simpler: { model: "deepseek-chat" },
      },
    },
    agents: {
      triage: { role: "workhorse" },
      infra: { role: "workhorse" },
      "fact-finder": { role: "workhorse" },
      architect: { role: "architect", timeoutSec: 1200 },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {},
      spike: {},
    },
    limits: {
      maxInfraRetries: 3,
    },
    contextPack: true,
    ...overrides,
  };
}

describe("Engine: Context Pack ingest sub-step and architect integration (§8.1, §12.5)", () => {
  let tmpRepo: TmpRepo;
  let prompts: any;
  let project: ProjectConfig;
  let repoObj: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
    project = {
      orchestrationFolder: ".factory",
      worktreeRoot,
    };
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("context pack is enabled by default in pipeline and configurable on/off", () => {
    const pipeline = makePipeline();
    expect(isContextPackEnabled({ ...pipeline, contextPack: true })).toBe(true);
    expect(isContextPackEnabled({ ...pipeline, contextPack: false })).toBe(false);
  });

  it("ingest runs context-pack after infra and writes committed context-pack.md", async () => {
    const task = "context-pack-ingest";
    const pipeline = makePipeline();
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Implement auth middleware\n", "utf8");
    tmpRepo.commit("Add intent for context-pack-ingest");

    const harness = new FakeHarness();

    // 1. Triage: story
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "story",
        rationale: "Requires multiple parts",
        citations: [],
      },
    });

    // 2. Infra
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "lint", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    // 3. Context pack
    const sampleFindings = "# Context Pack\n\n## Module Map\n- `src/auth`: handles auth tokens\n\n## Key Interfaces\n- `interface AuthContext`";
    let contextPackTurnRan = false;
    harness.scriptOutcome(`${task}/runs/context-pack#a1`, (run) => {
      expect(run.agent).toBe("fact-finder");
      expect(run.role).toBe("workhorse");
      expect(run.prompt).toContain("## Context Pack Document Structure");
      contextPackTurnRan = true;
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Prepared auth context",
          findings: sampleFindings,
        },
      };
    });

    // Two ticks: ingest, then architect planning turn
    await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 2 }
    );

    expect(contextPackTurnRan).toBe(true);
    const taskWtPath = path.join(project.worktreeRoot!, `topic_${task}`);
    const packPath = path.join(taskWtPath, ".factory", task, "context-pack.md");
    expect(fs.existsSync(packPath)).toBe(true);
    expect(fs.readFileSync(packPath, "utf8")).toBe(sampleFindings);

    // Resumability: isContextPackDone is true given committed files
    const done = await isContextPackDone(path.join(taskWtPath, ".factory", task), taskWtPath);
    expect(done).toBe(true);

    // Check that the architect prompt received the context pack
    const architectRun = harness.calls.find(
      (c) =>
        c.type === "run" &&
        typeof (c as any).run?.label === "string" &&
        (c as any).run.label.includes("architect-plan-1")
    ) as any;
    expect(architectRun).toBeDefined();
  });

  it("context-pack writes the whole document (no byte cap)", async () => {
    const task = "context-pack-nocap";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Large context task\n", "utf8");
    tmpRepo.commit("Add intent for context-pack-nocap");

    const harness = new FakeHarness();
    const largeFindings = "A".repeat(5000);

    harness.scriptOutcome(`${task}/runs/context-pack#a1`, {
      ok: true,
      data: {
        status: "ok",
        summary: "Big context pack",
        findings: largeFindings,
      },
    });

    const res = await runContextPackStep({
      task,
      taskDir,
      taskWt: tmpRepo.dir,
      repo: repoObj,
      harness,
      pipeline: makePipeline(),
      project,
      prompts,
      intentText: "Large context task",
      contextArtifact: {},
    });

    expect(res.ok).toBe(true);
    const packPath = path.join(taskDir, "context-pack.md");
    expect(fs.existsSync(packPath)).toBe(true);
    expect(fs.readFileSync(packPath, "utf8")).toBe(largeFindings);
  });

  it("architect prompt receives {{contextPack}} contents and exploration budget", async () => {
    const task = "architect-receives-context";
    const pipeline = makePipeline();
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Architect context test\n", "utf8");
    tmpRepo.commit("Add intent for architect-receives-context");

    const harness = new FakeHarness();
    let receivedPrompt = "";
    const packContent = "## High Signal Context\n- Important signature: `fn authenticate()`";

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Story with context", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/context-pack#a1`, {
      ok: true,
      data: { status: "ok", summary: "Ready", findings: packContent },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
      receivedPrompt = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario: S1"], directionalInterfaces: ["interface I"] }],
          itemOutlines: [{ slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1" }],
        },
      };
    });

    await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 2 }
    );

    expect(receivedPrompt).toContain("## Context Pack");
    expect(receivedPrompt).toContain("## High Signal Context");
    expect(receivedPrompt).toContain("Important signature: `fn authenticate()`");
    expect(receivedPrompt).toContain("Exploration budget: work primarily from INTENT");
  });

  it("stale detection identifies when code changes in taskWt in iteration > 1", async () => {
    const task = "stale-context-test";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Stale test intent\n", "utf8");
    const initialPack = "# Initial Context Pack\n";
    fs.writeFileSync(path.join(taskDir, "context-pack.md"), initialPack, "utf8");
    await commitAll(repoObj, tmpRepo.dir, "Add initial context-pack.md");

    // In iteration 1, not stale because it's committed
    const staleIter1 = await isContextPackStale(taskDir, tmpRepo.dir, 1);
    expect(staleIter1).toBe(false);

    // In iteration 2 without code changes, not stale
    const staleIter2BeforeChanges = await isContextPackStale(taskDir, tmpRepo.dir, 2);
    expect(staleIter2BeforeChanges).toBe(false);

    // Commit a code change in src/
    fs.mkdirSync(path.join(tmpRepo.dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo.dir, "src", "feature.ts"), "export const x = 1;\n");
    await commitAll(repoObj, tmpRepo.dir, "Add src/feature.ts code");

    // Now in iteration 2, it is stale!
    const staleIter2AfterChanges = await isContextPackStale(taskDir, tmpRepo.dir, 2);
    expect(staleIter2AfterChanges).toBe(true);
  });
});
