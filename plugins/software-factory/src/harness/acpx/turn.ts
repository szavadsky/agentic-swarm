import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import { registerChildGroup, unregisterChildGroup } from "../../core/shutdown.js";
import { exitDetails, stopDetails } from "../details.js";
import type { ModelRef, Stop, TurnRequest, TurnResult } from "../types.js";
import { zeroUsage } from "../usage.js";
import { classifyAcpxError, classifyAcpxTurn, isNoSessionError } from "./classify.js";
import { AcpxTranscriptParser, acpxErrors } from "./transcript.js";
import { ACPX_EFFORT, type AcpxAgent, type AcpxCommand, type AcpxTurnSummary } from "./types.js";

const SETUP_TIMEOUT_SEC = 120;
const MAX_STDERR_BYTES = 64 * 1024;

export interface AcpxRuntime {
  agent: AcpxAgent;
  command: AcpxCommand;
}

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

function globalArgs(cwd: string): string[] {
  // acpx requires global flags before the agent subcommand (probe §0).
  return ["--format", "json", "--cwd", path.resolve(cwd)];
}

async function runSetup(runtime: AcpxRuntime, args: string[], cwd: string): Promise<Stop | undefined> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    timeoutSec: SETUP_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  const errors = acpxErrors(result.stdout);
  const error = errors.at(-1);
  if (error) return classifyAcpxError(error);
  if (result.timedOut) return { kind: "infra", cause: "timeout" };
  if (result.code !== 0) {
    const details = stopDetails(result.stderr) ?? exitDetails(result.code, result.signal ?? null);
    return details ? { kind: "infra", cause: "crash", details } : { kind: "infra", cause: "crash" };
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
): Promise<Omit<TurnResult, "attempts">> {
  const agent = runtime.agent;
  const model: ModelRef = { ...requested, effort: req.effort ?? requested.effort };
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
  let name = resume ?? `${agent}-${randomUUID()}`;
  const base = globalArgs(req.cwd);

  // A resumed record may be gone (TTL, `sessions close`); acpx then answers
  // NO_SESSION. Retry once de novo with a new name so the returned ref is live
  // and the next turn does not resume the same dead record forever.
  for (let attempt = 0; ; attempt += 1) {
    if (!resume || attempt > 0) {
      const stop = await runSetup(runtime, [...base, agent, "sessions", "new", "--name", name], req.cwd);
      if (stop) return { stop, text: "", usage: zeroUsage(), model };
    }

    const effort = model.effort;
    if (effort) {
      const stop = await runSetup(
        runtime,
        [...base, agent, "-s", name, "set", ACPX_EFFORT[agent].configId, effort],
        req.cwd
      );
      if (stop) return { stop, text: "", usage: zeroUsage(), model };
    }

    const startedAt = new Date().toISOString();
    const parser = new AcpxTranscriptParser();
    const processResult = await runPromptProcess(
      runtime,
      [...base, "--model", model.id, agent, "-s", name, req.prompt],
      req.cwd,
      req.timeouts,
      parser
    );
    const summary: AcpxTurnSummary = parser.result();
    const lost = summary.errors.some(isNoSessionError);

    if (lost && attempt === 0 && resume) {
      name = `${agent}-${randomUUID()}`;
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
    };
  }
}
