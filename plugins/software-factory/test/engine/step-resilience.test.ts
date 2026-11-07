import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { AgentOutcome } from "../../src/harness/types.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";

describe("Engine: Step resilience — render errors, transient retry, sessionLost (§6.4, §10, §12.2)", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let prompts: any;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
    pipeline = {
      models: { roles: { workhorse: { model: "deepseek-chat" }, simpler: { model: "deepseek-chat" } } },
      agents: { developer: { role: "workhorse" } },
      flows: {
        simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
        story: {},
        spike: {},
      },
      limits: { maxInfraRetries: 3 },
    };
    project = { orchestrationFolder: ".factory", worktreeRoot };
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("prompt render failure fails the step with error status (no JSON-dump fallback)", async () => {
    const task = "render-fail";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    const res = await runAgentStep({
      task,
      stepId: "develop",
      stepFragment: "steps/develop",
      agent: "developer",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      // Missing required vars (assignment/target/citations) → render throws
      promptVars: {},
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe("error");
    expect(res.meta.error).toContain("Prompt or agent definition error");
    // Harness was never called: no fabricated turn ran
    expect(harness.calls.length).toBe(0);
  });
  it("transient harness errors retry with backoff and succeed without consuming attempts", async () => {
    const task = "transient-retry";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });
    const harness = new FakeHarness();
    let calls = 0;
    const flaky = (): AgentOutcome => {
      calls++;
      if (calls <= 2) {
        return { ok: false, error: "provider 503", transient: true };
      }
      return { ok: true, data: { status: "ok", summary: "Recovered" } };
    };
    harness.scriptOutcome(`${task}/runs/develop#a1`, flaky);
    harness.scriptOutcome(`${task}/runs/develop#a1#infra-retry-1`, flaky);
    harness.scriptOutcome(`${task}/runs/develop#a1#infra-retry-2`, flaky);

    const res = await runAgentStep({
      task,
      stepId: "develop",
      agent: "developer",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { assignment: "a", target: "t", citations: "[]" },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    // Primary + 2 infra retries, all within the same attempt/record
    const runCalls = harness.calls.filter((c) => c.type === "run");
    expect(runCalls.length).toBe(3);
    expect(res.meta.attempt).toBe(1);
  });

  it("sessionLost retries once with a fresh session and records usage from all turns", async () => {
    const task = "session-lost";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    // Unknown resume id → harness itself returns sessionLost (no usage);
    // engine retries once with a fresh session.
    harness.scriptOutcome(`${task}/runs/develop#a1#rehydrated`, {
      ok: true,
      data: { status: "ok", summary: "Fresh session worked" },
      usage: { inputTokens: 20, outputTokens: 10, costUsd: 0.02 },
    });

    const res = await runAgentStep({
      task,
      stepId: "develop",
      agent: "developer",
      sessionMode: "reuse",
      existingSessionId: "sess-dead",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { assignment: "a", target: "t", citations: "[]" },
    });

    expect(res.ok).toBe(true);
    // Usage recorded from the fresh turn
    expect(res.usage?.inputTokens).toBe(20);
    expect(res.usage?.outputTokens).toBe(10);
    expect(res.usage?.costUsd).toBeCloseTo(0.02, 5);
    const labels = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run.label);
    expect(labels).toContain(`${task}/runs/develop#a1#rehydrated`);
  });
});
