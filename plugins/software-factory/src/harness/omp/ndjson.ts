import type { OmpParsedResult } from "./types.js";

/**
 * Parser for streaming NDJSON protocol emitted by `omp --mode json`.
 */
export class OmpNdjsonParser {
  private sessionId?: string;
  private sessionTimestamp?: string;
  private cwd?: string;
  private assistantTextParts: string[] = [];
  private yieldData?: unknown;
  private inputTokens = 0;
  private outputTokens = 0;
  private costUsd = 0;
  private stopReason?: string;
  private rawEvents: unknown[] = [];
  private errors: string[] = [];

  /**
   * Ingests a single NDJSON line. Non-JSON lines (e.g. wall time metrics) are safely skipped.
   */
  public feedLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // Skip non-JSON lines emitted by CLI wrapper (e.g. "Wall time: ...")
      return;
    }

    this.rawEvents.push(event);

    switch (event.type) {
      case "session":
        if (event.id) this.sessionId = event.id;
        if (event.timestamp) this.sessionTimestamp = event.timestamp;
        if (event.cwd) this.cwd = event.cwd;
        break;

      case "turn_end":
        if (event.message?.role === "assistant") {
          const contents = event.message.content || [];
          for (const part of contents) {
            if (part.type === "text" && part.text) {
              this.assistantTextParts.push(part.text);
            } else if (
              part.type === "toolCall" &&
              (part.name === "yield" || part.name?.endsWith(":yield"))
            ) {
              this.yieldData = part.arguments?.data !== undefined ? part.arguments.data : part.arguments;
            }
          }

          if (event.message.usage) {
            const u = event.message.usage;
            this.inputTokens += u.input || 0;
            this.outputTokens += u.output || 0;
            const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
            this.costUsd += costVal || 0;
          }

          if (event.message.stopReason) {
            this.stopReason = event.message.stopReason;
          }
        }
        break;

      case "agent_end":
        if (Array.isArray(event.messages)) {
          for (const msg of event.messages) {
            if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (
                  part.type === "toolCall" &&
                  (part.name === "yield" || part.name?.endsWith(":yield"))
                ) {
                  this.yieldData = part.arguments?.data !== undefined ? part.arguments.data : part.arguments;
                }
              }
            }
          }
        }
        break;

      case "tool_execution_start":
        if (event.toolName === "yield" || event.toolName?.endsWith(":yield")) {
          if (event.args?.data !== undefined) {
            this.yieldData = event.args.data;
          } else if (event.args !== undefined) {
            this.yieldData = event.args;
          }
        }
        break;

      case "tool_execution_end":
        if (event.toolName === "yield" || event.toolName?.endsWith(":yield")) {
          if (event.result?.details?.data !== undefined) {
            this.yieldData = event.result.details.data;
          }
        }
        break;

      case "error":
        if (event.error) {
          this.errors.push(typeof event.error === "string" ? event.error : JSON.stringify(event.error));
        }
        break;
    }
  }

  /**
   * Ingests a complete multi-line NDJSON string.
   */
  public feedText(text: string): void {
    const lines = text.split("\n");
    for (const line of lines) {
      this.feedLine(line);
    }
  }

  /**
   * Returns the aggregated parsing result.
   */
  public getResult(): OmpParsedResult {
    return {
      sessionId: this.sessionId,
      sessionTimestamp: this.sessionTimestamp,
      cwd: this.cwd,
      finalAssistantText: this.assistantTextParts.join(""),
      yieldData: this.yieldData,
      usage: {
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        costUsd: this.costUsd > 0 ? Number(this.costUsd.toFixed(6)) : 0,
      },
      stopReason: this.stopReason,
      rawEvents: this.rawEvents,
      errors: this.errors,
    };
  }
}
