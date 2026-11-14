import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import { registerChildGroup, unregisterChildGroup } from "../../core/shutdown.js";
import { exitDetails, stopDetails } from "../details.js";
import type { AdapterTurnResult, ModelRef, Stop, TurnAttempt, TurnRequest } from "../types.js";
import { zeroUsage } from "../usage.js";
import { classifyAcpxError, classifyAcpxTurn, isNoSessionError } from "./classify.js";
import { AcpxTranscriptParser, acpxErrors } from "./transcript.js";
import {
  ACPX_EFFORT,
  ACPX_EFFORT_MODEL_BASES,
  type AcpxAgent,
  type AcpxCommand,
  type AcpxTurnSummary,
} from "./types.js";

const SETUP_TIMEOUT_SEC = 120;
const MAX_STDERR_BYTES = 64 * 1024;

export interface AcpxRuntime {
  agent: AcpxAgent;
  command: AcpxCommand;
  /** agy executable spawned by the raw `--agent` route. */
  agyBinary: string;
}

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

/**
 * acpx's built-in `antigravity` agent spawns `agy_acp_server.par`, which the
 * agy CLI does not install; its `<agy> acp` stdio server is reachable through
 * the raw-agent escape hatch instead. The path is resolved here rather than
 * left to the spawned process so AGY_PATH reaches it.
 */
function agentSelection(runtime: AcpxRuntime): string[] {
  return runtime.agent === "agy" ? ["--agent", `${runtime.agyBinary} acp`] : [runtime.agent];
}

function globalArgs(agent: AcpxAgent, cwd: string): string[] {
  // acpx requires global flags before the agent subcommand (probe §0).
  const args = ["--format", "json", "--cwd", path.resolve(cwd)];
  // agy asks before it runs a shell command and acpx's non-interactive answer
  // is `deny`, which would fail every gate command. pi and codex emitted no
  // permission frames in the probe (probe §7).
  if (agent === "agy") args.push("--approve-all");
  return args;
}

/**
 * agy keeps effort inside the model id (`gemini-3.8-flash-high`), while acpx's
 * `--model` accepts only the base id its `model` config option lists. A known
 * suffix moves to the `thought_level` session option; an explicit effort wins.
 */
function acpxModel(agent: AcpxAgent, model: ModelRef): { id: string; effort?: string } {
  let id = model.id;
  let effort = model.effort;
  if (agent === "agy") {
    for (const [base, levels] of Object.entries(ACPX_EFFORT_MODEL_BASES)) {
      const suffix = id.startsWith(`${base}-`) ? id.slice(base.length + 1) : undefined;
      if (suffix !== undefined && levels.includes(suffix)) {
        id = base;
        effort = effort ?? suffix;
        break;
      }
    }
  }
  return effort === undefined ? { id } : { id, effort };
}

interface SetupFailure {
  stop: Stop;
  /** acpx answered NO_SESSION: the named record is gone. */
  noSession: boolean;
}

async function runSetup(
  runtime: AcpxRuntime,
  args: string[],
  cwd: string
): Promise<SetupFailure | undefined> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    timeoutSec: SETUP_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  const errors = acpxErrors(result.stdout);
  const error = errors.at(-1);
  if (error) return { stop: classifyAcpxError(error), noSession: isNoSessionError(error) };
  if (result.timedOut) return { stop: { kind: "infra", cause: "timeout" }, noSession: false };
  if (result.code !== 0) {
    const details = stopDetails(result.stderr) ?? exitDetails(result.code, result.signal ?? null);
    const stop: Stop = details
      ? { kind: "infra", cause: "crash", details }
      : { kind: "infra", cause: "crash" };
    return { stop, noSession: false };
  }
  return undefined;
}

interface PromptProcessResult {
  code: number | null;
  signal: string | null;
  stderr: string;
  timedOut: boolean;
}

/** One prompt process: stream stdout into the parser, enforce idle and wall bounds. */
function runPromptProcess(
  runtime: AcpxRuntime,
  args: string[],
  cwd: string,
  timeouts: TurnRequest["timeouts"],
  parser: AcpxTranscriptParser
): Promise<PromptProcessResult> {
  return new Promise((resolve) => {
    let stderr = "";
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let wallTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let closed = false;
    let child: ReturnType<typeof spawn> | undefined;
    let pid = 0;

    const killGroup = (signal: NodeJS.Signals) => {
      if (closed) return;
      try {
        if (pid > 0) process.kill(-pid, signal);
        else child?.kill(signal);
      } catch {
        try {
          child?.kill(signal);
        } catch {}
      }
    };
    const clearTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (wallTimer) clearTimeout(wallTimer);
      idleTimer = undefined;
      wallTimer = undefined;
    };
    const timeout = () => {
      if (timedOut) return;
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
    };
    const resetIdle = () => {
      if (!timeouts.idleMs || timeouts.idleMs <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(timeout, timeouts.idleMs);
      idleTimer.unref?.();
    };

    try {
      child = spawn(runtime.command.binary, [...runtime.command.prefix, ...args], {
        cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      resolve({
        code: null,
        signal: null,
        stderr: (error as Error).message,
        timedOut: false,
      });
      return;
    }
    pid = child.pid ?? 0;
    if (pid > 0) registerChildGroup(pid);
    if (timeouts.wallMs > 0) {
      wallTimer = setTimeout(timeout, timeouts.wallMs);
      wallTimer.unref?.();
    }
    resetIdle();

    const decoder = new TextDecoder();
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      resetIdle();
      buffer += decoder.decode(chunk, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        parser.feedLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_BYTES);
    });
    child.on("error", (error) => {
      stderr = `${stderr}\n${error.message}`.slice(-MAX_STDERR_BYTES);
      closed = true;
      clearTimers();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({ code: null, signal: null, stderr, timedOut });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (buffer.trim()) parser.feedLine(buffer);
      clearTimers();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({ code, signal, stderr, timedOut });
    });
  });
}

/** One acpx turn for one model from the fallback chain. */
export async function runAcpxTurn(
  runtime: AcpxRuntime,
  req: TurnRequest,
  requested: ModelRef
): Promise<AdapterTurnResult> {
  const agent = runtime.agent;
  const requestedModel: ModelRef = { ...requested, effort: req.effort ?? requested.effort };
  // What acpx receives on --model versus what the session records: agy's effort
  // suffix is the wire-incompatible part, the alias's model id stays the record.
  const wire = acpxModel(agent, requestedModel);
  const model: ModelRef = wire.effort
    ? { id: requestedModel.id, effort: wire.effort }
    : { id: requestedModel.id };
  if (
    req.session &&
    req.session.harness === agent &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `acpx ${agent} session ${req.session.id} is cwd-bound to ${req.session.cwd}, not ${req.cwd}`
    );
  }

  // A named session per turn: acpx records are cwd-keyed, so implementer and
  // reviewer sharing a worktree would otherwise land in one record.
  const resume = req.session && req.session.harness === agent ? req.session.id : undefined;
  const freshName = () => `${agent}-${randomUUID()}`;
  let name = resume ?? freshName();
  const globals = globalArgs(agent, req.cwd);
  const selection = agentSelection(runtime);
  const base = [...globals, ...selection];

  // A resumed record may be gone (TTL, `sessions close`); acpx then answers
  // NO_SESSION. Retry once de novo with a new name so the returned ref is live
  // and the next turn does not resume the same dead record forever. The retry
  // covers both setup commands and the prompt, and attempt 0 is the only
  // attempt that may resume, so at most one de-novo retry runs per turn. Each
  // lost record is kept as an attempt so the restart is never silent.
  const attempts: TurnAttempt[] = [];
  for (let attempt = 0; ; attempt += 1) {
    const canRetryDeNovo = resume !== undefined && attempt === 0;
    const shouldRetryDeNovo = (failure: SetupFailure) => failure.noSession && canRetryDeNovo;

    if (!resume || attempt > 0) {
      const failure = await runSetup(
        runtime,
        [...base, "sessions", "new", "--name", name],
        req.cwd
      );
      if (failure) {
        if (shouldRetryDeNovo(failure)) {
          attempts.push({ model, stop: failure.stop, usage: zeroUsage() });
          name = freshName();
          continue;
        }
        return { stop: failure.stop, text: "", usage: zeroUsage(), model, attempts };
      }
    }

    const effort = model.effort;
    if (effort) {
      // The raw --agent route has no agent command to hang the session flag on,
      // so `-s` follows the top-level subcommand; pi and codex take it first.
      const set =
        agent === "agy"
          ? [...base, "set", "-s", name, ACPX_EFFORT[agent].configId, effort]
          : [...base, "-s", name, "set", ACPX_EFFORT[agent].configId, effort];
      const failure = await runSetup(runtime, set, req.cwd);
      if (failure) {
        if (shouldRetryDeNovo(failure)) {
          attempts.push({ model, stop: failure.stop, usage: zeroUsage() });
          name = freshName();
          continue;
        }
        return { stop: failure.stop, text: "", usage: zeroUsage(), model, attempts };
      }
    }

    const startedAt = new Date().toISOString();
    const parser = new AcpxTranscriptParser();
    // acpx parses the agent subcommand with enablePositionalOptions, so a
    // global `--model` after pi/codex is `unknown option '--model'` (exit 2).
    // The raw route has no positional agent, but `--model` must still precede
    // its `prompt` verb.
    const promptVerb = agent === "agy" ? ["prompt"] : [];
    const prompt = [
      ...globals,
      "--model",
      wire.id,
      ...selection,
      ...promptVerb,
      "-s",
      name,
      req.prompt,
    ];
    const processResult = await runPromptProcess(
      runtime,
      prompt,
      req.cwd,
      req.timeouts,
      parser
    );
    const summary: AcpxTurnSummary = parser.result();
    const lost = summary.errors.some(isNoSessionError);

    if (lost && canRetryDeNovo) {
      attempts.push({
        model,
        stop: classifyAcpxTurn({
          summary,
          code: processResult.code,
          signal: processResult.signal,
          timedOut: processResult.timedOut,
          stderr: processResult.stderr,
        }),
        usage: summary.usage,
      });
      name = freshName();
      continue;
    }

    const stop = classifyAcpxTurn({
      summary,
      code: processResult.code,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      stderr: processResult.stderr,
    });

    // A session that acpx says is gone must not be handed back to the kernel.
    const session = lost
      ? undefined
      : {
          harness: agent,
          id: name,
          cwd: req.cwd,
          model,
          lastRequestStartedAt: startedAt,
          retentionTier: "short" as const,
          compacted: req.session?.compacted ?? false,
        };

    return {
      stop,
      text: summary.text,
      usage: summary.usage,
      session,
      model,
      attempts,
    };
  }
}
