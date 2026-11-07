import type { OmpParsedResult } from "./types.js";

/**
 * Parser for streaming NDJSON protocol emitted by `omp --mode json`.
 */
const MAX_ASSISTANT_TEXT_CHARS = 256 * 1024; // 256 KB
const MAX_ERRORS = 50;
const MAX_ERROR_LEN = 2048;

export class OmpNdjsonParser {
  private sessionId?: string;
  private sessionTimestamp?: string;
  private cwd?: string;
  private finalAssistantText = "";
  private yieldData?: unknown;
  private inputTokens = 0;
  private outputTokens = 0;
  private costUsd = 0;
  private stopReason?: string;
  private errors: string[] = [];
  /**
   * Ingests a single NDJSON line. Non-JSON lines (e.g. wall time metrics) are safely skipped.
   */
  public feedLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Fast skip for multi-MB tool execution traces (e.g. bash loop ASTs) that do not contain yield
    if (
      trimmed.length > 65536 &&
      !trimmed.includes('"yield"') &&
      (trimmed.includes('"tool_execution_') || trimmed.includes('"toolResult"'))
    ) {
      return;
    }

    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // Skip non-JSON lines emitted by CLI wrapper (e.g. "Wall time: ...")
      return;
    }
    switch (event.type) {
      case "session":
        if (event.id) this.sessionId = event.id;
        if (event.timestamp) this.sessionTimestamp = event.timestamp;
        if (event.cwd) this.cwd = event.cwd;
        break;

      case "turn_end":
        if (event.message?.role === "assistant") {
          const contents = event.message.content || [];
          const currentTurnText: string[] = [];
          for (const part of contents) {
            if (part.type === "text" && part.text) {
              currentTurnText.push(part.text);
            } else if (
              part.type === "toolCall" &&
              (part.name === "yield" || part.name?.endsWith(":yield"))
            ) {
              this.yieldData = part.arguments?.data !== undefined ? part.arguments.data : part.arguments;
            }
          }

          // Overwrite with the latest turn's text, bounded to MAX_ASSISTANT_TEXT_CHARS (§2, §4)
          let turnText = currentTurnText.join("");
          if (turnText.length > MAX_ASSISTANT_TEXT_CHARS) {
            const half = Math.floor(MAX_ASSISTANT_TEXT_CHARS / 2);
            turnText = `${turnText.slice(0, half)}\n...[truncated]...\n${turnText.slice(-half)}`;
          }
          this.finalAssistantText = turnText;
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
        if (event.error && this.errors.length < MAX_ERRORS) {
          const errStr = typeof event.error === "string" ? event.error : JSON.stringify(event.error);
          this.errors.push(errStr.slice(0, MAX_ERROR_LEN));
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
      finalAssistantText: this.finalAssistantText,
      yieldData: this.yieldData,
      usage: {
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        costUsd: this.costUsd > 0 ? Number(this.costUsd.toFixed(6)) : 0,
      },
      stopReason: this.stopReason,
      rawEvents: [],
      errors: this.errors,
    };
  }
}
