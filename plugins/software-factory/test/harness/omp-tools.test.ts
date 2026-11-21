import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readYaml } from "../../src/core/records/io.js";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import type { SessionRef } from "../../src/harness/types.js";

/** A fake omp that logs every launch argv and completes one prompt. */
function fakeOmpScript(logPath: string): string {
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(argv) + "\\n");
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const sessionId = flag("--resume") ?? "fresh-session";
const write = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
write({ type: "ready", protocolVersion: 1 });
let prompted = false;
const rl = readline.createInterface({ input: process.stdin });
rl.on("close", () => process.exit(0));
rl.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) =>
    write({ id: frame.id, type: "response", command: frame.type, success: true, data });
  if (frame.type === "get_session_stats") {
    respond(prompted
      ? { sessionId, tokens: { input: 5, output: 3, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 }
      : { sessionId, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 });
  } else if (frame.type === "get_last_assistant_text") {
    respond({ text: "ok" });
  } else if (frame.type === "get_state") {
    respond({ sessionId, model: { provider: "provider", id: "tools" } });
  } else if (frame.type === "prompt") {
    prompted = true;
    write({ type: "message_end", message: { role: "assistant", usage: { input: 5, output: 3 }, stopReason: "stop" } });
    write({ type: "prompt_result", id: frame.id, agentInvoked: true, status: "completed", sessionSettled: true });
  }
});
`;
}

interface FakeOmp {
  harness: OmpHarness;
  invocations(): string[][];
  cleanup(): void;
}

function createFakeOmp(): FakeOmp {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-tools-"));
  const logPath = path.join(tmp, "invocations.ndjson");
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, fakeOmpScript(logPath), { mode: 0o755 });
  return {
    harness: new OmpHarness({
      binary,
      sessionDir: path.join(tmp, "sessions"),
      // The bundled-subagent model override is present but must not enable the tool.
      subagentModel: "provider/smol",
      readyTimeoutMs: 5_000,
    }),
    invocations: () =>
      fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

/** The comma-separated list after `--tools` in one launch argv. */
function toolList(args: string[]): string | undefined {
  return args
    .find((arg) => arg.startsWith("--tools="))
    ?.slice("--tools=".length);
}

function resumedSession(cwd: string): SessionRef {
  return {
    harness: "omp",
    id: "session-1",
    cwd,
    model: { id: "provider/fixture" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

const silent = { idleMs: 0, wallMs: 10_000 };

describe("omp launch tools", () => {
  it("omits task by default, including on a resumed turn", async () => {
    const fake = createFakeOmp();
    const cwd = os.tmpdir();
    try {
      const result = await fake.harness.turn({
        model: { id: "provider/fixture" },
        cwd,
        prompt: "go",
        session: resumedSession(cwd),
        timeouts: silent,
      });

      expect(result.stop).toEqual({ kind: "done" });
      const args = fake.invocations()[0]!;
      expect(args).toContain("--resume");
      expect(toolList(args)).toBe("read,bash,edit,write,glob,grep");
      // Alignment: the overlay still names the task role's model, so a missing
      // `task` in --tools is the launch list's choice, not an absent override.
      const overlay = (await readYaml(args[args.indexOf("--config") + 1]!)) as {
        modelRoles?: { task?: string };
      };
      expect(overlay.modelRoles?.task).toBe("provider/smol");
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("keeps an opted-in opaque tool list untouched", async () => {
    const fake = createFakeOmp();
    try {
      const result = await fake.harness.turn({
        model: { id: "provider/fixture" },
        cwd: os.tmpdir(),
        prompt: "go",
        opaque: { tools: ["read", "bash", "task"] },
        timeouts: silent,
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(toolList(fake.invocations()[0]!)).toBe("read,bash,task");
    } finally {
      fake.cleanup();
    }
  }, 20_000);
});
