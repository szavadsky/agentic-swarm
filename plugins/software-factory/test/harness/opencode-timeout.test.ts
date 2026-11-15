import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeHarness } from "../../src/harness/opencode/harness.js";

const FAKE_OPENCODE = `#!/usr/bin/env bun
import fs from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "session") process.exit(1);
if (process.env.FAKE_OPENCODE_PID_FILE && args[0] === "run") fs.writeFileSync(process.env.FAKE_OPENCODE_PID_FILE, String(process.pid));
process.stdout.write(JSON.stringify({ type: "step_start", sessionID: "ses_fake", part: {} }) + "\\n");
process.stdout.write(JSON.stringify({
  type: "step_finish",
  sessionID: "ses_fake",
  part: { reason: "stop", cost: 0, tokens: { input: 7, output: 3, reasoning: 1, cache: { read: 2, write: 0 } } },
}) + "\\n");
if (args[args.length - 1] !== "quick") setInterval(() => {}, 1000);
`;

function fakeHarness(): {
  harness: OpencodeHarness;
  dir: string;
  cleanup: () => void;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-fake-"));
  const binary = path.join(tmp, "fake-opencode.js");
  fs.writeFileSync(binary, FAKE_OPENCODE, { mode: 0o755 });
  const harness = new OpencodeHarness({
    binary,
    sessionDir: path.join(tmp, "sessions"),
  });
  return {
    harness,
    dir: tmp,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

/** Pids the fake binary reports through FAKE_OPENCODE_PID_FILE. */
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

describe("OpencodeHarness fake process", () => {
  it("idle timeout kills the run and returns partial usage", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 150, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage).toEqual({
        in: 7,
        cacheRead: 2,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 3,
        reasoningOut: 1,
        costUsd: 0,
      });
      expect(result.session?.id).toBe("ses_fake");
      expect(result.attempts).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 20_000);

  it("wall timeout works when idle detection is disabled", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 150 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage.in).toBe(7);
    } finally {
      cleanup();
    }
  }, 20_000);

  it("abort kills the run and reports cancelled", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OPENCODE_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      const pending = harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
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
      delete process.env.FAKE_OPENCODE_PID_FILE;
      cleanup();
    }
  }, 20_000);

  it("abort after resolve is a no-op", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OPENCODE_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
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
      delete process.env.FAKE_OPENCODE_PID_FILE;
      cleanup();
    }
  }, 20_000);

  it("a pre-aborted signal reports cancelled without spawning", async () => {
    const { harness, dir, cleanup } = fakeHarness();
    const pidFile = path.join(dir, "child.pid");
    process.env.FAKE_OPENCODE_PID_FILE = pidFile;
    try {
      const controller = new AbortController();
      controller.abort();
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 60_000 },
        signal: controller.signal,
      });
      expect(result.stop).toEqual({ kind: "cancelled" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fs.existsSync(pidFile)).toBe(false);
    } finally {
      delete process.env.FAKE_OPENCODE_PID_FILE;
      cleanup();
    }
  }, 20_000);
});
