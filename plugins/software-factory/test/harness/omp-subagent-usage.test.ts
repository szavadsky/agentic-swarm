import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

const FIXTURES = path.resolve(import.meta.dir, "../fixtures/omp");

const FAKE_OMP = `#!/usr/bin/env bun
const path = require("node:path");
const readline = require("node:readline");
const sessionsDir = process.argv[process.argv.indexOf("--session-dir") + 1];
const sessionFile = path.join(sessionsDir, "parent.jsonl");
let statsCalls = 0;
const write = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
write({ type: "ready", protocolVersion: 1 });
const rl = readline.createInterface({ input: process.stdin });
rl.on("close", () => process.exit(0));
rl.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) =>
    write({ id: frame.id, type: "response", command: frame.type, success: true, data });
  if (frame.type === "prompt") {
    write({ type: "prompt_result", id: frame.id, status: "completed", sessionSettled: true });
  } else if (frame.type === "get_session_stats") {
    statsCalls += 1;
    respond(statsCalls === 1
      ? { sessionId: "s1", tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 }
      : { sessionId: "s1", tokens: { input: 100, output: 20, reasoning: 5, cacheRead: 50, cacheWrite: 0 }, cost: 0.01 });
  } else if (frame.type === "get_last_assistant_text") {
    respond({ text: "ok" });
  } else if (frame.type === "get_state") {
    respond({ sessionId: "s1", sessionFile, thinkingLevel: "low", model: { provider: "opencode-go", id: "beam-free" } });
  } else {
    respond({});
  }
});
setInterval(() => {}, 1000);
`;

describe("omp subagent usage", () => {
  it("records parent and child-session tokens and cost in the turn result", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-subagent-usage-"));
    const sessionDir = path.join(tmp, "sessions");
    const sessions = path.join(sessionDir, "omp", "sessions");
    const childDir = path.join(sessions, "parent");
    fs.mkdirSync(childDir, { recursive: true });
    fs.writeFileSync(path.join(sessions, "parent.jsonl"), "");
    // The fixture dates its in-turn message in 2100 so it stays after the
    // turn's prompt timestamp; its earlier message must fall outside the turn.
    fs.copyFileSync(
      path.join(FIXTURES, "child-session-cost.jsonl"),
      path.join(childDir, "Scout.jsonl"),
    );
    const binary = path.join(tmp, "fake-omp.js");
    fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
    try {
      const harness = new OmpHarness({
        binary,
        sessionDir,
        readyTimeoutMs: 5_000,
      });
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: tmp,
        prompt: "go",
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("ok");
      expect(result.transcript).toBe(path.join(sessions, "parent.jsonl"));
      expect(result.usage).toEqual({
        in: 4890,
        cacheRead: 150,
        cacheWrite5m: 20,
        cacheWrite1h: 0,
        out: 47,
        reasoningOut: 252,
        costUsd: 0.0572,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 20_000);
});
