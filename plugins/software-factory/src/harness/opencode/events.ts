import type { Usage } from "../types.js";
import { zeroUsage } from "../usage.js";

/** Error object opencode emits as a `{"type":"error"}` event. */
export interface OpencodeError {
  type?: string;
  message?: string;
  status?: number;
  statusCode?: number;
  [key: string]: unknown;
}

export interface OpencodeEventSummary {
  sessionId?: string;
  text: string;
  usage: Usage;
  lastStepReason?: string;
  errors: OpencodeError[];
  sawStepFinish: boolean;
}

/**
 * Parser for `opencode run --format json` JSONL streams. Only the final
 * assistant message's text is returned; step_finish parts carry tokens/cost.
 */
export class OpencodeEventParser {
  private readonly summary: OpencodeEventSummary = {
    text: "",
    usage: zeroUsage(),
    errors: [],
    sawStepFinish: false,
  };
  private textMessageId?: string;
  private textParts: string[] = [];

  feedLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    this.feed(event);
  }

  feedText(text: string): void {
    for (const line of text.split("\n")) this.feedLine(line);
  }

  result(): OpencodeEventSummary {
    return {
      ...this.summary,
      text: this.textParts.join(""),
      usage: { ...this.summary.usage },
      errors: [...this.summary.errors],
    };
  }

  private feed(event: any): void {
    if (typeof event?.sessionID === "string") this.summary.sessionId = event.sessionID;

    if (event?.type === "text" && typeof event.part?.text === "string") {
      const messageId = event.part.messageID;
      if (typeof messageId === "string" && messageId !== this.textMessageId) {
        this.textMessageId = messageId;
        this.textParts = [];
      }
      this.textParts.push(event.part.text);
      return;
    }

    if (event?.type === "step_finish") {
      this.summary.sawStepFinish = true;
      const part = event.part ?? {};
      if (typeof part.reason === "string") this.summary.lastStepReason = part.reason;
      const tokens = part.tokens ?? {};
      const output = Number(tokens.output ?? 0);
      const reasoning = Number(tokens.reasoning ?? 0);
      const usage = this.summary.usage;
      usage.in += Number(tokens.input ?? 0);
      usage.cacheRead += Number(tokens.cache?.read ?? 0);
      usage.cacheWrite5m += Number(tokens.cache?.write ?? 0);
      usage.reasoningOut += reasoning;
      // opencode reports text output and reasoning as separate counters (output can be
      // smaller than reasoning), unlike omp where reasoning is inside output.
      usage.out += output;
      usage.costUsd = (usage.costUsd ?? 0) + Number(part.cost ?? 0);
      return;
    }

    if (event?.type === "error") {
      const error = (event.error ?? {}) as OpencodeError;
      this.summary.errors.push(error);
    }
  }
}
