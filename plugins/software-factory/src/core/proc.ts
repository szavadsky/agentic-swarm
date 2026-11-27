import { spawn } from "node:child_process";
import { createActiveTimer, detectSuspend, getClock } from "./clock.js";
import { childEnv } from "./env.js";
import { hostOs } from "./os/index.js";
import { sandboxedSpec } from "./sandbox.js";
import { registerChildGroup, unregisterChildGroup } from "./shutdown.js";
import type { ProcessResult } from "./types.js";

export type { ProcessResult } from "./types.js";

interface RunProcessOptions {
  cmd: string | string[];
  cwd: string;
  /** Names the run config allows this child to inherit; `env` values land regardless. */
  envAllowlist?: readonly string[];
  env?: Record<string, string>;
  timeoutSec?: number;
  maxOutputBytes?: number;
  stdin?: string;
  /** Aborts the child (group SIGTERM, then SIGKILL) and resolves with `aborted`. */
  signal?: AbortSignal;
  /** Receives the child's pid once its process group exists; not on spawn failure. */
  onSpawn?: (pid: number) => void;
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
class HeadTailBuffer {
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
      const first = this.tailChunks.shift();
      if (first === undefined) break;
      this.tailBytes -= first.length;
    }
    if (this.tailBytes > this.maxTailBytes) {
      const only = this.tailChunks[0];
      if (only !== undefined) {
        this.tailChunks[0] = only.subarray(only.length - this.maxTailBytes);
        this.tailBytes = this.maxTailBytes;
      }
    }
  }

  public toString(): string {
    if (this.totalBytes === 0) return "";
    if (this.totalBytes <= this.maxBytes) {
      const allChunks = [...this.headChunks, ...this.tailChunks];
      return Buffer.concat(allChunks, this.headBytes + this.tailBytes).toString(
        "utf8",
      );
    }
    const headStr = Buffer.concat(this.headChunks, this.headBytes).toString(
      "utf8",
    );
    const tailStr = Buffer.concat(this.tailChunks, this.tailBytes).toString(
      "utf8",
    );
    const dropped = this.totalBytes - this.headBytes - this.tailBytes;
    return `${headStr}\n... [truncated ${dropped} bytes] ...\n${tailStr}`;
  }
}

/** SIGKILL the child's process group; without a group, kill the child alone. */
function killGroupNow(child: ReturnType<typeof spawn>): void {
  const pid = child.pid;
  if (!pid || pid <= 0) {
    try {
      child.kill("SIGKILL");
    } catch {}
    return;
  }
  hostOs().killGroup(pid, "SIGKILL");
}

/** The spawn spec for a string shell command or an argument array. */
function commandSpec(
  cmd: string | string[],
): { executable: string; args: string[] } | { error: string } {
  if (typeof cmd === "string") {
    const shell = hostOs().shell(cmd);
    return sandboxedSpec(shell.executable, shell.args);
  }
  const [executable, ...args] = cmd;
  if (executable === undefined) return { error: "Empty command array" };
  return sandboxedSpec(executable, args);
}

/** The child environment: TMPDIR overrides plus the run config's allowlist. */
function processEnv(options: RunProcessOptions): Record<string, string> {
  const factoryTmp = process.env.TMPDIR;
  const tmpEnv: Record<string, string> = factoryTmp
    ? { TMPDIR: factoryTmp, TMP: factoryTmp, TEMP: factoryTmp }
    : {};
  return childEnv({
    allow: options.envAllowlist,
    set: { ...tmpEnv, ...options.env },
  });
}

/** The ring must hold at least maxOutputBytes so end-capping stays meaningful. */
function streamRingBytes(maxOutputBytes?: number): number {
  return maxOutputBytes && maxOutputBytes > 0
    ? maxOutputBytes
    : DEFAULT_STREAM_RING_BYTES;
}

/** Spawns the child in its own process group, or reports the spawn error. */
function spawnChild(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): { child: ReturnType<typeof spawn> } | { stderr: string } {
  try {
    return {
      child: spawn(executable, args, {
        cwd,
        env,
        detached: true, // creates new process group for clean group kills
        stdio: ["pipe", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    const message = (err as { message?: unknown } | null | undefined)?.message;
    return { stderr: typeof message === "string" ? message : String(err) };
  }
}

/** Registers the child's process group when it has one. */
function registerGrouped(child: ReturnType<typeof spawn>): void {
  if (child.pid && child.pid > 0) registerChildGroup(child.pid);
}

/** Clears the child's process-group registration when it had one. */
function unregisterGrouped(child: ReturnType<typeof spawn>): void {
  if (child.pid && child.pid > 0) unregisterChildGroup(child.pid);
}

/** Feeds the optional stdin payload and closes the pipe. */
function writeStdin(
  child: ReturnType<typeof spawn>,
  stdin: string | undefined,
): void {
  if (stdin === undefined || !child.stdin) return;
  child.stdin.write(stdin);
  child.stdin.end();
}

/** One run's mutable state, wired to the promise it resolves. */
class ProcessRun {
  private readonly clock = getClock();
  private readonly startWall: number;
  private readonly startMono: number;
  private readonly stdoutRing: HeadTailBuffer;
  private readonly stderrRing: HeadTailBuffer;
  private child!: ReturnType<typeof spawn>;
  private timedOut = false;
  private aborted = false;
  private settled = false;
  private exitCode: number | null = null;
  private exitSignal: string | undefined;
  private activeTimer: { cancel: () => void } | undefined;
  private graceTimer: NodeJS.Timeout | undefined;
  private onAbort: (() => void) | undefined;

  constructor(
    private readonly options: RunProcessOptions,
    private readonly spec: { executable: string; args: string[] },
    private readonly resolve: (result: ProcessResult) => void,
  ) {
    this.startWall = this.clock.now();
    this.startMono = this.clock.monotonic();
    const capacity = streamRingBytes(options.maxOutputBytes);
    this.stdoutRing = new HeadTailBuffer(capacity);
    this.stderrRing = new HeadTailBuffer(capacity);
  }

  /** Spawns the child and wires every event before it can finish. */
  public start(): void {
    const spawned = spawnChild(
      this.spec.executable,
      this.spec.args,
      this.options.cwd,
      processEnv(this.options),
    );
    if ("stderr" in spawned) {
      this.resolve({
        code: 1,
        stdout: "",
        stderr: spawned.stderr,
        timedOut: false,
        aborted: false,
        durationMs: Date.now() - this.startWall,
      });
      return;
    }
    this.child = spawned.child;
    registerGrouped(this.child);
    const pid = this.child.pid;
    if (pid && pid > 0) this.options.onSpawn?.(pid);
    this.wireStreams();
    writeStdin(this.child, this.options.stdin);
    this.wireAbort();
    this.armTimeout();
    this.wireExit();
  }

  private wireStreams(): void {
    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.stdoutRing.push(chunk);
    });
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrRing.push(chunk);
    });
  }

  private wireAbort(): void {
    this.onAbort = () => {
      if (this.settled || this.aborted) return;
      this.aborted = true;
      this.killGroup();
      this.scheduleGraceFinish();
    };
    this.options.signal?.addEventListener("abort", this.onAbort, {
      once: true,
    });
  }

  private armTimeout(): void {
    const { timeoutSec } = this.options;
    if (!timeoutSec || timeoutSec <= 0) return;
    this.activeTimer = createActiveTimer(
      timeoutSec * 1000,
      () => {
        this.timedOut = true;
        this.killGroup();
        this.scheduleGraceFinish();
      },
      this.clock,
    );
  }

  private wireExit(): void {
    this.child.on("exit", (code, signal) => {
      this.exitCode = code;
      this.exitSignal = signal ?? undefined;
      this.scheduleGraceFinish();
    });
    this.child.on("close", () => {
      this.finish();
    });
    this.child.on("error", (err) => {
      this.fail(err);
    });
  }

  /** The result body shared by every terminal path. */
  private result(overrides: Partial<ProcessResult>): ProcessResult {
    const { suspendDetected, gapMs } = detectSuspend(
      this.startWall,
      this.startMono,
      this.clock,
    );
    return {
      code: this.exitCode,
      signal: this.exitSignal,
      stdout: this.stdoutRing.toString(),
      stderr: this.stderrRing.toString(),
      timedOut: this.timedOut,
      aborted: this.aborted,
      durationMs: this.clock.now() - this.startWall,
      suspendDetected,
      suspendGapMs: gapMs,
      ...overrides,
    };
  }

  private finish(): void {
    if (this.settled) return;
    this.cleanup();
    this.resolve(this.result({}));
  }

  private fail(err: Error): void {
    if (this.settled) return;
    this.settled = true;
    this.cleanup();
    this.resolve(this.result({ code: 1, stderr: err.message }));
  }

  private cleanup(): void {
    if (this.onAbort) {
      this.options.signal?.removeEventListener("abort", this.onAbort);
    }
    unregisterGrouped(this.child);
    if (this.activeTimer) this.activeTimer.cancel();
    if (this.graceTimer) clearTimeout(this.graceTimer);
  }

  /** Destroys stdio after a short grace period and resolves, so grandchildren
   * that escaped the process group (setsid/daemonised) cannot hang us on `close`. */
  private scheduleGraceFinish(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      try {
        this.child.stdout?.destroy();
      } catch {}
      try {
        this.child.stderr?.destroy();
      } catch {}
      this.finish();
    }, STREAM_GRACE_MS);
  }

  private killGroup(): void {
    const pid = this.child.pid;
    if (!pid || pid <= 0) {
      killGroupNow(this.child);
      return;
    }
    hostOs().killGroup(pid, "SIGTERM");
    setTimeout(() => {
      const latePid = this.child.pid;
      if (latePid && latePid > 0) killGroupNow(this.child);
    }, 500);
  }
}

/**
 * Runs a process with process-group cleanup on timeout, bounded output
 * capture, and support for string shell commands (through the host's
 * non-login shell, so a developer's profile scripts cannot slow, alter or
 * pollute a gate) or argument arrays.
 *
 * The promise resolves on `close`, or shortly after `exit`/timeout: stdio
 * streams are destroyed after a short grace period so a surviving grandchild
 * (e.g. setsid/daemonised) holding the pipes cannot hang the caller.
 */
export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  if (options.signal?.aborted) {
    return Promise.resolve({
      code: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: true,
      durationMs: 0,
    });
  }
  const spec = commandSpec(options.cmd);
  if ("error" in spec) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr: spec.error,
      timedOut: false,
      aborted: false,
      durationMs: 0,
    });
  }
  return new Promise<ProcessResult>((resolve) => {
    new ProcessRun(options, spec, resolve).start();
  });
}
