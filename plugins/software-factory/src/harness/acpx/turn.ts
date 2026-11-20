// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { childEnv } from "../../core/env.js";
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
import {
  AcpxTranscriptParser,
  AcpxTranscriptFile,
  acpxErrors,
  acpxTranscriptPath,
} from "./transcript.js";
import { turnUsageFromTotals, usageFromAcpxSessionText } from "./usage.js";
import type { AcpxConfig, AcpxRunConfig, AcpxTurnOpaque } from "./config.js";
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
  acpx: AcpxRunConfig;
  /** Caller-given session store; turn transcripts live here, never in a worktree. */
  sessionDir: string;
  /** Run-config names this runtime's children may inherit on top of the base set. */
  envAllowlist?: readonly string[];
}

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

function turnConfig(runtime: AcpxRuntime, req: TurnRequest): AcpxRunConfig {
  const opaque = req.opaque as AcpxTurnOpaque | undefined;
  // The per-turn block overrides the binding but never drops the harness
  // entry's opaque process options.
  const config = { ...runtime.acpx, ...opaque };
  if (typeof config.agent !== "string" || !config.agent) {
    throw new Error(`acpx harness "${runtime.id}" has no agent configured`);
  }
  return config;
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

export function acpxGlobalArgs(config: AcpxRunConfig, cwd: string): string[] {
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
  config: AcpxRunConfig,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<SetupFailure | undefined> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    envAllowlist: runtime.envAllowlist,
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
  /** Persisted stdout stream, once the process ran. */
  transcript?: string;
  /** First failure opening or writing the transcript; the caller raises it. */
  transcriptError?: Error;
}

/** Opens the transcript file, or reports why it could not be opened. */
function openTranscript(path: string | undefined): {
  transcript?: AcpxTranscriptFile;
  error?: Error;
} {
  if (!path) return {};
  try {
    return { transcript: new AcpxTranscriptFile(path) };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** One prompt process: stream stdout into the parser, enforce idle and wall bounds. */
function runPromptProcess(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  args: string[],
  cwd: string,
  timeouts: TurnRequest["timeouts"],
  parser: AcpxTranscriptParser,
  transcriptPath: string | undefined,
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
    const opened = openTranscript(transcriptPath);
    const transcript = opened.transcript;
    if (opened.error) {
      resolve({
        code: null,
        signal: null,
        stderr: "",
        timedOut: false,
        aborted: false,
        transcriptError: opened.error,
      });
      return;
    }
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
          env: childEnv({
            allow: runtime.envAllowlist,
            set: config.env,
          }),
        },
      );
    } catch (error) {
      resolve({
        code: null,
        signal: null,
        stderr: (error as Error).message,
        timedOut: false,
        aborted,
        transcript: transcript?.path,
        transcriptError: transcript?.close(),
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
        const line = buffer.slice(0, index);
        parser.feedLine(line);
        transcript?.line(line);
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
      resolve({
        code: null,
        signal: null,
        stderr,
        timedOut,
        aborted,
        transcript: transcript?.path,
        transcriptError: transcript?.close(),
      });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (buffer.trim()) {
        parser.feedLine(buffer);
        transcript?.line(buffer);
        lastEventAt = new Date().toISOString();
      }
      clearTimers();
      clearSignal();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({
        code,
        signal,
        stderr,
        timedOut,
        aborted,
        lastEventAt,
        transcript: transcript?.path,
        transcriptError: transcript?.close(),
      });
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
  config: AcpxRunConfig,
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
    undefined,
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

/** Whether one attempt finished the turn or must retry de novo. */
type AttemptOutcome =
  | { retry: true }
  | { retry: false; result: AdapterTurnResult };

/** Per-turn values every phase reads: the adapter, config, request and names. */
interface AcpxTurnContext {
  runtime: AcpxRuntime;
  config: AcpxRunConfig;
  req: TurnRequest;
  model: ModelRef;
  wire: { id: string; effort?: string };
  /** Global args plus the agent selection: the prefix of every acpx command. */
  base: string[];
  globals: string[];
  selection: string[];
  resume: string | undefined;
  name: string;
  attempts: TurnAttempt[];
}

function freshName(runtime: AcpxRuntime): string {
  return `${runtime.id}-${randomUUID()}`;
}

/** The session id a resumable request names, when it is this harness's and cwd. */
function resumeId(runtime: AcpxRuntime, req: TurnRequest): string | undefined {
  if (!req.session || req.session.harness !== runtime.id) return undefined;
  return path.resolve(req.session.cwd) === path.resolve(req.cwd)
    ? req.session.id
    : undefined;
}

/** The model the record carries and the wire id acpx's `--model` accepts. */
function turnModel(
  requested: ModelRef,
  req: TurnRequest,
  config: AcpxRunConfig,
): { model: ModelRef; wire: { id: string; effort?: string } } {
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
  return { model, wire };
}

/** A setup failure: retried de novo when it is a lost resumed session. */
function setupOutcome(
  context: AcpxTurnContext,
  failure: SetupFailure,
  canRetryDeNovo: boolean,
): AttemptOutcome {
  if (failure.noSession && canRetryDeNovo) {
    context.attempts.push({
      model: context.model,
      stop: failure.stop,
      usage: zeroUsage(),
    });
    return { retry: true };
  }
  return {
    retry: false,
    result: {
      stop: failure.stop,
      text: "",
      usage: zeroUsage(),
      model: context.model,
      attempts: context.attempts,
    },
  };
}

/** Creates the named session unless this attempt resumes one. */
async function createSession(
  context: AcpxTurnContext,
  attempt: number,
  canRetryDeNovo: boolean,
): Promise<AttemptOutcome | undefined> {
  if (context.resume !== undefined && attempt === 0) return undefined;
  const failure = await runSetup(
    context.runtime,
    context.config,
    [...context.base, "sessions", "new", "--name", context.name],
    context.req.cwd,
    context.req.signal,
  );
  return failure ? setupOutcome(context, failure, canRetryDeNovo) : undefined;
}

/** Applies the requested effort to the session, when the model names one. */
async function applyEffort(
  context: AcpxTurnContext,
  canRetryDeNovo: boolean,
): Promise<AttemptOutcome | undefined> {
  const effort = context.model.effort;
  if (!effort) return undefined;
  const configId = context.config.effort?.configId;
  if (!configId) {
    throw new Error(
      `acpx harness "${context.runtime.id}" has no effort config but effort "${effort}" was requested`,
    );
  }
  // The raw --agent route has no agent command to hang the session flag on,
  // so `-s` follows the top-level subcommand; a positional agent takes it first.
  const set = context.config.raw
    ? [...context.base, "set", "-s", context.name, configId, effort]
    : [...context.base, "-s", context.name, "set", configId, effort];
  const failure = await runSetup(
    context.runtime,
    context.config,
    set,
    context.req.cwd,
    context.req.signal,
  );
  return failure ? setupOutcome(context, failure, canRetryDeNovo) : undefined;
}

/** The prompt command: `--model` before the agent subcommand or its verb. */
function promptArgs(context: AcpxTurnContext): string[] {
  // acpx parses the agent subcommand with enablePositionalOptions, so a
  // global `--model` after it is `unknown option '--model'` (exit 2).
  // The raw route has no positional agent, but `--model` must still precede
  // its `prompt` verb.
  const promptVerb = context.config.raw ? ["prompt"] : [];
  return [
    ...context.globals,
    "--model",
    context.wire.id,
    ...context.selection,
    ...promptVerb,
    "-s",
    context.name,
    context.req.prompt,
  ];
}

/** The stop one prompt process reached, from its transcript and process facts. */
function classifyProcess(
  processResult: PromptProcessResult,
  summary: AcpxTurnSummary,
): Stop {
  return classifyAcpxTurn({
    summary,
    code: processResult.code,
    signal: processResult.signal,
    timedOut: processResult.timedOut,
    stderr: processResult.stderr,
  });
}

/** The session ref this turn returns, absent when acpx lost the record. */
function turnSession(
  context: AcpxTurnContext,
  processResult: PromptProcessResult,
  resumed: boolean,
): SessionRef {
  return {
    harness: context.runtime.id,
    id: context.name,
    cwd: context.req.cwd,
    model: context.model,
    // Use the last streamed model event, not the prompt's start: a long
    // turn's cache is refreshed while its final response streams. ACP
    // carries no request timestamp, so local receipt time is the evidence.
    lastRequestStartedAt: processResult.lastEventAt ?? new Date().toISOString(),
    retentionTier: "short" as const,
    compacted: context.req.session?.compacted ?? false,
    // A failed usage command must not drop the delta baseline.
    ...(resumed && context.req.session?.cumulativeUsage
      ? { cumulativeUsage: context.req.session.cumulativeUsage }
      : {}),
  };
}

interface UsageMeasurement {
  usage: Usage;
  storedSession: SessionRef | undefined;
  usageMeasured: boolean;
}

/**
 * The turn's usage and the session baseline to return. pi's prompt result
 * carries no usage, so its configured command is the only source. The command
 * reuses the session and never spends a model turn; a failure leaves the stop
 * and the prompt's usage exactly as they were.
 */
async function measureUsage(
  context: AcpxTurnContext,
  summary: AcpxTurnSummary,
  session: SessionRef | undefined,
  resumed: boolean,
  processResult: PromptProcessResult,
): Promise<UsageMeasurement> {
  const unchanged = { usage: summary.usage, storedSession: session };
  if (!context.config.usage) return { ...unchanged, usageMeasured: false };
  if (!context.config.usage.command)
    return { ...unchanged, usageMeasured: true };
  if (!session || processResult.aborted || processResult.timedOut)
    return { ...unchanged, usageMeasured: false };
  const cumulative = await readAcpxSessionUsage(
    context.runtime,
    context.config,
    session,
    context.req.signal,
  );
  if (!cumulative) return { ...unchanged, usageMeasured: false };
  const previous = resumed ? context.req.session?.cumulativeUsage : undefined;
  // A resumed session with no recorded total cannot separate this turn from
  // its history; keep this turn's usage unknown but leave a baseline behind.
  const measured =
    resumed && !previous
      ? summary.usage
      : turnUsageFromTotals(cumulative, previous);
  return {
    usage: measured,
    storedSession: { ...session, cumulativeUsage: cumulative },
    usageMeasured: resumed && !previous ? false : true,
  };
}

interface PromptPhase {
  processResult: PromptProcessResult;
  summary: AcpxTurnSummary;
  lost: boolean;
}

/** Runs the prompt process and parses what it streamed. */
async function runPromptPhase(context: AcpxTurnContext): Promise<PromptPhase> {
  const parser = new AcpxTranscriptParser(context.config.usage?.fields);
  const processResult = await runPromptProcess(
    context.runtime,
    context.config,
    promptArgs(context),
    context.req.cwd,
    context.req.timeouts,
    parser,
    acpxTranscriptPath(
      context.runtime.sessionDir,
      context.runtime.id,
      context.name,
    ),
    context.req.signal,
  );
  if (processResult.transcriptError) {
    throw new Error(
      `acpx transcript write failed: ${processResult.transcriptError.message}`,
    );
  }
  const summary = parser.result();
  return {
    processResult,
    summary,
    lost: summary.errors.some(isNoSessionError),
  };
}

/** Records a lost-session attempt; true means the turn may retry de novo. */
function recordLostAttempt(
  context: AcpxTurnContext,
  processResult: PromptProcessResult,
  summary: AcpxTurnSummary,
  canRetryDeNovo: boolean,
): boolean {
  if (!canRetryDeNovo || processResult.aborted) return false;
  context.attempts.push({
    model: context.model,
    stop: classifyProcess(processResult, summary),
    usage: summary.usage,
  });
  return true;
}

/** A done turn whose harness reported no usage is classified as infra. */
function zeroUsageStop(
  stop: Stop,
  measurement: UsageMeasurement,
  summary: AcpxTurnSummary,
): Stop {
  if (
    stop.kind === "done" &&
    measurement.usageMeasured &&
    isZeroUsage(measurement.usage)
  ) {
    return classifyZeroUsageTurn(summary);
  }
  return stop;
}

/** One attempt: setup commands, the prompt, then the returned facts. */
async function runAttempt(
  context: AcpxTurnContext,
  attempt: number,
  canRetryDeNovo: boolean,
): Promise<AttemptOutcome> {
  const created = await createSession(context, attempt, canRetryDeNovo);
  if (created) return created;
  const effort = await applyEffort(context, canRetryDeNovo);
  if (effort) return effort;

  const { processResult, summary, lost } = await runPromptPhase(context);
  const resumed = context.resume !== undefined && attempt === 0;
  // ACP `usage_update.cost` is cumulative for the session, so a resumed one
  // already carries earlier turns. Only a fresh session's figure is this
  // turn's spend; a resumed turn leaves cost to the price table.
  if (resumed) delete summary.usage.costUsd;

  // An aborted turn never retries de novo: the caller stopped the turn, so no
  // new child may spawn after the abort.
  if (
    lost &&
    recordLostAttempt(context, processResult, summary, canRetryDeNovo)
  ) {
    return { retry: true };
  }

  let stop: Stop = processResult.aborted
    ? { kind: "cancelled" }
    : classifyProcess(processResult, summary);
  // A session that acpx says is gone must not be handed back to the kernel.
  const session = lost
    ? undefined
    : turnSession(context, processResult, resumed);
  const measurement = await measureUsage(
    context,
    summary,
    session,
    resumed,
    processResult,
  );
  stop = zeroUsageStop(stop, measurement, summary);
  return {
    retry: false,
    result: {
      stop,
      text: summary.text,
      usage: measurement.usage,
      session: measurement.storedSession,
      model: context.model,
      attempts: context.attempts,
      ...(processResult.transcript
        ? { transcript: processResult.transcript }
        : {}),
    },
  };
}

/** One acpx turn for one model from the fallback chain. */
export async function runAcpxTurn(
  runtime: AcpxRuntime,
  req: TurnRequest,
  requested: ModelRef,
): Promise<AdapterTurnResult> {
  const config = turnConfig(runtime, req);
  const { model, wire } = turnModel(requested, req, config);

  // A named session per turn: acpx records are cwd-keyed, so implementer and
  // reviewer sharing a worktree would otherwise land in one record. The kernel
  // only resumes cwd-matching sessions; a stray record starts de novo.
  const resume = resumeId(runtime, req);
  const globals = acpxGlobalArgs(config, req.cwd);
  const selection = acpxAgentSelection(config);
  const context: AcpxTurnContext = {
    runtime,
    config,
    req,
    model,
    wire,
    base: [...globals, ...selection],
    globals,
    selection,
    resume,
    name: resume ?? freshName(runtime),
    attempts: [],
  };

  // A resumed record may be gone (TTL, `sessions close`); acpx then answers
  // NO_SESSION. Retry once de novo with a new name so the returned ref is live
  // and the next turn does not resume the same dead record forever. The retry
  // covers both setup commands and the prompt, and attempt 0 is the only
  // attempt that may resume, so at most one de-novo retry runs per turn. Each
  // lost record is kept as an attempt so the restart is never silent.
  for (let attempt = 0; ; attempt += 1) {
    const canRetryDeNovo = resume !== undefined && attempt === 0;
    const outcome = await runAttempt(context, attempt, canRetryDeNovo);
    if (outcome.retry) {
      context.name = freshName(runtime);
      continue;
    }
    return outcome.result;
  }
}
