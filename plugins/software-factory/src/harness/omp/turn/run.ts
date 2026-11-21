/** The omp turn run: launch, prompt, finish. */

import type {
  AdapterTurnResult,
  ModelRef,
  TurnAttempt,
  TurnRequest,
} from "../../types.js";
import { zeroUsage } from "../../usage.js";
import type { OmpRpc } from "../rpc.js";
import type { OmpRuntime } from "../runtime.js";
import { OMP_ID } from "../types.js";
import type { OmpTurnOpaque } from "../types.js";
import { textOfContent } from "../usage.js";
import type { OmpStats } from "../usage.js";
import { assertOmpSessionCwd, awaitPrompt, finishOmpTurn } from "./finish.js";
import type { LaunchState } from "./types.js";
import {
  cancelledTurn,
  launchFailure,
  launchTurnRpc,
  liveAgents,
  turnArgs,
} from "./launch.js";

/** One omp turn's state: the RPC child, its timers and the prompt result. */
class OmpTurnRun {
  private readonly retainedFrames: any[] = [];
  private readonly abortSignal: Promise<void>;
  private abortResolve: (() => void) | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private wallTimer: ReturnType<typeof setTimeout> | undefined;
  private abortReason: "idle" | "wall" | undefined;
  // Set by the kernel's AbortSignal (the wall bound fired): the child is
  // stopped and the turn reports `cancelled`, never `timeout`.
  private aborted = false;
  private rpc: OmpRpc | undefined;
  private attempts: TurnAttempt[] | undefined;
  private finished = false;
  private lastModelEventAtMs: number | undefined;

  constructor(
    private readonly runtime: OmpRuntime,
    private readonly req: TurnRequest,
    private readonly model: ModelRef,
    private readonly dirs: ReturnType<OmpRuntime["dirs"]>,
    private readonly overlayPath: string,
    private readonly resume: string | undefined,
    private readonly extraArgs: string[],
  ) {
    this.abortSignal = new Promise<void>((resolve) => {
      this.abortResolve = resolve;
    });
  }

  public async run(): Promise<AdapterTurnResult> {
    this.req.signal?.addEventListener("abort", this.externalAbort, {
      once: true,
    });
    const state = await this.start();
    if (state.failure) return state.failure;
    const live = state.live;
    if (!live) throw new Error("omp launch reported no failure and no rpc");
    // The signal may have fired during the baseline stats request; the prompt
    // was never sent, so there is no result to keep.
    if (this.aborted) return await this.cancelBeforePrompt();
    // Usage for this turn starts when the prompt is sent. Cache hotness instead
    // follows the last streamed model frame: a long final request refreshes the
    // cache while it streams.
    const startedAtMs = Date.now();
    const { promptResult, promptFailed } = await awaitPrompt(
      live,
      this.abortSignal,
      this.req,
    );
    this.finished = true;
    this.clearTimers();
    this.clearSignal();
    return await this.result(state, startedAtMs, promptResult, promptFailed);
  }

  /** Launches the RPC child, or returns the failure result for this turn. */
  private async start(): Promise<LaunchState> {
    const launch = await launchTurnRpc(
      this.runtime,
      this.model,
      this.req,
      this.overlayPath,
      this.dirs,
      this.resume,
      this.extraArgs,
    );
    this.rpc = launch.rpc;
    this.attempts = launch.attempts;
    const state: LaunchState = {
      live: launch.rpc,
      baseline: undefined,
      resumeDir: launch.resumeDir,
      attempts: launch.attempts,
      failure: undefined,
    };
    if (!launch.rpc) {
      this.clearTimers();
      this.clearSignal();
      state.failure = {
        stop: launchFailure(launch.error),
        text: "",
        usage: zeroUsage(),
        model: this.model,
        attempts: launch.attempts,
      };
      return state;
    }
    // The signal may have fired while the child was launching, when `rpc` was
    // still undefined: stop it now instead of running the turn.
    if (this.aborted) {
      state.failure = await this.cancelBeforePrompt();
      return state;
    }
    if (this.req.onLive) this.req.onLive(liveAgents(launch.rpc));
    // Idle resets on every frame, including streamed deltas the RPC discards.
    launch.rpc.setOnFrame(this.onFrame);
    if (this.req.timeouts.wallMs > 0) {
      this.wallTimer = setTimeout(
        () => this.abort("wall"),
        this.req.timeouts.wallMs,
      );
      this.wallTimer.unref?.();
    }
    this.resetIdle();
    state.baseline = await launch.rpc
      .request("get_session_stats", {}, 10_000)
      .then((frame) => frame.data as OmpStats)
      .catch(() => undefined);
    return state;
  }

  /** The turn result assembled from the launched state and prompt outcome. */
  private async result(
    state: LaunchState,
    startedAtMs: number,
    promptResult: Awaited<ReturnType<typeof awaitPrompt>>["promptResult"],
    promptFailed: Awaited<ReturnType<typeof awaitPrompt>>["promptFailed"],
  ): Promise<AdapterTurnResult> {
    return await finishOmpTurn({
      runtime: this.runtime,
      req: this.req,
      model: this.model,
      rpc: this.rpc!,
      baseline: state.baseline,
      startedAtMs,
      promptResult,
      promptFailed,
      abortReason: this.abortReason,
      aborted: this.aborted,
      lastModelEventAtMs: this.lastModelEventAtMs,
      retainedFrames: this.retainedFrames,
      resume: this.resume,
      resumeDir: state.resumeDir,
      attempts: state.attempts,
    });
  }

  /** Retains a bounded text-only tail of message_end frames for the transcript. */
  private readonly onFrame = (frame: any): void => {
    if (this.finished) return;
    // Frame timestamps mark message creation, not completion. Receipt time is
    // the freshest evidence that the final request's cache is still hot.
    this.lastModelEventAtMs = Date.now();
    this.resetIdle();
    if (frame.type !== "message_end") return;
    const message = frame.message ?? {};
    const text = textOfContent(message.content);
    this.retainedFrames.push({
      type: "message_end",
      message: {
        role: message.role,
        usage: message.usage,
        stopReason: message.stopReason,
        content: text ? [{ type: "text", text }] : [],
      },
    });
    if (this.retainedFrames.length > 200) this.retainedFrames.shift();
  };

  private readonly externalAbort = (): void => {
    if (this.aborted || this.finished) return;
    this.aborted = true;
    this.abortResolve?.();
    this.killRpc();
  };

  private abort(reason: "idle" | "wall"): void {
    if (this.abortReason || this.finished || this.aborted) return;
    this.abortReason = reason;
    this.abortResolve?.();
    this.killRpc();
  }

  private killRpc(): void {
    this.rpc?.abort();
    setTimeout(() => this.rpc?.kill("SIGTERM"), 2_000).unref?.();
    setTimeout(() => this.rpc?.kill("SIGKILL"), 4_000).unref?.();
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.wallTimer) clearTimeout(this.wallTimer);
    this.idleTimer = undefined;
    this.wallTimer = undefined;
  }

  private clearSignal(): void {
    this.req.signal?.removeEventListener("abort", this.externalAbort);
  }

  private resetIdle(): void {
    const { idleMs } = this.req.timeouts;
    if (!idleMs || idleMs <= 0) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.abort("idle"), idleMs);
    this.idleTimer.unref?.();
  }

  private async cancelBeforePrompt(): Promise<AdapterTurnResult> {
    this.clearTimers();
    this.clearSignal();
    await this.rpc?.close(500);
    return cancelledTurn(this.req.session, this.model, this.attempts);
  }
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
  if (req.signal?.aborted) return cancelledTurn(req.session, model);

  const dirs = runtime.dirs();
  const overlayPath = await runtime.overlay(opaque);
  const extraArgs = turnArgs(runtime, req, opaque, dirs);
  assertOmpSessionCwd(req);
  const resume =
    req.session && req.session.harness === OMP_ID ? req.session.id : undefined;
  return await new OmpTurnRun(
    runtime,
    req,
    model,
    dirs,
    overlayPath,
    resume,
    extraArgs,
  ).run();
}
