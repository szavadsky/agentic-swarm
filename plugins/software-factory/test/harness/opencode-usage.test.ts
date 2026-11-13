import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeHarness } from "../../src/harness/opencode/harness.js";
import type { SessionRef } from "../../src/harness/types.js";

interface TokenCounts {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

interface FakeConfig {
  sessionId: string;
  stepTokens: TokenCounts;
  exportTokens: TokenCounts;
  beforeTokens?: TokenCounts;
  exportFails?: boolean;
  beforeFails?: boolean;
}

function fakeScript(config: FakeConfig): string {
  return `#!/usr/bin/env bun
const args = process.argv.slice(2);
const config = ${JSON.stringify(config)};
if (args[0] === "api" && args[1] === "GET") {
  if (config.beforeFails) {
    process.stderr.write("session api unavailable\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ data: { tokens: config.beforeTokens } }) + "\\n");
  process.exit(0);
}
if (args[0] === "session" && args[1] === "export") {
  if (config.exportFails) {
    process.stderr.write("session export unavailable\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ info: { tokens: config.exportTokens }, messages: [] }) + "\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: "step_start", sessionID: config.sessionId, part: {} }) + "\\n");
process.stdout.write(JSON.stringify({ type: "text", sessionID: config.sessionId, part: { messageID: "m1", text: "PONG" } }) + "\\n");
process.stdout.write(JSON.stringify({
  type: "step_finish",
  sessionID: config.sessionId,
  part: { reason: "stop", cost: 0, tokens: config.stepTokens },
}) + "\\n");
`;
}

function fakeHarness(config: FakeConfig): {
  harness: OpencodeHarness;
  cwd: string;
  cleanup: () => void;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-usage-"));
  const binary = path.join(tmp, "fake-opencode.js");
  fs.writeFileSync(binary, fakeScript(config), { mode: 0o755 });
  const harness = new OpencodeHarness({ binary, sessionDir: path.join(tmp, "sessions") });
  return { harness, cwd: tmp, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const MODEL = { id: "opencode-go/deepseek-v4.1-flash" };

function sessionRef(cwd: string): SessionRef {
  return {
    harness: "opencode",
    id: "ses_resumed",
    cwd,
    model: MODEL,
    lastRequestStartedAt: "2026-11-13T00:00:00.000Z",
    retentionTier: "short",
    compacted: false,
  };
}

describe("OpencodeHarness usage accounting", () => {
  it("records cache writes from the export, so totals match info.tokens", async () => {
    const { harness, cwd, cleanup } = fakeHarness({
      sessionId: "ses_fresh",
      stepTokens: {
        input: 6210,
        output: 5,
        reasoning: 13,
        cache: { read: 1792, write: 7 },
      },
      exportTokens: {
        input: 6213,
        output: 15,
        reasoning: 13,
        cache: { read: 1792, write: 1375 },
      },
    });
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "PONG",
        timeouts: { idleMs: 5_000, wallMs: 5_000 },
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.usage).toEqual({
        in: 6213,
        cacheRead: 1792,
        cacheWrite5m: 1375,
        cacheWrite1h: 0,
        out: 15,
        reasoningOut: 13,
        costUsd: 0,
      });
    } finally {
      cleanup();
    }
  }, 20_000);

  it("uses only the resumed session's delta, not its lifetime totals", async () => {
    const { harness, cwd, cleanup } = fakeHarness({
      sessionId: "ses_resumed",
      stepTokens: {
        input: 140,
        output: 6,
        reasoning: 4,
        cache: { read: 50, write: 0 },
      },
      beforeTokens: {
        input: 100,
        output: 20,
        reasoning: 5,
        cache: { read: 40, write: 50 },
      },
      exportTokens: {
        input: 250,
        output: 26,
        reasoning: 9,
        cache: { read: 90, write: 70 },
      },
    });
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "follow-up",
        session: sessionRef(cwd),
        timeouts: { idleMs: 5_000, wallMs: 5_000 },
      });
      expect(result.usage).toEqual({
        in: 150,
        cacheRead: 50,
        cacheWrite5m: 20,
        cacheWrite1h: 0,
        out: 6,
        reasoningOut: 4,
        costUsd: 0,
      });
    } finally {
      cleanup();
    }
  }, 20_000);

  it("keeps the event stream's cache write when the export fails", async () => {
    const { harness, cwd, cleanup } = fakeHarness({
      sessionId: "ses_no_export",
      stepTokens: {
        input: 7,
        output: 3,
        reasoning: 1,
        cache: { read: 2, write: 9 },
      },
      exportTokens: {
        input: 500,
        output: 100,
        reasoning: 50,
        cache: { read: 200, write: 1375 },
      },
      exportFails: true,
    });
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "crash",
        timeouts: { idleMs: 5_000, wallMs: 5_000 },
      });
      expect(result.usage).toEqual({
        in: 7,
        cacheRead: 2,
        cacheWrite5m: 9,
        cacheWrite1h: 0,
        out: 3,
        reasoningOut: 1,
        costUsd: 0,
      });
    } finally {
      cleanup();
    }
  }, 20_000);

  it("does not treat a missing resume baseline as a zero baseline", async () => {
    const { harness, cwd, cleanup } = fakeHarness({
      sessionId: "ses_resumed",
      stepTokens: {
        input: 7,
        output: 3,
        reasoning: 1,
        cache: { read: 2, write: 9 },
      },
      beforeTokens: {
        input: 100,
        output: 20,
        reasoning: 5,
        cache: { read: 40, write: 50 },
      },
      beforeFails: true,
      exportTokens: {
        input: 500,
        output: 100,
        reasoning: 50,
        cache: { read: 200, write: 1375 },
      },
    });
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "follow-up",
        session: sessionRef(cwd),
        timeouts: { idleMs: 5_000, wallMs: 5_000 },
      });
      expect(result.usage).toEqual({
        in: 7,
        cacheRead: 2,
        cacheWrite5m: 9,
        cacheWrite1h: 0,
        out: 3,
        reasoningOut: 1,
        costUsd: 0,
      });
    } finally {
      cleanup();
    }
  }, 20_000);
});
