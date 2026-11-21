/** Reading the finished prompt exchange: stop, text, session and usage. */

import path from "node:path";
import type {
  AdapterTurnResult,
  ModelRef,
  SessionRef,
  Stop,
  TurnRequest,
} from "../../types.js";
import { zeroUsage } from "../../usage.js";
import { classifyOmpTurn } from "../classify.js";
import type { OmpTurnFailure } from "../classify.js";
import { OmpRpcExit, OmpRpcTimeout } from "../rpc.js";
import type { OmpRpc } from "../rpc.js";
import { actualModel } from "../runtime.js";
import type { OmpRuntime } from "../runtime.js";
import { OMP_ID } from "../types.js";
import {
  isSessionCompacted,
  servedTotal,
  servedUsage,
  summarizeOmpFrames,
  turnUsage,
} from "../usage.js";
import type { OmpStats } from "../usage.js";
import type { EndedUsage, OmpTurnFinish, PromptExchange } from "./types.js";

/**
 * Sends the prompt and waits for its result, releasing a pending abort after a
 * short grace. A subarchitect child that keeps the session open is awaited up
 * to the wall bound.
 */
export async function awaitPrompt(
  rpc: OmpRpc,
  abortSignal: Promise<void>,
  req: TurnRequest,
): Promise<PromptExchange> {
  const promptId = rpc.send("prompt", { message: req.prompt });
  const promptPromise = rpc.awaitFrame(
    (frame) => frame.type === "prompt_result" && frame.id === promptId,
    0,
    "prompt_result",
  );
  promptPromise.catch(() => {});

  let promptResult: any;
  let promptFailed: Error | undefined;
  try {
    promptResult = await Promise.race([
      promptPromise,
      abortSignal.then(
        () =>
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), 2_500),
          ),
      ),
    ]);
  } catch (error) {
    promptFailed = error as Error;
  }

  if (promptResult?.sessionSettled === false) {
    // A subarchitect child keeps the session open after the parent yields; the
    // wall bound, not a fixed minute, is when the launch is truly over.
    const settleBoundMs =
      req.timeouts.wallMs > 0 ? req.timeouts.wallMs : 60_000;
    await rpc
      .awaitFrame(
        (frame) => frame.type === "session_settled",
        settleBoundMs,
        "session_settled",
      )
      .catch(() => undefined);
  }
  return { promptResult, promptFailed };
}

/** The prompt failure as the classifier reads it, if the prompt failed. */
function turnFailure(
  promptFailed: Error | undefined,
  rpc: OmpRpc,
): OmpTurnFailure | undefined {
  if (promptFailed instanceof OmpRpcExit) {
    return {
      code: promptFailed.code,
      signal: promptFailed.signal,
      stderr: promptFailed.stderr || rpc.stderr(),
    };
  }
  if (promptFailed instanceof OmpRpcTimeout) return { timedOut: true };
  if (promptFailed) return { stderr: String(promptFailed) };
  return undefined;
}

/** The turn's stop; an abort whose prompt never answered is a cancellation. */
function turnStop(
  aborted: boolean,
  promptResult: any,
  abortReason: "idle" | "wall" | undefined,
  failure: OmpTurnFailure | undefined,
  summary: ReturnType<typeof summarizeOmpFrames>,
  usage: ReturnType<typeof zeroUsage>,
  turnText: string,
): Stop {
  if (aborted && !promptResult) return { kind: "cancelled" };
  return classifyOmpTurn({
    abortReason,
    failure,
    promptResult,
    lastStopReason: summary.lastAssistantStopReason,
    usage,
    text: turnText,
  });
}

/** `get_last_assistant_text` answers for the session, so a glitch hides it. */
function turnTextFor(
  stop: Stop,
  frameText: string | undefined,
  turnText: string,
): string {
  if (stop.kind === "infra" && stop.cause === "glitch") return "";
  return frameText ?? turnText;
}

function sessionRefFor(
  runtime: OmpRuntime,
  req: TurnRequest,
  model: ModelRef,
  state: any,
  postStats: OmpStats | undefined,
  sessionFile: string | undefined,
  resume: string | undefined,
  resumeDir: string,
  lastModelEventAtMs: number | undefined,
): SessionRef | undefined {
  const sessionId: string | undefined =
    state?.sessionId ?? postStats?.sessionId ?? resume;
  if (!sessionId) return req.session;
  return {
    harness: OMP_ID,
    id: sessionId,
    cwd: req.cwd,
    dir: resumeDir,
    model: actualModel(state, model),
    lastRequestStartedAt: new Date(
      lastModelEventAtMs ?? Date.now(),
    ).toISOString(),
    retentionTier: runtime.retention,
    compacted:
      isSessionCompacted(sessionFile) ||
      (!sessionFile && req.session?.compacted === true),
  };
}

/** Queries the ended session, closes it, and summarizes its frames. */
async function endedSession(state: OmpTurnFinish) {
  const queryTimeout = state.abortReason || state.aborted ? 2_000 : 10_000;
  const textFrame = await state.rpc
    .request("get_last_assistant_text", {}, queryTimeout)
    .catch(() => undefined);
  const statsFrame = await state.rpc
    .request("get_session_stats", {}, queryTimeout)
    .catch(() => undefined);
  const stateFrame = await state.rpc
    .request("get_state", {}, queryTimeout)
    .catch(() => undefined);

  await state.rpc.close(2_000);

  const summary = summarizeOmpFrames(state.retainedFrames);
  const postStats = statsFrame?.data as OmpStats | undefined;
  const sessionData = stateFrame?.data;
  const sessionFile: string | undefined =
    sessionData?.sessionFile ?? postStats?.sessionFile;
  return { textFrame, summary, postStats, sessionData, sessionFile };
}

/**
 * An `@` alias resolves inside omp's own chain and can switch models within this
 * one call. The transcript carries per-message provider/model, so the turn is
 * split per served model and priced from those counters; any other model keeps
 * the session-stats aggregate unchanged.
 */
function endedUsage(
  state: OmpTurnFinish,
  summary: ReturnType<typeof summarizeOmpFrames>,
  postStats: OmpStats | undefined,
  sessionFile: string | undefined,
): EndedUsage {
  const served = state.model.id.startsWith("@")
    ? servedUsage(sessionFile, state.startedAtMs)
    : undefined;
  const usage = served
    ? servedTotal(served)
    : turnUsage({
        before: state.baseline,
        after: postStats,
        fallback: summary.usage,
        sessionFile,
        sinceMs: state.startedAtMs,
      });
  return { served, usage };
}

/** Queries the ended session and assembles the turn result. */
export async function finishOmpTurn(
  state: OmpTurnFinish,
): Promise<AdapterTurnResult> {
  const ended = await endedSession(state);
  const { served, usage } = endedUsage(
    state,
    ended.summary,
    ended.postStats,
    ended.sessionFile,
  );
  const summary = ended.summary;
  const sessionFile = ended.sessionFile;
  const turnText = summary.assistantText ?? "";
  const failure = turnFailure(state.promptFailed, state.rpc);
  const stop = turnStop(
    state.aborted,
    state.promptResult,
    state.abortReason,
    failure,
    summary,
    usage,
    turnText,
  );
  const text = turnTextFor(stop, ended.textFrame?.data?.text, turnText);
  const session = sessionRefFor(
    state.runtime,
    state.req,
    state.model,
    ended.sessionData,
    ended.postStats,
    sessionFile,
    state.resume,
    state.resumeDir,
    state.lastModelEventAtMs,
  );

  return {
    stop,
    text,
    usage,
    session,
    model: session?.model ?? state.model,
    ...(served ? { served } : {}),
    transcript: sessionFile,
    attempts: state.attempts,
  };
}

/** The session's cwd must match the request's: omp sessions are cwd-bound. */
export function assertOmpSessionCwd(req: TurnRequest): void {
  if (
    req.session &&
    req.session.harness === OMP_ID &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `omp session ${req.session.id} is cwd-bound to ${req.session.cwd}, not ${req.cwd}`,
    );
  }
}
