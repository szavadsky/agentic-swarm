/**
 * `bootstrap/dispatch.sh`'s body: run one assignment file through the
 * harness CLI on a free model (LOG D10). Which harness and model to run is
 * machine configuration, never repo code: `$FACTORY_DISPATCH_BIN` names the
 * executable, `$FACTORY_DISPATCH_MODEL` (or the `[model]` argument) the
 * `<provider>/<model>[#effort]` to pass it. The assignment's worktree and
 * branch follow its name: ../<name> on factory-v3-<name>, created from
 * factory-v3 when missing. The event log (JSONL) goes outside git:
 * $FACTORY_BOOTSTRAP_RUNS or ~/.local/share/factory/bootstrap-runs.
 * Follow-up round in the same session (same context, same agent):
 * SESSION=<id> MESSAGE="..." dispatch.sh <assignment>.
 *
 * Runtime imports are node builtins only, so the operator's checkout needs
 * no installed dependencies to launch a run.
 */

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { runSync } from "./promote.js";
import type { DispatchOptions, LogSummary } from "./types.js";

export type { DispatchOptions, LogSummary } from "./types.js";

/** A hard dispatch failure; the entry maps it to this exit code. */
export class DispatchError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

/** Local timestamp in the shell's `%Y%m%dT%H%M%S` shape. */
export function stampNow(date: Date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}` +
    `T${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  );
}

/**
 * One free-tier run at a time: a free model takes the slot lock (LOG D14).
 * Free-tier models carry the `-free` model id, whatever provider prefix or
 * effort suffix surrounds it.
 */
export function isFreeModel(model: string): boolean {
  const id = model.split("#")[0] ?? "";
  return id.slice(id.lastIndexOf("/") + 1).endsWith("-free");
}

/** A required machine setting, or the dispatch failure that names it. */
function setting(env: NodeJS.ProcessEnv, name: string, what: string): string {
  const value = env[name]?.trim();
  if (!value) throw new DispatchError(`${name} is not set: ${what}`, 1);
  return value;
}

/** The executable and model this machine dispatches: repo code names neither. */
function dispatchTarget(
  env: NodeJS.ProcessEnv,
  model: string | undefined,
): { binary: string; model: string } {
  return {
    binary: setting(
      env,
      "FACTORY_DISPATCH_BIN",
      "name the harness executable to spawn",
    ),
    model:
      model ??
      setting(
        env,
        "FACTORY_DISPATCH_MODEL",
        "name the model as <provider>/<model>[#effort]",
      ),
  };
}

function logsDir(env: NodeJS.ProcessEnv): string {
  return path.resolve(
    env.FACTORY_BOOTSTRAP_RUNS ??
      path.join(os.homedir(), ".local/share/factory/bootstrap-runs"),
  );
}

function slotDir(env: NodeJS.ProcessEnv): string {
  return path.resolve(
    env.FACTORY_SLOT_DIR ??
      path.join(os.homedir(), ".local/share/factory/slots"),
  );
}

function assignmentMessage(name: string, wt: string): string {
  return (
    `Your assignment is the file bootstrap/assignments/${name}.md in this git ` +
    `worktree (${wt}). Read bootstrap/assignments/RULES.md and the ` +
    `assignment in full, then carry it out to completion.`
  );
}

/** A failing child with its captured output on stderr, or undefined. */
function runMust(
  cmd: string,
  args: readonly string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): { code: number; stdout: string; stderr: string } {
  const res = runSync(cmd, args, opts);
  if (res.code !== 0) throw new DispatchError(res.stderr.trim(), res.code);
  return res;
}

/** One log line's event folded into the summary, as the old jq did. */
function applyEvent(summary: LogSummary, event: unknown): void {
  const obj = event as Record<string, unknown>;
  if (obj.type === "step_start" && !summary.session) {
    summary.session = String(obj.sessionID ?? "");
  }
  if (obj.type === "step_finish") summary.steps += 1;
  if (obj.type === "tool_use") summary.toolCalls += 1;
  if (obj.type === "error") summary.errors.push(obj.error);
  if (obj.type === "text") {
    const part = obj.part as { text?: unknown } | undefined;
    if (typeof part?.text === "string") summary.finalText = part.text;
  }
}

/** Reads one JSONL log; a missing or unreadable file is an empty summary. */
export async function summarizeLog(log: string): Promise<LogSummary> {
  const summary: LogSummary = {
    session: "",
    steps: 0,
    toolCalls: 0,
    errors: [],
    finalText: "",
  };
  if (!fs.existsSync(log)) return summary;
  const lines = createInterface({
    input: fs.createReadStream(log),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      applyEvent(summary, JSON.parse(line));
    } catch {
      // A malformed JSONL line is not an event; the summary copies the rest.
    }
  }
  return summary;
}

/** Prints the same summary the old dispatch.sh's jq pipeline printed. */
export function printSummary(
  name: string,
  model: string,
  status: number,
  log: string,
  sum: LogSummary,
): void {
  console.log(`assignment=${name} model=${model} exit=${status} log=${log}`);
  console.log(`session=${sum.session}`);
  console.log(`steps=${sum.steps} tool_calls=${sum.toolCalls}`);
  console.log("errors:");
  for (const err of sum.errors.slice(-3)) console.log(JSON.stringify(err));
  console.log("final text:");
  console.log(sum.finalText.slice(0, 1500));
}

/**
 * Runs one assignment through the harness CLI in its worktree, printing the
 * summary the old dispatch.sh printed and returning its exit code. A missing
 * name prints usage and returns 1; a missing executable or model is a hard
 * error, as is a failed worktree add or install.
 */
export async function dispatchAssignment(
  opts: DispatchOptions,
): Promise<number> {
  const env = opts.env ?? process.env;
  if (!opts.name) {
    console.error("usage: dispatch.sh <assignment> [model]");
    return 1;
  }
  const name = opts.name;
  const { binary, model } = dispatchTarget(env, opts.model);
  const root = path.resolve(opts.root);
  const lower = name.toLowerCase();
  const wt = path.join(path.dirname(root), lower);
  const logs = logsDir(env);
  fs.mkdirSync(logs, { recursive: true });
  const free = isFreeModel(model);
  const slots = slotDir(env);
  if (free) fs.mkdirSync(slots, { recursive: true });

  const log = path.join(logs, `${name}-${stampNow(opts.now)}.jsonl`);
  if (!fs.existsSync(wt)) {
    runMust(
      "git",
      ["worktree", "add", "-q", "-b", `factory-v3-${lower}`, wt, "factory-v3"],
      { cwd: root, env },
    );
  }
  if (!fs.existsSync(path.join(wt, "plugins/software-factory"))) {
    throw new DispatchError(`no plugins/software-factory in ${wt}`, 1);
  }
  runMust("bun", ["install", "--frozen-lockfile", "--silent"], {
    cwd: path.join(wt, "plugins/software-factory"),
    env,
  });

  const message = env.MESSAGE ?? assignmentMessage(name, wt);
  const status = runHarness({
    name,
    model,
    binary,
    /** One slot per harness executable, so two free runs never overlap. */
    lock: path.join(slots, `${path.basename(binary)}-free.lock`),
    wt,
    free,
    env,
    message,
    log,
  });
  const sum = await summarizeLog(log);
  printSummary(name, model, status, log, sum);
  return status;
}

/** Runs the harness CLI for one assignment, under the timeout. */
function runHarness(opts: {
  name: string;
  model: string;
  binary: string;
  lock: string;
  wt: string;
  free: boolean;
  env: NodeJS.ProcessEnv;
  message: string;
  log: string;
}): number {
  const cliArgs: string[] = [
    "run",
    "--auto",
    "--archived",
    "--format",
    "json",
    "--title",
    `bootstrap ${opts.name}`,
    "-m",
    opts.model,
  ];
  if (opts.env.SESSION) cliArgs.push("-s", opts.env.SESSION);
  cliArgs.push(opts.message);
  const runArgs: string[] = [
    opts.env.FACTORY_DISPATCH_TIMEOUT ?? "3h",
    opts.binary,
    ...cliArgs,
  ];
  const cmd = opts.free ? "flock" : "timeout";
  const spawnArgs = opts.free ? [opts.lock, "timeout", ...runArgs] : runArgs;

  const stdoutFd = fs.openSync(opts.log, "w");
  const stderrFd = fs.openSync(`${opts.log}.stderr`, "w");
  try {
    const res = spawnSync(cmd, spawnArgs, {
      cwd: opts.wt,
      env: opts.env,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    if (res.error) throw new DispatchError(res.error.message, 127);
    return res.status ?? 1;
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}
