import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

const FAKE_OMP = `#!/usr/bin/env bun
const readline = require("node:readline");
const modelIndex = process.argv.indexOf("--model");
const model = modelIndex > 0 ? process.argv[modelIndex + 1] : "unknown";
let prompted = false;
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) => process.stdout.write(JSON.stringify({
    id: frame.id, type: "response", command: frame.type, success: true, data,
  }) + "\\n");
  if (frame.type === "get_session_stats") {
    respond(prompted
      ? { sessionId: "s1", tokens: { input: 5, output: 3, reasoning: 1, cacheRead: 2, cacheWrite: 0 }, cost: 0.02 }
      : { sessionId: "s1", tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 });
  } else if (frame.type === "get_last_assistant_text") {
    respond({ text: "from good" });
  } else if (frame.type === "get_state") {
    respond({ sessionId: "s1", sessionFile: "/tmp/none-session.jsonl", thinkingLevel: "low",
              model: { provider: "provider", id: "good" } });
  } else if (frame.type === "prompt") {
    prompted = true;
    if (model === "provider/bad") {
      process.stdout.write(JSON.stringify({
        type: "prompt_result", id: frame.id, agentInvoked: true, status: "error",
        sessionSettled: true,
        error: { message: "429 Free usage limit reached", httpStatus: 429, retryable: true },
      }) + "\\n");
    } else {
      process.stdout.write(JSON.stringify({
        type: "message_end",
        message: { role: "assistant", usage: { input: 5, output: 3, cacheRead: 2, reasoningTokens: 1 },
                   stopReason: "stop" },
      }) + "\\n");
      process.stdout.write(JSON.stringify({
        type: "prompt_result", id: frame.id, agentInvoked: true, status: "completed",
        sessionSettled: true,
      }) + "\\n");
    }
  }
});
setInterval(() => {}, 1000);
`;

describe("OmpHarness fallback chain", () => {
  it("retries quota then walks to the fallback and reports every hop", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-fallback-"));
    try {
      const binary = path.join(tmp, "fake-omp.js");
      fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
      const harness = new OmpHarness({
        binary,
        sessionDir: path.join(tmp, "sessions"),
        retry: { retries: 0 },
      });

      const result = await harness.turn({
        model: { id: "provider/bad" },
        fallbacks: [{ id: "provider/good" }],
        cwd: tmp,
        prompt: "go",
        timeouts: { idleMs: 10_000, wallMs: 20_000 },
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("from good");
      expect(result.model.id).toBe("provider/good");
      expect(result.attempts?.map((attempt) => attempt.model.id)).toEqual([
        "provider/bad",
        "provider/good",
      ]);
      expect(result.attempts?.[0]?.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: "429 Free usage limit reached",
      });
      expect(result.usage.in).toBe(5);
      expect(result.usage.out).toBe(2);
      expect(result.usage.cacheRead).toBe(2);
      expect(result.usage.costUsd).toBe(0.02);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});
