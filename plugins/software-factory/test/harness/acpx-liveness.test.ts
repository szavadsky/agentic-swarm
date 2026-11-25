import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isChildGroupAlive } from "../../src/core/shutdown.js";
import {
  promptGroupIsLive,
  waitForPromptGroupExit,
} from "../../src/harness/acpx/liveness.js";
import { AcpxTranscriptParser } from "../../src/harness/acpx/transcript.js";
import { runPromptProcess } from "../../src/harness/acpx/turn/process.js";
import type { AcpxRuntime } from "../../src/harness/acpx/turn/types.js";
import type { SessionRef } from "../../src/harness/types.js";

function runtimeFor(dir: string): AcpxRuntime {
  return {
    id: "acpx-live",
    command: { binary: "bash", prefix: [] },
    acpx: { agent: "test", env: {} },
    retention: "short",
    sessionDir: dir,
    activePids: new Map(),
  };
}

function sessionFor(dir: string, id: string): SessionRef {
  return {
    harness: "acpx-live",
    id,
    cwd: dir,
    model: { id: "fake-model" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

async function promptChild(dir: string, script: string, name: string) {
  const runtime = runtimeFor(dir);
  await runPromptProcess(
    runtime,
    { agent: "test", env: {} },
    ["-c", script],
    dir,
    { idleMs: 0, wallMs: 5_000 },
    new AcpxTranscriptParser(),
    undefined,
    undefined,
    name,
  );
  return runtime;
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group already exited between the probe and the kill.
  }
}

function lingeringGroupKeepsSessionLive(): void {
  it("keeps a session live while a child in its prompt group still runs", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acpx-live-"));
    const name = "lingering";
    try {
      const runtime = await promptChild(
        dir,
        "(sleep 30 >/dev/null 2>&1 &); exit 0",
        name,
      );
      const pid = runtime.activePids?.get(name);
      if (pid === undefined) throw new Error("no prompt pid was recorded");
      expect(isChildGroupAlive(pid)).toBe(true);
      expect(promptGroupIsLive(runtime.activePids, sessionFor(dir, name))).toBe(
        true,
      );

      killGroup(pid);
      await waitForPromptGroupExit(
        runtime.activePids,
        sessionFor(dir, name),
        5_000,
      );
      expect(promptGroupIsLive(runtime.activePids, sessionFor(dir, name))).toBe(
        false,
      );
      expect(runtime.activePids?.has(name)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function exitedGroupIsDropped(): void {
  it("drops a session whose prompt group exited with the process", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acpx-dead-"));
    const name = "gone";
    try {
      const runtime = await promptChild(dir, "exit 0", name);
      expect(runtime.activePids?.has(name)).toBe(false);
      expect(promptGroupIsLive(runtime.activePids, sessionFor(dir, name))).toBe(
        false,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function onlyEsrchProvesGone(): void {
  it("treats only ESRCH as proof that a prompt group is gone", () => {
    const original = process.kill;
    try {
      process.kill = (() => {
        const error = new Error("not permitted") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }) as typeof process.kill;
      expect(isChildGroupAlive(12_345)).toBe(true);

      process.kill = (() => {
        const error = new Error("no such process") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }) as typeof process.kill;
      expect(isChildGroupAlive(12_345)).toBe(false);
    } finally {
      process.kill = original;
    }
  });
}

describe("acpx prompt child liveness", () => {
  lingeringGroupKeepsSessionLive();
  exitedGroupIsDropped();
  onlyEsrchProvesGone();
});
