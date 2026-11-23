import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import { scrubSecrets } from "../details.js";
import type { ModelProbe, ModelRef } from "../types.js";
import type { AcpxRunConfig } from "./config.js";
import { acpxModel } from "./model.js";
import {
  acpxAgentSelection,
  acpxGlobalArgs,
  type AcpxRuntime,
} from "./turn.js";

const PROBE_TIMEOUT_SEC = 120;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

interface ProbeProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

function commandLine(runtime: AcpxRuntime, args: string[]): string[] {
  return [runtime.command.binary, ...runtime.command.prefix, ...args];
}

async function runProbeCommand(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  args: string[],
  cwd: string,
): Promise<ProbeProcessResult> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
    envAllowlist: runtime.envAllowlist,
    env: config.env,
    timeoutSec: PROBE_TIMEOUT_SEC,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  });
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    aborted: result.aborted,
  };
}

/** The object records a parsed JSON value names, in order. */
function recordItems(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      const object = record(item);
      return object ? [object] : [];
    });
  }
  const object = record(parsed);
  return object ? [object] : [];
}

function records(text: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    try {
      found.push(...recordItems(JSON.parse(trimmed)));
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return found;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function collectMessages(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectMessages(item, out);
    return;
  }
  const object = record(value);
  if (!object) return;
  for (const key of ["message", "details"]) {
    const text = object[key];
    if (typeof text === "string" && text.trim().length > 0) out.push(text);
  }
  if ("error" in object) collectMessages(object.error, out);
  if ("data" in object) collectMessages(object.data, out);
}

function failureText(result: ProbeProcessResult): string {
  const messages: string[] = [];
  collectMessages(records(result.stdout), messages);
  if (result.stderr.trim().length > 0) messages.push(result.stderr);
  return scrubSecrets(messages.join("\n")).trim().replace(/\s+/g, " ");
}

function availableModels(text: string): string[] {
  const match = /Available models:\s*(.*?)(?:\.(?:\s|$)|$)/is.exec(text);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0 && !/^none advertised$/i.test(model));
}

function didNotOfferModel(text: string): boolean {
  return /did not advertise that model|cannot apply --model|unknown model|model .*not found|model .*not available/i.test(
    text,
  );
}

/** One config-option entry's values, including a nested level's. */
function choiceValues(entry: unknown): string[] {
  const choice = record(entry);
  if (!choice) return [];
  const values = typeof choice.value === "string" ? [choice.value] : [];
  for (const nested of Array.isArray(choice.options) ? choice.options : []) {
    const nestedChoice = record(nested);
    if (nestedChoice && typeof nestedChoice.value === "string")
      values.push(nestedChoice.value);
  }
  return values;
}

function optionValues(option: Record<string, unknown>): string[] {
  const entries = Array.isArray(option.options) ? option.options : [];
  return [...new Set(entries.flatMap(choiceValues))];
}

function configOptions(
  session: Record<string, unknown>,
): Record<string, unknown>[] {
  const acpx = record(session.acpx);
  if (!acpx || !Array.isArray(acpx.config_options)) {
    throw new Error("acpx session record carries no config options");
  }
  return acpx.config_options.flatMap((option) => {
    const item = record(option);
    return item ? [item] : [];
  });
}

function failure(
  action: string,
  result: ProbeProcessResult,
  model?: string,
): Error {
  const details = failureText(result) || `exit ${result.code ?? "none"}`;
  const target = model === undefined ? "" : ` for model "${model}"`;
  return new Error(`acpx ${action}${target} failed: ${details}`);
}
/** One probe's fixed inputs: the adapter, the model selection and its temp cwd. */
interface ProbeContext {
  runtime: AcpxRuntime;
  config: AcpxRunConfig;
  selection: { id: string; effort?: string };
  globals: string[];
  agent: string[];
  name: string;
  cwd: string;
}

/** The probe's optional effort field, absent when the model names none. */
function effortField(selection: ProbeContext["selection"]): {
  modelEffort?: string;
} {
  return selection.effort === undefined
    ? {}
    : { modelEffort: selection.effort };
}

function unlistedProbe(
  selection: ProbeContext["selection"],
  available: string[],
): ModelProbe {
  return {
    listed: false,
    available,
    effort: null,
    ...effortField(selection),
  };
}

/** `sessions new` with the model selection and a fresh session name. */
function createSessionArgs(context: ProbeContext): string[] {
  return [
    ...context.globals,
    "--model",
    context.selection.id,
    ...context.agent,
    "sessions",
    "new",
    "--name",
    context.name,
  ];
}

/** A failed `sessions new` that rejected the model, or the failure it is. */
function rejectedCreate(
  context: ProbeContext,
  result: ProbeProcessResult,
): ModelProbe {
  const text = failureText(result);
  if (!didNotOfferModel(text)) {
    throw failure("sessions new", result, context.selection.id);
  }
  return unlistedProbe(context.selection, availableModels(text));
}

/** Reads the live session record into the probe outcome. */
async function readSession(context: ProbeContext): Promise<ModelProbe> {
  const show = await runProbeCommand(
    context.runtime,
    context.config,
    [...context.globals, ...context.agent, "sessions", "show", context.name],
    context.cwd,
  );
  if (show.aborted) throw new Error("acpx session probe was aborted");
  if (show.timedOut)
    throw new Error("acpx session probe timed out reading the session");
  if (show.code !== 0)
    throw failure("sessions show", show, context.selection.id);
  const session = records(show.stdout).at(-1);
  if (!session) {
    throw new Error("acpx sessions show returned no session record");
  }
  const options = configOptions(session);
  const modelOption = options.find(
    (option) => option.category === "model" || option.id === "model",
  );
  const available = modelOption ? optionValues(modelOption) : [];
  const current = modelOption?.currentValue;
  if (
    modelOption &&
    !available.includes(context.selection.id) &&
    current !== context.selection.id
  ) {
    return unlistedProbe(context.selection, available);
  }
  const effortId = context.config.effort?.configId;
  const effortOption = effortId
    ? options.find((option) => option.id === effortId)
    : undefined;
  return {
    listed: true,
    available,
    effort: effortOption ? optionValues(effortOption) : null,
    ...effortField(context.selection),
  };
}

/** Closes the created session, collecting its failure instead of throwing. */
async function closeSession(context: ProbeContext): Promise<unknown[]> {
  try {
    const close = await runProbeCommand(
      context.runtime,
      context.config,
      [...context.globals, ...context.agent, "sessions", "close", context.name],
      context.cwd,
    );
    if (close.aborted || close.timedOut || close.code !== 0) {
      return [failure("sessions close", close, context.selection.id)];
    }
    return [];
  } catch (err) {
    return [err];
  }
}

/** Removes the throwaway cwd, collecting its failure instead of throwing. */
async function removeCwd(cwd: string): Promise<unknown[]> {
  try {
    await fs.promises.rm(cwd, { recursive: true, force: true });
    return [];
  } catch (err) {
    return [err];
  }
}

/**
 * One no-prompt ACP session for an acpx model. Session creation applies
 * `--model`; the local session record then exposes the live model list and the
 * config option values for that model. The session is closed in the same call,
 * and the throwaway cwd is removed either way.
 */
export async function probeAcpxModel(
  runtime: AcpxRuntime,
  config: AcpxRunConfig,
  model: ModelRef,
): Promise<ModelProbe> {
  const selection = acpxModel(config, model);
  const cwd = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "preflight-acpx-"),
  );
  const context: ProbeContext = {
    runtime,
    config,
    selection,
    globals: acpxGlobalArgs(config, cwd),
    agent: acpxAgentSelection(config),
    name: `${runtime.id}-preflight-${randomUUID()}`,
    cwd,
  };
  let created = false;
  let outcome: ModelProbe | undefined;
  let probeFailure: unknown;
  try {
    const create = await runProbeCommand(
      runtime,
      config,
      createSessionArgs(context),
      cwd,
    );
    if (create.aborted) throw new Error("acpx session probe was aborted");
    if (create.timedOut)
      throw new Error("acpx session probe timed out creating a session");
    if (create.code !== 0) {
      outcome = rejectedCreate(context, create);
    } else {
      created = true;
      outcome = await readSession(context);
    }
  } catch (err) {
    probeFailure = err;
  }

  const cleanupFailures = created ? await closeSession(context) : [];
  cleanupFailures.push(...(await removeCwd(cwd)));

  const failures = [
    ...(probeFailure === undefined ? [] : [probeFailure]),
    ...cleanupFailures,
  ];
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "acpx session probe and cleanup both failed",
    );
  }
  if (!outcome) throw new Error("acpx session probe returned no result");
  return outcome;
}
