import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AdapterTurnResult,
  ModelRef,
  Stop,
  TurnAttempt,
  TurnRequest,
} from "../types.js";
import { zeroUsage } from "../usage.js";
import { classifyOmpTurn, type OmpTurnFailure } from "./classify.js";
import { type OmpRpc, OmpRpcExit, OmpRpcTimeout } from "./rpc.js";
import { actualModel, type OmpRuntime } from "./runtime.js";
import { DEFAULT_TOOLS, OMP_ID, type OmpTurnOpaque } from "./types.js";
import {
  isSessionCompacted,
  type OmpStats,
  summarizeOmpFrames,
  textOfContent,
  turnUsage,
} from "./usage.js";

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Stop for a failed RPC launch, shared by the retry record and the terminal return. */
function launchFailure(error: unknown): Stop {
  return classifyOmpTurn({
    failure:
      error instanceof OmpRpcTimeout
        ? { timedOut: true }
        : error instanceof OmpRpcExit
          ? { code: error.code, signal: error.signal, stderr: error.stderr }
          : { stderr: String(error) },
  });
}

/** One omp RPC process for one model from the fallback chain. */
export async function runOmpTurn(
  runtime: OmpRuntime,
  req: TurnRequest,
  requested: ModelRef,
): Promise<AdapterTurnResult> {
  const opaque = (req.opaque ?? {}) as OmpTurnOpaque;
  const model: ModelRef = {
    ...requested,
    effort: req.effort ?? requested.effort,
  };
  if (req.signal?.aborted) {
    return {
      stop: { kind: "cancelled" },
      text: "",
      usage: zeroUsage(),
      session: req.session,
      model,
      attempts: [],
    };
  }
  const dirs = runtime.dirs();
  const overlayPath = await runtime.overlay(opaque);

  const tools = opaque.tools ?? DEFAULT_TOOLS;
  const addDirs = new Set<string>(opaque.addDirs ?? []);
  if (req.outcomePath) {
    const outcomeDir = path.dirname(path.resolve(req.cwd, req.outcomePath));
    if (!isInside(req.cwd, outcomeDir)) addDirs.add(outcomeDir);
  }

  const extraArgs = [`--tools=${tools.join(",")}`];
  if (req.system) {
    const hash = createHash("sha1")
      .update(req.system)
      .digest("hex")
      .slice(0, 12);
    const systemFile = path.join(dirs.prompts, `system-${hash}.txt`);
    if (!fs.existsSync(systemFile))
      fs.writeFileSync(systemFile, req.system, "utf8");
    extraArgs.push("--append-system-prompt", systemFile);
  }
  for (const dir of addDirs) extraArgs.push("--add-dir", dir);

  if (
    req.session &&
    req.session.harness === OMP_ID &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `omp session ${req.session.id} is cwd-bound to ${req.session.cwd}, not ${req.cwd}`,
    );
  }
  const resume =
    req.session && req.session.harness === OMP_ID ? req.session.id : undefined;
  const retainedFrames: any[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let abortResolve: (() => void) | undefined;
  const abortSignal = new Promise<void>((resolve) => {
    abortResolve = resolve;
  });
  let abortReason: "idle" | "wall" | undefined;
  // Set by the kernel's AbortSignal (the wall bound fired): the child is
  // stopped and the turn reports `cancelled`, never `timeout`.
  let aborted = false;
  let rpc: OmpRpc | undefined;
  let finished = false;

  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (wallTimer) clearTimeout(wallTimer);
    idleTimer = undefined;
    wallTimer = undefined;
  };
  const clearSignal = () =>
    req.signal?.removeEventListener("abort", externalAbort);
  const killRpc = () => {
    rpc?.abort();
    setTimeout(() => rpc?.kill("SIGTERM"), 2_000).unref?.();
    setTimeout(() => rpc?.kill("SIGKILL"), 4_000).unref?.();
  };
  const abort = (reason: "idle" | "wall") => {
    if (abortReason || finished || aborted) return;
    abortReason = reason;
    abortResolve?.();
    killRpc();
  };
  const externalAbort = () => {
    if (aborted || finished) return;
    aborted = true;
    abortResolve?.();
    killRpc();
  };
  req.signal?.addEventListener("abort", externalAbort, { once: true });
  const resetIdle = () => {
    if (!req.timeouts.idleMs || req.timeouts.idleMs <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort("idle"), req.timeouts.idleMs);
    idleTimer.unref?.();
  };

  // The session lives in its own launch dir; resume against that home, and when
  // it is gone (retention pruned it) retry de novo once instead of crashing.
  // The failed resume is kept as an attempt record: the restart is never silent.
  let resumeDir = dirs.sessions;
  let resumeId = resume;
  const attempts: TurnAttempt[] = [];
  if (resume && req.session?.dir && fs.existsSync(req.session.dir)) {
    resumeDir = req.session.dir;
  }
  try {
    rpc = await runtime.launch(
      model,
      req.cwd,
      overlayPath,
      resumeDir,
      resumeId,
      extraArgs,
    );
  } catch (error) {
    if (
      resumeId &&
      /session .*not found/i.test(
        error instanceof OmpRpcExit ? error.stderr : String(error),
      )
    ) {
      attempts.push({ model, stop: launchFailure(error), usage: zeroUsage() });
      resumeId = undefined;
      resumeDir = dirs.sessions;
      try {
        rpc = await runtime.launch(
          model,
          req.cwd,
          overlayPath,
          resumeDir,
          undefined,
          extraArgs,
        );
      } catch (retryError) {
        error = retryError;
      }
    }
    if (!rpc) {
      clearTimers();
      clearSignal();
      return {
        stop: launchFailure(error),
        text: "",
        usage: zeroUsage(),
        model,
        attempts,
      };
    }
  }
  const cancelBeforePrompt = async (): Promise<AdapterTurnResult> => {
    clearTimers();
    clearSignal();
    await rpc?.close(500);
    return {
      stop: { kind: "cancelled" },
      text: "",
      usage: zeroUsage(),
      session: req.session,
      model,
      attempts,
    };
  };
  // The signal may have fired while the child was launching, when `rpc` was
  // still undefined: stop it now instead of running the turn.
  if (aborted) return cancelBeforePrompt();
  // Idle resets on every frame, including streamed deltas the RPC discards.
  rpc.setOnFrame((frame: any) => {
    if (finished) return;
    resetIdle();
    if (frame.type === "message_end") {
      const message = frame.message ?? {};
      const text = textOfContent(message.content);
      retainedFrames.push({
        type: "message_end",
        message: {
          role: message.role,
          usage: message.usage,
          stopReason: message.stopReason,
          content: text ? [{ type: "text", text }] : [],
        },
      });
      if (retainedFrames.length > 200) retainedFrames.shift();
    }
  });

  if (req.timeouts.wallMs > 0) {
    wallTimer = setTimeout(() => abort("wall"), req.timeouts.wallMs);
    wallTimer.unref?.();
  }
  resetIdle();

  const baseline = await rpc
    .request("get_session_stats", {}, 10_000)
    .then((frame) => frame.data as OmpStats)
    .catch(() => undefined);

  // The signal may have fired during the baseline stats request; the prompt
  // was never sent, so there is no result to keep.
  if (aborted) return cancelBeforePrompt();

  // Cache lifetime runs from the start of the model request, not from launch.
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
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
    await rpc
      .awaitFrame(
        (frame) => frame.type === "session_settled",
        60_000,
        "session_settled",
      )
      .catch(() => undefined);
  }
  finished = true;
  clearTimers();
  clearSignal();

  const queryTimeout = abortReason || aborted ? 2_000 : 10_000;
  const textFrame = await rpc
    .request("get_last_assistant_text", {}, queryTimeout)
    .catch(() => undefined);
  const statsFrame = await rpc
    .request("get_session_stats", {}, queryTimeout)
    .catch(() => undefined);
  const stateFrame = await rpc
    .request("get_state", {}, queryTimeout)
    .catch(() => undefined);

  await rpc.close(2_000);

  const summary = summarizeOmpFrames(retainedFrames);
  const postStats = statsFrame?.data as OmpStats | undefined;
  const state = stateFrame?.data;
  const sessionFile: string | undefined =
    state?.sessionFile ?? postStats?.sessionFile;
  const usage = turnUsage({
    before: baseline,
    after: postStats,
    fallback: summary.usage,
    sessionFile,
    sinceMs: startedAtMs,
  });

  const failure: OmpTurnFailure | undefined =
    promptFailed instanceof OmpRpcExit
      ? {
          code: promptFailed.code,
          signal: promptFailed.signal,
          stderr: promptFailed.stderr || rpc.stderr(),
        }
      : promptFailed instanceof OmpRpcTimeout
        ? { timedOut: true }
        : promptFailed
          ? { stderr: String(promptFailed) }
          : undefined;

  // An aborted turn whose prompt never answered was cancelled; a prompt_result
  // that arrived first keeps its own classification.
  const stop: Stop =
    aborted && !promptResult
      ? { kind: "cancelled" }
      : classifyOmpTurn({
          abortReason,
          failure,
          promptResult,
          lastStopReason: summary.lastAssistantStopReason,
        });

  const sessionId: string | undefined =
    state?.sessionId ?? postStats?.sessionId ?? (resume as string | undefined);
  const session = sessionId
    ? {
        harness: OMP_ID,
        id: sessionId,
        cwd: req.cwd,
        dir: resumeDir,
        model: actualModel(state, model),
        lastRequestStartedAt: startedAt,
        retentionTier: runtime.retention,
        compacted:
          isSessionCompacted(sessionFile) ||
          (!sessionFile && req.session?.compacted === true),
      }
    : req.session;

  return {
    stop,
    text: textFrame?.data?.text ?? summary.assistantText ?? "",
    usage,
    session,
    model: session?.model ?? model,
    transcript: sessionFile,
    attempts,
  };
}
