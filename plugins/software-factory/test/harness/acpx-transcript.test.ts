// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import {
  AcpxTranscriptParser,
  usageFromAcpxResult,
} from "../../src/harness/acpx/transcript.js";
import {
  turnUsageFromTotals,
  usageFromAcpxSessionText,
} from "../../src/harness/acpx/usage.js";

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

  it("parses pi's /session token report", () => {
    // The exact shape from the probe: human text, cumulative session counters.
    const report =
      "Session: 01a1d37f-1c1e-…\n" +
      "Session file: /home/slava/.pi/agent/sessions/--tmp-acpx-pi-1--/s.jsonl\n" +
      "Messages: 7\n" +
      "Cost: 0\n" +
      "Tokens: in 2403, out 87, cache read 1216, cache write 0, total 3706";
    expect(usageFromAcpxSessionText(report)).toEqual({
      in: 2403,
      cacheRead: 1216,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 87,
      reasoningOut: 0,
    });
  });

  it("leaves usage unknown when /session has no token line", () => {
    expect(
      usageFromAcpxSessionText("Session: s\nMessages: 7\nCost: 0"),
    ).toBeUndefined();
  });

  it("turns cumulative totals into a non-negative per-turn delta", () => {
    const before = {
      in: 2403,
      cacheRead: 1216,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 87,
      reasoningOut: 0,
    };
    const after = {
      in: 3000,
      cacheRead: 1500,
      cacheWrite5m: 10,
      cacheWrite1h: 0,
      out: 100,
      reasoningOut: 0,
    };
    expect(turnUsageFromTotals(after, before)).toEqual({
      in: 597,
      cacheRead: 284,
      cacheWrite5m: 10,
      cacheWrite1h: 0,
      out: 13,
      reasoningOut: 0,
    });
    expect(turnUsageFromTotals(after, undefined)).toEqual(after);
    // A reset counter must not produce a negative turn.
    expect(turnUsageFromTotals({ ...after, in: 10 }, before).in).toBe(0);
  });
});
