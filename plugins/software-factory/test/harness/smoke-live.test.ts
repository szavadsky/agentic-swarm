import { describe, it, expect } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import { loadPipelineConfig } from "../../src/core/config/loader.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";

const liveOmp = process.env.FACTORY_LIVE_OMP === "1";

describe.skipIf(!liveOmp)("OmpHarness Live Smoke Test (FACTORY_LIVE_OMP=1)", () => {
  const pluginRoot = path.resolve(import.meta.dir, "../..");
  const { config: pipeline } = loadPipelineConfig({ pluginRoot });

  it("executes a real tiny complete() with schema extraction", async () => {
    const harness = new OmpHarness({
      pipeline,
      timeoutMs: 60_000,
    });

    const schema = {
      type: "object",
      properties: {
        pong: { type: "string" },
        answer: { type: "number" },
      },
      required: ["pong", "answer"],
      additionalProperties: false,
    };

    const res = (await harness.complete({
      role: "simpler",
      models: ["opencode-go/deepseek-v4.1-flash"],
      system: "You are a test agent. Return JSON matching the schema.",
      prompt: "Extract pong as 'ok' and answer as 42.",
      schema,
    })) as any;

    expect(res).toBeDefined();
    expect(res.pong).toBe("ok");
    expect(res.answer).toBe(42);
  }, 120_000);

  it("executes a real tiny read-only run() turn with cheap model", async () => {
    const tmp = createTmpRepo();
    try {
      const harness = new OmpHarness({
        pipeline,
        timeoutMs: 90_000,
      });

      const outcome = await harness.run({
        agent: "fact-finder",
        definition: "# Fact Finder\nInspect the environment and call yield.",
        prompt: "Call yield with data: { ping: 'live_test_ok', count: 123 }",
        role: "workhorse",
        models: ["opencode-go/deepseek-v4.1-flash"],
        tools: ["read", "yield"],
        cwd: tmp.dir,
        outputSchema: {
          type: "object",
          properties: {
            ping: { type: "string" },
            count: { type: "number" },
          },
          required: ["ping", "count"],
        },
        label: "smoke/test#turn1",
        session: { keep: false },
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data).toEqual({ ping: "live_test_ok", count: 123 });
        expect(outcome.sessionId).toBeDefined();
        expect(outcome.usage?.inputTokens).toBeGreaterThan(0);
      }
    } finally {
      tmp.cleanup();
    }
  }, 180_000);
});
