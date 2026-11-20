import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AdapterTurnResult,
  LiveAgents,
  ModelRef,
  ServedUsage,
  SessionRef,
  Stop,
  SubagentInfo,
  TurnAttempt,
  TurnRequest,
  Usage,
} from "../types.js";
import { zeroUsage } from "../usage.js";
import { classifyOmpTurn, type OmpTurnFailure } from "./classify.js";
import { type OmpRpc, OmpRpcExit, OmpRpcTimeout } from "./rpc.js";
import { actualModel, type OmpDirs, type OmpRuntime } from "./runtime.js";
import { DEFAULT_TOOLS, OMP_ID, type OmpTurnOpaque } from "./types.js";
import {
  isSessionCompacted,
  type OmpStats,
  servedTotal,
  servedUsage,
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

/** Writes the hashed system prompt file once; returns its path. */
function systemPromptPath(promptsDir: string, system: string): string {
  const hash = createHash("sha1").update(system).digest("hex").slice(0, 12);
  const file = path.join(promptsDir, `system-${hash}.txt`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, system, "utf8");
  return file;
}

/** Adds the outcome file's directory when it lies outside the worktree. */
function addOutcomeDir(
  addDirs: Set<string>,
  cwd: string,
  outcomePath: string,
): void {
  const dir = path.dirname(path.resolve(cwd, outcomePath));
  if (!isInside(cwd, dir)) addDirs.add(dir);
}

/** Launch args: tools, the system prompt, extra dirs and agent definitions. */
function turnArgs(
  runtime: OmpRuntime,
  req: TurnRequest,
  opaque: OmpTurnOpaque,
  dirs: OmpDirs,
): string[] {
  const tools = opaque.tools ?? DEFAULT_TOOLS;
  const extraArgs = [`--tools=${tools.join(",")}`];
  if (req.system) {
    extraArgs.push(
      "--append-system-prompt",
      systemPromptPath(dirs.prompts, req.system),
    );
  }
  const addDirs = new Set<string>(opaque.addDirs ?? []);
  if (req.outcomePath) addOutcomeDir(addDirs, req.cwd, req.outcomePath);
  for (const dir of addDirs) extraArgs.push("--add-dir", dir);
  if (opaque.agents !== undefined && opaque.agents.length > 0) {
    extraArgs.push("-e", runtime.agentsDir(opaque.agents));
  }
  return extraArgs;
}

interface TurnLaunch {
  rpc?: OmpRpc;
  error?: unknown;
  attempts: TurnAttempt[];
  resumeDir: string;
}

/** Whether a failed launch was a resume whose record is gone. */
function isLostResume(error: unknown): boolean {
  return /session .*not found/i.test(
    error instanceof OmpRpcExit ? error.stderr : String(error),
  );
}

/**
 * Launches the turn's RPC, retrying once de novo when the resumed record is
 * gone. The failed resume is kept as an attempt record: the restart is never
 * silent.
 */
async function launchTurnRpc(
  runtime: OmpRuntime,
  model: ModelRef,
  req: TurnRequest,
  overlayPath: string,
  dirs: OmpDirs,
  resume: string | undefined,
  extraArgs: string[],
): Promise<TurnLaunch> {
  // The session lives in its own launch dir; resume against that home, and when
  // it is gone (retention pruned it) retry de novo once instead of crashing.
  let resumeDir = dirs.sessions;
  const resumeId = resume;
  const attempts: TurnAttempt[] = [];
  if (resume && req.session?.dir && fs.existsSync(req.session.dir)) {
    resumeDir = req.session.dir;
  }
  try {
    const rpc = await runtime.launch(
      model,
      req.cwd,
      overlayPath,
      resumeDir,
      resumeId,
      extraArgs,
    );
    return { rpc, attempts, resumeDir };
  } catch (error) {
    if (!resumeId || !isLostResume(error)) {
      return { error, attempts, resumeDir };
    }
    attempts.push({ model, stop: launchFailure(error), usage: zeroUsage() });
    try {
      const rpc = await runtime.launch(
        model,
        req.cwd,
        overlayPath,
        dirs.sessions,
        undefined,
        extraArgs,
      );
      return { rpc, attempts, resumeDir: dirs.sessions };
    } catch (retryError) {
      return { error: retryError, attempts, resumeDir: dirs.sessions };
    }
  }
}

/** The live subagent registry, from the turn's own RPC. */
async function listSubagents(live: OmpRpc): Promise<SubagentInfo[]> {
  const frame = await live.request("get_subagents", {}, 10_000);
  if (!frame.success) {
    throw new Error(String(frame.error ?? "get_subagents failed"));
  }
  const subs: any[] = Array.isArray(frame.data?.subagents)
    ? frame.data.subagents
    : [];
  return subs.map((sub) => ({
    id: String(sub.id),
    agent: String(sub.agent ?? ""),
    status: String(sub.status ?? ""),
    ...(typeof sub.sessionFile === "string"
      ? { sessionFile: sub.sessionFile }
      : {}),
  }));
}

async function steerSubagent(
  live: OmpRpc,
  id: string,
  message: string,
): Promise<void> {
  const frame = await live.request(
    "steer_subagent",
    { subagentId: id, message },
    10_000,
  );
  if (!frame.success) {
    throw new Error(String(frame.error ?? `steer_subagent ${id} failed`));
  }
}

function liveAgents(live: OmpRpc): LiveAgents {
  return {
    list: () => listSubagents(live),
    steer: (id, message) => steerSubagent(live, id, message),
  };
}

/** A turn that never ran, reported as cancelled. */
function cancelledTurn(
  session: TurnRequest["session"],
  model: ModelRef,
  attempts: TurnAttempt[] = [],
): AdapterTurnResult {
  return {
    stop: { kind: "cancelled" },
    text: "",
    usage: zeroUsage(),
    session,
    model,
    attempts,
  };
}

interface PromptExchange {
  promptResult: any;
  promptFailed: Error | undefined;
}

/**
 * Sends the prompt and waits for its result, releasing a pending abort after a
 * short grace. A subarchitect child that keeps the session open is awaited up
 * to the wall bound.
 */
async function awaitPrompt(
  rpc: OmpRpc,
  abortSignal: Promise<void>,
  req: TurnRequest,
): Promise<PromptExchange> {
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
    // A subarchitect child keeps the session open after the parent yields; the
    // wall bound, not a fixed minute, is when the launch is truly over.
    const settleBoundMs =
      req.timeouts.wallMs > 0 ? req.timeouts.wallMs : 60_000;
    await rpc
      .awaitFrame(
        (frame) => frame.type === "session_settled",
        settleBoundMs,
        "session_settled",
      )
      .catch(() => undefined);
  }
  return { promptResult, promptFailed };
}

/** The prompt failure as the classifier reads it, if the prompt failed. */
function turnFailure(
  promptFailed: Error | undefined,
  rpc: OmpRpc,
): OmpTurnFailure | undefined {
  if (promptFailed instanceof OmpRpcExit) {
    return {
      code: promptFailed.code,
      signal: promptFailed.signal,
      stderr: promptFailed.stderr || rpc.stderr(),
    };
  }
  if (promptFailed instanceof OmpRpcTimeout) return { timedOut: true };
  if (promptFailed) return { stderr: String(promptFailed) };
  return undefined;
}

/** The turn's stop; an abort whose prompt never answered is a cancellation. */
function turnStop(
  aborted: boolean,
  promptResult: any,
  abortReason: "idle" | "wall" | undefined,
  failure: OmpTurnFailure | undefined,
  summary: ReturnType<typeof summarizeOmpFrames>,
  usage: ReturnType<typeof zeroUsage>,
  turnText: string,
): Stop {
  if (aborted && !promptResult) return { kind: "cancelled" };
  return classifyOmpTurn({
    abortReason,
    failure,
    promptResult,
    lastStopReason: summary.lastAssistantStopReason,
    usage,
    text: turnText,
  });
}

/** `get_last_assistant_text` answers for the session, so a glitch hides it. */
function turnTextFor(
  stop: Stop,
  frameText: string | undefined,
  turnText: string,
): string {
  if (stop.kind === "infra" && stop.cause === "glitch") return "";
  return frameText ?? turnText;
}

function sessionRefFor(
  runtime: OmpRuntime,
  req: TurnRequest,
  model: ModelRef,
  state: any,
  postStats: OmpStats | undefined,
  sessionFile: string | undefined,
  resume: string | undefined,
  resumeDir: string,
  lastModelEventAtMs: number | undefined,
): SessionRef | undefined {
  const sessionId: string | undefined =
    state?.sessionId ?? postStats?.sessionId ?? resume;
  if (!sessionId) return req.session;
  return {
    harness: OMP_ID,
    id: sessionId,
    cwd: req.cwd,
    dir: resumeDir,
    model: actualModel(state, model),
    lastRequestStartedAt: new Date(
      lastModelEventAtMs ?? Date.now(),
    ).toISOString(),
    retentionTier: runtime.retention,
    compacted:
      isSessionCompacted(sessionFile) ||
      (!sessionFile && req.session?.compacted === true),
  };
}

/** Everything the turn learned once the prompt exchange is over. */
interface OmpTurnFinish {
  runtime: OmpRuntime;
  req: TurnRequest;
  model: ModelRef;
  rpc: OmpRpc;
  baseline: OmpStats | undefined;
  startedAtMs: number;
  promptResult: any;
  promptFailed: Error | undefined;
  abortReason: "idle" | "wall" | undefined;
  aborted: boolean;
  lastModelEventAtMs: number | undefined;
  retainedFrames: any[];
  resume: string | undefined;
  resumeDir: string;
  attempts: TurnAttempt[];
}

/** Queries the ended session, closes it, and summarizes its frames. */
async function endedSession(state: OmpTurnFinish) {
  const queryTimeout = state.abortReason || state.aborted ? 2_000 : 10_000;
  const textFrame = await state.rpc
    .request("get_last_assistant_text", {}, queryTimeout)
    .catch(() => undefined);
  const statsFrame = await state.rpc
    .request("get_session_stats", {}, queryTimeout)
    .catch(() => undefined);
  const stateFrame = await state.rpc
    .request("get_state", {}, queryTimeout)
    .catch(() => undefined);

  await state.rpc.close(2_000);

  const summary = summarizeOmpFrames(state.retainedFrames);
  const postStats = statsFrame?.data as OmpStats | undefined;
  const sessionData = stateFrame?.data;
  const sessionFile: string | undefined =
    sessionData?.sessionFile ?? postStats?.sessionFile;
  return { textFrame, summary, postStats, sessionData, sessionFile };
}

interface EndedUsage {
  served: ServedUsage[] | undefined;
  usage: Usage;
}

/**
 * An `@` alias resolves inside omp's own chain and can switch models within this
 * one call. The transcript carries per-message provider/model, so the turn is
 * split per served model and priced from those counters; any other model keeps
 * the session-stats aggregate unchanged.
 */
function endedUsage(
  state: OmpTurnFinish,
  summary: ReturnType<typeof summarizeOmpFrames>,
  postStats: OmpStats | undefined,
  sessionFile: string | undefined,
): EndedUsage {
  const served = state.model.id.startsWith("@")
    ? servedUsage(sessionFile, state.startedAtMs)
    : undefined;
  const usage = served
    ? servedTotal(served)
    : turnUsage({
        before: state.baseline,
        after: postStats,
        fallback: summary.usage,
        sessionFile,
        sinceMs: state.startedAtMs,
      });
  return { served, usage };
}

/** Queries the ended session and assembles the turn result. */
async function finishOmpTurn(state: OmpTurnFinish): Promise<AdapterTurnResult> {
  const ended = await endedSession(state);
  const { served, usage } = endedUsage(
    state,
    ended.summary,
    ended.postStats,
    ended.sessionFile,
  );
  const summary = ended.summary;
  const sessionFile = ended.sessionFile;
  const turnText = summary.assistantText ?? "";
  const failure = turnFailure(state.promptFailed, state.rpc);
  const stop = turnStop(
    state.aborted,
    state.promptResult,
    state.abortReason,
    failure,
    summary,
    usage,
    turnText,
  );
  const text = turnTextFor(stop, ended.textFrame?.data?.text, turnText);
  const session = sessionRefFor(
    state.runtime,
    state.req,
    state.model,
    ended.sessionData,
    ended.postStats,
    sessionFile,
    state.resume,
    state.resumeDir,
    state.lastModelEventAtMs,
  );

  return {
    stop,
    text,
    usage,
    session,
    model: session?.model ?? state.model,
    ...(served ? { served } : {}),
    transcript: sessionFile,
    attempts: state.attempts,
  };
}

/** The session's cwd must match the request's: omp sessions are cwd-bound. */
function assertOmpSessionCwd(req: TurnRequest): void {
  if (
    req.session &&
    req.session.harness === OMP_ID &&
    path.resolve(req.session.cwd) !== path.resolve(req.cwd)
  ) {
    throw new Error(
      `omp session ${req.session.id} is cwd-bound to ${req.session.cwd}, not ${req.cwd}`,
    );
  }
}

/** The launched RPC state, or the failure that ends the turn. */
interface LaunchState {
  live: OmpRpc | undefined;
  baseline: OmpStats | undefined;
  resumeDir: string;
  attempts: TurnAttempt[];
  failure: AdapterTurnResult | undefined;
}

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
