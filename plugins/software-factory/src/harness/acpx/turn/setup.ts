/** Command lines, timeouts and the one-off setup process. */

import path from "node:path";
import { runProcess } from "../../../core/proc.js";
import { exitWithDetails, lastNonBannerLine } from "../../details.js";
import type { Stop, TurnRequest } from "../../types.js";
import { classifyAcpxError, isNoSessionError } from "../classify.js";
import { resolveRawAgentCommand } from "../command.js";
import { acpxErrors } from "../transcript.js";
import type { AcpxConfig, AcpxRunConfig, AcpxTurnOpaque } from "../config.js";
import type { AcpxRuntime, SetupFailure } from "./types.js";

const SETUP_TIMEOUT_SEC = 120;
export const MAX_STDERR_BYTES = 64 * 1024;
/** A slash command reuses the session; no model turn runs, so the bound is setup-sized. */
export const COMMAND_TIMEOUTS: TurnRequest["timeouts"] = {
  idleMs: 120_000,
  wallMs: 180_000,
};

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

export function turnConfig(
  runtime: AcpxRuntime,
  req: TurnRequest,
): AcpxRunConfig {
  const opaque = req.opaque as AcpxTurnOpaque | undefined;
  // The per-turn block overrides the binding but never drops the harness
  // entry's opaque process options.
  const config = { ...runtime.acpx, ...opaque };
  if (typeof config.agent !== "string" || !config.agent) {
    throw new Error(`acpx harness "${runtime.id}" has no agent configured`);
  }
  return config;
}

/**
 * The raw-agent escape hatch (`--agent "<binary> acp"`) reaches a stdio server
 * the dispatcher cannot spawn itself. The path is resolved here rather than
 * left to the spawned process so config and pre-flight agree.
 */
export function acpxAgentSelection(config: AcpxConfig): string[] {
  return config.raw
    ? ["--agent", resolveRawAgentCommand(config.agent)]
    : [config.agent];
}

export function acpxGlobalArgs(config: AcpxRunConfig, cwd: string): string[] {
  // acpx requires global flags before the agent subcommand (probe §0).
  return [
    "--format",
    "json",
    "--cwd",
    path.resolve(cwd),
    ...(config.args ?? []),
  ];
}

export async function runSetup(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<SetupFailure | undefined> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    envAllowlist: runtime.envAllowlist,
    env: config.env,
    timeoutSec: SETUP_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
    signal,
  });
  if (result.aborted) return { stop: { kind: "cancelled" }, noSession: false };
  const errors = acpxErrors(result.stdout);
  const error = errors.at(-1);
  if (error)
    return {
      stop: classifyAcpxError(error, {
        code: result.code,
        signal: result.signal ?? null,
      }),
      noSession: isNoSessionError(error),
    };
  if (result.timedOut)
    return { stop: { kind: "infra", cause: "timeout" }, noSession: false };
  if (result.code !== 0) {
    const details = exitWithDetails(
      result.code,
      result.signal ?? null,
      lastNonBannerLine(result.stderr),
    );
    const stop: Stop = details
      ? { kind: "infra", cause: "crash", details }
      : { kind: "infra", cause: "crash" };
    return { stop, noSession: false };
  }
  return undefined;
}
