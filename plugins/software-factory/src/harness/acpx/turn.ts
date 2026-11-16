import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import {
  registerChildGroup,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import { exitWithDetails, lastNonBannerLine } from "../details.js";
import type {
  AdapterTurnResult,
  ModelRef,
  SessionRef,
  Stop,
  TurnAttempt,
  TurnRequest,
  Usage,
} from "../types.js";
import { zeroUsage } from "../usage.js";
import {
  classifyAcpxError,
  classifyAcpxTurn,
  classifyZeroUsageTurn,
  isNoSessionError,
} from "./classify.js";
import { resolveRawAgentCommand } from "./command.js";
import { acpxModel } from "./model.js";
import { AcpxTranscriptParser, acpxErrors } from "./transcript.js";
import { turnUsageFromTotals, usageFromAcpxSessionText } from "./usage.js";
import type { AcpxConfig, AcpxTurnOpaque } from "./config.js";
import type {
  AcpxCommand,
  AcpxCommandResult,
  AcpxTurnSummary,
} from "./types.js";

const SETUP_TIMEOUT_SEC = 120;
const MAX_STDERR_BYTES = 64 * 1024;
/** A slash command reuses the session; no model turn runs, so the bound is setup-sized. */
const COMMAND_TIMEOUTS: TurnRequest["timeouts"] = {
  idleMs: 120_000,
  wallMs: 180_000,
};

export interface AcpxRuntime {
  id: string;
  command: AcpxCommand;
  acpx: AcpxConfig;
}

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

function turnConfig(runtime: AcpxRuntime, req: TurnRequest): AcpxConfig {
  const opaque = (req.opaque as AcpxTurnOpaque | undefined) ?? runtime.acpx;
  if (!opaque || typeof opaque.agent !== "string" || !opaque.agent) {
    throw new Error(`acpx harness "${runtime.id}" has no agent configured`);
  }
  return opaque;
}

/**
 * The raw-agent escape hatch (`--agent "<binary> acp"`) reaches a stdio server
 * the dispatcher cannot spawn itself. The path is resolved here rather than
 * left to the spawned process so config and pre-flight agree.
 */
export function acpxAgentSelection(config: AcpxConfig): string[] {
  return config.raw
    ? ["--agent", resolveRawAgentCommand(config.agent)]
    : [config.agent];
}

export function acpxGlobalArgs(config: AcpxConfig, cwd: string): string[] {
  // acpx requires global flags before the agent subcommand (probe §0).
  return [
    "--format",
    "json",
    "--cwd",
    path.resolve(cwd),
    ...(config.args ?? []),
  ];
}

interface SetupFailure {
  stop: Stop;
  /** acpx answered NO_SESSION: the named record is gone. */
  noSession: boolean;
}

async function runSetup(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<SetupFailure | undefined> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    env: config.env,
    timeoutSec: SETUP_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
    signal,
  });
  if (result.aborted) return { stop: { kind: "cancelled" }, noSession: false };
  const errors = acpxErrors(result.stdout);
  const error = errors.at(-1);
  if (error)
    return {
      stop: classifyAcpxError(error, {
        code: result.code,
        signal: result.signal ?? null,
      }),
      noSession: isNoSessionError(error),
    };
  if (result.timedOut)
    return { stop: { kind: "infra", cause: "timeout" }, noSession: false };
  if (result.code !== 0) {
    const details = exitWithDetails(
      result.code,
      result.signal ?? null,
      lastNonBannerLine(result.stderr),
    );
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
  /** The kernel's AbortSignal fired; the child was killed, not reaped. */
  aborted: boolean;
  /** Local receipt time of the last non-empty stdout line; absent when none arrived. */
  lastEventAt?: string;
}

/** One prompt process: stream stdout into the parser, enforce idle and wall bounds. */
function runPromptProcess(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  args: string[],
  cwd: string,
  timeouts: TurnRequest["timeouts"],
  parser: AcpxTranscriptParser,
  signal?: AbortSignal,
): Promise<PromptProcessResult> {
  if (signal?.aborted) {
    return Promise.resolve({
      code: null,
      signal: null,
      stderr: "",
      timedOut: false,
      aborted: true,
    });
  }
  return new Promise((resolve) => {
    let stderr = "";
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let wallTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let aborted = false;
    let closed = false;
    let child: ReturnType<typeof spawn> | undefined;
    let pid = 0;
    let lastEventAt: string | undefined;

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
      if (timedOut || aborted) return;
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
    };
    const externalAbort = () => {
      if (aborted || closed) return;
      aborted = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
    };
    signal?.addEventListener("abort", externalAbort, { once: true });
    const clearSignal = () =>
      signal?.removeEventListener("abort", externalAbort);
    const resetIdle = () => {
      if (!timeouts.idleMs || timeouts.idleMs <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(timeout, timeouts.idleMs);
      idleTimer.unref?.();
    };

    try {
      child = spawn(
        runtime.command.binary,
        [...runtime.command.prefix, ...args],
        {
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, ...config.env },
        },
      );
    } catch (error) {
      resolve({
        code: null,
        signal: null,
        stderr: (error as Error).message,
        timedOut: false,
        aborted,
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
      while (true) {
        index = buffer.indexOf("\n");
        if (index < 0) break;
        parser.feedLine(buffer.slice(0, index));
        lastEventAt = new Date().toISOString();
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
      clearSignal();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({ code: null, signal: null, stderr, timedOut, aborted });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (buffer.trim()) {
        parser.feedLine(buffer);
        lastEventAt = new Date().toISOString();
      }
      clearTimers();
      clearSignal();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({ code, signal, stderr, timedOut, aborted, lastEventAt });
    });
  });
}

/**
 * One adapter slash command on a named session, with no model prompt: the
 * command is the whole prompt and `--model` is omitted, so `/compact` reaches
 * the adapter instead of spending a model turn. Returns the parsed transcript
 * (ACP errors included) and the process facts so callers can classify it.
 */
export async function runAcpxCommand(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  ref: Pick<SessionRef, "id" | "cwd">,
  command: string,
  signal?: AbortSignal,
): Promise<AcpxCommandResult> {
  const globals = acpxGlobalArgs(config, ref.cwd);
  const selection = acpxAgentSelection(config);
  // The raw --agent route has no positional agent: the prompt verb follows the
  // selection. A positional agent takes `-s` and the command directly.
  const verb = config.raw ? ["prompt"] : [];
  const args = [...globals, ...selection, ...verb, "-s", ref.id, command];
  const parser = new AcpxTranscriptParser(config.usage?.fields);
  const result = await runPromptProcess(
    runtime,
    config,
    args,
    ref.cwd,
    COMMAND_TIMEOUTS,
    parser,
    signal,
  );
  return {
    summary: parser.result(),
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    stderr: result.stderr,
  };
}

/**
 * Read a session's cumulative token totals through its usage command. The
 * command is the whole prompt, so it reuses the session without spending a
 * model turn. Any failure leaves the caller's stop and usage untouched.
 */
export async function readAcpxSessionUsage(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  ref: Pick<SessionRef, "id" | "cwd">,
  signal?: AbortSignal,
): Promise<Usage | undefined> {
  const command = config.usage?.command;
  if (!command) return undefined;
  const result = await runAcpxCommand(runtime, config, ref, command, signal);
  if (
    result.aborted ||
    result.timedOut ||
    result.code !== 0 ||
    result.summary.errors.length > 0 ||
    result.summary.stopReason !== "end_turn"
  ) {
    return undefined;
  }
  return usageFromAcpxSessionText(result.summary.text);
}

function isZeroUsage(usage: Usage): boolean {
  return (
    usage.in === 0 &&
    usage.out === 0 &&
    usage.cacheRead === 0 &&
    usage.cacheWrite5m === 0 &&
    usage.cacheWrite1h === 0 &&
    usage.reasoningOut === 0
  );
}

/** One acpx turn for one model from the fallback chain. */
export async function runAcpxTurn(
  runtime: AcpxRuntime,
  req: TurnRequest,
  requested: ModelRef,
): Promise<AdapterTurnResult> {
  const config = turnConfig(runtime, req);
  const requestedModel: ModelRef = {
    ...requested,
    effort: req.effort ?? requested.effort,
  };
  // What acpx receives on --model versus what the session records: an effort
  // suffix is the wire-incompatible part, the alias's model id stays the record.
  const wire = acpxModel(config, requestedModel);
  const model: ModelRef = wire.effort
    ? { id: requestedModel.id, effort: wire.effort }
    : { id: requestedModel.id };

  // A named session per turn: acpx records are cwd-keyed, so implementer and
  // reviewer sharing a worktree would otherwise land in one record. The kernel
  // only resumes cwd-matching sessions; a stray record starts de novo.
  const resume =
    req.session &&
    req.session.harness === runtime.id &&
    path.resolve(req.session.cwd) === path.resolve(req.cwd)
      ? req.session.id
      : undefined;
  const freshName = () => `${runtime.id}-${randomUUID()}`;
  let name = resume ?? freshName();
  const globals = acpxGlobalArgs(config, req.cwd);
  const selection = acpxAgentSelection(config);
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
    const shouldRetryDeNovo = (failure: SetupFailure) =>
      failure.noSession && canRetryDeNovo;

    if (!resume || attempt > 0) {
      const failure = await runSetup(
        runtime,
        config,
        [...base, "sessions", "new", "--name", name],
        req.cwd,
        req.signal,
      );
      if (failure) {
        if (shouldRetryDeNovo(failure)) {
          attempts.push({ model, stop: failure.stop, usage: zeroUsage() });
          name = freshName();
          continue;
        }
        return {
          stop: failure.stop,
          text: "",
          usage: zeroUsage(),
          model,
          attempts,
        };
      }
    }

    const effort = model.effort;
    if (effort) {
      const configId = config.effort?.configId;
      if (!configId) {
        throw new Error(
          `acpx harness "${runtime.id}" has no effort config but effort "${effort}" was requested`,
        );
      }
      // The raw --agent route has no agent command to hang the session flag on,
      // so `-s` follows the top-level subcommand; a positional agent takes it first.
      const set = config.raw
        ? [...base, "set", "-s", name, configId, effort]
        : [...base, "-s", name, "set", configId, effort];
      const failure = await runSetup(runtime, config, set, req.cwd, req.signal);
      if (failure) {
        if (shouldRetryDeNovo(failure)) {
          attempts.push({ model, stop: failure.stop, usage: zeroUsage() });
          name = freshName();
          continue;
        }
        return {
          stop: failure.stop,
          text: "",
          usage: zeroUsage(),
          model,
          attempts,
        };
      }
    }

    const parser = new AcpxTranscriptParser(config.usage?.fields);
    // acpx parses the agent subcommand with enablePositionalOptions, so a
    // global `--model` after it is `unknown option '--model'` (exit 2).
    // The raw route has no positional agent, but `--model` must still precede
    // its `prompt` verb.
    const promptVerb = config.raw ? ["prompt"] : [];
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
      config,
      prompt,
      req.cwd,
      req.timeouts,
      parser,
      req.signal,
    );
    const summary: AcpxTurnSummary = parser.result();
    const lost = summary.errors.some(isNoSessionError);
    // ACP `usage_update.cost` is cumulative for the session, so a resumed one
    // already carries earlier turns. Only a fresh session's figure is this
    // turn's spend; a resumed turn leaves cost to the price table.
    if (resume !== undefined && attempt === 0) delete summary.usage.costUsd;

    // An aborted turn never retries de novo: the caller stopped the turn, so no
    // new child may spawn after the abort.
    if (lost && canRetryDeNovo && !processResult.aborted) {
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

    let stop: Stop = processResult.aborted
      ? { kind: "cancelled" }
      : classifyAcpxTurn({
          summary,
          code: processResult.code,
          signal: processResult.signal,
          timedOut: processResult.timedOut,
          stderr: processResult.stderr,
        });

    const resumed = resume !== undefined && attempt === 0;
    // A session that acpx says is gone must not be handed back to the kernel.
    const session: SessionRef | undefined = lost
      ? undefined
      : {
          harness: runtime.id,
          id: name,
          cwd: req.cwd,
          model,
          // Use the last streamed model event, not the prompt's start: a long
          // turn's cache is refreshed while its final response streams. ACP
          // carries no request timestamp, so local receipt time is the evidence.
          lastRequestStartedAt:
            processResult.lastEventAt ?? new Date().toISOString(),
          retentionTier: "short" as const,
          compacted: req.session?.compacted ?? false,
          // A failed usage command must not drop the delta baseline.
          ...(resumed && req.session?.cumulativeUsage
            ? { cumulativeUsage: req.session.cumulativeUsage }
            : {}),
        };

    // pi's prompt result carries no usage, so its configured command is the only
    // source. The command reuses the session and never spends a model turn; a
    // failure leaves the stop and the prompt's usage exactly as they were.
    let usage = summary.usage;
    let storedSession = session;
    let usageMeasured = false;
    if (config.usage) {
      if (config.usage.command) {
        if (session && !processResult.aborted && !processResult.timedOut) {
          const cumulative = await readAcpxSessionUsage(
            runtime,
            config,
            session,
            req.signal,
          );
          if (cumulative) {
            const previous = resumed ? req.session?.cumulativeUsage : undefined;
            // A resumed session with no recorded total cannot separate this turn
            // from its history; keep this turn's usage unknown but leave a baseline
            // behind for the next delta.
            if (!resumed || previous) {
              usage = turnUsageFromTotals(cumulative, previous);
              usageMeasured = true;
            }
            storedSession = { ...session, cumulativeUsage: cumulative };
          }
        }
      } else {
        usageMeasured = true;
      }
    }

    if (stop.kind === "done" && usageMeasured && isZeroUsage(usage)) {
      stop = classifyZeroUsageTurn(summary);
    }

    return {
      stop,
      text: summary.text,
      usage,
      session: storedSession,
      model,
      attempts,
    };
  }
}
