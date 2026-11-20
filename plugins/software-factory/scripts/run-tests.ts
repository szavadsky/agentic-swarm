#!/usr/bin/env bun
/**
 * Tests gate runner.
 * `--parallel` implies `--isolate`: Bun gives every file a
 * fresh global object, module registry, environment and process listeners, so
 * files share neither tmp repos nor process-wide state. A file that still
 * races under the sweep is listed in SERIAL and runs in one `--parallel=1`
 * worker; the sweep ignores it.
 *
 * Re-run policy: A red run re-runs its red files once.
 *
 * Extra argv forwards to `bun test` and skips the shard split: a focused run
 * names exact files and should not pay for, or silently include, the serial
 * shard.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  failedFiles,
  failedTests,
  parseJunit,
  type ParsedJunit,
} from "../src/core/checks/junit.js";

/** Parallel test workers; tuned for this suite on a many-core box. */
const WORKERS = 8;

/**
 * Files that run in one serial worker ahead of the parallel sweep.
 */
const SERIAL: readonly string[] = ["test/kernel/budget-drain.test.ts"];

interface FileTimings {
  version: number;
  files: Record<string, number>;
}

function slowestFiles(
  timingsPath: string,
  limit: number,
): Array<[string, number]> {
  try {
    const raw = fs.readFileSync(timingsPath, "utf8");
    const parsed = JSON.parse(raw) as FileTimings;
    return Object.entries(parsed.files)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * The run's JUnit report. Bun writes none when a worker crashes, and a killed
 * worker can leave one cut mid-element; both are failures the caller reports
 * from its own lines, not an exception out of the gate.
 */
function readReport(): ParsedJunit | undefined {
  if (!fs.existsSync(junitPath)) return undefined;
  try {
    return parseJunit(fs.readFileSync(junitPath, "utf8"));
  } catch (error) {
    console.error(
      `tests gate: cannot read ${junitPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-tests-"));
const timingsPath = path.join(tmpDir, "timings.json");
/**
 * Where this run writes its JUnit report. A gate that declares
 * `format: { junit: ... }` passes the absolute path in the environment; the
 * report then stays there for the kernel to read, so the bun gate is read from
 * the same file it wrote. A direct run keeps it in its own temp dir.
 */
const declaredJunit = process.env.FACTORY_JUNIT_PATH;
const junitPath = declaredJunit
  ? path.resolve(declaredJunit)
  : path.join(tmpDir, "junit.xml");
if (declaredJunit) fs.mkdirSync(path.dirname(junitPath), { recursive: true });
const forwarded = process.argv.slice(2);
const runs: string[][] =
  forwarded.length > 0
    ? [[`--parallel=${WORKERS}`, ...forwarded]]
    : [
        ["--parallel=1", ...SERIAL],
        [
          `--parallel=${WORKERS}`,
          ...SERIAL.flatMap((file) => ["--path-ignore-patterns", file]),
        ],
      ];
const started = performance.now();
let active: ReturnType<typeof spawn> | undefined;
let interrupted: NodeJS.Signals | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    interrupted = signal;
    active?.kill(signal);
  });
}

/**
 * The test process's environment. The report variable names this gate's
 * report; a test that spawns another runner must not overwrite it, so the
 * child does not inherit it.
 */
function testEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.FACTORY_JUNIT_PATH;
  return env;
}

function runBun(argv: string[]): Promise<RunResult> {
  // Each run's report must describe that run, not the previous shard's.
  fs.rmSync(junitPath, { force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bun",
      [
        "test",
        "--timings",
        timingsPath,
        "--update-timings",
        "--reporter=junit",
        `--reporter-outfile=${junitPath}`,
        ...argv,
      ],
      { stdio: "inherit", env: testEnv() },
    );
    active = child;
    child.on("error", reject);
    child.on("close", (code, signal) => {
      active = undefined;
      resolve({ code, signal });
    });
  });
}

/** The report the one retry wrote, so a flake that passed no longer reads red. */
function rerunRed(red: readonly string[]): number | null {
  fs.rmSync(junitPath, { force: true });
  return spawnSync(
    "bun",
    ["test", "--reporter=junit", `--reporter-outfile=${junitPath}`, ...red],
    { stdio: "inherit", env: testEnv() },
  ).status;
}

try {
  let failed = false;
  for (const argv of runs) {
    if (interrupted) break;
    const result = await runBun(argv);
    if (result.signal !== null || result.code !== 0) {
      const red = failedFiles(readReport());
      if (red.length > 0) {
        console.log(
          `tests gate: run red; re-running ${red.length} failed file(s) once: ${red.join(", ")}`,
        );
        if (rerunRed(red) !== 0) {
          failed = true;
          break;
        }
      } else if (result.code !== 0) {
        // Crash detected: report files in this batch as crashed
        for (const file of argv.filter((a) => a.endsWith(".test.ts"))) {
          console.error(`${file}: worker exit ${result.code}`);
        }
        failed = true;
        break;
      } else {
        failed = true;
        break;
      }
    }
  }
  const report = readReport();
  const wall = (performance.now() - started) / 1000;
  const slowest = slowestFiles(timingsPath, 5)
    .map(([file, ms]) => `${file} ${(ms / 1000).toFixed(1)}s`)
    .join(", ");
  const shape =
    forwarded.length > 0
      ? `focused; slowest: ${slowest}`
      : `--parallel=${WORKERS}; serial: ${SERIAL.length} files; slowest: ${slowest}`;
  console.error(`tests gate: wall ${wall.toFixed(1)}s (${shape})`);
  if (failed) {
    for (const test of failedTests(report)) {
      console.error(test);
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed || interrupted ? 1 : 0);
} catch (error) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(`tests gate: failed to run bun test: ${String(error)}`);
  process.exit(1);
}
