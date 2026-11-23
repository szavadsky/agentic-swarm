import fs from "node:fs";
import path from "node:path";
import { scrubSecrets } from "../details.js";
import type { Usage } from "../types.js";
import { zeroUsage } from "../usage.js";
import type { AcpxUsageFields } from "./config.js";
import type { AcpxError, AcpxTurnSummary } from "./types.js";

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

const DEFAULT_USAGE_FIELDS: Required<AcpxUsageFields> = {
  input: ["inputTokens"],
  cacheRead: ["cachedReadTokens"],
  cacheWrite: ["cachedWriteTokens", "cacheCreationInputTokens"],
  output: ["outputTokens"],
  thought: ["thoughtTokens"],
};

function first(source: Record<string, unknown>, names: string[]): number {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number") return number(value);
  }
  return 0;
}

/**
 * Token counts come from the prompt result; an absent usage stays unknown.
 * Reasoning stays disjoint from text output, as in the omp adapter. Field
 * names come from config; the defaults cover the probed agents.
 */
export function usageFromAcpxResult(
  raw: unknown,
  fields?: AcpxUsageFields,
): Usage {
  const usage = zeroUsage();
  if (!raw || typeof raw !== "object") return usage;
  const source = raw as Record<string, unknown>;
  const names = { ...DEFAULT_USAGE_FIELDS, ...fields };
  const output = first(source, names.output);
  const reasoning = first(source, names.thought);
  usage.in = first(source, names.input);
  usage.cacheRead = first(source, names.cacheRead);
  usage.cacheWrite5m = first(source, names.cacheWrite);
  // Some agents count thought inside output; others count it on top and
  // report totalTokens = input+output+reasoning+cache read/write. That total
  // is the only field that separates the two shapes; without it the inside
  // shape is assumed (config/acpx-verify.md §3). Reading it wrong moves
  // tokens between `out` and `reasoningOut` and drops them from the priced total.
  const total = first(source, ["totalTokens"]);
  const thoughtSeparate =
    reasoning > 0 &&
    total ===
      usage.in +
        usage.cacheRead +
        usage.cacheWrite5m +
        usage.cacheWrite1h +
        output +
        reasoning;
  usage.out = thoughtSeparate ? output : Math.max(0, output - reasoning);
  usage.reasoningOut = reasoning;
  return usage;
}

/**
 * ACP `usage_update.cost` is the session-cumulative figure in USD, not this
 * turn's spend. Any other currency is not a `Usage` dollar amount, so it
 * stays unknown (config/acpx-verify.md §4).
 */
function usageUpdateCost(update: unknown): number | undefined {
  const cost = objectValue(objectValue(update)?.cost);
  if (cost?.currency !== "USD") return undefined;
  return typeof cost.amount === "number" &&
    Number.isFinite(cost.amount) &&
    cost.amount >= 0
    ? cost.amount
    : undefined;
}

/** An object value, or undefined for primitives, null and absent values. */
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Error objects a session_info_update's `_meta` names, direct and nested. */
function errorCandidates(
  meta: Record<string, unknown>,
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const direct = objectValue(meta.error);
  if (direct) candidates.push(direct);
  for (const value of Object.values(meta)) {
    const nested = objectValue(objectValue(value)?.error);
    if (nested) candidates.push(nested);
  }
  return candidates;
}

/** One candidate's code, message and nested data, as the adapter reported them. */
function adapterError(raw: Record<string, unknown>): AcpxError {
  const codexErrorInfo = objectValue(raw.codexErrorInfo);
  const disconnected = objectValue(codexErrorInfo?.responseStreamDisconnected);
  const code =
    typeof raw.httpStatusCode === "number"
      ? raw.httpStatusCode
      : typeof disconnected?.httpStatusCode === "number"
        ? disconnected.httpStatusCode
        : typeof raw.code === "number"
          ? raw.code
          : undefined;
  const message = typeof raw.message === "string" ? raw.message : undefined;
  const details =
    typeof raw.additionalDetails === "string"
      ? raw.additionalDetails
      : typeof raw.details === "string"
        ? raw.details
        : undefined;
  const errorName =
    typeof raw.errorName === "string" ? raw.errorName : undefined;
  return {
    ...(code !== undefined ? { code } : {}),
    ...(message ? { message } : {}),
    data: {
      ...(details ? { details } : {}),
      ...(errorName ? { errorName } : {}),
    },
  };
}

/** Extracts adapter-level error metadata from a session_info_update frame. */
function extractAdapterError(update: unknown): AcpxError | undefined {
  const meta = objectValue(objectValue(update)?._meta);
  if (!meta) return undefined;
  const raw = errorCandidates(meta)[0];
  return raw ? adapterError(raw) : undefined;
}

/** A config name used as one path segment; ids and session names are caller text. */
function segment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Where one named session's stdout stream is kept: under the launch's session
 * store, never in a worktree. Every turn that reuses the name appends here, so
 * the record's one path carries the whole chain, repairs included.
 */
export function acpxTranscriptPath(
  sessionDir: string,
  harness: string,
  session: string,
): string {
  return path.join(
    sessionDir,
    "acpx",
    segment(harness),
    "transcripts",
    `${segment(session)}.ndjson`,
  );
}

/**
 * One session's stdout stream, appended line by line as each turn's child
 * emits it. Token-shaped secrets are scrubbed with the same rules as
 * `Stop.details`, so an error frame cannot leave a key on disk; the child's
 * env is filtered by `childEnv`, so provider keys never reach the stream.
 */
export class AcpxTranscriptFile {
  readonly path: string;
  private descriptor: number | undefined;
  private failure: Error | undefined;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.path = file;
    this.descriptor = fs.openSync(file, "a");
  }

  /** Appends one complete stdout line; write failures are raised by `close`. */
  line(text: string): void {
    if (this.descriptor === undefined || this.failure) return;
    try {
      fs.writeSync(this.descriptor, `${scrubSecrets(text)}\n`);
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
    }
  }

  /** Closes the stream and returns its first failure for the caller to raise. */
  close(): Error | undefined {
    const descriptor = this.descriptor;
    this.descriptor = undefined;
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        this.failure ??=
          error instanceof Error ? error : new Error(String(error));
      }
    }
    return this.failure;
  }
}

/**
 * Parser for acpx's `--format json` stdout: a raw ACP JSON-RPC transcript, not
 * an acpx event stream. Requests and responses share ids, so the prompt result
 * is the response to the `session/prompt` request.
 *
 * Agent text arrives as `agent_message_chunk` notifications. Flush on every
 * other session update so a banner and the model reply are separate messages;
 * the last one is what the turn returns.
 */
export class AcpxTranscriptParser {
  private promptId: string | number | undefined;
  private promptResult?: Record<string, unknown>;
  private sessionId?: string;
  private readonly errors: AcpxError[] = [];
  private adapterError?: AcpxError;
  private currentText = "";
  private lastText = "";
  private messageId?: string;
  private costUsd?: number;
  private readonly fields?: AcpxUsageFields;

  constructor(fields?: AcpxUsageFields) {
    this.fields = fields;
  }

  feedLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame: unknown;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      return;
    }
    this.feed(frame);
  }

  result(): AcpxTurnSummary {
    this.flush();
    const usage = usageFromAcpxResult(this.promptResult?.usage, this.fields);
    const stopReason = this.promptResult?.stopReason;
    // The last update of the turn carries the newest session total.
    if (this.costUsd !== undefined) usage.costUsd = this.costUsd;
    return {
      text: this.lastText,
      usage,
      ...(typeof stopReason === "string" ? { stopReason } : {}),
      ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      errors: [...this.errors],
      ...(this.adapterError ? { adapterError: this.adapterError } : {}),
    };
  }

  /** Records a `session/prompt` request id; true when the frame was one. */
  private feedPromptRequest(frame: Record<string, unknown>): boolean {
    const id = frame.id;
    if (
      frame.method !== "session/prompt" ||
      (typeof id !== "string" && typeof id !== "number")
    ) {
      return false;
    }
    this.promptId = id;
    return true;
  }

  /** Applies one `session/update` notification's update and session id. */
  private feedUpdate(params: unknown): void {
    const notification = objectValue(params);
    const update = objectValue(notification?.update);
    if (typeof notification?.sessionId === "string")
      this.sessionId = notification.sessionId;
    if (update?.sessionUpdate === "usage_update") {
      const cost = usageUpdateCost(update);
      if (cost !== undefined) this.costUsd = cost;
    }
    if (update?.sessionUpdate === "session_info_update") {
      const adapterErr = extractAdapterError(update);
      if (adapterErr) this.adapterError = adapterErr;
    }
    if (update?.sessionUpdate === "agent_message_chunk") {
      this.feedChunk(update);
    } else if (update?.sessionUpdate !== "agent_thought_chunk") {
      this.flush();
    }
  }

  /** Records the turn's prompt result; true when the frame carried it. */
  private feedPromptResult(frame: Record<string, unknown>): boolean {
    const result = objectValue(frame.result);
    if (!result || this.promptId === undefined || frame.id !== this.promptId) {
      return false;
    }
    this.promptResult = result;
    if (typeof result.sessionId === "string") this.sessionId = result.sessionId;
    this.flush();
    return true;
  }

  private feed(frame: unknown): void {
    const rpc = objectValue(frame);
    if (!rpc) return;
    if (this.feedPromptRequest(rpc)) return;
    if (rpc.method === "session/update") {
      this.feedUpdate(rpc.params);
      return;
    }
    if (rpc.error) {
      this.errors.push(rpc.error as AcpxError);
      return;
    }
    if (this.feedPromptResult(rpc)) return;
    const sessionId = objectValue(rpc.result)?.sessionId;
    if (typeof sessionId === "string") this.sessionId = sessionId;
  }

  private feedChunk(update: Record<string, unknown>): void {
    const text = objectValue(update.content)?.text;
    if (typeof text !== "string") return;
    const messageId =
      typeof update.messageId === "string" ? update.messageId : undefined;
    if (messageId !== this.messageId) {
      this.flush();
      this.messageId = messageId;
    }
    this.currentText += text;
  }

  private flush(): void {
    if (!this.currentText) return;
    this.lastText = this.currentText;
    this.currentText = "";
    this.messageId = undefined;
  }
}

/** Collects the error frames from one acpx process's stdout. */
export function acpxErrors(stdout: string): AcpxError[] {
  const errors: AcpxError[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const frame = JSON.parse(trimmed);
      if (frame?.error) errors.push(frame.error as AcpxError);
    } catch {}
  }
  return errors;
}
