import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSessionCompacted,
  servedTotal,
  servedUsage,
  statsDelta,
  subagentUsage,
  summarizeOmpFrames,
  turnUsage,
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

/** A parent session file whose sibling `parent/` dir holds one child transcript. */
function withChildSession(
  fixture: string,
  run: (sessionFile: string) => void,
): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-turn-usage-"));
  try {
    const parent = path.join(tmp, "parent.jsonl");
    fs.writeFileSync(parent, "");
    const childDir = path.join(tmp, "parent");
    fs.mkdirSync(childDir);
    fs.copyFileSync(
      path.join(FIXTURES, fixture),
      path.join(childDir, "Scout.jsonl"),
    );
    run(parent);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function statsOf(recorded: any[], id: string): any {
  return recorded.find((frame) => frame.id === id)?.data;
}

/** One transcript `message` line, assistant by default. */
function assistant(message: Record<string, unknown>): string {
  return JSON.stringify({
    type: "message",
    message: { role: "assistant", ...message },
  });
}

describe("omp usage", () => {
  registerOmpUsagePart1();
  registerOmpUsagePart2();
  registerOmpUsagePart3();
  registerOmpUsagePart4();
  registerOmpUsagePart5();
  registerOmpUsagePart6();
  registerOmpUsagePart7();
  registerOmpUsagePart8();
});

function splitsTurnSAssistantUsageByModelPart1(tmp: string) {
  const parent = path.join(tmp, "parent.jsonl");

  return { parent };
}

function splitsTurnSAssistantUsageByModelPart2(
  scope: ReturnType<typeof splitsTurnSAssistantUsageByModelPart1>,
) {
  const { parent } = scope;
  fs.writeFileSync(
    parent,
    [
      assistant({
        provider: "openrouter",
        model: "baidu/ernie-5.5-flash-preview:free",
        usage: {
          input: 100,
          output: 10,
          cacheRead: 5,
          cacheWrite: 0,
          reasoningTokens: 2,
          cost: { total: 0 },
        },
        timestamp: 1_000,
      }),
      assistant({
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        usage: {
          input: 200,
          output: 20,
          cacheRead: 7,
          cacheWrite: 3,
          reasoningTokens: 4,
          cost: { total: 0.02 },
        },
        timestamp: 2_000,
      }),
      // Before the prompt: another turn's message, never part of the split.
      assistant({
        provider: "openrouter",
        model: "baidu/ernie-5.5-flash-preview:free",
        usage: { input: 999, output: 1, timestamp: 10 },
        timestamp: 10,
      }),
      JSON.stringify({
        type: "message",
        message: { role: "user", timestamp: 1_500 },
      }),
    ].join("\n"),
  );
}

function splitsTurnSAssistantUsageByModelPart3(
  scope: ReturnType<typeof splitsTurnSAssistantUsageByModelPart1>,
) {
  const { parent } = scope;
  expect(servedUsage(parent, 1_000)).toEqual([
    {
      model: { id: "openrouter/baidu/ernie-5.5-flash-preview:free" },
      usage: {
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 8,
        reasoningOut: 2,
        costUsd: 0,
      },
    },
    {
      model: { id: "opencode-go/deepseek-v4.1-flash" },
      usage: {
        in: 200,
        cacheRead: 7,
        cacheWrite5m: 3,
        cacheWrite1h: 0,
        out: 16,
        reasoningOut: 4,
        costUsd: 0.02,
      },
    },
  ]);
  expect(servedTotal(servedUsage(parent, 1_000)!)).toEqual({
    in: 300,
    cacheRead: 12,
    cacheWrite5m: 3,
    cacheWrite1h: 0,
    out: 24,
    reasoningOut: 6,
    costUsd: 0.02,
  });
}

function registerOmpUsagePart1(): void {
  it("subtracts reasoning from output so the counters stay disjoint", () => {
    expect(
      usageFromMessage({
        input: 159,
        output: 20,
        cacheRead: 9984,
        cacheWrite: 3,
        reasoningTokens: 17,
        cost: { total: 0.5 },
      }),
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
}

function registerOmpUsagePart2(): void {
  it("matches parent session stats on a subagent turn (child usage is separate)", () => {
    const recorded = frames("rpc-subagent.ndjson");
    const summary = summarizeOmpFrames(recorded);
    const stats = recorded.find((frame) => frame.id === "s1")?.data;
    expect(summary.usage.in).toBe(stats.tokens.input);
    expect(summary.usage.cacheRead).toBe(stats.tokens.cacheRead);
    expect(summary.usage.out + summary.usage.reasoningOut).toBe(
      stats.tokens.output,
    );
    expect(summary.usage.reasoningOut).toBe(stats.tokens.reasoning);
  });

  it("accepts assistant content that is a plain string", () => {
    const summary = summarizeOmpFrames([
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: "plain text",
          usage: { input: 1, output: 2 },
        },
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
}

function registerOmpUsagePart3(): void {
  it("clamps a stats reset (compaction) to zero instead of going negative", () => {
    const usage = statsDelta(
      {
        tokens: {
          input: 100,
          output: 50,
          reasoning: 10,
          cacheRead: 20,
          cacheWrite: 0,
        },
        cost: 1,
      },
      {
        tokens: {
          input: 10,
          output: 5,
          reasoning: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        cost: 0,
      },
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
}

function registerOmpUsagePart4(): void {
  it("adds child-session usage only for messages after the turn started", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-usage-"));
    try {
      const parent = path.join(tmp, "parent.jsonl");
      fs.writeFileSync(parent, "");
      const childDir = path.join(tmp, "parent");
      fs.mkdirSync(childDir);
      fs.copyFileSync(
        path.join(FIXTURES, "child-session.jsonl"),
        path.join(childDir, "ScoutReply.jsonl"),
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
}

function registerOmpUsagePart5(): void {
  // The fixture dates its pre-turn message at 1s and its in-turn message in 2100.
  it("sums parent stats and child-session usage for one turn, cost included", () => {
    const recorded = frames("rpc-subagent.ndjson");
    withChildSession("child-session-cost.jsonl", (sessionFile) => {
      const usage = turnUsage({
        before: statsOf(recorded, "s0"),
        after: statsOf(recorded, "s1"),
        fallback: summarizeOmpFrames(recorded).usage,
        sessionFile,
        sinceMs: 2000,
      });
      expect(usage).toEqual({
        in: 15374,
        cacheRead: 30436,
        cacheWrite5m: 20,
        cacheWrite1h: 0,
        out: 178,
        reasoningOut: 398,
        costUsd: 0.0472,
      });
    });
  });
}

function registerOmpUsagePart6(): void {
  it("sums frame usage and child-session usage when session stats are unavailable", () => {
    const recorded = frames("rpc-subagent.ndjson");
    withChildSession("child-session-cost.jsonl", (sessionFile) => {
      const usage = turnUsage({
        fallback: summarizeOmpFrames(recorded).usage,
        sessionFile,
        sinceMs: 2000,
      });
      expect(usage).toEqual({
        in: 15374,
        cacheRead: 30436,
        cacheWrite5m: 20,
        cacheWrite1h: 0,
        out: 178,
        reasoningOut: 398,
        costUsd: 0.0472,
      });
    });
  });

  it("splits a turn's assistant usage by the model that served it", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-served-"));
    try {
      const scope1 = splitsTurnSAssistantUsageByModelPart1(tmp);
      splitsTurnSAssistantUsageByModelPart2(scope1);
      splitsTurnSAssistantUsageByModelPart3(scope1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

function registerOmpUsagePart7(): void {
  it("returns one served model and refuses a partial split", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-served-"));
    try {
      const parent = path.join(tmp, "parent.jsonl");
      fs.writeFileSync(
        parent,
        assistant({
          provider: "opencode-go",
          model: "beam-free",
          usage: { input: 10, output: 2 },
          timestamp: 1_000,
        }),
      );
      // One served model still names the model whose row prices the turn.
      expect(servedUsage(parent, 0)).toEqual([
        {
          model: { id: "opencode-go/beam-free" },
          usage: {
            in: 10,
            cacheRead: 0,
            cacheWrite5m: 0,
            cacheWrite1h: 0,
            out: 2,
            reasoningOut: 0,
            costUsd: 0,
          },
        },
      ]);

      fs.writeFileSync(
        parent,
        [
          assistant({
            provider: "opencode-go",
            model: "beam-free",
            usage: { input: 10, output: 2 },
            timestamp: 1_000,
          }),
          assistant({
            usage: { input: 5, output: 1 },
            timestamp: 2_000,
          }),
        ].join("\n"),
      );
      // A usage-bearing message without a model would lose its tokens, so the
      // caller keeps the aggregate usage rather than a partial split.
      expect(servedUsage(parent, 0)).toBeUndefined();
      expect(servedUsage(path.join(tmp, "missing.jsonl"), 0)).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

function registerOmpUsagePart8(): void {
  it("adds a child session's model to the served split", () => {
    withChildSession("child-session-cost.jsonl", (sessionFile) => {
      fs.writeFileSync(
        sessionFile,
        assistant({
          provider: "opencode-go",
          model: "beam-free",
          usage: { input: 10, output: 2, timestamp: 2_100 },
          timestamp: 2_100,
        }),
      );
      const split = servedUsage(sessionFile, 2_000);
      expect(split?.map((entry) => entry.model.id)).toEqual([
        "opencode-go/beam-free",
        "cheap/model",
      ]);
      expect(split?.[1]?.usage.in).toBe(4790);
    });
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
}
