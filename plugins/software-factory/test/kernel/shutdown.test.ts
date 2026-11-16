import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  registerChildGroup,
  terminateAllChildGroups,
  unregisterChildGroup,
} from "../../src/core/shutdown.js";
import { createDrainController } from "../../src/kernel/signals.js";

async function runShutdownSweepInChild(
  dir: string,
  grandchildPid: string,
  grandchildSurvived: string,
): Promise<{ exitCode: number }> {
  const procPath = path.resolve(__dirname, "../../src/core/proc.ts");
  const shutdownPath = path.resolve(__dirname, "../../src/core/shutdown.ts");

  const childCode = `
import fs from "node:fs";
import { runProcess } from ${JSON.stringify(procPath)};
import { terminateAllChildGroups } from ${JSON.stringify(shutdownPath)};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForFile(file, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error("timed out waiting for " + file);
    await sleep(20);
  }
}

const dir = process.argv[1];
const grandchildPid = process.argv[2];
const grandchildSurvived = process.argv[3];

const script = [
  \`(echo \\$BASHPID > "\${grandchildPid}"; sleep 1; echo alive > "\${grandchildSurvived}") &\`,
  "wait",
].join("\\n");

const running = runProcess({ cmd: ["bash", "-c", script], cwd: dir });
await waitForFile(grandchildPid);
await terminateAllChildGroups(200);
const result = await running;
if (result.signal !== "SIGTERM") {
  process.exit(2);
}
await sleep(1200);
if (fs.existsSync(grandchildSurvived)) {
  process.exit(3);
}
process.exit(0);
`;

  return new Promise((resolve, reject) => {
    const cp = spawn(
      "bun",
      ["-e", childCode, dir, grandchildPid, grandchildSurvived],
      {
        stdio: "inherit",
      },
    );
    cp.on("error", reject);
    cp.on("exit", (code) => resolve({ exitCode: code ?? 1 }));
  });
}

describe("child process group shutdown", () => {
  it("terminateAllChildGroups kills a spawned child group, not only its leader", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shutdown-test-"));
    const grandchildPid = path.join(dir, "grandchild.pid");
    const grandchildSurvived = path.join(dir, "grandchild-survived");
    let pid: number | undefined;
    try {
      const res = await runShutdownSweepInChild(
        dir,
        grandchildPid,
        grandchildSurvived,
      );
      expect(res.exitCode).toBe(0);

      expect(fs.existsSync(grandchildPid)).toBe(true);
      pid = Number(fs.readFileSync(grandchildPid, "utf8").trim());
      expect(pid).toBeGreaterThan(0);

      expect(fs.existsSync(grandchildSurvived)).toBe(false);

      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      expect(alive).toBe(false);
    } finally {
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already dead: the assertion above is the test.
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sentinel child group survives shutdown sweep path and double-signal drain", async () => {
    const sentinel = spawn("sleep", ["30"], { detached: true });
    expect(sentinel.pid).toBeDefined();
    const sentinelPid = sentinel.pid!;
    registerChildGroup(sentinelPid);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shutdown-sentinel-"));
    const grandchildPid = path.join(dir, "grandchild.pid");
    const grandchildSurvived = path.join(dir, "grandchild-survived");

    try {
      // 1. Run shutdown sweep path in child bun process
      const res = await runShutdownSweepInChild(
        dir,
        grandchildPid,
        grandchildSurvived,
      );
      expect(res.exitCode).toBe(0);

      // Sentinel survives the shutdown sweep
      expect(process.kill(sentinelPid, 0)).toBe(true);

      // 2. Run double-signal drain with recorder terminator
      let recordedGrace: number | undefined;
      const controller = createDrainController(async (graceMs) => {
        recordedGrace = graceMs;
      });
      controller.handleSignal("SIGINT");
      controller.handleSignal("SIGINT");
      expect(controller.aborted).toBe(true);
      expect(recordedGrace).toBe(500);

      // Sentinel survives the double-signal drain
      expect(process.kill(sentinelPid, 0)).toBe(true);
    } finally {
      try {
        process.kill(sentinelPid, "SIGKILL");
      } catch {}
      unregisterChildGroup(sentinelPid);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a pid that unregistered during the grace gets no SIGKILL", async () => {
    const origKill = process.kill;
    const killCalls: Array<{ pid: number; signal?: string | number }> = [];

    const pid1 = 999901;
    const pid2 = 999902;
    registerChildGroup(pid1);
    registerChildGroup(pid2);

    process.kill = ((pid: number, signal?: string | number) => {
      killCalls.push({ pid, signal });
      if (Math.abs(pid) === pid1 && signal === "SIGTERM") {
        unregisterChildGroup(pid1);
      }
      return true;
    }) as typeof process.kill;

    try {
      await terminateAllChildGroups(50);

      const pid1KillCalls = killCalls.filter(
        (c) => Math.abs(c.pid) === pid1 && c.signal === "SIGKILL",
      );
      expect(pid1KillCalls).toHaveLength(0);

      const pid2KillCalls = killCalls.filter(
        (c) => Math.abs(c.pid) === pid2 && c.signal === "SIGKILL",
      );
      expect(pid2KillCalls.length).toBeGreaterThan(0);
    } finally {
      process.kill = origKill;
      unregisterChildGroup(pid1);
      unregisterChildGroup(pid2);
    }
  });
});
