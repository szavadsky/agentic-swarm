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

/**
 * Returns the trailing bytes of a string, safe for UTF-8 boundaries.
 */
export function tail(text: string, bytes: number): string {
  if (bytes <= 0) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= bytes) return text;
  return buf.subarray(buf.length - bytes).toString("utf8");
}

/**
 * Caps output length by preserving head and tail with a truncation marker.
 */
export function capOutput(text: string, maxBytes: number): string {
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
 * Runs a process with process-group cleanup on timeout, output capping,
 * and support for string shell command (via bash -lc) or argument array.
 */
export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  const { cmd, cwd, env, timeoutSec, maxOutputBytes, stdin } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let timedOut = false;

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

    let stdoutChunks: Buffer[] = [];
    let stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    let timeoutTimer: NodeJS.Timeout | undefined;
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
      }, timeoutSec * 1000);
    }

    child.on("close", (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;

      let stdout = Buffer.concat(stdoutChunks).toString("utf8");
      let stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (maxOutputBytes) {
        stdout = capOutput(stdout, maxOutputBytes);
        stderr = capOutput(stderr, maxOutputBytes);
      }

      resolve({
        code,
        signal: signal ?? undefined,
        stdout,
        stderr,
        timedOut,
        durationMs,
      });
    });

    child.on("error", (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve({
        code: 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: err.message,
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
