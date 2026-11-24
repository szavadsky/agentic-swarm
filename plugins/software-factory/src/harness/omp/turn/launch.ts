/** Launching the omp RPC, its setup and subagent steering. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AdapterTurnResult,
  LiveAgents,
  ModelRef,
  Stop,
  SubagentInfo,
  TurnAttempt,
  TurnRequest,
} from "../../types.js";
import { zeroUsage } from "../../usage.js";
import { classifyOmpTurn } from "../classify.js";
import { OmpRpcExit, OmpRpcTimeout } from "../rpc.js";
import type { OmpRpc } from "../rpc.js";
import type { OmpDirs, OmpRuntime } from "../runtime.js";
import { DEFAULT_TOOLS } from "../types.js";
import type { OmpTurnOpaque } from "../types.js";
import type { TurnLaunch } from "./types.js";

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Stop for a failed RPC launch, shared by the retry record and the terminal return. */
export function launchFailure(error: unknown): Stop {
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
export function turnArgs(
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
export async function launchTurnRpc(
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

async function steerSession(live: OmpRpc, message: string): Promise<void> {
  const frame = await live.request("steer", { message }, 10_000);
  if (!frame.success) {
    throw new Error(String(frame.error ?? "steer failed"));
  }
}

/**
 * The live turn's handles. Root steering rides the same firmware probe as the
 * subagent surface: a binary too old to advertise steering is offered none, so
 * the kernel queues the steer for the session's next turn instead.
 */
export function liveAgents(live: OmpRpc, canSteerSession: boolean): LiveAgents {
  return {
    list: () => listSubagents(live),
    steer: (id, message) => steerSubagent(live, id, message),
    ...(canSteerSession
      ? { steerSession: (message: string) => steerSession(live, message) }
      : {}),
  };
}

/** A turn that never ran, reported as cancelled. */
export function cancelledTurn(
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
