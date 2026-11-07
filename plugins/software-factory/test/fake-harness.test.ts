import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import type { AgentRun } from "../src/harness/types.js";

describe("Fake scripted harness (§4)", () => {
  it("replays scripted outcome by label, assigns session id on keep, and threads resume", async () => {
    const harness = new FakeHarness();
    const label = "task-1/runs/architect";

    harness.scriptOutcome(label, [
      {
        ok: true,
        data: { plan: "iteration 1 initial plan" },
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      {
        ok: true,
        data: { plan: "revised plan" },
        usage: { inputTokens: 150, outputTokens: 80 },
      },
    ]);

    const run1: AgentRun = {
      agent: "architect",
      definition: "architect prompt",
      prompt: "generate plan",
      role: "architect",
      models: ["claude-opus"],
      tools: [],
      cwd: "/mock/cwd",
      outputSchema: {},
      label,
      session: { keep: true },
    };

    const outcome1 = await harness.run(run1);
    expect(outcome1.ok).toBe(true);
    expect(outcome1.sessionId).toBeDefined();

    // Verify call was recorded
    expect(harness.calls.length).toBe(1);
    expect(harness.calls[0]?.type).toBe("run");

    // Second turn resumes session
    const run2: AgentRun = {
      ...run1,
      prompt: "revise plan",
      session: { resume: outcome1.sessionId, keep: true },
    };

    const outcome2 = await harness.run(run2);
    expect(outcome2.ok).toBe(true);
    expect(outcome2.sessionId).toBe(outcome1.sessionId);
    expect(harness.calls.length).toBe(2);
  });

  it("returns sessionLost: true when resuming an unknown or lost session", async () => {
    const harness = new FakeHarness();
    const label = "task-1/runs/triage";

    harness.scriptOutcome(label, {
      ok: true,
      data: { triage: "done" },
    });

    const run: AgentRun = {
      agent: "triage",
      definition: "triage def",
      prompt: "triage intent",
      role: "workhorse",
      models: ["deepseek"],
      tools: [],
      cwd: "/mock/cwd",
      outputSchema: {},
      label,
      session: { resume: "expired-or-unknown-session-id", keep: true },
    };

    const outcome = await harness.run(run);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.sessionLost).toBe(true);
    }
  });

  it("allows a script function to inspect AgentRun and modify files in cwd", async () => {
    const harness = new FakeHarness();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-harness-run-"));
    const label = "task-1/items/item-1/develop#a1";

    harness.scriptOutcome(label, async (run) => {
      // Simulate developer writing code in worktree
      fs.writeFileSync(path.join(run.cwd, "output.txt"), "hello world", "utf8");
      return {
        ok: true,
        data: { status: "ok", summary: "File written" },
      };
    });

    const run: AgentRun = {
      agent: "developer",
      definition: "dev def",
      prompt: "create output.txt",
      role: "workhorse",
      models: ["deepseek"],
      tools: ["edit"],
      cwd: tempDir,
      outputSchema: {},
      label,
      session: { keep: false },
    };

    const outcome = await harness.run(run);
    expect(outcome.ok).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, "output.txt"), "utf8")).toBe("hello world");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles complete() calls and records them in calls array", async () => {
    const harness = new FakeHarness();

    harness.scriptComplete(async ({ prompt }) => {
      return {
        repaired: true,
        len: prompt.length,
      };
    });

    const result = (await harness.complete({
      role: "simpler",
      models: ["gemini-flash"],
      system: "Repair",
      prompt: "raw output text",
      schema: {},
    })) as any;

    expect(result.repaired).toBe(true);
    expect(harness.calls.some((c) => c.type === "complete")).toBe(true);
  });
});
