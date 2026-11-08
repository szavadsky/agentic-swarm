import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { OmpNdjsonParser } from "../../src/harness/omp/ndjson.js";

const FIXTURES_DIR = path.resolve(import.meta.dir, "../fixtures/omp");

describe("OmpNdjsonParser", () => {
  it("parses text-only completion fixture (turn-ping-pong.ndjson)", () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, "turn-ping-pong.ndjson"), "utf8");
    const parser = new OmpNdjsonParser();
    parser.feedText(raw);

    const result = parser.getResult();
    expect(result.sessionId).toBe("01a1b3dc-3918-753b-ae8a-0c6852c1e653");
    expect(result.sessionTimestamp).toBe("2026-11-07T02:35:16.632Z");
    expect(result.finalAssistantText).toBe("PING_PONG");
    expect(result.yieldData).toBeUndefined();
    expect(result.usage.inputTokens).toBe(4123);
    expect(result.usage.outputTokens).toBe(6);
    expect(result.usage.costUsd).toBeGreaterThan(0);
    expect(result.stopReason).toBe("stop");
  });

  it("parses structured yield tool call fixture (turn-yield.ndjson)", () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, "turn-yield.ndjson"), "utf8");
    const parser = new OmpNdjsonParser();
    parser.feedText(raw);

    const result = parser.getResult();
    expect(result.sessionId).toBe("01a1b3dd-2c53-72b3-9f57-5220388b313f");
    expect(result.yieldData).toEqual({ success: true, count: 7 });
    expect(result.usage.inputTokens).toBe(4675);
    expect(result.usage.outputTokens).toBe(67);
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it("parses retry fallback fixture (turn-fallback.ndjson)", () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, "turn-fallback.ndjson"), "utf8");
    const parser = new OmpNdjsonParser();
    parser.feedText(raw);

    const result = parser.getResult();
    expect(result.sessionId).toBe("01a1b3de-34e1-74e7-9e71-d0db5a43e27a");
    expect(result.finalAssistantText).toBe("FALLBACK_WORKS");
    expect(result.usage.inputTokens).toBe(13533);
    expect(result.usage.outputTokens).toBe(98);
  });

  it("gracefully ignores non-JSON lines and blank lines", () => {
    const parser = new OmpNdjsonParser();
    parser.feedLine("");
    parser.feedLine("   ");
    parser.feedLine("Wall time: 42.12 seconds");
    parser.feedLine("Non-json arbitrary diagnostic log from CLI wrapper");
    parser.feedLine('{"type":"session","id":"test-session-123"}');

    const result = parser.getResult();
    expect(result.sessionId).toBe("test-session-123");
    expect(result.errors.length).toBe(0);
  });

  it("extracts last turn text from multi-turn fixture without concatenating previous turns", () => {
    const multiTurnFixture = [
      '{"type":"session","id":"multi-turn-sess-1","timestamp":"2026-11-07T00:00:00Z"}',
      '{"type":"turn_start"}',
      '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"status\\":\\"draft\\",\\"step\\":1}"}],"stopReason":"stop"}}',
      '{"type":"turn_start"}',
      '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"status\\":\\"final\\",\\"step\\":2}"}],"stopReason":"stop"}}',
    ].join("\n");

    const parser = new OmpNdjsonParser();
    parser.feedText(multiTurnFixture);
    const result = parser.getResult();

    // Must be strictly the last turn's text, not concatenated
    expect(result.finalAssistantText).toBe('{"status":"final","step":2}');
    expect(result.finalAssistantText).not.toContain("draft");
  });

  it("captures abort and error stopReasons", () => {
    const abortFixture = [
      '{"type":"session","id":"abort-sess-1"}',
      '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"I must abort."}],"stopReason":"abort"}}',
    ].join("\n");

    const parser = new OmpNdjsonParser();
    parser.feedText(abortFixture);
    const result = parser.getResult();

    expect(result.stopReason).toBe("abort");
    expect(result.finalAssistantText).toBe("I must abort.");
  });
  it("keeps memory bounded (< 20 KB) when processing huge multi-MB tool-result lines and extracts outcome", () => {
    const parser = new OmpNdjsonParser();

    // 1. Session start
    parser.feedLine('{"type":"session","id":"sess-memory-test","timestamp":"2026-11-07T10:00:00Z","cwd":"/repo"}');

    // 2. Multi-megabyte tool execution traces (simulate 6x 3.5MB bash AST trace loops from Launch 1)
    const hugeTracePayload = "x".repeat(3_500_000);
    for (let i = 0; i < 6; i++) {
      const hugeToolEvent = JSON.stringify({
        type: "tool_execution_end",
        toolName: "bash",
        result: {
          exitCode: 0,
          output: "stdout line",
          details: {
            trace: {
              units: hugeTracePayload,
            },
          },
        },
      });
      parser.feedLine(hugeToolEvent);
    }

    // 3. Yield tool execution
    parser.feedLine(
      JSON.stringify({
        type: "tool_execution_end",
        toolName: "yield",
        result: { details: { data: { status: "ok", discoveredItems: [1, 2, 3] } } },
      })
    );

    // 4. Turn end with assistant text and usage
    parser.feedLine(
      JSON.stringify({
        type: "turn_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Turn completed successfully." }],
          usage: { input: 5000, output: 250, cost: { total: 0.015 } },
          stopReason: "stop",
        },
      })
    );

    const result = parser.getResult();

    // Verify correct outcome extraction
    expect(result.sessionId).toBe("sess-memory-test");
    expect(result.sessionTimestamp).toBe("2026-11-07T10:00:00Z");
    expect(result.cwd).toBe("/repo");
    expect(result.yieldData).toEqual({ status: "ok", discoveredItems: [1, 2, 3] });
    expect(result.finalAssistantText).toBe("Turn completed successfully.");
    expect(result.usage.inputTokens).toBe(5000);
    expect(result.usage.outputTokens).toBe(250);
    expect(result.usage.costUsd).toBe(0.015);
    expect(result.stopReason).toBe("stop");
    expect(result.rawEvents?.length ?? 0).toBe(0);

    // Verify memory footprint of retained result:
    // Over 21 MB of JSON was fed, but the retained result serialized is under 1 KB (< 20 KB limit)
    const retainedJsonBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    expect(retainedJsonBytes).toBeLessThan(1024);
  });

  it("bounds excessive assistant text to MAX_ASSISTANT_TEXT_CHARS preserving head and tail", () => {
    const parser = new OmpNdjsonParser();
    const excessiveText = "A".repeat(200_000) + "MIDDLE_TEXT" + "Z".repeat(200_000); // 400KB+

    parser.feedLine(
      JSON.stringify({
        type: "turn_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: excessiveText }],
          stopReason: "stop",
        },
      })
    );

    const result = parser.getResult();
    expect(result.finalAssistantText.length).toBeLessThanOrEqual(256 * 1024 + 50);
    expect(result.finalAssistantText).toContain("...[truncated]...");
    expect(result.finalAssistantText.startsWith("AAA")).toBe(true);
    expect(result.finalAssistantText.endsWith("ZZZ")).toBe(true);
  });

  it("counts tool_execution_start events as toolCallCount", () => {
    const parser = new OmpNdjsonParser();
    parser.feedLine('{"type":"session","id":"sess-tools"}');
    parser.feedLine('{"type":"tool_execution_start","toolName":"read"}');
    parser.feedLine('{"type":"tool_execution_end","toolName":"read"}');
    parser.feedLine('{"type":"tool_execution_start","toolName":"bash"}');
    parser.feedLine('{"type":"tool_execution_end","toolName":"bash"}');
    parser.feedLine('{"type":"tool_execution_start","toolName":"yield","args":{"data":{"status":"ok"}}}');
    const result = parser.getResult();
    expect(result.toolCallCount).toBe(3);
  });
});
