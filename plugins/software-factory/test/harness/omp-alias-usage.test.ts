import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

/**
 * A stub omp whose transcript serves two models while its session stats carry
 * a different aggregate, so a test can tell which source priced the turn.
 */
const FAKE_OMP = `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const modelIndex = process.argv.indexOf("--model");
const model = modelIndex > 0 ? process.argv[modelIndex + 1] : "unknown";
const sessionsDir = process.argv[process.argv.indexOf("--session-dir") + 1];
const sessionFile = path.join(sessionsDir, "parent.jsonl");
const STATS = {
  sessionId: "s1",
  tokens: { input: 405, output: 41, reasoning: 8, cacheRead: 17, cacheWrite: 3 },
  cost: 0.05,
};
let prompted = false;
const message = (provider, id, usage) => JSON.stringify({
  type: "message",
  message: { role: "assistant", provider, model: id, usage, timestamp: Date.now() },
});
const write = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
write({ type: "ready", protocolVersion: 1 });
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) => write({
    id: frame.id, type: "response", command: frame.type, success: true, data,
  });
  if (frame.type === "prompt") {
    prompted = true;
    const served = [
      message("price", "tiny-preview:free", {
        input: 100, output: 10, cacheRead: 5, cacheWrite: 0,
        reasoningTokens: 2, cost: { total: 0 },
      }),
    ];
    if (model !== "@one") {
      served.push(message("local-host", "mini-flash", {
        input: 200, output: 20, cacheRead: 7, cacheWrite: 3,
        reasoningTokens: 4, cost: { total: 0.02 },
      }));
    }
    fs.writeFileSync(sessionFile, served.join("\\n") + "\\n");
    write({ type: "prompt_result", id: frame.id, status: "completed", sessionSettled: true });
  } else if (frame.type === "get_session_stats") {
    respond(prompted
      ? STATS
      : { sessionId: "s1", tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 });
  } else if (frame.type === "get_last_assistant_text") {
    respond({ text: "ok" });
  } else if (frame.type === "get_state") {
    const provider = model.startsWith("@") ? "price" : "local-host";
    const id = model.startsWith("@") ? "tiny-preview:free" : "lamp-mini-free";
    respond({ sessionId: "s1", sessionFile, thinkingLevel: "low", model: { provider, id } });
  } else {
    respond({});
  }
});
setInterval(() => {}, 1000);
`;

async function turn(
  requested: string,
): Promise<{ tmp: string; harness: OmpHarness }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-alias-usage-"));
  const sessionDir = path.join(tmp, "sessions");
  fs.mkdirSync(path.join(sessionDir, "omp", "sessions"), { recursive: true });
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
  return {
    tmp,
    harness: new OmpHarness({
      binary,
      sessionDir,
      retention: "short",
      readyTimeoutMs: 5_000,
    }),
  };
}

describe("omp alias turn usage", () => {
  registerOmpAliasTurnUsagePart1();
  registerOmpAliasTurnUsagePart2();
  registerOmpAliasTurnUsagePart3();
});

function registerOmpAliasTurnUsagePart1(): void {
  it("records every served model with its own tokens", async () => {
    const { tmp, harness } = await turn("@free");
    try {
      const result = await harness.turn({
        model: { id: "@free" },
        cwd: tmp,
        prompt: "go",
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.served).toEqual([
        {
          model: { id: "price/tiny-preview:free" },
          usage: {
            in: 100,
            cacheRead: 5,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            out: 8,
            reasoningOut: 2,
            costUsd: 0,
          },
        },
        {
          model: { id: "local-host/mini-flash" },
          usage: {
            in: 200,
            cacheRead: 7,
            cacheWrite5m: 3,
            cacheWrite1h: 0,
            out: 16,
            reasoningOut: 4,
            costUsd: 0.02,
          },
        },
      ]);
      // The split, not the session-stats aggregate, is the turn's usage.
      expect(result.usage).toEqual({
        in: 300,
        cacheRead: 12,
        cacheWrite5m: 3,
        cacheWrite1h: 0,
        out: 24,
        reasoningOut: 6,
        costUsd: 0.02,
      });
      // The record keeps the configured model for routing and admission.
      expect(result.model).toEqual({
        id: "price/tiny-preview:free",
        effort: "low",
      });
      // A native hop is one harness call, never an extra kernel attempt.
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts?.[0]?.model.id).toBe("@free");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

function registerOmpAliasTurnUsagePart2(): void {
  it("prices an alias turn from its one served model, not the primary", async () => {
    const { tmp, harness } = await turn("@one");
    try {
      const result = await harness.turn({
        model: { id: "@one" },
        cwd: tmp,
        prompt: "go",
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.served).toEqual([
        {
          model: { id: "price/tiny-preview:free" },
          usage: {
            in: 100,
            cacheRead: 5,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            out: 8,
            reasoningOut: 2,
            costUsd: 0,
          },
        },
      ]);
      // The transcript, not the session-stats aggregate (405/41), priced it.
      expect(result.usage).toEqual({
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 8,
        reasoningOut: 2,
        costUsd: 0,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

function registerOmpAliasTurnUsagePart3(): void {
  it("leaves a non-alias turn on its session-stats aggregate", async () => {
    const { tmp, harness } = await turn("local-host/lamp-mini-free");
    try {
      const result = await harness.turn({
        model: { id: "local-host/lamp-mini-free" },
        cwd: tmp,
        prompt: "go",
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.served).toBeUndefined();
      expect(result.usage).toEqual({
        in: 405,
        cacheRead: 17,
        cacheWrite5m: 3,
        cacheWrite1h: 0,
        out: 33,
        reasoningOut: 8,
        costUsd: 0.05,
      });
      expect(result.model).toEqual({
        id: "local-host/lamp-mini-free",
        effort: "low",
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
