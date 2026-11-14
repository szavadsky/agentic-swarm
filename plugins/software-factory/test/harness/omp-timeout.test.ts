import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

const FAKE_OMP = `#!/usr/bin/env bun
const readline = require("node:readline");
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  if (frame.type === "prompt") {
    process.stdout.write(JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, reasoningTokens: 2,
                 cost: { total: 0.01 } },
        stopReason: "stop",
      },
    }) + "\\n");
  } else if (frame.type === "abort") {
    process.exit(0);
  } else {
    process.stdout.write(JSON.stringify({
      id: frame.id, type: "response", command: frame.type, success: true,
      data: { tokens: { input: 0, output: 0 }, cost: 0 },
    }) + "\\n");
  }
});
setInterval(() => {}, 1000);
`;

function fakeHarness(): { harness: OmpHarness; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-fake-"));
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
  const harness = new OmpHarness({
    binary,
    sessionDir: path.join(tmp, "sessions"),
    readyTimeoutMs: 5_000,
  });
  return { harness, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

describe("OmpHarness fake process", () => {
  it("idle timeout aborts the turn and returns partial usage", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 150, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage.in).toBe(10);
      expect(result.usage.out).toBe(3);
      expect(result.usage.reasoningOut).toBe(2);
      expect(result.usage.cacheRead).toBe(2);
      expect(result.usage.costUsd).toBe(0.01);
      expect(result.attempts).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 20_000);

  it("wall timeout is distinct from idle and still reports usage", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 150 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage.in).toBe(10);
      expect(result.usage.out).toBe(3);
    } finally {
      cleanup();
    }
  }, 20_000);
});
