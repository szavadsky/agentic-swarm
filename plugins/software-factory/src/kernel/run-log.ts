/**
 * The durable run log: one timestamped, append-only file per launch under the
 * goal's artifact directory. A tee copies the console's lines into it, so a
 * kill or a reboot keeps the evidence the operator already saw and never
 * replaces the console or a redirected stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";
import type { RunLog } from "./run-log-types.js";

/** Goal-relative directory of the launch logs; never artifact history. */
const RUN_LOG_DIR = "logs";
const RUN_LOG_PREFIX = "run-";
const RUN_LOG_SUFFIX = ".log";
const RUN_LOG_NAME = /^run-[^/]+\.log$/;

function runLogPath(goalDir: string, launchId: string): RunLog {
  const rel = `${RUN_LOG_DIR}/${RUN_LOG_PREFIX}${launchId}${RUN_LOG_SUFFIX}`;
  return { rel, path: path.join(goalDir, rel) };
}

/**
 * Creates this launch's file. The id is stamped and random, so a relaunch adds
 * a file and no launch ever reuses or truncates another's.
 */
export function openRunLog(goalDir: string, launchId: string): RunLog {
  const log = runLogPath(goalDir, launchId);
  fs.mkdirSync(path.dirname(log.path), { recursive: true });
  fs.appendFileSync(log.path, "");
  return log;
}

/** Every line of one printed message, each stamped and written now. */
function timestamped(text: string, at: () => Date): string {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const stamp = at().toISOString();
  return body
    .split("\n")
    .map((line) => `${stamp} ${line}\n`)
    .join("");
}

function appendRunLog(log: RunLog, text: string, at: () => Date): void {
  fs.appendFileSync(log.path, timestamped(text, at));
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];
type ConsoleWriter = (...args: unknown[]) => void;

interface Tap {
  log: RunLog;
  at: () => Date;
}

/** Active taps by log path; one console patch serves every launch in the process. */
const taps = new Map<string, Tap>();
let originals: Partial<Record<ConsoleMethod, ConsoleWriter>> | undefined;

function teed(original: ConsoleWriter): ConsoleWriter {
  return (...args: unknown[]): void => {
    const text = format(...args);
    // Append before printing: a kill between the two leaves a line the operator
    // has not seen, never a printed line the log misses.
    for (const tap of taps.values()) appendRunLog(tap.log, text, tap.at);
    original.apply(console, args);
  };
}

function patchConsole(): void {
  originals = {};
  for (const method of CONSOLE_METHODS) {
    const original = console[method] as ConsoleWriter;
    originals[method] = original;
    console[method] = teed(original);
  }
}

function restoreConsole(): void {
  if (!originals) return;
  for (const method of CONSOLE_METHODS) {
    const original = originals[method];
    if (original) console[method] = original;
  }
  originals = undefined;
}

/**
 * Copies every line the kernel prints into `log` until the returned function
 * runs. The console keeps working, and stdout/stderr are never touched, so a
 * shell redirect still receives exactly what it received before.
 */
export function installRunLogTee(
  log: RunLog,
  at: () => Date = () => new Date(),
): () => void {
  taps.set(log.path, { log, at });
  if (!originals) patchConsole();
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    taps.delete(log.path);
    if (taps.size === 0) restoreConsole();
  };
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

/** A candidate's modification time, or undefined when it is gone or not a file. */
async function candidateMtime(file: string): Promise<number | undefined> {
  try {
    const stat = await fs.promises.stat(file);
    return stat.isFile() ? stat.mtimeMs : undefined;
  } catch (err) {
    // Another launch may have swept it; a vanished candidate is not latest.
    if (isENOENT(err)) return undefined;
    throw err;
  }
}

interface Candidate {
  name: string;
  mtimeMs: number;
}

function newer(
  current: Candidate | undefined,
  name: string,
  mtimeMs: number,
): Candidate {
  if (!current) return { name, mtimeMs };
  const later =
    mtimeMs > current.mtimeMs ||
    (mtimeMs === current.mtimeMs && name > current.name);
  return later ? { name, mtimeMs } : current;
}

/**
 * Goal-relative path of the newest launch log, by modification time. Absent
 * before the first launch and under an older kernel; never a guess from a
 * missing directory.
 */
export async function latestRunLog(
  goalDir: string,
): Promise<string | undefined> {
  const dir = path.join(goalDir, RUN_LOG_DIR);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return undefined;
    throw err;
  }
  let latest: Candidate | undefined;
  for (const name of names.sort()) {
    if (!RUN_LOG_NAME.test(name)) continue;
    const mtimeMs = await candidateMtime(path.join(dir, name));
    if (mtimeMs === undefined) continue;
    latest = newer(latest, name, mtimeMs);
  }
  return latest ? `${RUN_LOG_DIR}/${latest.name}` : undefined;
}
