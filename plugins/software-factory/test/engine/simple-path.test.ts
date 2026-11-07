import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, StepMetaArtifact } from "../../src/core/artifacts.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { readYaml } from "../../src/core/records/io.js";

describe("Engine: Simple path (§8.1.4, Finding 1 & 2)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("simple path commits changes on scratch, passes gates, merges to topic/{task}, and asserts files land on the task branch", async () => {
    const task = "simple-add";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Add simple math helper\n", "utf8");
    tmpRepo.commit("Add intent for simple-add");

    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot,
    });

    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot,
    };

    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        infra: { role: "workhorse" },
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: {
        simpleMaxProdLines: 150,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const harness = new FakeHarness();

    // 1. Triage: classifies as simple
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: {
        kind: "simple",
        rationale: "Small self-contained helper function",
        citations: [],
      },
    });

    // 2. Infra
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "check", command: "true" }],
        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
      },
    });

    // 3. Simple-implement: developer writes helper.ts in scratch worktree
    const helperContent = "export const add = (a: number, b: number): number => a + b;\n";
    harness.scriptOutcome(`${task}/runs/simple-implement#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "helper.ts"), helperContent, "utf8");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Added math helper function",
          evidence: ["helper.ts created and verified"],
        },
      };
    });

    const result = await runTask(
      {
        harness,
        repo: repoObj,
        project,
        pipelineFor: async () => pipeline,
        prompts,
      },
      task
    );

    expect(result.status).toBe("done");
    expect(result.exitCode).toBe(0);

    // Verify observable outcome: helper.ts MUST exist on topic/{task} worktree
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    expect(fs.existsSync(taskWtPath)).toBe(true);

    const helperFilePath = path.join(taskWtPath, "helper.ts");
    expect(fs.existsSync(helperFilePath)).toBe(true);
    expect(fs.readFileSync(helperFilePath, "utf8")).toBe(helperContent);

    // Verify git log on topic/{task} contains simple implementation and merge commit
    const logRes = tmpRepo.git(["log", "--oneline", `topic/${task}`]);
    expect(logRes.stdout).toContain("factory: merge simple implementation");

    // Verify simple-implement step record has meta.status === "ok"
    const runsDir = path.join(taskWtPath, orchFolder, task, "runs");
    const simpleRecordDir = path.join(runsDir, "003-simple-implement-a1");
    expect(fs.existsSync(simpleRecordDir)).toBe(true);
    const meta = await readYaml<StepMetaArtifact>(path.join(simpleRecordDir, "meta.yaml"));
    expect(meta.status).toBe("ok");

    // Verify derived task state reports done
    const state = await deriveTaskState({
      taskDir: path.join(taskWtPath, orchFolder, task),
      task,
      taskWt: taskWtPath,
      pipeline,
    });
    expect(state.status).toBe("done");
  });
});
