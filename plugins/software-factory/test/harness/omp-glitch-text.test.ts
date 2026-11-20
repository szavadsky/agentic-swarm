import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import type { SessionRef } from "../../src/harness/types.js";

/**
 * A fake omp that never emits `message_end`: the only text on the wire is the
 * session-scoped `get_last_assistant_text`, which answers with a prior turn's
 * answer when resumed. `productive` switches the post-prompt stats to a real
 * usage report, so that turn is not a glitch.
 */
function fakeOmpScript(logPath: string, servedPath: string): string {
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
const servedPath = ${JSON.stringify(servedPath)};
fs.appendFileSync(logPath, JSON.stringify(argv) + "\\n");
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const resumeId = flag("--resume");
const sessionId = resumeId ?? "fresh-session";
let stats = { sessionId, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 };
const write = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
write({ type: "ready", protocolVersion: 1 });
const rl = readline.createInterface({ input: process.stdin });
rl.on("close", () => process.exit(0));
rl.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) =>
    write({ id: frame.id, type: "response", command: frame.type, success: true, data });
  if (frame.type === "get_session_stats") {
    respond(stats);
  } else if (frame.type === "get_last_assistant_text") {
    const text = resumeId ? "previous turn answer" : "";
    if (text) fs.appendFileSync(servedPath, JSON.stringify(text) + "\\n");
    respond({ text });
  } else if (frame.type === "get_state") {
    respond({ sessionId, model: { provider: "provider", id: "glitch" } });
  } else if (frame.type === "prompt") {
    if (frame.message === "productive") {
      stats = { sessionId, tokens: { input: 5, output: 3, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 };
    }
    write({ type: "prompt_result", id: frame.id, agentInvoked: true, status: "completed", sessionSettled: true });
  }
});
setInterval(() => {}, 1000);
`;
}

function fixture(): {
  harness: OmpHarness;
  invocations: () => string[][];
  servedTexts: () => string[];
  cleanup: () => void;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-glitch-"));
  const logPath = path.join(tmp, "invocations.ndjson");
  const servedPath = path.join(tmp, "served.ndjson");
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, fakeOmpScript(logPath, servedPath), { mode: 0o755 });
  const lines = (file: string): unknown[] =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  return {
    harness: new OmpHarness({
      binary,
      sessionDir: path.join(tmp, "sessions"),
      readyTimeoutMs: 5_000,
    }),
    invocations: () => lines(logPath) as string[][],
    servedTexts: () => lines(servedPath) as string[],
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

function resumedSession(cwd: string): SessionRef {
  return {
    harness: "omp",
    id: "session-1",
    cwd,
    model: { id: "provider/glitch" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

describe("omp glitch turn text", () => {
  it("returns empty text for a resumed zero-usage turn with no output", async () => {
    const fake = fixture();
    const cwd = os.tmpdir();
    try {
      const result = await fake.harness.turn({
        model: { id: "provider/glitch" },
        cwd,
        prompt: "silent",
        session: resumedSession(cwd),
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "glitch",
        details: "zero-usage, no-output",
      });
      expect(result.usage).toMatchObject({ in: 0, out: 0, costUsd: 0 });
      expect(result.text).toBe("");
      expect(result.attempts).toHaveLength(1);

      // The stale answer really was on the wire; only the glitch guard drops it.
      expect(fake.servedTexts()).toEqual(["previous turn answer"]);
      const launch = fake.invocations()[0] ?? [];
      expect(launch).toContain("--resume");
      expect(launch).toContain("session-1");
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("keeps the session text for a resumed turn that reports usage", async () => {
    const fake = fixture();
    const cwd = os.tmpdir();
    try {
      const result = await fake.harness.turn({
        model: { id: "provider/glitch" },
        cwd,
        prompt: "productive",
        session: resumedSession(cwd),
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.usage).toMatchObject({ in: 5, out: 3 });
      expect(result.text).toBe("previous turn answer");
      expect(fake.servedTexts()).toEqual(["previous turn answer"]);
    } finally {
      fake.cleanup();
    }
  }, 20_000);
});
