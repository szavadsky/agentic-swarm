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

  it("keeps opencode's separate output and reasoning counters", () => {
    // opencode's total adds reasoning on top of output and cache; codex/agy's
    // total already contains it, so the same numbers must not be subtracted.
    expect(
      usageFromAcpxResult({
        totalTokens: 105,
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
      out: 8,
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

  it("records the newest usage_update cost alongside the prompt usage", () => {
    const summary = feed([
      { jsonrpc: "2.0", id: 7, method: "session/prompt", params: {} },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "usage_update",
            used: 7163,
            size: 1048576,
            cost: { amount: 0.001, currency: "USD" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "usage_update",
            used: 7200,
            size: 1048576,
            cost: { amount: 0.0032, currency: "USD" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 7,
        result: { stopReason: "end_turn", usage: { inputTokens: 10 } },
      },
    ]);
    expect(summary.usage.costUsd).toBe(0.0032);
    expect(summary.usage.in).toBe(10);
  });

  it("leaves cost unknown for a non-USD usage_update cost", () => {
    const summary = feed([
      { jsonrpc: "2.0", id: 7, method: "session/prompt", params: {} },
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s",
          update: {
            sessionUpdate: "usage_update",
            used: 7163,
            size: 1048576,
            cost: { amount: 5, currency: "EUR" },
          },
        },
      },
      { jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } },
    ]);
    expect(summary.usage.costUsd).toBeUndefined();
  });
});
