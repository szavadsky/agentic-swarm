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

/** File suites that recorded a failure in bun's JUnit report. */
function failedFiles(junitPath: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(junitPath, "utf8");
  } catch {
    return [];
  }
  const files = new Set<string>();
  for (const match of raw.matchAll(/<testsuite\b[^>]*>/g)) {
    const file = /\bfile="([^"]+)"/.exec(match[0])?.[1];
    const failures = Number(/\bfailures="(\d+)"/.exec(match[0])?.[1] ?? 0);
    if (file && failures > 0) files.add(file);
  }
  return [...files];
}

/** Individual failed tests recorded in bun's JUnit report. */
function getFailedTests(junitPath: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(junitPath, "utf8");
  } catch {
    return [];
  }
  const failedTests: string[] = [];
  // Find testsuites
  for (const suiteMatch of raw.matchAll(
    /<testsuite\b[^>]*\bfile="([^"]+)"[^>]*>([\s\S]*?)<\/testsuite>/g,
  )) {
    const file = suiteMatch[1]!;
    const suiteContent = suiteMatch[2]!;
    // Find failed testcases within this suite
    for (const caseMatch of suiteContent.matchAll(
      /<testcase\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g,
    )) {
      const name = caseMatch[1]!;
      const caseContent = caseMatch[2]!;
      if (caseContent.includes("<failure")) {
        failedTests.push(`${file} > ${name}`);
      }
    }
  }
  return failedTests;
}

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-tests-"));
const timingsPath = path.join(tmpDir, "timings.json");
const junitPath = path.join(tmpDir, "junit.xml");
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

function runBun(argv: string[]): Promise<RunResult> {
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
      { stdio: "inherit" },
    );
    active = child;
    child.on("error", reject);
    child.on("close", (code, signal) => {
      active = undefined;
      resolve({ code, signal });
    });
  });
}

try {
  let failed = false;
  for (const argv of runs) {
    if (interrupted) break;
    const result = await runBun(argv);
    if (result.signal !== null || result.code !== 0) {
      const red = failedFiles(junitPath);
      if (red.length > 0) {
        console.log(
          `tests gate: run red; re-running ${red.length} failed file(s) once: ${red.join(", ")}`,
        );
        const rerun = spawnSync("bun", ["test", ...red], { stdio: "inherit" });
        if (rerun.status !== 0) {
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
    for (const test of getFailedTests(junitPath)) {
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
