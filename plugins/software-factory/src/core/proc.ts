import { spawn } from "node:child_process";
import { registerChildGroup, unregisterChildGroup } from "./shutdown.js";
import { getClock, createActiveTimer, detectSuspend } from "./clock.js";
import { getFactoryTmpDir } from "./runtime-tmp.js";

export interface RunProcessOptions {
  cmd: string | string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutSec?: number;
  maxOutputBytes?: number;
  stdin?: string;
}

export interface ProcessResult {
  code: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  suspendDetected?: boolean;
  suspendGapMs?: number;
}

/** Grace period after process exit (or timeout kill) for stdio to flush. */
const STREAM_GRACE_MS = 100;

/** Default per-stream ring capacity (1 MiB); total memory is bounded by 2x this. */
const DEFAULT_STREAM_RING_BYTES = 1024 * 1024;

/**
 * Bounded head+tail buffer: keeps up to headBytes from the start and up to
 * tailBytes from the end, dropping the middle. Total memory is strictly
 * bounded by maxBytes at all times during streaming.
 */
export class HeadTailBuffer {
  private headChunks: Buffer[] = [];
  private headBytes = 0;
  private tailChunks: Buffer[] = [];
  private tailBytes = 0;
  private readonly maxHeadBytes: number;
  private readonly maxTailBytes: number;
  public totalBytes = 0;

  constructor(public readonly maxBytes: number) {
    this.maxHeadBytes = Math.max(1, Math.floor(maxBytes / 3));
    this.maxTailBytes = Math.max(1, maxBytes - this.maxHeadBytes);
  }

  public push(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.totalBytes += chunk.length;

    // 1. Fill head buffer if not yet full
    if (this.headBytes < this.maxHeadBytes) {
      const needed = this.maxHeadBytes - this.headBytes;
      if (chunk.length <= needed) {
        this.headChunks.push(chunk);
        this.headBytes += chunk.length;
        return;
      }
      this.headChunks.push(chunk.subarray(0, needed));
      this.headBytes += needed;
      chunk = chunk.subarray(needed);
    }

    // 2. Push remainder to tail ring
    this.tailChunks.push(chunk);
    this.tailBytes += chunk.length;
    while (this.tailBytes > this.maxTailBytes && this.tailChunks.length > 1) {
      const first = this.tailChunks.shift()!;
      this.tailBytes -= first.length;
    }
    if (this.tailBytes > this.maxTailBytes) {
      const only = this.tailChunks[0]!;
      this.tailChunks[0] = only.subarray(only.length - this.maxTailBytes);
      this.tailBytes = this.maxTailBytes;
    }
  }

  public toString(): string {
    if (this.totalBytes === 0) return "";
    if (this.totalBytes <= this.maxBytes) {
      const allChunks = [...this.headChunks, ...this.tailChunks];
      return Buffer.concat(allChunks, this.headBytes + this.tailBytes).toString("utf8");
    }
    const headStr = Buffer.concat(this.headChunks, this.headBytes).toString("utf8");
    const tailStr = Buffer.concat(this.tailChunks, this.tailBytes).toString("utf8");
    const dropped = this.totalBytes - this.headBytes - this.tailBytes;
    return `${headStr}\n... [truncated ${dropped} bytes] ...\n${tailStr}`;
  }
}

/** Backward compatibility wrapper for capOutput */
export function capOutput(text: string, maxBytes: number): string {
  if (!maxBytes || maxBytes <= 0) return text;
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const htb = new HeadTailBuffer(maxBytes);
  htb.push(buf);
  return htb.toString();
}

/** Bounded tail buffer (kept for backwards compatibility). */
export class TailRing extends HeadTailBuffer {}
/**
 * Runs a process with process-group cleanup on timeout, bounded output
 * capture, and support for string shell command (via bash -lc) or argument
 * array.
 *
 * The promise resolves on `close`, or shortly after `exit`/timeout: stdio
 * streams are destroyed after a short grace period so a surviving grandchild
 * (e.g. setsid/daemonised) holding the pipes cannot hang the caller.
 */
export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  const { cmd, cwd, env, timeoutSec, maxOutputBytes, stdin } = options;

  return new Promise((resolve) => {
    const clock = getClock();
    const startWall = clock.now();
    const startMono = clock.monotonic();
    const startTime = startWall;
    let timedOut = false;
    let settled = false;
    let exitCode: number | null = null;
    let exitSignal: string | undefined;

    let executable: string;
    let args: string[];

    if (typeof cmd === "string") {
      executable = "bash";
      args = ["-lc", cmd];
    } else {
      if (cmd.length === 0) {
        return resolve({
          code: 1,
          stdout: "",
          stderr: "Empty command array",
          timedOut: false,
          durationMs: 0,
        });
      }
      executable = cmd[0]!;
      args = cmd.slice(1);
    }

    const factoryTmp = getFactoryTmpDir();
    const tmpEnv: Record<string, string> = factoryTmp
      ? { TMPDIR: factoryTmp, TMP: factoryTmp, TEMP: factoryTmp }
      : {};

    const mergedEnv = {
      ...process.env,
      ...tmpEnv,
      ...env,
    };

    // The ring must hold at least maxOutputBytes so end-capping stays meaningful.
    const ringCapacity =
      maxOutputBytes && maxOutputBytes > 0
        ? maxOutputBytes
        : DEFAULT_STREAM_RING_BYTES;
    const stdoutRing = new HeadTailBuffer(ringCapacity);
    const stderrRing = new HeadTailBuffer(ringCapacity);

    const finalizeStream = (ring: HeadTailBuffer): string => {
      return ring.toString();
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        cwd,
        env: mergedEnv,
        detached: true, // creates new process group for clean group kills
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: any) {
      return resolve({
        code: 1,
        stdout: "",
        stderr: err?.message ?? String(err),
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    }
    if (child.pid && child.pid > 0) {
      registerChildGroup(child.pid);
    }
    let activeTimer: { cancel: () => void } | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      if (settled) return;
      if (child.pid && child.pid > 0) {
        unregisterChildGroup(child.pid);
      }
      if (activeTimer) activeTimer.cancel();
      if (graceTimer) clearTimeout(graceTimer);
      const { suspendDetected, gapMs } = detectSuspend(startWall, startMono, clock);
      resolve({
        code: exitCode,
        signal: exitSignal,
        stdout: finalizeStream(stdoutRing),
        stderr: finalizeStream(stderrRing),
        timedOut,
        durationMs: clock.now() - startWall,
        suspendDetected,
        suspendGapMs: gapMs,
      });
    };

    // Destroy stdio after a short grace period and resolve, so grandchildren
    // that escaped the process group (setsid/daemonised) cannot hang us on `close`.
    const scheduleGraceFinish = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        try {
          child.stdout?.destroy();
        } catch {}
        try {
          child.stderr?.destroy();
        } catch {}
        finish();
      }, STREAM_GRACE_MS);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutRing.push(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrRing.push(chunk);
    });

    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    if (timeoutSec && timeoutSec > 0) {
      activeTimer = createActiveTimer(
        timeoutSec * 1000,
        () => {
          timedOut = true;
          // Kill the whole process group: SIGTERM first, then SIGKILL
          if (child.pid && child.pid > 0) {
            try {
              process.kill(-child.pid, "SIGTERM");
            } catch {
              try {
                child.kill("SIGTERM");
              } catch {}
            }
            setTimeout(() => {
              if (child.pid && child.pid > 0) {
                try {
                  process.kill(-child.pid, "SIGKILL");
                } catch {
                  try {
                    child.kill("SIGKILL");
                  } catch {}
                }
              }
            }, 500);
          } else {
            try {
              child.kill("SIGKILL");
            } catch {}
          }
          scheduleGraceFinish();
        },
        clock
      );
    }

    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal ?? undefined;
      scheduleGraceFinish();
    });

    child.on("close", () => {
      finish();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (activeTimer) activeTimer.cancel();
      if (graceTimer) clearTimeout(graceTimer);
      const { suspendDetected, gapMs } = detectSuspend(startWall, startMono, clock);
      resolve({
        code: 1,
        stdout: finalizeStream(stdoutRing),
        stderr: err.message,
        timedOut,
        durationMs: clock.now() - startWall,
        suspendDetected,
        suspendGapMs: gapMs,
      });
    });
  });
}
