import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import { scrubSecrets } from "../details.js";
import type { ModelProbe, ModelRef } from "../types.js";
import type { AcpxConfig } from "./config.js";
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
  config: AcpxConfig,
  args: string[],
  cwd: string,
): Promise<ProbeProcessResult> {
  const result = await runProcess({
    cmd: commandLine(runtime, args),
    cwd,
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

function records(text: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item !== null && typeof item === "object" && !Array.isArray(item))
          found.push(item as Record<string, unknown>);
      }
    } else if (parsed !== null && typeof parsed === "object") {
      found.push(parsed as Record<string, unknown>);
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

function optionValues(option: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const entry of Array.isArray(option.options) ? option.options : []) {
    const choice = record(entry);
    if (!choice) continue;
    if (typeof choice.value === "string") values.push(choice.value);
    for (const nested of Array.isArray(choice.options) ? choice.options : []) {
      const nestedChoice = record(nested);
      if (nestedChoice && typeof nestedChoice.value === "string")
        values.push(nestedChoice.value);
    }
  }
  return [...new Set(values)];
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
/**
 * One no-prompt ACP session for an acpx model. Session creation applies
 * `--model`; the local session record then exposes the live model list and the
 * config option values for that model. The session is closed in the same call,
 * and the throwaway cwd is removed either way.
 */
export async function probeAcpxModel(
  runtime: AcpxRuntime,
  config: AcpxConfig,
  model: ModelRef,
): Promise<ModelProbe> {
  const selection = acpxModel(config, model);
  const cwd = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "preflight-acpx-"),
  );
  const name = `${runtime.id}-preflight-${randomUUID()}`;
  const globals = acpxGlobalArgs(config, cwd);
  const agent = acpxAgentSelection(config);
  let created = false;
  let outcome: ModelProbe | undefined;
  let probeFailure: unknown;
  try {
    const create = await runProbeCommand(
      runtime,
      config,
      [
        ...globals,
        "--model",
        selection.id,
        ...agent,
        "sessions",
        "new",
        "--name",
        name,
      ],
      cwd,
    );
    if (create.aborted) throw new Error("acpx session probe was aborted");
    if (create.timedOut)
      throw new Error("acpx session probe timed out creating a session");
    if (create.code !== 0) {
      const text = failureText(create);
      if (didNotOfferModel(text)) {
        outcome = {
          listed: false,
          available: availableModels(text),
          effort: [],
          ...(selection.effort === undefined
            ? {}
            : { modelEffort: selection.effort }),
        };
      } else {
        throw failure("sessions new", create, selection.id);
      }
    } else {
      created = true;

      const show = await runProbeCommand(
        runtime,
        config,
        [...globals, ...agent, "sessions", "show", name],
        cwd,
      );
      if (show.aborted) throw new Error("acpx session probe was aborted");
      if (show.timedOut)
        throw new Error("acpx session probe timed out reading the session");
      if (show.code !== 0) throw failure("sessions show", show, selection.id);
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
        !available.includes(selection.id) &&
        current !== selection.id
      ) {
        outcome = {
          listed: false,
          available,
          effort: [],
          ...(selection.effort === undefined
            ? {}
            : { modelEffort: selection.effort }),
        };
      } else {
        const effortId = config.effort?.configId;
        const effortOption = effortId
          ? options.find((option) => option.id === effortId)
          : undefined;
        outcome = {
          listed: true,
          available,
          effort: effortOption ? optionValues(effortOption) : [],
          ...(selection.effort === undefined
            ? {}
            : { modelEffort: selection.effort }),
        };
      }
    }
  } catch (err) {
    probeFailure = err;
  }

  const cleanupFailures: unknown[] = [];
  if (created) {
    try {
      const close = await runProbeCommand(
        runtime,
        config,
        [...globals, ...agent, "sessions", "close", name],
        cwd,
      );
      if (close.aborted || close.timedOut || close.code !== 0) {
        cleanupFailures.push(failure("sessions close", close, selection.id));
      }
    } catch (err) {
      cleanupFailures.push(err);
    }
  }

  try {
    await fs.promises.rm(cwd, { recursive: true, force: true });
  } catch (err) {
    cleanupFailures.push(err);
  }

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
