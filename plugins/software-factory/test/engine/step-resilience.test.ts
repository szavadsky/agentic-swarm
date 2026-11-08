import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep, TIMEOUT_NUDGE_PROMPT, INTERRUPTED_RESUME_PROMPT } from "../../src/core/flows/step-runner.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { AgentOutcome } from "../../src/harness/types.js";
import type { PipelineConfig, ProjectConfig, StepMetaArtifact } from "../../src/core/artifacts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { readJournal } from "../../src/core/journal.js";
import { setClock, resetClock, type Clock } from "../../src/core/clock.js";
import { runGates } from "../../src/core/checks/gates.js";
import { writeQuestion } from "../../src/core/steer.js";

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
      promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
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
      promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
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
        taskStatus: "test_taskStatus",
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
        taskStatus: "test_taskStatus",
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
      promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
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
    const stepDir = path.join(itemDir, "steps", "001-develop-r1-a1");
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
    expect(res.summary).toContain("001-develop-r1-a1/meta.yaml");
  });

  it("kill mid-turn (FakeHarness throws after onSession) -> restart resumes that session id", async () => {
    const task = "kill-mid-turn-resume";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    let capturedSessionId: string | undefined;

    // Run 1: FakeHarness receives call, onSession fires and writes session to meta.yaml, then throws (kill mid-turn)
    harness.scriptOutcome(`${task}/runs/develop#a1`, () => {
      throw new Error("Simulated SIGKILL mid-turn");
    });

    try {
      await runAgentStep({
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
        promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
      });
    } catch (err: any) {
      expect(err.message).toContain("Simulated SIGKILL mid-turn");
    }

    // Verify record 001 was created and its meta.yaml has session persisted
    const record1Dir = path.join(recordsDir, "001-develop-a1");
    expect(fs.existsSync(record1Dir)).toBe(true);
    const meta1 = await readYaml<StepMetaArtifact>(path.join(record1Dir, "meta.yaml"));
    expect(meta1.session).toBeDefined();
    capturedSessionId = meta1.session;

    // Simulate restart: repairInterruptedRecords sets status to "interrupted"
    meta1.status = "interrupted";
    await writeYamlAtomic(path.join(record1Dir, "meta.yaml"), meta1);

    // Run 2: Next attempt of develop (restart)
    let resumedSessionId: string | undefined;
    let resumedPrompt: string | undefined;
    harness.scriptOutcome(`${task}/runs/develop#a2`, (run) => {
      resumedSessionId = run.session.resume;
      resumedPrompt = run.prompt;
      return {
        ok: true,
        data: { status: "ok", summary: "Resumed and completed" },
      };
    });

    const res2 = await runAgentStep({
      task,
      stepId: "develop",
      agent: "developer",
      attempt: 2,
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
    });

    expect(res2.ok).toBe(true);
    expect(resumedSessionId).toBe(capturedSessionId);
    expect(resumedPrompt).toBe(INTERRUPTED_RESUME_PROMPT);
  });

  it("retry escalation: caps retries for expensive roles (default 1), journals events, and stops with tousertoreview question", async () => {
    const task = "expensive-escalation";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();

    // Turn 1 fails transiently
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: false,
      error: "Harness transient network failure",
      transient: true,
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 1.0 },
    });

    // Retry 1 fails transiently as well
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1#infra-retry-1`, {
      ok: false,
      error: "Harness transient network failure 2",
      transient: true,
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 1.0 },
    });

    const customPipeline: PipelineConfig = {
      ...pipeline,
      models: {
        roles: {
          architect: { model: "claude-opus" },
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: { architect: { role: "architect" } },
      limits: { maxInfraRetries: 3, maxInfraRetriesExpensive: 1 },
      budget: { perStepUsd: 8, expensiveRoles: ["architect", "task-escalation"] },
    };

    const res = await runAgentStep({
      task,
      stepId: "architect-plan-1",
      stepFragment: "steps/architect-plan",
      agent: "architect",
      role: "architect",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline: customPipeline,
      project,
      prompts,
      promptVars: { task, iteration: "1", intent: "t", context: "[]", contextPack: "", infra: "", debt: "", steering: "", limits: "{}", taskStatus: "test_taskStatus" },
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe("error");

    // Verify journal events
    const journal = await readJournal(taskDir);
    const started = journal.filter((e) => e.type === "infra_retry_started");
    const finished = journal.filter((e) => e.type === "infra_retry_finished");
    const escalated = journal.filter((e) => e.type === "infra_retry_escalated");

    expect(started.length).toBe(1);
    expect(started[0]!.retry).toBe(1);
    expect(finished.length).toBe(1);
    expect(finished[0]!.retry).toBe(1);
    expect(escalated.length).toBe(1);
    expect(escalated[0]!.reason).toBe("retries_exhausted");

    // Verify tousertoreview question created
    const questionFile = path.join(taskDir, "steer", "tousertoreview", `${escalated[0]!.questionId}.yaml`);
    expect(fs.existsSync(questionFile)).toBe(true);
    const qData = await readYaml<any>(questionFile);
    expect(qData.question).toContain("retries_exhausted");
  });

  it("cost cap budget.perStepUsd stops step before retrying and writes tousertoreview question", async () => {
    const task = "cost-cap-escalation";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();

    // Turn 1 fails transiently but costs $8.50, exceeding perStepUsd of 8
    harness.scriptOutcome(`${task}/runs/develop#a1`, {
      ok: false,
      error: "Harness transient error after heavy computation",
      transient: true,
      usage: { inputTokens: 50000, outputTokens: 5000, costUsd: 8.5 },
    });

    const customPipeline: PipelineConfig = {
      ...pipeline,
      limits: { maxInfraRetries: 3 },
      budget: { perStepUsd: 8 },
    };

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
      pipeline: customPipeline,
      project,
      prompts,
      promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
    });

    expect(res.ok).toBe(false);

    const journal = await readJournal(taskDir);
    const escalated = journal.filter((e) => e.type === "infra_retry_escalated");
    expect(escalated.length).toBe(1);
    expect(escalated[0]!.reason).toBe("cost_cap_exceeded");

    const questionFile = path.join(taskDir, "steer", "tousertoreview", `${escalated[0]!.questionId}.yaml`);
    expect(fs.existsSync(questionFile)).toBe(true);
    const qData = await readYaml<any>(questionFile);
    expect(qData.question).toContain("cost_cap_exceeded");
  });

  it("always journals system_suspend_detected when suspend gap is observed during ok step", async () => {
    const task = "suspend-ok-turn";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    let wall = 1000;
    let mono = 1000;
    const fakeClock: Clock = {
      now: () => wall,
      monotonic: () => mono,
    };
    setClock(fakeClock);

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/develop#a1`, () => {
      // Simulate system sleep: wall clock advances by 60s, monotonic by 1s
      wall += 60000;
      mono += 1000;
      return {
        ok: true,
        data: { status: "ok", summary: "Success despite suspend gap" },
      };
    });

    try {
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
        promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
      });

      expect(res.ok).toBe(true);

      const journal = await readJournal(taskDir);
      const suspendEvents = journal.filter((e) => e.type === "system_suspend_detected");
      expect(suspendEvents.length).toBe(1);
      expect(suspendEvents[0]!.step).toBe("develop");
      expect(suspendEvents[0]!.gapMs).toBeGreaterThan(50000);
    } finally {
      resetClock();
    }
  });

  it("records usage accumulated so far into meta.yaml on interrupt/exception path", async () => {
    const task = "usage-on-interrupt";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/develop#a1`, async (run) => {
      if (run.onUsage) {
        await run.onUsage({ inputTokens: 1500, outputTokens: 300, costUsd: 0.08 });
      }
      throw new Error("Interrupted mid-execution");
    });

    try {
      await runAgentStep({
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
        promptVars: { assignment: "a", target: "t", citations: "[]", feedback: "" },
      });
    } catch {}

    const metaPath = path.join(recordsDir, "001-develop-a1", "meta.yaml");
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = await readYaml<StepMetaArtifact>(metaPath);
    expect(meta.usage).toBeDefined();
    expect(meta.usage!.inputTokens).toBe(1500);
    expect(meta.usage!.outputTokens).toBe(300);
    expect(meta.usage!.costUsd).toBeCloseTo(0.08, 5);
  });

  it("baseline recording runs gates with gateRetries=0 (no retries)", async () => {
    const counterFile = path.join(require("node:os").tmpdir(), `gate-runs-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    const checkCtx: any = {
      infra: {
        gates: [{ id: "failing-gate", command: `echo run >> ${counterFile}; false` }],
      },
      limits: {
        gateRetries: 2, // configured with retries=2
        gateTimeoutSec: 10,
      },
      outputBytes: 1024,
      wt: tmpRepo.dir,
      project: {},
    };

    // Running with record: true
    const outcome = await runGates(checkCtx, { record: true });
    expect(outcome.ok).toBe(false);
    expect(outcome.results[0]!.status).toBe("fail");

    // With record: true, gateRetries was overridden to 0, so command ran exactly once
    const content = fs.readFileSync(counterFile, "utf8").trim().split("\n");
    expect(content.length).toBe(1);
  });
});
