/** One turn attempt: session creation, prompt phase and lost-attempt bookkeeping. */

import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ModelRef, SessionRef, Stop, TurnRequest } from "../../types.js";
import { zeroUsage } from "../../usage.js";
import {
  classifyAcpxTurn,
  classifyZeroUsageTurn,
  isNoSessionError,
} from "../classify.js";
import { acpxModel } from "../model.js";
import { AcpxTranscriptParser, acpxTranscriptPath } from "../transcript.js";
import { turnUsageFromTotals } from "../usage.js";
import type { AcpxRunConfig } from "../config.js";
import type { AcpxTurnSummary } from "../types.js";
import type {
  AcpxRuntime,
  AcpxTurnContext,
  AttemptOutcome,
  PromptPhase,
  PromptProcessResult,
  SetupFailure,
  UsageMeasurement,
} from "./types.js";
import { runSetup } from "./setup.js";
import { isZeroUsage, readAcpxSessionUsage } from "./usage.js";
import { runPromptProcess } from "./process.js";

export function freshName(runtime: AcpxRuntime): string {
  return `${runtime.id}-${randomUUID()}`;
}

/** The session id a resumable request names, when it is this harness's and cwd. */
export function resumeId(
  runtime: AcpxRuntime,
  req: TurnRequest,
): string | undefined {
  if (!req.session || req.session.harness !== runtime.id) return undefined;
  return path.resolve(req.session.cwd) === path.resolve(req.cwd)
    ? req.session.id
    : undefined;
}

/** The model the record carries and the wire id acpx's `--model` accepts. */
export function turnModel(
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
export async function createSession(
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
export async function applyEffort(
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
export function classifyProcess(
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
export function turnSession(
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
    retentionTier: context.runtime.retention,
    compacted: context.req.session?.compacted ?? false,
    // A failed usage command must not drop the delta baseline.
    ...(resumed && context.req.session?.cumulativeUsage
      ? { cumulativeUsage: context.req.session.cumulativeUsage }
      : {}),
  };
}

/**
 * The turn's usage and the session baseline to return. A prompt result with
 * no usage leaves its configured command as the only source. The command
 * reuses the session and never spends a model turn; a failure leaves the stop
 * and the prompt's usage exactly as they were.
 */
export async function measureUsage(
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

/** Runs the prompt process and parses what it streamed. */
export async function runPromptPhase(
  context: AcpxTurnContext,
): Promise<PromptPhase> {
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
export function recordLostAttempt(
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
export function zeroUsageStop(
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
