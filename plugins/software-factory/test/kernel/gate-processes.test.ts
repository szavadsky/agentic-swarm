import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDeclaredGate, runGates } from "../../src/kernel/gates.js";
import type { GateConfig, KernelRuntime } from "../../src/kernel/types.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** A gate whose sleeping grandchild is the observable survivor. */
function sleepingGate(leaderFile: string, childFile: string): string {
  return [
    `echo $$ > ${shellQuote(leaderFile)}`,
    "sleep 300 &",
    `echo $! > ${shellQuote(childFile)}`,
    "wait",
  ].join("\n");
}

async function waitForPid(file: string): Promise<number> {
  for (let i = 0; i < 500; i++) {
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8").trim();
      if (text) return Number(text);
    }
    await Bun.sleep(10);
  }
  throw new Error(`pid file never appeared: ${file}`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function expectDead(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (alive(pid) && Date.now() < deadline) await Bun.sleep(20);
  expect(alive(pid)).toBe(false);
}

/** Kills a group a failed test may have left behind. */
function killGroup(leader: number | undefined): void {
  if (leader === undefined) return;
  try {
    process.kill(-leader, "SIGKILL");
  } catch {
    // Already gone: the assertion in the test is the verdict.
  }
}

function tmpDir(kind: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gate-${kind}-`));
}

/** The sweep only removes terminal task worktrees. */
async function mergedTask(runtime: KernelRuntime, slug: string): Promise<void> {
  await writeTask(runtime, task(slug));
  await runtime.store.records.append(
    { iteration: 1, step: "merge", round: 1, actor: "script", slug },
    { ok: true },
  );
}

describe("gate process tree lifecycle", () => {
  gateProcessTreeLifecyclePart1();
  gateProcessTreeLifecyclePart2();
  gateProcessTreeLifecyclePart3();
  gateProcessTreeLifecyclePart4();
  gateProcessTreeLifecyclePart5();
});

function gateProcessTreeLifecyclePart1() {
  it("kills a timed-out gate's whole process group", async () => {
    const dir = tmpDir("timeout");
    const leaderFile = path.join(dir, "leader.pid");
    const childFile = path.join(dir, "child.pid");
    try {
      const gate: GateConfig = {
        id: "sleepy",
        command: sleepingGate(leaderFile, childFile),
        serial: [],
        timeoutSec: 0.2,
      };
      const { res } = await runDeclaredGate(dir, gate);
      expect(res.timedOut).toBe(true);

      const leader = await waitForPid(leaderFile);
      const child = await waitForPid(childFile);
      await expectDead(child);
      await expectDead(leader);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function gateProcessTreeLifecyclePart2() {
  it("kills a cancelled gate's whole process group", async () => {
    const dir = tmpDir("cancel");
    const leaderFile = path.join(dir, "leader.pid");
    const childFile = path.join(dir, "child.pid");
    const gatesPath = path.resolve(
      import.meta.dir,
      "../../src/kernel/gates.ts",
    );
    const shutdownPath = path.resolve(
      import.meta.dir,
      "../../src/core/shutdown.ts",
    );
    const code = `
import fs from "node:fs";
import { runDeclaredGate } from ${JSON.stringify(gatesPath)};
import { terminateAllChildGroups } from ${JSON.stringify(shutdownPath)};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const [cwd, command, childFile] = process.argv.slice(1);
const running = runDeclaredGate(cwd, {
  id: "sleepy",
  command,
  serial: [],
  timeoutSec: 60,
});
for (let i = 0; i < 500 && !fs.existsSync(childFile); i++) await sleep(10);
await terminateAllChildGroups(100);
const { res } = await running;
process.exit(res.signal === "SIGTERM" ? 0 : 2);
`;
    let leader: number | undefined;
    try {
      const command = sleepingGate(leaderFile, childFile);
      const exitCode = await new Promise<number>((resolve, reject) => {
        const cp = spawn("bun", ["-e", code, dir, command, childFile], {
          stdio: "inherit",
        });
        cp.on("error", reject);
        cp.on("exit", (status) => resolve(status ?? 1));
      });
      expect(exitCode).toBe(0);

      leader = await waitForPid(leaderFile);
      const child = await waitForPid(childFile);
      await expectDead(child);
      await expectDead(leader);
    } finally {
      killGroup(leader);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function gateProcessTreeLifecyclePart3() {
  it("removes a task worktree without leaving its running gate behind", async () => {
    const shared = tmpDir("removal");
    const leaderFile = path.join(shared, "leader.pid");
    const childFile = path.join(shared, "child.pid");
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "sleepy", command: sleepingGate(leaderFile, childFile) }],
    });
    let leader: number | undefined;
    try {
      const runtime = await makeRuntime(repo, goal, {});
      await mergedTask(runtime, "sleepy");
      const tasksRoot = path.join(runtime.paths.worktreeRoot, `${goal}-tasks`);
      const worktree = path.join(tasksRoot, "sleepy");
      repo.createWorktree(`factory-task/${goal}/sleepy`, worktree);

      const running = runGates(runtime, worktree);
      leader = await waitForPid(leaderFile);
      const child = await waitForPid(childFile);
      expect(alive(child)).toBe(true);

      await prepareIntegrationCheckout(runtime);
      const checks = await running;

      expect(checks.map((check) => check.name)).toEqual(["sleepy"]);
      await expectDead(child);
      await expectDead(leader);
      expect(fs.existsSync(worktree)).toBe(false);
    } finally {
      killGroup(leader);
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  });
}

function gateProcessTreeLifecyclePart4() {
  it("reaps a gate tree whose owner died before the worktree was removed", async () => {
    const shared = tmpDir("orphan");
    const leaderFile = path.join(shared, "leader.pid");
    const childFile = path.join(shared, "child.pid");
    const { repo, goal } = setupFlowRepo({});
    const gatesPath = path.resolve(
      import.meta.dir,
      "../../src/kernel/gates.ts",
    );
    const code = `
import fs from "node:fs";
import { runDeclaredGate } from ${JSON.stringify(gatesPath)};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const [cwd, command, leaderFile, childFile] = process.argv.slice(1);
void runDeclaredGate(cwd, {
  id: "sleepy",
  command,
  serial: [],
  timeoutSec: 600,
});
for (let i = 0; i < 500; i++) {
  if (fs.existsSync(leaderFile) && fs.existsSync(childFile)) break;
  await sleep(10);
}
process.exit(0);
`;
    let leader: number | undefined;
    try {
      const runtime = await makeRuntime(repo, goal, {});
      await mergedTask(runtime, "sleepy");
      const tasksRoot = path.join(runtime.paths.worktreeRoot, `${goal}-tasks`);
      const worktree = path.join(tasksRoot, "sleepy");
      repo.createWorktree(`factory-task/${goal}/sleepy`, worktree);

      const command = sleepingGate(leaderFile, childFile);
      const exitCode = await new Promise<number>((resolve, reject) => {
        const cp = spawn(
          "bun",
          ["-e", code, worktree, command, leaderFile, childFile],
          { stdio: "inherit" },
        );
        cp.on("error", reject);
        cp.on("exit", (status) => resolve(status ?? 1));
      });
      expect(exitCode).toBe(0);

      leader = await waitForPid(leaderFile);
      const child = await waitForPid(childFile);
      expect(alive(child)).toBe(true);

      await prepareIntegrationCheckout(runtime);

      await expectDead(child);
      await expectDead(leader);
    } finally {
      killGroup(leader);
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  });
}

function gateProcessTreeLifecyclePart5() {
  it("exits promptly when a gate reads stdin", async () => {
    const dir = tmpDir("stdin");
    try {
      const gate: GateConfig = {
        id: "stdin-reader",
        command: "cat",
        serial: [],
        timeoutSec: 5,
      };
      const { res, check } = await runDeclaredGate(dir, gate);
      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(check.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
