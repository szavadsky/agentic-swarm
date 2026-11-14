import { spawn } from "node:child_process";
import path from "node:path";
import {
  registerChildGroup,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import type { ModelRef, SessionRef, TurnRequest, TurnResult } from "../types.js";
import { classifyOpencodeTurn } from "./classifier.js";
import { OpencodeEventParser } from "./events.js";
import type { OpencodeRuntime } from "./types.js";
import {
  readExportTokens,
  usageFromSessionDelta,
  type OpencodeSessionTokens,
} from "./usage.js";

const MAX_STDERR_BYTES = 64 * 1024;

/** One `opencode run` process for one model from the fallback chain. */
export async function runOpencodeTurn(
  runtime: OpencodeRuntime,
  req: TurnRequest,
  requested: ModelRef
): Promise<Omit<TurnResult, "attempts">> {
  const model: ModelRef = { ...requested, effort: req.effort ?? requested.effort };
  if (!model.id.includes("/")) {
    throw new Error(`opencode model id must be provider/model (got "${model.id}")`);
  }
  if (
    req.session &&
    req.session.harness === "opencode" &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `opencode session ${req.session.id} belongs to ${req.session.cwd}, not ${req.cwd}`
    );
  }
  const selector = model.effort ? `${model.id}#${model.effort}` : model.id;
  const resume =
    req.session && req.session.harness === "opencode" ? req.session.id : undefined;
  const beforeTokens = resume
    ? await runtime.api.sessionTokens(resume, req.cwd).catch(() => undefined)
    : undefined;
  // A resumed turn without a baseline cannot subtract: the export total covers the
  // whole session, not this turn, so the step stream's usage is the safe fallback.
  const sessionUsageKnown = !resume || beforeTokens !== undefined;
  const prompt = !resume && req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
  const args = ["run", "--auto", "--archived", "--format", "json", "-m", selector];
  if (resume) args.push("-s", resume);
  args.push(prompt);

  const parser = new OpencodeEventParser();
  let stderr = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutCause: "idle" | "wall" | undefined;
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
    if (timeoutCause) return;
    timeoutCause = cause;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), 2_000).unref?.();
  };
  const resetIdle = () => {
    if (!req.timeouts.idleMs || req.timeouts.idleMs <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => timeout("idle"), req.timeouts.idleMs);
    idleTimer.unref?.();
  };

  const exit = await new Promise<{ code: number | null; signal: string | null }>(
    (resolve) => {
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
        resolve({ code: null, signal: null });
      });
      child.on("close", (code, signal) => {
        closed = true;
        if (buffer.trim()) parser.feedLine(buffer);
        clearTimers();
        if (pid > 0) unregisterChildGroup(pid);
        resolve({ code, signal });
      });
    }
  );

  const summary = parser.result();
  let transcript: string | undefined;
  let exportedTokens: OpencodeSessionTokens | undefined;
  if (summary.sessionId) {
    const out = path.join(runtime.sessionDir, "opencode", `${summary.sessionId}.export.json`);
    try {
      transcript = await runtime.api.export(
        summary.sessionId,
        out,
        req.cwd,
        timeoutCause ? 15_000 : 120_000
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
  if (exportedTokens && sessionUsageKnown && summary.usage.costUsd !== undefined) {
    usage.costUsd = summary.usage.costUsd;
  }

  const stop = classifyOpencodeTurn({
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
        compacted: req.session?.compacted ?? false,
      }
    : req.session;

  return {
    stop,
    text: summary.text,
    usage,
    session,
    model: session?.model ?? model,
    transcript,
  };
}
