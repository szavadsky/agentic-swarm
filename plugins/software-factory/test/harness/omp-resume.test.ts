import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import type { SessionRef } from "../../src/harness/types.js";
import { zeroUsage } from "../../src/harness/usage.js";
import { compactSession } from "../../src/kernel/flow-context.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { installFakeClock } from "../helpers/fake-clock.js";

function fakeOmpScript(
  logPath: string,
  promptsPath: string,
  promptDelayMs = 0,
): string {
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
const promptsPath = ${JSON.stringify(promptsPath)};
const promptDelayMs = ${JSON.stringify(promptDelayMs)};
fs.appendFileSync(logPath, JSON.stringify(argv) + "\\n");
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const model = flag("--model") ?? "unknown";
const resumeId = flag("--resume");
const fail = (message, code) => {
  process.stderr.write(message + "\\n");
  process.exit(code);
};
if (argv[0] === "models") {
  process.stdout.write(JSON.stringify({ models: [] }) + "\\n");
  process.exit(0);
}

// A resumed session that was pruned reports omp's "Session ... not found"
// wording before the ready frame. The retry launch then fails for real.
if (resumeId && (model === "provider/resume-retry" || model === "provider/resume-dead")) {
  fail("Session " + resumeId + " not found", 1);
}
if (!resumeId && model === "provider/resume-dead") {
  fail("de novo launch exploded", 1);
}
// Any other resume failure must surface as infra, not trigger a de-novo retry.
if (resumeId && model === "provider/resume-denied") {
  fail("permission denied opening session " + resumeId, 1);
}

const sessionId = resumeId ?? (model === "provider/resume-retry" ? "fresh-session" : "live-1");
const write = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
write({ type: "ready", protocolVersion: 1 });
let prompted = false;
const rl = readline.createInterface({ input: process.stdin });
rl.on("close", () => process.exit(0));
rl.on("line", async (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  const respond = (data) =>
    write({ id: frame.id, type: "response", command: frame.type, success: true, data });
  if (frame.type === "get_session_stats") {
    respond(prompted
      ? { sessionId, tokens: { input: 5, output: 3, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 }
      : { sessionId, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 });
  } else if (frame.type === "get_last_assistant_text") {
    respond({ text: "resumed" });
  } else if (frame.type === "get_state") {
    respond({ sessionId, thinkingLevel: "low", model: { provider: "provider", id: model.split("/")[1] } });
  } else if (frame.type === "compact") {
    respond({});
  } else if (frame.type === "prompt") {
    prompted = true;
    fs.appendFileSync(promptsPath, JSON.stringify(frame.message) + "\\n");
    if (promptDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, promptDelayMs));
    }
    write({ type: "message_end", message: { role: "assistant", usage: { input: 5, output: 3 }, stopReason: "stop" } });
    write({ type: "prompt_result", id: frame.id, agentInvoked: true, status: "completed", sessionSettled: true });
  }
});
`;
}

interface FakeOmp {
  binary: string;
  /** argv of every launch, in order. */
  invocations(): string[][];
  /** The message frame each prompted launch carried, in order. */
  prompts(): string[];
  cleanup(): void;
}

function createFakeOmp(options: { promptDelayMs?: number } = {}): FakeOmp {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resume-"));
  const logPath = path.join(tmp, "invocations.ndjson");
  const promptsPath = path.join(tmp, "prompts.ndjson");
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(
    binary,
    fakeOmpScript(logPath, promptsPath, options.promptDelayMs),
    { mode: 0o755 },
  );
  return {
    binary,
    invocations: () =>
      fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    prompts: () =>
      fs
        .readFileSync(promptsPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function compactRuntime(harness: OmpHarness): KernelRuntime {
  return {
    harnesses: new Map([[harness.id, harness]]),
  } as unknown as KernelRuntime;
}

async function waitForPrompts(fake: FakeOmp, count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      if (fake.prompts().length >= count) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${count} omp prompt(s)`);
}

/** The runtime's default launch home (`OmpRuntime.dirs().sessions`) for a harness. */
function defaultHome(sessionDir: string): string {
  return path.join(sessionDir, "omp", "sessions");
}

const silent = { idleMs: 0, wallMs: 10_000 };

describe("omp resume", () => {
  it("retries once de novo when the resumed session is not found", async () => {
    const fake = createFakeOmp();
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    const home = defaultHome(sessionDir);
    const storedDir = path.join(root, "stored-home");
    fs.mkdirSync(storedDir, { recursive: true });
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        readyTimeoutMs: 5_000,
      });
      const session: SessionRef = {
        harness: "omp",
        id: "sess-old",
        cwd: root,
        model: { id: "provider/resume-retry" },
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: "short",
        compacted: false,
        dir: storedDir,
      };

      const result = await harness.turn({
        model: { id: "provider/resume-retry" },
        session,
        cwd: root,
        prompt: "go",
        timeouts: silent,
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.session?.id).toBe("fresh-session");
      expect(result.session?.dir).toBe(home);

      // The lost resume is recorded, then the same task input starts de novo.
      expect(result.attempts).toEqual([
        {
          model: { id: "provider/resume-retry" },
          stop: {
            kind: "infra",
            cause: "crash",
            details: "Session sess-old not found",
          },
          usage: zeroUsage(),
        },
        {
          model: { id: "provider/resume-retry" },
          stop: { kind: "done" },
          usage: result.usage,
        },
      ]);
      expect(fake.prompts()).toEqual(["go"]);

      const calls = fake.invocations();
      expect(calls).toHaveLength(2);
      expect(flag(calls[0]!, "--resume")).toBe("sess-old");
      expect(flag(calls[0]!, "--session-dir")).toBe(storedDir);
      expect(flag(calls[1]!, "--resume")).toBeUndefined();
      expect(flag(calls[1]!, "--session-dir")).toBe(home);
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("does not retry de novo when the resume failure is not a missing session", async () => {
    const fake = createFakeOmp();
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    const home = defaultHome(sessionDir);
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        readyTimeoutMs: 5_000,
        retry: { retries: 5 },
      });
      const session: SessionRef = {
        harness: "omp",
        id: "sess-denied",
        cwd: root,
        model: { id: "provider/resume-denied" },
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: "short",
        compacted: false,
        dir: home,
      };

      const result = await harness.turn({
        model: { id: "provider/resume-denied" },
        session,
        cwd: root,
        prompt: "go",
        timeouts: silent,
      });

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "crash",
        details: "permission denied opening session sess-denied",
      });
      expect(result.attempts).toHaveLength(1);
      const calls = fake.invocations();
      expect(calls).toHaveLength(1);
      expect(flag(calls[0]!, "--resume")).toBe("sess-denied");
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("stores the launch session home and resumes against it", async () => {
    const fake = createFakeOmp();
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    const home = defaultHome(sessionDir);
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        readyTimeoutMs: 5_000,
      });
      const first = await harness.turn({
        model: { id: "provider/resume-ok" },
        cwd: root,
        prompt: "go",
        timeouts: silent,
      });

      expect(first.stop).toEqual({ kind: "done" });
      expect(first.session?.id).toBe("live-1");
      expect(first.session?.dir).toBe(home);
      expect(flag(fake.invocations()[0]!, "--session-dir")).toBe(
        first.session?.dir,
      );

      const second = await harness.turn({
        model: { id: "provider/resume-ok" },
        session: first.session,
        cwd: root,
        prompt: "again",
        timeouts: silent,
      });

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.session?.id).toBe("live-1");
      expect(second.session?.dir).toBe(first.session?.dir);

      const resumeCall = fake.invocations()[1]!;
      expect(flag(resumeCall, "--resume")).toBe("live-1");
      expect(flag(resumeCall, "--session-dir")).toBe(first.session?.dir);
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("reports a failed de-novo retry as an infra crash instead of looping", async () => {
    const fake = createFakeOmp();
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    const storedDir = path.join(root, "stored-home");
    fs.mkdirSync(storedDir, { recursive: true });
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        readyTimeoutMs: 5_000,
        retry: { retries: 5 },
      });
      const session: SessionRef = {
        harness: "omp",
        id: "sess-gone",
        cwd: root,
        model: { id: "provider/resume-dead" },
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: "short",
        compacted: false,
        dir: storedDir,
      };

      const result = await harness.turn({
        model: { id: "provider/resume-dead" },
        session,
        cwd: root,
        prompt: "go",
        timeouts: silent,
      });

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "crash",
        details: "de novo launch exploded",
      });
      // Both calls are recorded: the lost resume and the failed de-novo start.
      expect(result.attempts?.map((attempt) => attempt.stop)).toEqual([
        {
          kind: "infra",
          cause: "crash",
          details: "Session sess-gone not found",
        },
        {
          kind: "infra",
          cause: "crash",
          details: "de novo launch exploded",
        },
      ]);
      expect(fake.invocations()).toHaveLength(2);
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("stamps the configured long retention tier on the returned session", async () => {
    const fake = createFakeOmp();
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        retention: "long",
        readyTimeoutMs: 5_000,
      });
      const result = await harness.turn({
        model: { id: "provider/resume-ok" },
        cwd: root,
        prompt: "go",
        timeouts: silent,
      });
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.session?.retentionTier).toBe("long");
    } finally {
      fake.cleanup();
    }
  }, 20_000);

  it("keeps a long turn's cache hot through its last model event and skips once idle", async () => {
    const fake = createFakeOmp({ promptDelayMs: 100 });
    const root = path.dirname(fake.binary);
    const sessionDir = path.join(root, "sessions");
    const clock = installFakeClock(Date.parse("2026-11-16T12:00:00.000Z"));
    try {
      const harness = new OmpHarness({
        binary: fake.binary,
        sessionDir,
        readyTimeoutMs: 5_000,
      });
      const turnStartedAt = Date.now();
      const pending = harness.turn({
        model: { id: "provider/resume-ok" },
        cwd: root,
        prompt: "long turn",
        timeouts: silent,
      });
      await waitForPrompts(fake, 1);
      clock.advance(10 * 60_000);
      const result = await pending;

      expect(result.stop).toEqual({ kind: "done" });
      expect(
        Date.parse(result.session!.lastRequestStartedAt) - turnStartedAt,
      ).toBe(10 * 60_000);
      expect(sessionCacheHot(result.session!, new Date())).toBe(true);

      const compacted = await compactSession(
        compactRuntime(harness),
        result.session!,
      );
      expect(compacted?.session.compacted).toBe(true);
      const launches = () =>
        fake.invocations().filter((args) => args.includes("--mode"));
      expect(launches()).toHaveLength(2);
      expect(flag(launches()[1]!, "--resume")).toBe(result.session!.id);

      clock.advance(10 * 60_000);
      expect(sessionCacheHot(result.session!, new Date())).toBe(false);
      expect(
        await compactSession(compactRuntime(harness), result.session!),
      ).toBeUndefined();
      expect(launches()).toHaveLength(2);
    } finally {
      clock.restore();
      fake.cleanup();
    }
  }, 20_000);
});
