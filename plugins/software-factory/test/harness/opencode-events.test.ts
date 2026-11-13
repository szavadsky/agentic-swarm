import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  classifyOpencodeError,
  classifyOpencodeTurn,
} from "../../src/harness/opencode/classifier.js";
import { OpencodeEventParser } from "../../src/harness/opencode/events.js";

const FIXTURES = path.resolve(import.meta.dir, "../fixtures/opencode");

function parse(file: string) {
  const parser = new OpencodeEventParser();
  parser.feedText(fs.readFileSync(path.join(FIXTURES, file), "utf8"));
  return parser.result();
}

describe("OpencodeEventParser on recorded streams", () => {
  it("reads session id, final text, step reason and disjoint token counters", () => {
    const summary = parse("turn-pong.jsonl");
    expect(summary.sessionId).toBe("ses_e2da376caffeWGZmwWcYY5PLGn");
    expect(summary.text).toBe("PONG");
    expect(summary.lastStepReason).toBe("stop");
    expect(summary.sawStepFinish).toBe(true);
    expect(summary.errors).toEqual([]);
    expect(summary.usage).toEqual({
      in: 6210,
      cacheRead: 1792,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 5,
      reasoningOut: 13,
      costUsd: 0,
    });
    expect(
      classifyOpencodeTurn({ summary, code: 0, signal: null, timedOut: false })
    ).toEqual({ kind: "done" });
  });

  it("surfaces the provider error event and classifies a bad route", () => {
    const summary = parse("turn-noroute.jsonl");
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]?.type).toBe("provider.no-route");
    expect(
      classifyOpencodeTurn({ summary, code: 1, signal: null, timedOut: false })
    ).toEqual({ kind: "infra", cause: "auth" });
  });

  it("keeps only the last assistant message's text when a run has several", () => {
    const parser = new OpencodeEventParser();
    parser.feedText(
      [
        JSON.stringify({
          type: "text",
          sessionID: "ses_x",
          part: { messageID: "m1", text: "working" },
        }),
        JSON.stringify({
          type: "text",
          sessionID: "ses_x",
          part: { messageID: "m2", text: "final " },
        }),
        JSON.stringify({
          type: "text",
          sessionID: "ses_x",
          part: { messageID: "m2", text: "answer" },
        }),
      ].join("\n")
    );
    expect(parser.result().text).toBe("final answer");
  });
});

describe("classifyOpencodeError", () => {
  it("maps free-tier limits and HTTP 429 to quota (LOG D8)", () => {
    expect(
      classifyOpencodeError({
        type: "provider.free-limit",
        message: "Free usage limit reached",
        status: 429,
      })
    ).toEqual({ kind: "infra", cause: "quota" });
    expect(classifyOpencodeError({ message: "429 Too Many Requests" })).toEqual({
      kind: "infra",
      cause: "quota",
    });
  });

  it("maps auth, overflow, refusal and server errors", () => {
    expect(classifyOpencodeError({ status: 401 })).toEqual({
      kind: "infra",
      cause: "auth",
    });
    expect(classifyOpencodeError({ message: "context window exceeded" })).toEqual({
      kind: "infra",
      cause: "overflow",
    });
    expect(classifyOpencodeError({ message: "content policy refusal" })).toEqual({
      kind: "refusal",
      details: "content policy refusal",
    });
    expect(classifyOpencodeError({ message: "unknown failure" })).toEqual({
      kind: "infra",
      cause: "crash",
      details: "unknown failure",
    });
    expect(classifyOpencodeError({ type: "provider.overloaded" })).toEqual({
      kind: "infra",
      cause: "rate",
    });
  });
});

describe("classifyOpencodeTurn", () => {
  const empty = new OpencodeEventParser().result();

  it("prefers the timeout flag over a clean exit", () => {
    expect(
      classifyOpencodeTurn({ summary: empty, code: 0, signal: null, timedOut: true })
    ).toEqual({ kind: "infra", cause: "timeout" });
  });

  it("reports a truncated turn from the step reason", () => {
    expect(
      classifyOpencodeTurn({
        summary: { ...empty, lastStepReason: "length", sawStepFinish: true },
        code: 0,
        signal: null,
        timedOut: false,
      })
    ).toEqual({ kind: "truncated", cause: "max-tokens" });
  });

  it("reports a factory SIGTERM as cancelled and a hard kill as crash", () => {
    expect(
      classifyOpencodeTurn({ summary: empty, code: null, signal: "SIGTERM", timedOut: false })
    ).toEqual({ kind: "cancelled" });
    expect(
      classifyOpencodeTurn({ summary: empty, code: null, signal: "SIGKILL", timedOut: false })
    ).toEqual({
      kind: "infra",
      cause: "crash",
      details: "exit none, signal SIGKILL",
    });
  });

  it("carries process stderr on a crash and falls back to exit code", () => {
    expect(
      classifyOpencodeTurn({
        summary: empty,
        code: 2,
        signal: null,
        timedOut: false,
        stderr: "fatal: boom",
      })
    ).toEqual({ kind: "infra", cause: "crash", details: "fatal: boom" });
    expect(
      classifyOpencodeTurn({ summary: empty, code: 2, signal: null, timedOut: false })
    ).toEqual({ kind: "infra", cause: "crash", details: "exit 2, signal none" });
  });
});
