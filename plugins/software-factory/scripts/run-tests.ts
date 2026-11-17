#!/usr/bin/env bun
/**
 * Tests gate runner: `bun test` across parallel worker processes with a
 * wall-time report. `--parallel` implies `--isolate`: Bun gives every file a
 * fresh global object, module registry, environment and process listeners, so
 * files share neither tmp repos nor process-wide state. A file that still
 * races under the sweep is listed in SERIAL and runs in one `--parallel=1`
 * worker; the sweep ignores it. Output stays bun's own, which the kernel's
 * gate parser reads (it drops the closing wall line); this runner only adds
 * that line.
 *
 * Extra argv forwards to `bun test` and skips the shard split: a focused run
 * names exact files and should not pay for, or silently include, the serial
 * shard.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Parallel test workers; tuned for this suite on a many-core box. */
const WORKERS = 8;

/**
 * Files that run in one serial worker ahead of the parallel sweep, each with
 * the reason it cannot share eight workers. `--parallel` implies `--isolate`,
 * and Bun resets the global object, module registry, environment and process
 * listeners per file, so the child-group registry and process-wide env need no
 * shard; no test here binds a fixed port or path. A file that still races
 * under the sweep goes here with its observed failure, never behind a retry.
 */
const SERIAL: readonly string[] = [
  // Flaked to `infra` under 8 workers (1 of 3 full runs; green solo 11/11):
  // dispatch spawns real git worktrees and gates, which contended with 7 peers.
  "test/kernel/budget-drain.test.ts",
];

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

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-tests-"));
const timingsPath = path.join(tmpDir, "timings.json");
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
      ["test", "--timings", timingsPath, "--update-timings", ...argv],
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
  const results: RunResult[] = [];
  for (const argv of runs) {
    if (interrupted) break;
    results.push(await runBun(argv));
  }
  const wall = (performance.now() - started) / 1000;
  const slowest = slowestFiles(timingsPath, 5)
    .map(([file, ms]) => `${file} ${(ms / 1000).toFixed(1)}s`)
    .join(", ");
  const shape =
    forwarded.length > 0
      ? `focused; slowest: ${slowest}`
      : `--parallel=${WORKERS}; serial: ${SERIAL.length} files; slowest: ${slowest}`;
  // stderr, not stdout: gate capture concatenates stdout before stderr and
  // keeps the tail, so the wall report must be the last line of stderr.
  console.error(`tests gate: wall ${wall.toFixed(1)}s (${shape})`);
  const failed =
    interrupted !== undefined ||
    results.length < runs.length ||
    results.some((result) => result.signal !== null || result.code !== 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
} catch (error) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(`tests gate: failed to run bun test: ${String(error)}`);
  process.exit(1);
}
