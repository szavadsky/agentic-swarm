import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep, TIMEOUT_NUDGE_PROMPT } from "../../src/core/flows/step-runner.js";
import { runTask } from "../../src/core/engine.js";
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

  it("timeout of a kept session retries by RESUMING the same session with nudge and reduced timeout", async () => {
    const task = "timeout-resume";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    const targetSessionId = "fake-sess-architect-turn1";

    // Turn 1 times out after exploring
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: false,
      error: "Execution timed out",
      transient: true,
      timedOut: true,
      sessionId: targetSessionId,
      usage: { inputTokens: 5000, outputTokens: 500, costUsd: 0.15 },
    });

    // Retry 1 resumes the same session with the nudge
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1#infra-retry-1`, (run) => {
      // Assert that the retry resumed the same session, received the nudge prompt, and got reduced timeout
      expect(run.session.resume).toBe(targetSessionId);
      expect(run.prompt).toBe(TIMEOUT_NUDGE_PROMPT);
      expect(run.timeoutSec).toBeLessThan(1200);
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [
            { id: "m1", title: "Milestone 1", scenarios: ["Scenario: Works"], directionalInterfaces: ["interface I"] },
          ],
          itemOutlines: [{ slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1" }],
        },
        sessionId: targetSessionId,
        usage: { inputTokens: 100, outputTokens: 200, costUsd: 0.05 },
      };
    });

    const customPipeline: PipelineConfig = {
      ...pipeline,
      agents: {
        architect: { role: "architect", timeoutSec: 1200 },
      },
      models: {
        roles: {
          architect: { model: "claude-opus" },
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      limits: { maxInfraRetries: 3, timeoutNudgeSec: 300 },
    };

    const res = await runAgentStep({
      task,
      stepId: "architect-plan-1",
      stepFragment: "steps/architect-plan",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline: customPipeline,
      project,
      prompts,
      promptVars: {
        task,
        iteration: "1",
        intent: "Test intent",
        context: "[]",
        contextPack: "",
        infra: "",
        debt: "",
        steering: "",
        limits: "{}",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    expect(res.sessionId).toBe(targetSessionId);
    expect(res.usage?.costUsd).toBeCloseTo(0.2, 5);

    const runs = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run);
    expect(runs.length).toBe(2);
    expect(runs[0].session.resume).toBeUndefined();
    expect(runs[1].session.resume).toBe(targetSessionId);
    expect(runs[1].prompt).toBe(TIMEOUT_NUDGE_PROMPT);
    expect(runs[1].timeoutSec).toBe(300);
  });

  it("timeout retry falls back to fresh session when sessionLost occurs on resume", async () => {
    const task = "timeout-session-lost";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    const deadSessionId = "fake-sess-dead-timeout";

    // Turn 1 times out
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: false,
      error: "Execution timed out",
      transient: true,
      timedOut: true,
      sessionId: deadSessionId,
    });

    // Retry 1 attempts to resume dead session, but harness reports sessionLost
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1#infra-retry-1`, {
      ok: false,
      error: `Session "${deadSessionId}" not found or expired`,
      sessionLost: true,
    });

    // Fallback rehydrated run succeeds with fresh session
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1#rehydrated`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [
          { id: "m1", title: "Milestone 1", scenarios: ["Scenario: Fresh"], directionalInterfaces: ["interface I"] },
        ],
        itemOutlines: [{ slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1" }],
      },
      sessionId: "fresh-session-recovered",
    });

    const customPipeline: PipelineConfig = {
      ...pipeline,
      agents: { architect: { role: "architect", timeoutSec: 1200 } },
      models: {
        roles: {
          architect: { model: "claude-opus" },
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
    };

    const res = await runAgentStep({
      task,
      stepId: "architect-plan-1",
      stepFragment: "steps/architect-plan",
      agent: "architect",
      role: "architect",
      sessionMode: "reuse",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline: customPipeline,
      project,
      prompts,
      promptVars: {
        task,
        iteration: "1",
        intent: "Test intent",
        context: "[]",
        contextPack: "",
        infra: "",
        debt: "",
        steering: "",
        limits: "{}",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    expect(res.sessionId).toBe("fresh-session-recovered");

    const runs = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run);
    expect(runs.length).toBe(3);
    expect(runs[0].session.resume).toBeUndefined();
    expect(runs[1].session.resume).toBe(deadSessionId);
    expect(runs[2].session.resume).toBeUndefined(); // Fresh rehydrated
  });

  it("transient retry does not discard resumable session", async () => {
    const task = "transient-kept-session";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    const activeSessionId = "sess-dev-transient";
    harness.knownSessionIds.add(activeSessionId);

    // Turn 1 fails with 503 (transient, not timeout)
    harness.scriptOutcome(`${task}/runs/develop#a1`, {
      ok: false,
      error: "service unavailable 503",
      transient: true,
      sessionId: activeSessionId,
    });

    // Retry 1 must resume the session and use original prompt (not nudge)
    harness.scriptOutcome(`${task}/runs/develop#a1#infra-retry-1`, (run) => {
      expect(run.session.resume).toBe(activeSessionId);
      expect(run.prompt).not.toBe(TIMEOUT_NUDGE_PROMPT);
      return {
        ok: true,
        data: { status: "ok", summary: "Recovered in resumed session" },
        sessionId: activeSessionId,
      };
    });

    const res = await runAgentStep({
      task,
      stepId: "develop",
      agent: "developer",
      sessionMode: "reuse",
      existingSessionId: activeSessionId,
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
    expect(res.sessionId).toBe(activeSessionId);
    const runs = harness.calls.filter((c) => c.type === "run").map((c) => (c as any).run);
    expect(runs.length).toBe(2);
    expect(runs[0].session.resume).toBe(activeSessionId);
    expect(runs[1].session.resume).toBe(activeSessionId);
  });

  it("corrupt meta.yaml for an item causes runTask to exit 1 naming the file", async () => {
    const task = "corrupt-meta-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Corrupt meta test\n");
    tmpRepo.commit("Add intent for corrupt meta");

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "multistep", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });

    // Create an item with corrupt meta.yaml
    const itemSlug = "corrupt-item";
    const itemDir = path.join(taskDir, "items", itemSlug);
    const stepDir = path.join(itemDir, "steps", "001-develop-a1");
    fs.mkdirSync(stepDir, { recursive: true });
    const corruptMetaPath = path.join(stepDir, "meta.yaml");
    fs.writeFileSync(corruptMetaPath, "::: invalid: yaml: {{{\n");
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify({ slug: itemSlug, kind: "dev", title: "Corrupt Item", assignment: "Do", wave: 1 })
    );
    tmpRepo.commit("Add item with corrupt meta.yaml");

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );

    expect(res.status).toBe("failed");
    expect(res.exitCode).toBe(1);
    expect(res.summary).toContain("001-develop-a1/meta.yaml");
  });
});
