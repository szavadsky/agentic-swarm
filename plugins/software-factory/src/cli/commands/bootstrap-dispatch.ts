/**
 * `bootstrap/dispatch.sh`'s body: run one assignment file through the
 * OpenCode CLI on a free model (LOG D10). The assignment's worktree and
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

/** One free-tier run at a time: a free model takes the slot lock (LOG D14). */
export function isFreeModel(model: string): boolean {
  if (model === "opencode/big-pickle") return true;
  if (!model.startsWith("opencode/")) return false;
  return model.includes("-free");
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

/** Aggregates of one opencode JSONL event log, as the old jq pipes printed. */
export interface LogSummary {
  session: string;
  steps: number;
  toolCalls: number;
  errors: unknown[];
  finalText: string;
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

export interface DispatchOptions {
  /** Repo root of the checkout running dispatch. */
  root: string;
  /** Assignment name; usage and exit 1 when missing. */
  name?: string;
  /** Model; the free-model default when missing. */
  model?: string;
  env?: NodeJS.ProcessEnv;
  /** Overrides the clock, for deterministic log names in tests. */
  now?: Date;
}

/**
 * Runs one assignment through the OpenCode CLI in its worktree, printing the
 * summary the old dispatch.sh printed and returning its exit code. A missing
 * name prints usage and returns 1; a failed worktree add or install is a
 * hard error.
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
  const model = opts.model ?? "opencode/deepseek-v4.1-flash-free#max";
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
  const status = runOpencode({
    name,
    model,
    wt,
    free,
    slots,
    env,
    message,
    log,
  });
  const sum = await summarizeLog(log);
  printSummary(name, model, status, log, sum);
  return status;
}

/** Runs the OpenCode CLI for one assignment, under the timeout. */
function runOpencode(opts: {
  name: string;
  model: string;
  wt: string;
  free: boolean;
  slots: string;
  env: NodeJS.ProcessEnv;
  message: string;
  log: string;
}): number {
  const args: string[] = [
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
  if (opts.env.SESSION) args.push("-s", opts.env.SESSION);
  args.push(opts.message);
  const runArgs: string[] = [
    opts.env.FACTORY_DISPATCH_TIMEOUT ?? "3h",
    "opencode",
    ...args,
  ];
  const opCmd = opts.free ? "flock" : "timeout";
  const opArgs = opts.free
    ? [path.join(opts.slots, "opencode-free.lock"), "timeout", ...runArgs]
    : runArgs;

  const stdoutFd = fs.openSync(opts.log, "w");
  const stderrFd = fs.openSync(`${opts.log}.stderr`, "w");
  try {
    const res = spawnSync(opCmd, opArgs, {
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
