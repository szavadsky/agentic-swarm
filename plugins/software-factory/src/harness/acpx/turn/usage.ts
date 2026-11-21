/** Running one acpx command and reading a session's usage. */

import type { SessionRef, Usage } from "../../types.js";
import { AcpxTranscriptParser } from "../transcript.js";
import { usageFromAcpxSessionText } from "../usage.js";
import type { AcpxConfig, AcpxRunConfig } from "../config.js";
import type { AcpxCommandResult } from "../types.js";
import type { AcpxRuntime } from "./types.js";
import {
  COMMAND_TIMEOUTS,
  acpxAgentSelection,
  acpxGlobalArgs,
} from "./setup.js";
import { runPromptProcess } from "./process.js";

/**
 * One adapter slash command on a named session, with no model prompt: the
 * command is the whole prompt and `--model` is omitted, so `/compact` reaches
 * the adapter instead of spending a model turn. Returns the parsed transcript
 * (ACP errors included) and the process facts so callers can classify it.
 */
export async function runAcpxCommand(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  ref: Pick<SessionRef, "id" | "cwd">,
  command: string,
  signal?: AbortSignal,
): Promise<AcpxCommandResult> {
  const globals = acpxGlobalArgs(config, ref.cwd);
  const selection = acpxAgentSelection(config);
  // The raw --agent route has no positional agent: the prompt verb follows the
  // selection. A positional agent takes `-s` and the command directly.
  const verb = config.raw ? ["prompt"] : [];
  const args = [...globals, ...selection, ...verb, "-s", ref.id, command];
  const parser = new AcpxTranscriptParser(config.usage?.fields);
  const result = await runPromptProcess(
    runtime,
    config,
    args,
    ref.cwd,
    COMMAND_TIMEOUTS,
    parser,
    undefined,
    signal,
  );
  return {
    summary: parser.result(),
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    stderr: result.stderr,
  };
}

/**
 * Read a session's cumulative token totals through its usage command. The
 * command is the whole prompt, so it reuses the session without spending a
 * model turn. Any failure leaves the caller's stop and usage untouched.
 */
export async function readAcpxSessionUsage(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  ref: Pick<SessionRef, "id" | "cwd">,
  signal?: AbortSignal,
): Promise<Usage | undefined> {
  const command = config.usage?.command;
  if (!command) return undefined;
  const result = await runAcpxCommand(runtime, config, ref, command, signal);
  if (
    result.aborted ||
    result.timedOut ||
    result.code !== 0 ||
    result.summary.errors.length > 0 ||
    result.summary.stopReason !== "end_turn"
  ) {
    return undefined;
  }
  return usageFromAcpxSessionText(result.summary.text);
}

export function isZeroUsage(usage: Usage): boolean {
  return (
    usage.in === 0 &&
    usage.out === 0 &&
    usage.cacheRead === 0 &&
    usage.cacheWrite5m === 0 &&
    usage.cacheWrite1h === 0 &&
    usage.reasoningOut === 0
  );
}
