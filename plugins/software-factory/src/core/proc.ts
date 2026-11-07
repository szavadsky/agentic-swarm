import { spawn } from "node:child_process";

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
}

/** Grace period after process exit (or timeout kill) for stdio to flush. */
const STREAM_GRACE_MS = 100;

/** Default per-stream ring capacity (1 MiB); total memory is bounded by 2x this. */
const DEFAULT_STREAM_RING_BYTES = 1024 * 1024;

/**
 * Caps output length by preserving head and tail with a truncation marker.
 */
function capOutput(text: string, maxBytes: number): string {
  if (!maxBytes || maxBytes <= 0) return text;
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;

  const headBytes = Math.floor(maxBytes / 3);
  const tailBytes = maxBytes - headBytes;
  const truncatedBytes = buf.length - headBytes - tailBytes;

  const headStr = buf.subarray(0, headBytes).toString("utf8");
  const tailStr = buf.subarray(buf.length - tailBytes).toString("utf8");

  return `${headStr}\n... [truncated ${truncatedBytes} bytes] ...\n${tailStr}`;
}

/**
 * Bounded tail buffer: keeps at most `capacity` bytes of the most recent
 * output so a verbose or never-ending stream cannot grow memory without limit.
 */
class TailRing {
  private chunks: Buffer[] = [];
  private bytes = 0;
  public droppedBytes = 0;

  constructor(private readonly capacity: number) {}

  public push(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > this.capacity && this.chunks.length > 1) {
      const head = this.chunks.shift()!;
      this.bytes -= head.length;
      this.droppedBytes += head.length;
    }
    if (this.bytes > this.capacity) {
      // Single chunk larger than capacity: keep its tail.
      const only = this.chunks[0]!;
      const excess = this.bytes - this.capacity;
      this.chunks[0] = only.subarray(only.length - this.capacity);
      this.bytes = this.capacity;
      this.droppedBytes += excess;
    }
  }

  public toString(): string {
    if (this.chunks.length === 0) return "";
    return Buffer.concat(this.chunks, this.bytes).toString("utf8");
  }
}

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
    const startTime = Date.now();
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

    const mergedEnv = {
      ...process.env,
      ...env,
    };

    // The ring must hold at least maxOutputBytes so end-capping stays meaningful.
    const ringCapacity =
      maxOutputBytes && maxOutputBytes > DEFAULT_STREAM_RING_BYTES
        ? maxOutputBytes
        : DEFAULT_STREAM_RING_BYTES;
    const stdoutRing = new TailRing(ringCapacity);
    const stderrRing = new TailRing(ringCapacity);

    const finalizeStream = (ring: TailRing): string => {
      let text = ring.toString();
      if (ring.droppedBytes > 0) {
        text = `... [truncated ${ring.droppedBytes} bytes of head output] ...\n${text}`;
      }
      if (maxOutputBytes) {
        text = capOutput(text, maxOutputBytes);
      }
      return text;
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

    let timeoutTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({
        code: exitCode,
        signal: exitSignal,
        stdout: finalizeStream(stdoutRing),
        stderr: finalizeStream(stderrRing),
        timedOut,
        durationMs: Date.now() - startTime,
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
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        // Kill the whole process group
        try {
          if (child.pid) {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
        scheduleGraceFinish();
      }, timeoutSec * 1000);
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
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({
        code: 1,
        stdout: finalizeStream(stdoutRing),
        stderr: err.message,
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
