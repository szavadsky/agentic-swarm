/** The acpx turn run: attempt loop and its outcome. */

import type {
  AdapterTurnResult,
  ModelRef,
  Stop,
  TurnRequest,
} from "../../types.js";
import type { AcpxRuntime, AcpxTurnContext, AttemptOutcome } from "./types.js";
import {
  applyEffort,
  classifyProcess,
  createSession,
  freshName,
  measureUsage,
  recordLostAttempt,
  resumeId,
  runPromptPhase,
  turnModel,
  turnSession,
  zeroUsageStop,
} from "./attempts.js";
import { acpxAgentSelection, acpxGlobalArgs, turnConfig } from "./setup.js";

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
