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
});
