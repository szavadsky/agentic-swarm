import { describe, expect, it } from "bun:test";
import {
  AcpxTranscriptParser,
  usageFromAcpxResult,
} from "../../src/harness/acpx/transcript.js";

function feed(lines: unknown[]): ReturnType<AcpxTranscriptParser["result"]> {
  const parser = new AcpxTranscriptParser();
  for (const line of lines) parser.feedLine(JSON.stringify(line));
  return parser.result();
}

describe("acpx transcript", () => {
  it("keeps the last agent message when a banner is an earlier message", () => {
    const summary = feed([
      { jsonrpc: "2.0", id: 7, method: "session/prompt", params: {} },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "pi v1.5.2" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: { sessionUpdate: "available_commands_update" },
        },
      },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "PONG" },
          },
        },
      },
      { jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } },
    ]);
    expect(summary.text).toBe("PONG");
    expect(summary.stopReason).toBe("end_turn");
    expect(summary.sessionId).toBe("s");
  });

  it("joins streamed chunks that share a message id", () => {
    const summary = feed([
      { jsonrpc: "2.0", id: 7, method: "session/prompt", params: {} },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "m",
            content: { type: "text", text: "P" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "m",
            content: { type: "text", text: "ONG" },
          },
        },
      },
      { jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } },
    ]);
    expect(summary.text).toBe("PONG");
  });

  it("maps codex prompt usage with reasoning kept disjoint from text output", () => {
    expect(
      usageFromAcpxResult({
        totalTokens: 100,
        inputTokens: 80,
        cachedReadTokens: 12,
        outputTokens: 8,
        thoughtTokens: 5,
      }),
    ).toEqual({
      in: 80,
      cacheRead: 12,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 3,
      reasoningOut: 5,
    });
  });

  it("leaves usage unknown when the prompt result carries none", () => {
    expect(usageFromAcpxResult(undefined)).toEqual({
      in: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 0,
      reasoningOut: 0,
    });
  });
});
