import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

const FAKE_OMP = `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
if (process.env.FAKE_OMP_PID_FILE) fs.writeFileSync(process.env.FAKE_OMP_PID_FILE, String(process.pid));
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
    if (frame.message === "quick") {
      process.stdout.write(JSON.stringify({
        type: "prompt_result", id: frame.id, agentInvoked: true,
        status: "completed", sessionSettled: true,
      }) + "\\n");
    }
  } else if (frame.type === "abort") {
    process.exit(0);
  } else {
    const respond = () => process.stdout.write(JSON.stringify({
      id: frame.id, type: "response", command: frame.type, success: true,
      data: { tokens: { input: 0, output: 0 }, cost: 0 },
    }) + "\\n");
    if (process.env.FAKE_OMP_SLOW_STATS) setTimeout(respond, 500);
    else respond();
  }
});
setInterval(() => {}, 1000);
`;

function fakeHarness(): {
  harness: OmpHarness;
  dir: string;
  cleanup: () => void;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-fake-"));
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
  const harness = new OmpHarness({
    binary,
    sessionDir: path.join(tmp, "sessions"),
    readyTimeoutMs: 5_000,
  });
  return {
    harness,
    dir: tmp,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

/** Pids the fake binary reports through FAKE_OMP_PID_FILE. */
async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for pid file ${pidFile}`);
}

function expectDead(pid: number): void {
  expect(() => process.kill(pid, 0)).toThrow();
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

  it("abort kills the child and reports cancelled", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OMP_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      const pending = harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 60_000 },
        signal: controller.signal,
      });
      const pid = await waitForPid(pidFile);
      controller.abort();
      const result = await pending;
      expect(result.stop).toEqual({ kind: "cancelled" });
      expect(result.attempts).toHaveLength(1);
      expectDead(pid);
    } finally {
      delete process.env.FAKE_OMP_PID_FILE;
      cleanup();
    }
  }, 20_000);

  it("abort after resolve is a no-op", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OMP_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "quick",
        timeouts: { idleMs: 0, wallMs: 60_000 },
        signal: controller.signal,
      });
      expect(result.stop).toEqual({ kind: "done" });
      const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      // The turn reaped its own child; the abort below has nothing to kill.
      expectDead(pid);
      controller.abort();
      expect(result.stop).toEqual({ kind: "done" });
    } finally {
      delete process.env.FAKE_OMP_PID_FILE;
      cleanup();
    }
  }, 20_000);

  it("abort during the baseline request reports cancelled instead of rejecting", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OMP_PID_FILE = pidFile;
    process.env.FAKE_OMP_SLOW_STATS = "1";
    try {
      const controller = new AbortController();
      const pending = harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 60_000 },
        signal: controller.signal,
      });
      const pid = await waitForPid(pidFile);
      // The baseline stats answer takes 500ms; abort while it is pending.
      await new Promise((resolve) => setTimeout(resolve, 100));
      controller.abort();
      const result = await pending;
      expect(result.stop).toEqual({ kind: "cancelled" });
      expectDead(pid);
    } finally {
      delete process.env.FAKE_OMP_PID_FILE;
      delete process.env.FAKE_OMP_SLOW_STATS;
      cleanup();
    }
  }, 20_000);

  it("a pre-aborted signal reports cancelled without spawning", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OMP_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      controller.abort();
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 60_000 },
        signal: controller.signal,
      });
      expect(result.stop).toEqual({ kind: "cancelled" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fs.existsSync(pidFile)).toBe(false);
    } finally {
      delete process.env.FAKE_OMP_PID_FILE;
      cleanup();
    }
  }, 20_000);
});
