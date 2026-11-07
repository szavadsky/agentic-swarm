import { describe, it, expect } from "bun:test";
import { PersistentAgent } from "../src/core/sessions.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import type { AgentRun } from "../src/harness/types.js";

describe("PersistentAgent sessions (§4, §6.1)", () => {
  it("serializes concurrent turn() calls in strict FIFO order", async () => {
    const harness = new FakeHarness();
    const label = "task/runs/architect";
    const executionOrder: string[] = [];

    harness.scriptOutcome(label, async (run: AgentRun) => {
      executionOrder.push(`start:${run.prompt}`);
      // Simulate variable turn latency
      const delay = run.prompt === "turn-1" ? 30 : 5;
      await new Promise((resolve) => setTimeout(resolve, delay));
      executionOrder.push(`end:${run.prompt}`);
      return {
        ok: true,
        data: { echo: run.prompt },
        usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
      };
    });

    const agent = new PersistentAgent({
      harness,
      labelBase: label,
      agent: "architect",
      role: "architect",
      models: ["claude-opus"],
      definition: "architect prompt",
      tools: [],
      cwd: "/mock/cwd",
    });

    // Fire 3 concurrent turn calls simultaneously
    const p1 = agent.turn("turn-1");
    const p2 = agent.turn("turn-2");
    const p3 = agent.turn("turn-3");

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);

    // FIFO guarantee: turn-1 must finish before turn-2 starts, and turn-2 must finish before turn-3 starts
    expect(executionOrder).toEqual([
      "start:turn-1",
      "end:turn-1",
      "start:turn-2",
      "end:turn-2",
      "start:turn-3",
      "end:turn-3",
    ]);

    // Usage accumulated across all 3 turns
    expect(agent.totalUsage.inputTokens).toBe(30);
    expect(agent.totalUsage.outputTokens).toBe(15);
  });

  it("threads session resume ID across turns after first success", async () => {
    const harness = new FakeHarness();
    const label = "task/runs/triage";

    harness.scriptOutcome(label, [
      {
        ok: true,
        data: { step: 1 },
      },
      {
        ok: true,
        data: { step: 2 },
      },
    ]);

    const agent = new PersistentAgent({
      harness,
      labelBase: label,
      agent: "triage",
      role: "workhorse",
      models: ["deepseek"],
      definition: "triage def",
      tools: [],
      cwd: "/mock/cwd",
    });

    expect(agent.sessionId).toBeUndefined();

    const turn1 = await agent.turn("first prompt");
    expect(turn1.ok).toBe(true);
    expect(agent.sessionId).toBeDefined();
    const firstSessionId = agent.sessionId;

    const turn2 = await agent.turn("second prompt");
    expect(turn2.ok).toBe(true);
    expect(agent.sessionId).toBe(firstSessionId);

    // Verify harness saw resume id on the second run
    const runCalls = harness.calls.filter((c) => c.type === "run") as Array<{
      type: "run";
      run: AgentRun;
    }>;
    expect(runCalls[0]?.run.session.resume).toBeUndefined();
    expect(runCalls[1]?.run.session.resume).toBe(firstSessionId);
  });

  it("rehydrates once via rehydrate() when session is lost", async () => {
    const harness = new FakeHarness();
    const label = "task/runs/architect";

    // Setup initial session
    harness.scriptOutcome(label, {
      ok: true,
      data: { initial: true },
      usage: { inputTokens: 50 },
    });

    const agent = new PersistentAgent({
      harness,
      labelBase: label,
      agent: "architect",
      role: "architect",
      models: ["claude-opus"],
      definition: "architect def",
      tools: [],
      cwd: "/mock/cwd",
    });

    await agent.turn("initial turn");
    const initialSessionId = agent.sessionId!;
    expect(initialSessionId).toBeDefined();

    // Now simulate session loss (e.g. process restart or expired session)
    harness.invalidateSession(initialSessionId);

    // Script outcome for the rehydrated turn
    harness.scriptOutcome(`${label}#rehydrated`, {
      ok: true,
      data: { rehydrated: true },
      usage: { inputTokens: 80 },
    });

    let rehydrateCalled = false;
    const rehydratedTurn = await agent.turn("followup prompt", undefined, {
      rehydrate: () => {
        rehydrateCalled = true;
        return "# Context Hydration\nPrevious plan: milestone 1 complete.";
      },
    });

    expect(rehydrateCalled).toBe(true);
    expect(rehydratedTurn.ok).toBe(true);
    expect((rehydratedTurn.data as any).rehydrated).toBe(true);

    // New session ID was acquired
    expect(agent.sessionId).toBeDefined();
    expect(agent.sessionId).not.toBe(initialSessionId);

    // Verify the rehydrated run had the hydration prefix
    const runCalls = harness.calls.filter((c) => c.type === "run") as Array<{
      type: "run";
      run: AgentRun;
    }>;
    const lastRun = runCalls[runCalls.length - 1]!;
    expect(lastRun.run.label).toBe(`${label}#rehydrated`);
    expect(lastRun.run.prompt).toContain("# Context Hydration");
    expect(lastRun.run.prompt).toContain("followup prompt");
  });

  it("clears sessionId on sessionLost even without a rehydrate callback", async () => {
    const harness = new FakeHarness();
    const label = "task/runs/triage";

    harness.scriptOutcome(label, {
      ok: true,
      data: { initial: true },
    });

    const agent = new PersistentAgent({
      harness,
      labelBase: label,
      agent: "triage",
      role: "workhorse",
      models: ["deepseek"],
      definition: "triage def",
      tools: [],
      cwd: "/mock/cwd",
    });

    await agent.turn("initial turn");
    const initialSessionId = agent.sessionId!;
    expect(initialSessionId).toBeDefined();

    harness.invalidateSession(initialSessionId);

    const lost = await agent.turn("followup without rehydrate");
    expect(lost.ok).toBe(false);
    expect(agent.sessionId).toBeUndefined();

    // Next turn resumes cleanly (no stale resume id sent to the harness).
    const resumed = await agent.turn("fresh turn");
    expect(resumed.ok).toBe(true);
    expect(agent.sessionId).toBeDefined();
    expect(agent.sessionId).not.toBe(initialSessionId);
    const runCalls = harness.calls.filter((c) => c.type === "run") as Array<{
      type: "run";
      run: AgentRun;
    }>;
    expect(runCalls[runCalls.length - 1]!.run.session.resume).toBeUndefined();
  });

  it("uses the per-turn label override with fallback to labelBase", async () => {
    const harness = new FakeHarness();
    const label = "task/runs/architect";
    const customLabel = "task/runs/architect/turn-7";

    harness.scriptOutcome(label, { ok: true, data: { base: true } });
    harness.scriptOutcome(customLabel, { ok: true, data: { custom: true } });

    const agent = new PersistentAgent({
      harness,
      labelBase: label,
      agent: "architect",
      role: "architect",
      models: ["claude-opus"],
      definition: "architect def",
      tools: [],
      cwd: "/mock/cwd",
    });

    const base = await agent.turn("base turn");
    expect(base.ok).toBe(true);
    const custom = await agent.turn("custom turn", undefined, { label: customLabel });
    expect(custom.ok).toBe(true);
    expect((custom.data as any).custom).toBe(true);

    const runCalls = harness.calls.filter((c) => c.type === "run") as Array<{
      type: "run";
      run: AgentRun;
    }>;
    expect(runCalls[0]!.run.label).toBe(label);
    expect(runCalls[1]!.run.label).toBe(customLabel);
  });
});
