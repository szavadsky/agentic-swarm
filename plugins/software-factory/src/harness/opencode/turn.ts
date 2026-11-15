import { spawn } from "node:child_process";
import path from "node:path";
import {
  registerChildGroup,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import { withDetails } from "../details.js";
import type {
  AdapterTurnResult,
  ModelRef,
  SessionRef,
  Stop,
  TurnAttempt,
  TurnRequest,
} from "../types.js";
import { zeroUsage } from "../usage.js";
import { isMissingSessionError } from "./api.js";
import { classifyOpencodeTurn } from "./classifier.js";
import { OpencodeEventParser } from "./events.js";
import type { OpencodeRuntime } from "./types.js";
import {
  type OpencodeSessionTokens,
  readExportTokens,
  usageFromSessionDelta,
} from "./usage.js";

const MAX_STDERR_BYTES = 64 * 1024;

/** One `opencode run` process for one model from the fallback chain. */
export async function runOpencodeTurn(
  runtime: OpencodeRuntime,
  req: TurnRequest,
  requested: ModelRef,
): Promise<AdapterTurnResult> {
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
  if (!model.id.includes("/")) {
    throw new Error(
      `opencode model id must be provider/model (got "${model.id}")`,
    );
  }
  if (
    req.session &&
    req.session.harness === "opencode" &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `opencode session ${req.session.id} belongs to ${req.session.cwd}, not ${req.cwd}`,
    );
  }
  const selector = model.effort ? `${model.id}#${model.effort}` : model.id;
  // opencode exposes the session through its local API: a failed probe that
  // names a missing record is the resume check. A probe failing for another
  // reason leaves the resume to the turn, so a flaky API never restarts work.
  const attempts: TurnAttempt[] = [];
  let priorSession = req.session;
  let resume =
    req.session && req.session.harness === "opencode"
      ? req.session.id
      : undefined;
  let beforeTokens: OpencodeSessionTokens | undefined;
  if (resume) {
    try {
      beforeTokens = await runtime.api.sessionTokens(resume, req.cwd);
    } catch (error) {
      if (isMissingSessionError(error)) {
        attempts.push({
          model,
          stop: withDetails(
            { kind: "infra", cause: "crash" },
            error instanceof Error ? error.message : String(error),
          ),
          usage: zeroUsage(),
        });
        resume = undefined;
        // A dead ref must never be handed back if the fresh turn yields none.
        priorSession = undefined;
      }
    }
  }
  // A resumed turn without a baseline cannot subtract: the export total covers the
  // whole session, not this turn, so the step stream's usage is the safe fallback.
  const sessionUsageKnown = !resume || beforeTokens !== undefined;
  const prompt =
    !resume && req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
  const args = [
    "run",
    "--auto",
    "--archived",
    "--format",
    "json",
    "-m",
    selector,
  ];
  if (resume) args.push("-s", resume);
  args.push(prompt);

  const parser = new OpencodeEventParser();
  let stderr = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutCause: "idle" | "wall" | undefined;
  // Set by the kernel's AbortSignal (the wall bound fired): the child is
  // killed and the turn reports `cancelled`, never `timeout`.
  let aborted = false;
  let child: ReturnType<typeof spawn> | undefined;
  let pid = 0;
  let closed = false;

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
  const timeout = (cause: "idle" | "wall") => {
    if (timeoutCause || aborted) return;
    timeoutCause = cause;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
  };
  const externalAbort = () => {
    if (aborted || closed) return;
    aborted = true;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
  };
  req.signal?.addEventListener("abort", externalAbort, { once: true });
  const clearSignal = () =>
    req.signal?.removeEventListener("abort", externalAbort);
  const resetIdle = () => {
    if (!req.timeouts.idleMs || req.timeouts.idleMs <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => timeout("idle"), req.timeouts.idleMs);
    idleTimer.unref?.();
  };

  const exit = await new Promise<{
    code: number | null;
    signal: string | null;
  }>((resolve) => {
    try {
      child = spawn(runtime.binary, args, {
        cwd: req.cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      stderr = (error as Error).message;
      resolve({ code: null, signal: null });
      return;
    }
    pid = child.pid ?? 0;
    if (pid > 0) registerChildGroup(pid);
    if (req.timeouts.wallMs > 0) {
      wallTimer = setTimeout(() => timeout("wall"), req.timeouts.wallMs);
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
      resolve({ code: null, signal: null });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (buffer.trim()) parser.feedLine(buffer);
      clearTimers();
      clearSignal();
      if (pid > 0) unregisterChildGroup(pid);
      resolve({ code, signal });
    });
  });

  const summary = parser.result();
  let transcript: string | undefined;
  let exportedTokens: OpencodeSessionTokens | undefined;
  if (summary.sessionId) {
    const out = path.join(
      runtime.sessionDir,
      "opencode",
      `${summary.sessionId}.export.json`,
    );
    try {
      transcript = await runtime.api.export(
        summary.sessionId,
        out,
        req.cwd,
        timeoutCause ? 15_000 : 120_000,
      );
      exportedTokens = readExportTokens(out);
    } catch {
      transcript = undefined;
    }
  }

  const usage =
    exportedTokens && sessionUsageKnown
      ? usageFromSessionDelta(beforeTokens, exportedTokens)
      : summary.usage;
  if (
    exportedTokens &&
    sessionUsageKnown &&
    summary.usage.costUsd !== undefined
  ) {
    usage.costUsd = summary.usage.costUsd;
  }

  const stop: Stop = aborted
    ? { kind: "cancelled" }
    : classifyOpencodeTurn({
        summary,
        code: exit.code,
        signal: exit.signal,
        timedOut: timeoutCause !== undefined,
        stderr,
      });

  const session: SessionRef | undefined = summary.sessionId
    ? {
        harness: "opencode",
        id: summary.sessionId,
        cwd: req.cwd,
        model,
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: "short",
        compacted: priorSession?.compacted ?? false,
      }
    : priorSession;

  return {
    stop,
    text: summary.text,
    usage,
    session,
    model: session?.model ?? model,
    transcript,
    attempts,
  };
}
