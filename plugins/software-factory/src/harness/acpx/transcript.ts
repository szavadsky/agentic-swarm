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
 * Token counts come from the prompt result with no cost; an absent usage stays
 * unknown. Reasoning stays disjoint from text output, as in the omp adapter.
 * Field names come from config; the defaults cover the probed agents.
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
  usage.out = Math.max(0, output - reasoning);
  usage.reasoningOut = reasoning;
  return usage;
}

interface PromptResult {
  stopReason?: string;
  usage?: unknown;
  sessionId?: string;
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
  private promptResult?: PromptResult;
  private sessionId?: string;
  private readonly errors: AcpxError[] = [];
  private currentText = "";
  private lastText = "";
  private messageId?: string;
  private readonly fields?: AcpxUsageFields;

  constructor(fields?: AcpxUsageFields) {
    this.fields = fields;
  }

  feedLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame: any;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      return;
    }
    this.feed(frame);
  }

  result(): AcpxTurnSummary {
    this.flush();
    return {
      text: this.lastText,
      usage: usageFromAcpxResult(this.promptResult?.usage, this.fields),
      ...(this.promptResult?.stopReason
        ? { stopReason: this.promptResult.stopReason }
        : {}),
      ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      errors: [...this.errors],
    };
  }

  private feed(frame: any): void {
    if (!frame || typeof frame !== "object") return;

    if (
      frame.method === "session/prompt" &&
      frame.id !== undefined &&
      frame.id !== null
    ) {
      this.promptId = frame.id;
      return;
    }

    if (frame.method === "session/update") {
      const update = frame.params?.update;
      if (typeof frame.params?.sessionId === "string")
        this.sessionId = frame.params.sessionId;
      if (update?.sessionUpdate === "agent_message_chunk") {
        this.feedChunk(update);
      } else if (update?.sessionUpdate !== "agent_thought_chunk") {
        this.flush();
      }
      return;
    }

    if (frame.error) {
      this.errors.push(frame.error as AcpxError);
      return;
    }

    if (
      frame.result &&
      this.promptId !== undefined &&
      frame.id === this.promptId
    ) {
      const result = frame.result as PromptResult;
      this.promptResult = result;
      if (typeof result.sessionId === "string")
        this.sessionId = result.sessionId;
      this.flush();
      return;
    }

    if (typeof frame.result?.sessionId === "string") {
      this.sessionId = frame.result.sessionId;
    }
  }

  private feedChunk(update: any): void {
    const text = update.content?.text;
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
