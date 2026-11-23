import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

const AGENT_BANNER = "agent-a v1.5.2\n---\n\n## Skills\n";

const AGENT_A_ACPX: AcpxConfig = {
  agent: "agent-a",
  effort: {
    configId: "thought_level",
  },
};

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "fake-host/lamp-mini-free" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

async function createsNamedPiSessionPassesModelPart1(
  stub: ReturnType<typeof createAcpxStub>,
  harness: AcpxHarness,
) {
  const cwd = path.dirname(stub.binary);
  const outcomePath = path.join(cwd, "outbox", "outcome.yaml");
  const result = await harness.turn(
    request(cwd, `Say [[text:PONG]]\n\n- outcome path: \`${outcomePath}\``, {
      effort: "high",
      outcomePath,
    }),
  );

  expect(result.stop).toEqual({ kind: "done" });
  expect(result.text).toBe("PONG");
  expect(result.model).toEqual({
    id: "fake-host/lamp-mini-free",
    effort: "high",
  });
  expect(result.session?.harness).toBe("agent-a");
  expect(result.session?.id).toMatch(/^agent-a-/);
  // agent-a reports no usage on the prompt; absence stays unknown, not a fake zero cost.
  expect(result.usage.costUsd).toBeUndefined();
  expect(result.usage.in).toBe(0);

  const calls = stub.invocations();
  const create = calls.find(
    (args) => args.includes("sessions") && args.includes("new"),
  )!;
  const set = calls.find((args) => args.includes("set"))!;
  const prompt = calls.find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;

  // The stub logs argv and never writes the outcome, so this is the path the
  // adapter actually handed the agent, not a file the stub invented.
  expect(prompt.at(-1)).toContain(`outcome path: \`${outcomePath}\``);

  for (const args of [create, set, prompt]) {
    expect(args.indexOf("--format")).toBeLessThan(args.indexOf("agent-a"));
    expect(args.indexOf("--cwd")).toBeLessThan(args.indexOf("agent-a"));
  }
  expect(create).toContain("--name");
  expect(create).toContain(result.session!.id);
  expect(set.slice(set.indexOf("set"))).toEqual([
    "set",
    "thought_level",
    "high",
  ]);

  return { result, prompt };
}

async function createsNamedPiSessionPassesModelPart2(
  scope: Awaited<ReturnType<typeof createsNamedPiSessionPassesModelPart1>>,
) {
  const { prompt, result } = scope;
  expect(prompt).toContain("--model");
  expect(prompt[prompt.indexOf("--model") + 1]).toBe(
    "fake-host/lamp-mini-free",
  );
  // acpx parses the positional agent with enablePositionalOptions: a global
  // --model after `agent-a` is `unknown option '--model'`, exit 2.
  expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("agent-a"));
  expect(prompt[prompt.indexOf("-s") + 1]).toBe(result.session!.id);
}

function registerAcpxHarnessPart1(): void {
  it("creates a named agent-a session, passes model and effort, and returns the last agent text", async () => {
    const stub = createAcpxStub({ banner: AGENT_BANNER });
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_A_ACPX,
    });
    try {
      const scope1 = await createsNamedPiSessionPassesModelPart1(stub, harness);
      await createsNamedPiSessionPassesModelPart2(scope1);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart2(): void {
  it("persists the stdout stream and appends a resumed turn to the same path", async () => {
    const stub = createAcpxStub({ usage: { totalTokens: 10 } });
    const sessionDir = path.join(path.dirname(stub.binary), "sessions");
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir,
      acpx: AGENT_A_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first [[text:ONE]]"));
      expect(first.transcript).toBeDefined();
      expect(first.transcript!.startsWith(`${sessionDir}${path.sep}`)).toBe(
        true,
      );
      expect(first.transcript!.endsWith(".ndjson")).toBe(true);
      const frames = fs
        .readFileSync(first.transcript!, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(frames.some((frame) => frame.method === "session/prompt")).toBe(
        true,
      );
      expect(
        frames.some(
          (frame) => frame.result?.stopReason === "end_turn" && frame.id === 7,
        ),
      ).toBe(true);

      // A resumed named session is the same acpx record; its next turn appends
      // to the same transcript instead of replacing the first stream.
      const second = await harness.turn(
        request(cwd, "second [[text:TWO]]", { session: first.session }),
      );
      expect(second.transcript).toBe(first.transcript);
      const prompts = fs
        .readFileSync(second.transcript!, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((frame) => frame.method === "session/prompt");
      expect(prompts).toHaveLength(2);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart3(): void {
  it("scrubs token-shaped secrets before the stream reaches disk", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.join(path.dirname(stub.binary), "sessions"),
      acpx: AGENT_A_ACPX,
    });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "[[mode:bad_model]]"),
      );
      expect(result.stop.kind).toBe("infra");
      expect(result.transcript).toBeDefined();
      const stream = fs.readFileSync(result.transcript!, "utf8");
      expect(stream).not.toContain("sk-abcdefghijklmnop");
      expect(stream).toContain("[redacted]");
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart4(): void {
  it("passes harness-entry options to the acpx child as args and env", async () => {
    const stub = createAcpxStub();
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "options-env.pid");
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_A_ACPX,
      options: {
        args: ["--approve-all"],
        env: { ACPX_STUB_PID_FILE: pidFile },
      },
    });
    try {
      const result = await harness.turn(request(cwd, "Say [[text:PONG]]"));
      expect(result.text).toBe("PONG");
      const create = stub
        .invocations()
        .find((args) => args.includes("sessions") && args.includes("new"))!;
      expect(create).toContain("--approve-all");
      // The stub writes this file only when the option env reached the child.
      expect(fs.existsSync(pidFile)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart5(): void {
  it("keeps harness-entry args and env when the turn carries the production opaque block", async () => {
    const stub = createAcpxStub();
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "opaque-options-env.pid");
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_A_ACPX,
      options: {
        args: ["--approve-all"],
        env: { ACPX_STUB_PID_FILE: pidFile },
      },
    });
    try {
      // flow-context passes harnesses.<id>.acpx here; the turn must not drop
      // the entry's args/env when it applies that block.
      const result = await harness.turn({
        ...request(cwd, "Say [[text:PONG]]"),
        opaque: AGENT_A_ACPX,
      });
      expect(result.text).toBe("PONG");
      const create = stub
        .invocations()
        .find((args) => args.includes("sessions") && args.includes("new"))!;
      expect(create).toContain("--approve-all");
      expect(fs.existsSync(pidFile)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart6(): void {
  it("refuses a scalar args option instead of spreading it into argv", () => {
    expect(
      () =>
        new AcpxHarness({
          retention: "short",
          id: "agent-a",
          binary: "/bin/true",
          sessionDir: path.dirname("/bin/true"),
          acpx: AGENT_A_ACPX,
          options: { args: "--approve-all" },
        }),
    ).toThrow('Invalid "args" option: expected string array, got string');
    expect(
      () =>
        new AcpxHarness({
          retention: "short",
          id: "agent-a",
          binary: "/bin/true",
          sessionDir: path.dirname("/bin/true"),
          acpx: AGENT_A_ACPX,
          options: { args: ["--approve-all", 1] },
        }),
    ).toThrow(
      'Invalid "args" option: expected string array, got array with non-string entries',
    );
  });
}

function registerAcpxHarnessPart7(): void {
  it("refuses a non-string env option instead of coercing it", () => {
    expect(
      () =>
        new AcpxHarness({
          retention: "short",
          id: "agent-a",
          binary: "/bin/true",
          sessionDir: path.dirname("/bin/true"),
          acpx: AGENT_A_ACPX,
          options: { env: "ACPX_STUB_PID_FILE=/tmp/x" },
        }),
    ).toThrow(
      'Invalid "env" option: expected string-to-string object, got string',
    );
    expect(
      () =>
        new AcpxHarness({
          retention: "short",
          id: "agent-a",
          binary: "/bin/true",
          sessionDir: path.dirname("/bin/true"),
          acpx: AGENT_A_ACPX,
          options: { env: { ACPX_STUB_PID_FILE: 1 } },
        }),
    ).toThrow(
      'Invalid "env" option: expected string-to-string object, got object with non-string values',
    );
  });
}

function registerAcpxHarnessPart8(): void {
  it("ignores non-args/env options in harness-entry", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_A_ACPX,
      options: {
        args: ["--approve-all"],
        env: { FOO: "bar" },
        unexpected: "value",
      } as any,
    });
    try {
      await harness.turn(
        request(path.dirname(stub.binary), "Say [[text:PONG]]"),
      );
      for (const args of stub.invocations()) {
        expect(args).not.toContain("unexpected");
        expect(args).not.toContain("value");
      }
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart9(): void {
  it("resumes the same named session from a second process without creating a new one", async () => {
    const stub = createAcpxStub();
    const options = {
      retention: "short" as const,
      id: "agent-a",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_A_ACPX,
    };
    const harness = new AcpxHarness(options);
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      // A fresh harness object stands in for the next kernel process.
      const restart = new AcpxHarness(options);
      const second = await restart.turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session }),
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);

      const calls = stub.invocations();
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(1);
      const resumed = calls.at(-1)!;
      expect(resumed[resumed.indexOf("-s") + 1]).toBe(first.session!.id);
      expect(resumed).not.toContain("--name");
    } finally {
      stub.cleanup();
    }
  });
}

describe("AcpxHarness", () => {
  registerAcpxHarnessPart1();

  registerAcpxHarnessPart2();

  registerAcpxHarnessPart3();

  registerAcpxHarnessPart4();

  registerAcpxHarnessPart5();

  registerAcpxHarnessPart6();

  registerAcpxHarnessPart7();

  registerAcpxHarnessPart8();

  registerAcpxHarnessPart9();
});
