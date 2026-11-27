import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { childEnv } from "../../core/env.js";
import { hostOs } from "../../core/os/index.js";
import { sandboxedSpec } from "../../core/sandbox.js";
import {
  registerChildGroup,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import { OmpRpcExit, OmpRpcTimeout } from "./errors.js";
import type { OmpRpcOptions } from "./types.js";

export type { OmpRpcOptions } from "./types.js";

export { OmpRpcExit, OmpRpcTimeout };

// Only frames someone awaits are retained; message_end reaches the harness
// through onFrame and is not held for the whole turn.
const KEEP_FRAME_TYPES = new Set([
  "ready",
  "response",
  "prompt_result",
  "session_settled",
]);

interface Waiter {
  match: (frame: any) => boolean;
  label: string;
  resolve: (frame: any) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * One `omp --mode rpc` process. Retains only the frames the adapter consumes;
 * `message_update`/tool chatter is streamed past and only resets the idle clock.
 */
export class OmpRpc {
  readonly pid: number;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly retained: any[] = [];
  private readonly waiters = new Set<Waiter>();
  private buffer = "";
  private stderrText = "";
  private readonly maxStderrBytes: number;
  private nextId = 0;
  private exitResult?: { code: number | null; signal: string | null };
  readonly exited: Promise<{ code: number | null; signal: string | null }>;
  private readonly opts: OmpRpcOptions;

  constructor(opts: OmpRpcOptions) {
    this.opts = opts;
    this.maxStderrBytes = opts.maxStderrBytes ?? 64 * 1024;
    const command = sandboxedSpec(opts.binary, opts.args);
    this.child = spawn(command.executable, command.args, {
      cwd: opts.cwd,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv({ allow: opts.envAllowlist }),
    });
    this.pid = this.child.pid ?? 0;
    if (this.pid > 0) registerChildGroup(this.pid);

    this.child.stdin.on("error", () => {});
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrText = (this.stderrText + chunk).slice(-this.maxStderrBytes);
    });

    this.exited = new Promise((resolve) => {
      const finish = (code: number | null, signal: string | null) => {
        if (this.exitResult) return;
        this.exitResult = { code, signal };
        if (this.pid > 0) unregisterChildGroup(this.pid);
        this.rejectWaiters(
          new OmpRpcExit(
            `omp RPC exited (code ${code ?? "null"}, signal ${signal ?? "none"})`,
            code,
            signal,
            this.stderr(),
          ),
        );
        resolve({ code, signal });
      };
      this.child.on("close", (code, signal) => finish(code, signal));
      this.child.on("error", (error) => {
        this.stderrText = `${this.stderrText}\n${error.message}`.slice(
          -this.maxStderrBytes,
        );
        finish(null, null);
      });
    });
  }

  /** Waits for the protocol ready frame; a launch failure surfaces stderr. */
  static async launch(
    opts: OmpRpcOptions,
    readyTimeoutMs = 30_000,
  ): Promise<OmpRpc> {
    const rpc = new OmpRpc(opts);
    try {
      await rpc.awaitFrame(
        (frame) => frame.type === "ready",
        readyTimeoutMs,
        "ready",
      );
      return rpc;
    } catch (error) {
      await rpc.close(500);
      throw error;
    }
  }

  stderr(): string {
    return this.stderrText;
  }

  private exitInfo():
    | { code: number | null; signal: string | null }
    | undefined {
    return this.exitResult;
  }

  /** Replaces the per-frame callback after launch (idle timers, partial-usage capture). */
  setOnFrame(onFrame: (frame: any) => void): void {
    this.opts.onFrame = onFrame;
  }

  send(command: string, payload: Record<string, unknown> = {}): string {
    if (this.exitResult) {
      throw new OmpRpcExit(
        "omp RPC already exited",
        this.exitResult.code,
        this.exitResult.signal,
        this.stderr(),
      );
    }
    const id = payload.id ?? `r${++this.nextId}`;
    const frame = { id, type: command, ...payload };
    try {
      this.child.stdin.write(`${JSON.stringify(frame)}\n`);
    } catch (error) {
      const exited = this.exitInfo();
      throw new OmpRpcExit(
        `omp RPC stdin write failed: ${(error as Error).message}`,
        exited?.code ?? null,
        exited?.signal ?? null,
        this.stderr(),
      );
    }
    return String(id);
  }

  /** Non-prompt command; resolves with its `response` frame. */
  async request(
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 60_000,
  ): Promise<any> {
    const id = this.send(command, payload);
    return this.awaitFrame(
      (frame) => frame.type === "response" && frame.id === id,
      timeoutMs,
      command,
    );
  }

  abort(): void {
    if (this.exitResult) return;
    try {
      this.send("abort", { id: "abort" });
    } catch {
      // The process is already gone; the exit path carries the result.
    }
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.exitResult) return;
    if (this.pid > 0) {
      hostOs().killGroup(this.pid, signal);
      return;
    }
    try {
      this.child.kill(signal);
    } catch {}
  }

  /** Closes stdin (drains accepted commands) and waits; kills after `graceMs`. */
  async close(graceMs = 2_000): Promise<void> {
    try {
      this.child.stdin.end();
    } catch {}
    const closed = await Promise.race([
      this.exited.then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), graceMs),
      ),
    ]);
    if (closed) return;
    this.kill("SIGTERM");
    const graceful = await Promise.race([
      this.exited.then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), 1_000),
      ),
    ]);
    if (!graceful) {
      this.kill("SIGKILL");
      await Promise.race([
        this.exited,
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while (true) {
      index = this.buffer.indexOf("\n");
      if (index < 0) break;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      this.accept(frame);
    }
  }

  private accept(frame: any): void {
    this.opts.onFrame?.(frame);
    if (KEEP_FRAME_TYPES.has(frame?.type)) {
      this.retained.push(frame);
      if (this.retained.length > 1_000) this.retained.shift();
    }
    for (const waiter of [...this.waiters]) {
      if (!waiter.match(frame)) continue;
      this.waiters.delete(waiter);
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }

  awaitFrame(
    match: (frame: any) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<any> {
    const existing = this.retained.findIndex(match);
    if (existing >= 0)
      return Promise.resolve(this.retained.splice(existing, 1)[0]);
    if (this.exitResult) {
      return Promise.reject(
        new OmpRpcExit(
          `omp RPC exited before ${label}`,
          this.exitResult.code,
          this.exitResult.signal,
          this.stderr(),
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { match, label, resolve, reject };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new OmpRpcTimeout(label));
        }, timeoutMs);
      }
      this.waiters.add(waiter);
    });
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}
