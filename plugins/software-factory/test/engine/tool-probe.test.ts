import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

function basePipeline(): PipelineConfig {
  return {
    models: { roles: { workhorse: { model: "deepseek-chat" }, simpler: { model: "deepseek-chat" } } },
    agents: { developer: { role: "workhorse", tools: ["read", "bogus-tool"] } },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {},
      spike: {},
    },
    limits: { maxInfraRetries: 3 },
    tools: { defaults: ["edit", "bash"], structuredOutput: ["yield"] },
  } as unknown as PipelineConfig;
}

describe("Engine: tool-name probe fails fast", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => { tmpRepo = createTmpRepo(); });
  afterEach(() => { tmpRepo.cleanup(); });

  it("runTask throws naming unknown tools before any agent turn", async () => {
    const task = "tool-probe-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "x\n", "utf8");
    tmpRepo.commit("intent");

    const harness = new FakeHarness() as FakeHarness & { validateTools: (t: string[]) => Promise<string[]> };
    let probed: string[] = [];
    harness.validateTools = async (t: string[]) => {
      probed = t;
      return t.filter((x) => x === "bogus-tool");
    };

    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".wt") });
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const project = { orchestrationFolder: ".factory", worktreeRoot: path.join(tmpRepo.dir, ".wt") } as ProjectConfig;

    let res;
    try {
      res = await runTask(
        { harness, repo, project, pipelineFor: async () => basePipeline(), prompts },
        task
      );
    } catch (e: any) {
      res = { status: "threw", summary: e?.message ?? String(e) };
    }
    expect(res.summary).toContain("bogus-tool");
    expect(probed).toContain("bogus-tool");
    expect(probed).toContain("yield");
    // No agent turn ran: no step records beyond the probe
    expect(harness.calls.filter((c) => c.type === "run").length).toBe(0);
  });

  it("runTask proceeds when the probe is clean", async () => {
    const task = "tool-probe-clean";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "x\n", "utf8");
    tmpRepo.commit("intent");

    const harness = new FakeHarness() as FakeHarness & { validateTools: (t: string[]) => Promise<string[]> };
    harness.validateTools = async () => [];
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "r", citations: [] },
    });

    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".wt") });
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const project = { orchestrationFolder: ".factory", worktreeRoot: path.join(tmpRepo.dir, ".wt") } as ProjectConfig;
    const pipeline = basePipeline();
    pipeline.agents = { developer: { role: "workhorse", tools: ["read"] } };

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 1 }
    );
    expect(res).toBeDefined();
  });

  it("launchError outcome fails the run fast without consuming attempts", async () => {
    const task = "tool-probe-launch-error";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "x\n", "utf8");
    tmpRepo.commit("intent");

    const harness = new FakeHarness() as FakeHarness & { validateTools: (t: string[]) => Promise<string[]> };
    harness.validateTools = async () => [];
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: false,
      error: "Error: Built-in tools unavailable in this session: checkpoint.",
      launchError: true,
    });

    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".wt") });
    const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
    const project = { orchestrationFolder: ".factory", worktreeRoot: path.join(tmpRepo.dir, ".wt") } as ProjectConfig;
    const pipeline = basePipeline();
    pipeline.agents = { developer: { role: "workhorse", tools: ["read"] } };

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 1 }
    );
    expect(res.status).toBe("failed");
    expect(res.summary).toContain("launch error");
    // Fail fast: no retry, repair, or consult — exactly one harness run call.
    expect(harness.calls.filter((c) => c.type === "run").length).toBe(1);
    const deployedTaskDir = path.join(tmpRepo.dir, ".wt", `topic_${task}`, ".factory", task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("step_launch_error");
  });
});
