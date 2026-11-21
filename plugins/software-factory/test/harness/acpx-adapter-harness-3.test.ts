import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

const PI_ACPX: AcpxConfig = {
  agent: "pi",
  effort: {
    configId: "thought_level",
  },
};

const CODEX_ACPX: AcpxConfig = {
  agent: "codex",
  effort: {
    configId: "reasoning_effort",
  },
  usage: { cache: true },
};

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "opencode-go/beam-free" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

/** Pids the stub reports through ACPX_STUB_PID_FILE. */
async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for pid file ${pidFile}`);
}

function expectDead(pid: number): void {
  expect(() => process.kill(pid, 0)).toThrow();
}

function acpxHarnessPromptResultPrecedencePart1() {
  function turnOn(
    stub: ReturnType<typeof createAcpxStub>,
    prompt: string,
    extra: Record<string, unknown> = {},
  ) {
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    return harness.turn(request(path.dirname(stub.binary), prompt, extra));
  }

  it("returns done and reads the outcome when exit 5 follows a valid result", async () => {
    const stub = createAcpxStub({
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        cachedReadTokens: 3,
        cachedWriteTokens: 2,
      },
      promptExitCode: 5,
    });
    try {
      const result = await turnOn(stub, "Say [[text:COMPLETE]]");
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("COMPLETE");
      expect(result.usage).toMatchObject({
        in: 11,
        out: 7,
        cacheRead: 3,
        cacheWrite5m: 2,
      });
      expect(result.session?.id).toMatch(/^pi-/);
    } finally {
      stub.cleanup();
    }
  });

  return { turnOn };
}

function acpxHarnessPromptResultPrecedencePart2(
  scope: ReturnType<typeof acpxHarnessPromptResultPrecedencePart1>,
) {
  const { turnOn } = scope;
  it("carries exit details when exit 5 has no prompt result", async () => {
    const stub = createAcpxStub({
      promptExitCode: 5,
      omitPromptResult: true,
    });
    try {
      const result = await turnOn(stub, "Say [[text:INCOMPLETE]]");
      expect(result.stop).toEqual({
        kind: "infra",
        cause: "crash",
        details: "exit 5, signal none",
      });
    } finally {
      stub.cleanup();
    }
  });

  it("keeps an ACP error frame over a parsed result", async () => {
    const stub = createAcpxStub({
      promptExitCode: 5,
      errorAfterResult: {
        code: -32603,
        message: "agent transport crashed",
      },
    });
    try {
      const result = await turnOn(stub, "Say [[text:COMPLETE]]");
      expect(result.stop.kind).toBe("infra");
      if (result.stop.kind !== "infra")
        throw new Error("expected an infra stop");
      expect(result.stop.cause).toBe("crash");
      expect(result.stop.details).toContain("exit 5");
      expect(result.stop.details).toContain("agent transport crashed");
    } finally {
      stub.cleanup();
    }
  });
}

function acpxHarnessPromptResultPrecedencePart3(
  scope: ReturnType<typeof acpxHarnessPromptResultPrecedencePart1>,
) {
  const { turnOn } = scope;
  it("classifies a transport error frame as transient network", async () => {
    const cases = [
      { message: "fetch failed ECONNRESET", needle: "fetch failed ECONNRESET" },
      {
        message: "connect ECONNREFUSED 127.0.0.1:443",
        needle: "connect ECONNREFUSED",
      },
      {
        message: "ECONNABORTED: The operation was aborted",
        needle: "ECONNABORTED",
      },
    ] as const;
    for (const testCase of cases) {
      const stub = createAcpxStub({
        promptExitCode: 5,
        errorAfterResult: { code: -32603, message: testCase.message },
      });
      try {
        const result = await turnOn(stub, "Say [[text:COMPLETE]]");
        expect(result.stop.kind).toBe("infra");
        if (result.stop.kind !== "infra")
          throw new Error("expected an infra stop");
        expect(result.stop.cause).toBe("network");
        expect(result.stop.details).toContain(testCase.needle);
      } finally {
        stub.cleanup();
      }
    }
  }, 20_000);

  it("keeps a wall timeout over a parsed result", async () => {
    const stub = createAcpxStub({ hangAfterResult: true });
    try {
      const result = await turnOn(stub, "Say [[text:COMPLETE]]", {
        timeouts: { idleMs: 0, wallMs: 250 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
    } finally {
      stub.cleanup();
    }
  }, 20_000);
}

function acpxHarnessPromptResultPrecedencePart4(
  scope: ReturnType<typeof acpxHarnessPromptResultPrecedencePart1>,
) {
  const { turnOn } = scope;
  it("keeps refusal and truncation kinds under exit 5", async () => {
    const cases = [
      { stopReason: "refusal", stop: { kind: "refusal" } },
      {
        stopReason: "max_tokens",
        stop: { kind: "truncated", cause: "max-tokens" },
      },
      {
        stopReason: "max_turns",
        stop: { kind: "truncated", cause: "turn-limit" },
      },
    ] as const;
    for (const testCase of cases) {
      const stub = createAcpxStub({
        stopReason: testCase.stopReason,
        promptExitCode: 5,
      });
      try {
        const result = await turnOn(stub, "Say [[text:CUT]]");
        expect(result.stop).toEqual(testCase.stop);
      } finally {
        stub.cleanup();
      }
    }
  }, 20_000);
}

function registerAcpxHarnessPart22(): void {
  it("maps a cancelled stop reason to cancelled even though acpx exits 0", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: CODEX_ACPX,
    });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "[[mode:cancelled]]"),
      );
      expect(result.stop).toEqual({ kind: "cancelled" });
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart23(): void {
  it("starts de novo instead of reusing a session bound to another cwd", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      const elsewhere = path.join(cwd, "elsewhere");
      fs.mkdirSync(elsewhere, { recursive: true });
      const second = await harness.turn(
        request(elsewhere, "second [[text:ALPHA]]", {
          session: first.session,
        }),
      );
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).not.toBe(first.session!.id);
      expect(second.session?.cwd).toBe(elsewhere);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart24(): void {
  it("abort kills the prompt child and reports cancelled", async () => {
    const stub = createAcpxStub();
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "child.pid");
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
      // The stub reports its pid through this entry env; no parent variable
      // reaches a child unless the harness entry names it.
      options: { env: { ACPX_STUB_PID_FILE: pidFile } },
    });
    try {
      const controller = new AbortController();
      const pending = harness.turn(
        request(cwd, "[[mode:hang]]", {
          timeouts: { idleMs: 0, wallMs: 60_000 },
          signal: controller.signal,
        }),
      );
      const pid = await waitForPid(pidFile);
      controller.abort();
      const result = await pending;
      expect(result.stop).toEqual({ kind: "cancelled" });
      expect(result.attempts).toHaveLength(1);
      expectDead(pid);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart25(): void {
  it("abort after resolve is a no-op", async () => {
    const stub = createAcpxStub();
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "child.pid");
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
      options: { env: { ACPX_STUB_PID_FILE: pidFile } },
    });
    try {
      const controller = new AbortController();
      const result = await harness.turn(
        request(cwd, "hello", {
          timeouts: { idleMs: 0, wallMs: 60_000 },
          signal: controller.signal,
        }),
      );
      expect(result.stop).toEqual({ kind: "done" });
      const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      // The turn reaped its own child; the abort below has nothing to kill.
      expectDead(pid);
      controller.abort();
      expect(result.stop).toEqual({ kind: "done" });
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart26(): void {
  it("a pre-aborted signal reports cancelled without spawning", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const controller = new AbortController();
      controller.abort();
      const result = await harness.turn(
        request(path.dirname(stub.binary), "hello", {
          signal: controller.signal,
        }),
      );
      expect(result.stop).toEqual({ kind: "cancelled" });
      expect(stub.invocations()).toHaveLength(0);
    } finally {
      stub.cleanup();
    }
  });
}

describe("AcpxHarness", () => {
  registerAcpxHarnessPart22();

  registerAcpxHarnessPart23();

  registerAcpxHarnessPart24();

  registerAcpxHarnessPart25();

  registerAcpxHarnessPart26();
});

describe("AcpxHarness prompt result precedence", () => {
  const scope1 = acpxHarnessPromptResultPrecedencePart1();
  acpxHarnessPromptResultPrecedencePart2(scope1);
  acpxHarnessPromptResultPrecedencePart3(scope1);
  acpxHarnessPromptResultPrecedencePart4(scope1);
});
