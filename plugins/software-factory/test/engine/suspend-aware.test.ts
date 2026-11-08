import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  setClock,
  resetClock,
  createActiveTimer,
  detectSuspend,
  type Clock,
} from "../../src/core/clock.js";
import { runProcess } from "../../src/core/proc.js";
import { runGates } from "../../src/core/checks/gates.js";
import { runCheck } from "../../src/core/checks/runner.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import type { PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
import type { Harness, AgentRun, AgentOutcome } from "../../src/harness/types.js";

describe("Suspend awareness: active monotonic timeouts and suspend detection", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    resetClock();
    tmpRepo.cleanup();
  });

  it("detectSuspend detects gap > 30s when wall-clock advances during sleep", () => {
    let wall = 1000;
    let mono = 1000;
    const fakeClock: Clock = {
      now: () => wall,
      monotonic: () => mono,
    };
    setClock(fakeClock);

    // Normal execution: 50ms active time
    wall += 50;
    mono += 50;
    const resNormal = detectSuspend(1000, 1000, fakeClock);
    expect(resNormal.suspendDetected).toBe(false);
    expect(resNormal.gapMs).toBe(0);

    // Suspend execution: system slept for 45 seconds, but active CPU time was only 100ms
    wall += 45000;
    mono += 100;
    const resSuspend = detectSuspend(1000, 1000, fakeClock);
    expect(resSuspend.suspendDetected).toBe(true);
    expect(resSuspend.gapMs).toBeGreaterThan(40000);
  });
  it("createActiveTimer measures monotonic active time so a suspend does not burn timeout", async () => {
    let wall = 0;
    let mono = 0;
    const fakeClock: Clock = {
      now: () => wall,
      monotonic: () => mono,
    };
    setClock(fakeClock);

    let fired = false;
    const timer = createActiveTimer(
      50, // 50ms timeout
      () => {
        fired = true;
      },
      fakeClock
    );

    // Simulate system suspend: wall jumps by 60s, but active monotonic only jumps by 10ms
    wall += 60000;
    mono += 10;

    // Wait 60ms real time (initial 50ms timer triggers, sees elapsed mono 10ms < 50ms, reschedules)
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toBe(false);

    // Now advance monotonic by 45ms (total mono = 55ms >= 50ms)
    mono += 45;
    // Wait for the rescheduled timer to fire
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toBe(true);

    timer.cancel();
  });

  it("turn failure during suspend is classified as transient, retried without consuming attempts, and journaled", async () => {
    const task = "suspend-turn-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "Suspend turn test\n", "utf8");
    tmpRepo.commit("Add intent");

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
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {},
        spike: {},
      },
      limits: {
        maxStepAttempts: 3,
        maxInfraRetries: 2,
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createBranch(`topic/${task}`);
    tmpRepo.createWorktree(`topic/${task}`, taskWtPath);

    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    fs.mkdirSync(deployedTaskDir, { recursive: true });
    const runsDir = path.join(deployedTaskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    let wall = 1000;
    let mono = 1000;
    const fakeClock: Clock = {
      now: () => wall,
      monotonic: () => mono,
    };
    setClock(fakeClock);

    let callCount = 0;
    const mockHarness: Harness = {
      async run(run: AgentRun): Promise<AgentOutcome> {
        callCount++;
        if (callCount === 1) {
          // Simulate machine sleeping for 40s during turn, network socket dropped
          wall += 40000;
          mono += 200;
          return {
            ok: false,
            error: "FetchError: connection reset by peer after machine suspend",
            transient: false, // Initially false, step-runner must classify as transient due to suspend!
          };
        }
        // Retry succeeds
        wall += 100;
        mono += 100;
        return {
          ok: true,
          data: { status: "ok", summary: "Developer succeeded after suspend recovery" },
        };
      },
      async complete(): Promise<unknown> {
        return {};
      },
    };

    const res = await runAgentStep({
      task,
      stepId: "develop",
      stepFragment: "steps/develop",
      agent: "developer",
      role: "workhorse",
      attempt: 1,
      cwd: taskWtPath,
      taskWt: taskWtPath,
      taskDir: deployedTaskDir,
      recordsDir: runsDir,
      repo: repoObj,
      harness: mockHarness,
      pipeline,
      project,
      prompts,
      promptVars: {
        task,
        assignment: "Do work",
        target: "test",
        citations: "[]",
        feedback: "",
      },
    });
    expect(res.ok).toBe(true);
    expect(res.meta.status).toBe("ok");
    // Verify attempt was NOT consumed: still attempt 1!
    expect(res.meta.attempt).toBe(1);
    expect(callCount).toBe(2);

    // Verify journal recorded system_suspend_detected
    const journalPath = path.join(deployedTaskDir, "journal.ndjson");
    expect(fs.existsSync(journalPath)).toBe(true);
    const journalContent = fs.readFileSync(journalPath, "utf8");
    expect(journalContent).toContain("system_suspend_detected");
  });

  it("gate interrupted by suspend is re-run once rather than recorded red", async () => {
    const task = "gate-suspend-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(taskDir, { recursive: true });

    // Gate command fails on first run while touching markerFile, passes on re-run (counter outside worktree)
    const markerFile = path.join(os.tmpdir(), `gate_attempt_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    const gateCmd = `if [ ! -f "${markerFile}" ]; then touch "${markerFile}"; exit 1; else exit 0; fi`;

    let wall = 1000;
    let mono = 1000;
    const fakeClock: Clock = {
      now: () => {
        if (fs.existsSync(markerFile)) {
          return wall + 40000; // 40s suspend gap
        }
        return wall;
      },
      monotonic: () => {
        if (fs.existsSync(markerFile)) {
          return mono + 100;
        }
        return mono;
      },
    };
    setClock(fakeClock);

    const ctx: CheckContext = {
      repo: new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: tmpRepo.dir + "-wt" }),
      wt: tmpRepo.dir,
      base: "HEAD",
      task,
      taskDir,
      taskWt: tmpRepo.dir,
      project: { orchestrationFolder: orchFolder, worktreeRoot: tmpRepo.dir + "-wt" },
      pipeline: { models: { roles: {} }, agents: {}, flows: { simple: { steps: [] }, story: {}, spike: {} }, limits: {} },
      infra: {
        setup: [],
        gates: [{ id: "test-gate", command: gateCmd }],
        testRunner: { command: "true" },
      },
      limits: { gateRetries: 0 },
      outputBytes: 4096,
    };
    try {
      const gateRes = await runGates(ctx);
      expect(gateRes.ok).toBe(true);
      expect(gateRes.results[0]?.status).toBe("pass");
      // Verify system_suspend_detected was journaled
      const journalPath = path.join(taskDir, "journal.ndjson");
      expect(fs.existsSync(journalPath)).toBe(true);
      const journalContent = fs.readFileSync(journalPath, "utf8");
      expect(journalContent).toContain("system_suspend_detected");
    } finally {
      resetClock();
      try { if (fs.existsSync(markerFile)) fs.unlinkSync(markerFile); } catch {}
    }
  });
});
