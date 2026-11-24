import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { DASHBOARD_REL_PATH } from "../../src/kernel/dashboard.js";
import { runGoal } from "../../src/kernel/launch.js";
import { PIN_GATE_FILE } from "../../src/kernel/preflight/pin.js";
import {
  installRunLogTee,
  latestRunLog,
  openRunLog,
} from "../../src/kernel/run-log.js";
import { readStatus, writeStatus } from "../../src/kernel/status.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { artifactState } from "../../src/kernel/worktree/containment-state.js";
import { testPriceSource } from "../helpers/price-source.js";
import { cleanup, makeGoal, outcome } from "./e2e-helpers.js";
import { scriptKernelRoleFallbacks } from "./fake-defaults.js";

const AT = () => new Date("2026-01-02T03:04:05.000Z");
const STAMP = "2026-01-02T03:04:05.000Z";

function goalDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-run-log-"));
}

function content(file: string): string {
  return fs.readFileSync(file, "utf8");
}

async function waitFor(
  ready: () => boolean,
  what: string,
  timeoutMs = 5_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ready()) return;
    await Bun.sleep(10);
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe("console tee", () => {
  it("copies every console line, timestamped and flushed before the launch ends", () => {
    const root = goalDir();
    const log = openRunLog(root, "launch-one");
    const seen: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      seen.push(args.join(" "));
    };
    const close = installRunLogTee(log, AT);
    try {
      console.warn("one");
      // Read before close: a kill after this line keeps it.
      expect(content(log.path)).toBe(`${STAMP} one\n`);

      console.warn("two\nthree");
      expect(content(log.path)).toBe(
        `${STAMP} one\n${STAMP} two\n${STAMP} three\n`,
      );
      // The tee delegates: the console still received exactly what was printed.
      expect(seen).toEqual(["one", "two\nthree"]);
    } finally {
      close();
      console.warn = originalWarn;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds a file on relaunch and overwrites none", () => {
    const root = goalDir();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const first = openRunLog(root, "launch-one");
      const closeFirst = installRunLogTee(first, AT);
      console.warn("first launch line");
      closeFirst();
      const firstText = content(first.path);

      const second = openRunLog(root, "launch-two");
      const closeSecond = installRunLogTee(second, AT);
      console.warn("second launch line");
      closeSecond();

      expect(first.rel).toBe("logs/run-launch-one.log");
      expect(second.rel).toBe("logs/run-launch-two.log");
      expect(fs.readdirSync(path.join(root, "logs")).sort()).toEqual([
        "run-launch-one.log",
        "run-launch-two.log",
      ]);
      expect(content(first.path)).toBe(firstText);
      expect(firstText).toBe(`${STAMP} first launch line\n`);
      expect(content(second.path)).toBe(`${STAMP} second launch line\n`);
    } finally {
      console.warn = originalWarn;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("latest launch log", () => {
  it("names the newest file and ignores non-launch files and directories", async () => {
    const root = goalDir();
    try {
      const dir = path.join(root, "logs");
      fs.mkdirSync(dir);
      const older = path.join(dir, "run-older.log");
      const newer = path.join(dir, "run-newer.log");
      fs.writeFileSync(older, "older\n");
      fs.writeFileSync(newer, "newer\n");
      fs.writeFileSync(path.join(dir, "notes.txt"), "not a launch\n");
      fs.mkdirSync(path.join(dir, "run-a-directory.log"));
      fs.utimesSync(older, new Date(1_000_000), new Date(1_000_000));
      fs.utimesSync(newer, new Date(2_000_000), new Date(2_000_000));

      expect(await latestRunLog(root)).toBe("logs/run-newer.log");
      fs.utimesSync(newer, new Date(500_000), new Date(500_000));
      expect(await latestRunLog(root)).toBe("logs/run-older.log");
      expect(await latestRunLog(path.join(root, "absent"))).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stays out of containment's artifact snapshot", () => {
    const root = goalDir();
    try {
      fs.mkdirSync(path.join(root, "logs"), { recursive: true });
      fs.writeFileSync(path.join(root, "logs", "run-launch.log"), "line\n");
      fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
      fs.writeFileSync(path.join(root, "tasks", "one.md"), "slug: one\n");
      const state = artifactState(root);
      expect([...state.keys()]).toEqual(["tasks/one.md"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a killed launch", () => {
  it("keeps its printed lines and leaves a redirected stdout alone", async () => {
    const root = goalDir();
    try {
      const killed = await runUntilKilled(root);
      expect(killed.signal).toBe("SIGKILL");
      expect(content(killed.stdoutFile)).toBe("first line\nsecond line\n");
      const lines = content(killed.logFile).split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z first line$/);
      expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z second line$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});

interface KilledLaunch {
  logFile: string;
  stdoutFile: string;
  signal: NodeJS.Signals | null;
}

/** Writes two console lines through the tee, then waits to be killed. */
function writeTeeScript(root: string): string {
  const script = path.join(root, "tee.ts");
  const modulePath = path.join(import.meta.dir, "../../src/kernel/run-log.ts");
  fs.writeFileSync(
    script,
    [
      `import { installRunLogTee, openRunLog } from ${JSON.stringify(modulePath)};`,
      "const [goalDir, launchId] = process.argv.slice(2);",
      "installRunLogTee(openRunLog(goalDir, launchId));",
      "console.log('first line');",
      "console.log('second line');",
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"),
  );
  return script;
}

async function runUntilKilled(root: string): Promise<KilledLaunch> {
  const stdoutFile = path.join(root, "stdout.txt");
  const stderrFile = path.join(root, "stderr.txt");
  const out = fs.openSync(stdoutFile, "w");
  const err = fs.openSync(stderrFile, "w");
  const child = spawn(
    process.execPath,
    [writeTeeScript(root), root, "killed"],
    { cwd: root, stdio: ["ignore", out, err] },
  );
  fs.closeSync(out);
  fs.closeSync(err);
  const logFile = path.join(root, "logs", "run-killed.log");
  try {
    await waitFor(
      () => fs.existsSync(logFile) && content(logFile).includes("second line"),
      `the log lines (stderr: ${content(stderrFile)})`,
    );
    await waitFor(
      () => content(stdoutFile).includes("second line"),
      "the redirected stdout",
    );
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    return { logFile, stdoutFile, signal: child.signalCode };
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}

function redPin(root: string): string {
  const build = path.join(root, "pins", "0123456789ab");
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(
    path.join(build, PIN_GATE_FILE),
    JSON.stringify({
      rev: "0123456789ab",
      typecheck: "fail",
      tests: "pass",
      at: "2026-01-02T03:04:05.000Z",
    }),
  );
  return build;
}

function doneHarness(): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  scriptKernelRoleFallbacks(harness);
  return harness;
}

function launchFiles(goalDir: string): string[] {
  try {
    return fs.readdirSync(path.join(goalDir, "logs")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function launchGoal(goal: ReturnType<typeof makeGoal>, pin: string) {
  return runGoal({
    repo: goal.repo.dir,
    goal: "demo",
    iterations: 1,
    pinBuild: pin,
    pinGateOverride: "test override reason",
    harnesses: { fake: doneHarness() },
    priceSource: testPriceSource(goal.repo.dir),
  });
}

/** Every line is stamped and each log carries the printed override warning. */
function expectTimestampedLogs(goalDir: string, names: string[]): void {
  for (const name of names) {
    const lines = content(path.join(goalDir, "logs", name))
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines)
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /);
    expect(
      lines.some((line) =>
        line.includes(
          "launching on the recorded override: test override reason",
        ),
      ),
    ).toBe(true);
  }
}

async function latestInStatus(
  goal: ReturnType<typeof makeGoal>,
): Promise<string | undefined> {
  const store = createFolderStore(goal.goalDir, undefined, {});
  await writeStatus({
    store,
    flows: {},
    priceSource: testPriceSource(goal.repo.dir),
  });
  const status = JSON.parse((await readStatus(store))!) as {
    runLog?: string;
  };
  return status.runLog;
}

describe("launch run log", () => {
  it("writes one file per launch and status names the latest after a relaunch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-run-log-"));
    const goal = makeGoal();
    const pin = redPin(root);
    try {
      expect((await launchGoal(goal, pin)).stop).toBe("done");
      const first = launchFiles(goal.goalDir);
      expect(first).toHaveLength(1);

      await Bun.sleep(10);
      expect((await launchGoal(goal, pin)).stop).toBe("done");
      const both = launchFiles(goal.goalDir);
      expect(both).toHaveLength(2);
      const second = both.find((name) => !first.includes(name));
      expect(second).toBeDefined();
      expectTimestampedLogs(goal.goalDir, both);

      expect(await latestInStatus(goal)).toBe(`logs/${second}`);
      const dashboard = content(path.join(goal.goalDir, DASHBOARD_REL_PATH));
      expect(dashboard).toContain(`href="logs/${second}"`);
    } finally {
      cleanup(goal);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
