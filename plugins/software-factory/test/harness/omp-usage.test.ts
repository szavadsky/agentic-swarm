import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSessionCompacted,
  statsDelta,
  subagentUsage,
  summarizeOmpFrames,
  usageFromMessage,
} from "../../src/harness/omp/usage.js";

const FIXTURES = path.resolve(import.meta.dir, "../fixtures/omp");

function frames(file: string): any[] {
  return fs
    .readFileSync(path.join(FIXTURES, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("omp usage", () => {
  it("subtracts reasoning from output so the counters stay disjoint", () => {
    expect(
      usageFromMessage({
        input: 159,
        output: 20,
        cacheRead: 9984,
        cacheWrite: 3,
        reasoningTokens: 17,
        cost: { total: 0.5 },
      })
    ).toEqual({
      in: 159,
      cacheRead: 9984,
      cacheWrite5m: 3,
      cacheWrite1h: 0,
      out: 3,
      reasoningOut: 17,
      costUsd: 0.5,
    });
  });

  it("sums assistant message_end usage from a recorded RPC stream", () => {
    const summary = summarizeOmpFrames(frames("rpc-turn.ndjson"));
    expect(summary.usage).toEqual({
      in: 10249,
      cacheRead: 20096,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 85,
      reasoningOut: 84,
      costUsd: 0,
    });
    expect(summary.lastAssistantStopReason).toBe("stop");
  });

  it("matches parent session stats on a subagent turn (child usage is separate)", () => {
    const recorded = frames("rpc-subagent.ndjson");
    const summary = summarizeOmpFrames(recorded);
    const stats = recorded.find((frame) => frame.id === "s1")?.data;
    expect(summary.usage.in).toBe(stats.tokens.input);
    expect(summary.usage.cacheRead).toBe(stats.tokens.cacheRead);
    expect(summary.usage.out + summary.usage.reasoningOut).toBe(stats.tokens.output);
    expect(summary.usage.reasoningOut).toBe(stats.tokens.reasoning);
  });

  it("accepts assistant content that is a plain string", () => {
    const summary = summarizeOmpFrames([
      {
        type: "message_end",
        message: { role: "assistant", content: "plain text", usage: { input: 1, output: 2 } },
      },
    ]);
    expect(summary.assistantText).toBe("plain text");
    expect(summary.usage.in).toBe(1);
  });

  it("takes the non-negative delta of cumulative session stats", () => {
    const [stats] = frames("rpc-turn.ndjson")
      .filter((frame) => frame.id === "s2")
      .map((frame) => frame.data);
    expect(statsDelta(undefined, stats)).toEqual({
      in: 69,
      cacheRead: 10112,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 7,
      reasoningOut: 39,
      costUsd: 0,
    });
  });

  it("clamps a stats reset (compaction) to zero instead of going negative", () => {
    const usage = statsDelta(
      { tokens: { input: 100, output: 50, reasoning: 10, cacheRead: 20, cacheWrite: 0 }, cost: 1 },
      { tokens: { input: 10, output: 5, reasoning: 1, cacheRead: 0, cacheWrite: 0 }, cost: 0 }
    );
    expect(usage).toEqual({
      in: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 0,
      reasoningOut: 0,
      costUsd: 0,
    });
  });

  it("adds child-session usage only for messages after the turn started", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-usage-"));
    try {
      const parent = path.join(tmp, "parent.jsonl");
      fs.writeFileSync(parent, "");
      const childDir = path.join(tmp, "parent");
      fs.mkdirSync(childDir);
      fs.copyFileSync(
        path.join(FIXTURES, "child-session.jsonl"),
        path.join(childDir, "ScoutReply.jsonl")
      );

      expect(subagentUsage(parent, 0)).toEqual({
        in: 4790,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 32,
        reasoningOut: 247,
        costUsd: 0,
      });
      expect(subagentUsage(parent, 1794530760304).in).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detects compaction entries in a session file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-compacted-"));
    try {
      const file = path.join(tmp, "session.jsonl");
      fs.writeFileSync(file, '{"type":"message"}\n');
      expect(isSessionCompacted(file)).toBe(false);
      fs.appendFileSync(file, '{"type":"compaction","summary":"x"}\n');
      expect(isSessionCompacted(file)).toBe(true);
      expect(isSessionCompacted(path.join(tmp, "missing.jsonl"))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
