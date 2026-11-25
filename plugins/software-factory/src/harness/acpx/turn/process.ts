/** The prompt process: transcript, JSON event stream and its outcome. */

import { spawn } from "node:child_process";
import { childEnv } from "../../../core/env.js";
import { sandboxedSpec } from "../../../core/sandbox.js";
import {
  isChildGroupAlive,
  registerChildGroup,
  unregisterChildGroup,
} from "../../../core/shutdown.js";
import type { TurnRequest } from "../../types.js";
import type { AcpxRunConfig } from "../config.js";
import {
  AcpxTranscriptFile,
  type AcpxTranscriptParser,
} from "../transcript.js";
import { MAX_STDERR_BYTES } from "./setup.js";
import type { AcpxRuntime, PromptProcessResult } from "./types.js";

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

/** One prompt run's state, wired to the promise it resolves. */
class PromptProcessRun {
  private readonly opened: ReturnType<typeof openTranscript>;
  private readonly transcript: AcpxTranscriptFile | undefined;
  private stderr = "";
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private wallTimer: ReturnType<typeof setTimeout> | undefined;
  private timedOut = false;
  private aborted = false;
  private closed = false;
  private child: ReturnType<typeof spawn> | undefined;
  private pid = 0;
  private lastEventAt: string | undefined;
  private readonly decoder = new TextDecoder();
  private buffer = "";

  constructor(
    private readonly runtime: AcpxRuntime,
    private readonly config: AcpxRunConfig,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly timeouts: TurnRequest["timeouts"],
    private readonly parser: AcpxTranscriptParser,
    transcriptPath: string | undefined,
    private readonly signal: AbortSignal | undefined,
    private readonly resolve: (result: PromptProcessResult) => void,
    private readonly sessionName?: string,
  ) {
    this.opened = openTranscript(transcriptPath);
    this.transcript = this.opened.transcript;
  }

  public start(): void {
    if (this.opened.error) {
      this.resolve({
        code: null,
        signal: null,
        stderr: "",
        timedOut: false,
        aborted: false,
        transcriptError: this.opened.error,
      });
      return;
    }
    this.signal?.addEventListener("abort", this.externalAbort, { once: true });
    if (!this.spawnChild()) return;
    if (this.timeouts.wallMs > 0) {
      this.wallTimer = setTimeout(this.timeout, this.timeouts.wallMs);
      this.wallTimer.unref?.();
    }
    this.resetIdle();
    this.wireStreams();
    this.wireExit();
  }

  private spawnChild(): boolean {
    try {
      const command = sandboxedSpec(this.runtime.command.binary, [
        ...this.runtime.command.prefix,
        ...this.args,
      ]);
      this.child = spawn(command.executable, command.args, {
        cwd: this.cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv({
          allow: this.runtime.envAllowlist,
          set: this.config.env,
        }),
      });
    } catch (error) {
      this.resolve({
        code: null,
        signal: null,
        stderr: (error as Error).message,
        timedOut: false,
        aborted: this.aborted,
        transcript: this.transcript?.path,
        transcriptError: this.transcript?.close(),
      });
      return false;
    }
    this.pid = this.child.pid ?? 0;
    if (this.pid > 0) {
      registerChildGroup(this.pid);
      if (this.sessionName) {
        this.runtime.activePids?.set(this.sessionName, this.pid);
      }
    }
    return true;
  }

  private wireStreams(): void {
    this.child?.stdout?.on("data", (chunk: Buffer) => {
      this.resetIdle();
      this.buffer += this.decoder.decode(chunk, { stream: true });
      this.consumeLines();
    });
    this.child?.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(
        -MAX_STDERR_BYTES,
      );
    });
  }

  private consumeLines(): void {
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) break;
      const line = this.buffer.slice(0, index);
      this.parser.feedLine(line);
      this.transcript?.line(line);
      this.lastEventAt = new Date().toISOString();
      this.buffer = this.buffer.slice(index + 1);
    }
  }

  /**
   * Drops the group from the kill and liveness registries once it is gone.
   * A group with surviving members stays recorded so a later read can wait
   * for the outcome it may still write.
   */
  private releaseGroup(): void {
    if (this.pid <= 0 || isChildGroupAlive(this.pid)) return;
    unregisterChildGroup(this.pid);
    if (this.sessionName) this.runtime.activePids?.delete(this.sessionName);
  }

  private wireExit(): void {
    this.child?.on("error", (error) => {
      this.stderr = `${this.stderr}\n${error.message}`.slice(-MAX_STDERR_BYTES);
      this.closed = true;
      this.clearTimers();
      this.clearSignal();
      this.releaseGroup();
      this.resolve({
        code: null,
        signal: null,
        stderr: this.stderr,
        timedOut: this.timedOut,
        aborted: this.aborted,
        transcript: this.transcript?.path,
        transcriptError: this.transcript?.close(),
      });
    });
    this.child?.on("close", (code, signal) => {
      this.closed = true;
      if (this.buffer.trim()) {
        this.parser.feedLine(this.buffer);
        this.transcript?.line(this.buffer);
        this.lastEventAt = new Date().toISOString();
      }
      this.clearTimers();
      this.clearSignal();
      this.releaseGroup();
      this.resolve({
        code,
        signal,
        stderr: this.stderr,
        timedOut: this.timedOut,
        aborted: this.aborted,
        lastEventAt: this.lastEventAt,
        transcript: this.transcript?.path,
        transcriptError: this.transcript?.close(),
      });
    });
  }

  private killGroup(signal: NodeJS.Signals): void {
    if (this.closed) return;
    try {
      if (this.pid > 0) process.kill(-this.pid, signal);
      else this.child?.kill(signal);
    } catch {
      try {
        this.child?.kill(signal);
      } catch {}
    }
  }

  private clearTimers = (): void => {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.wallTimer) clearTimeout(this.wallTimer);
    this.idleTimer = undefined;
    this.wallTimer = undefined;
  };

  private timeout = (): void => {
    if (this.timedOut || this.aborted) return;
    this.timedOut = true;
    this.killGroup("SIGTERM");
    setTimeout(() => this.killGroup("SIGKILL"), 2_000).unref?.();
  };

  private externalAbort = (): void => {
    if (this.aborted || this.closed) return;
    this.aborted = true;
    this.killGroup("SIGTERM");
    setTimeout(() => this.killGroup("SIGKILL"), 2_000).unref?.();
  };

  private clearSignal = (): void => {
    this.signal?.removeEventListener("abort", this.externalAbort);
  };

  private resetIdle = (): void => {
    const { idleMs } = this.timeouts;
    if (!idleMs || idleMs <= 0) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(this.timeout, idleMs);
    this.idleTimer.unref?.();
  };
}

/** One prompt process: stream stdout into the parser, enforce idle and wall bounds. */
export function runPromptProcess(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  args: string[],
  cwd: string,
  timeouts: TurnRequest["timeouts"],
  parser: AcpxTranscriptParser,
  transcriptPath: string | undefined,
  signal?: AbortSignal,
  sessionName?: string,
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
  return new Promise<PromptProcessResult>((resolve) => {
    new PromptProcessRun(
      runtime,
      config,
      args,
      cwd,
      timeouts,
      parser,
      transcriptPath,
      signal,
      resolve,
      sessionName,
    ).start();
  });
}
