import { describe, expect, it } from "bun:test";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

const AGY_BIN = "/opt/agy-test/bin/agy";

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

const AGY_OPTIONS = { args: ["--approve-all"] };

const agyAcpx = (agent: string): AcpxConfig => ({
  agent,
  raw: true,
  effort: {
    configId: "thought_level",
    modelBases: { "gemini-3.8-flash": ["low", "medium", "high"] },
  },
  usage: { cache: true },
});

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

async function runsAgyThroughAcpxSRawAgentRoutePart1(
  stub: ReturnType<typeof createAcpxStub>,
  harness: AcpxHarness,
) {
  const cwd = path.dirname(stub.binary);
  const result = await harness.turn(
    request(cwd, "Say [[text:PONG]]", {
      model: { id: "gemini-3.8-flash-high" },
    }),
  );

  expect(result.stop).toEqual({ kind: "done" });
  expect(result.text).toBe("PONG");
  // The alias's model id is recorded; only acpx's --model gets the base id.
  expect(result.model).toEqual({
    id: "gemini-3.8-flash-high",
    effort: "high",
  });
  expect(result.usage).toEqual({
    in: 8783,
    cacheRead: 0,
    cacheWrite5m: 21,
    cacheWrite1h: 0,
    out: 2,
    reasoningOut: 77,
  });
  expect(result.usage.costUsd).toBeUndefined();

  const calls = stub.invocations();
  const create = calls.find(
    (args) => args.includes("sessions") && args.includes("new"),
  )!;
  const set = calls.find((args) => args.includes("set"))!;
  const prompt = calls.find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;

  // The raw ACP agent is the resolved executable; it needs approve-all or
  // every shell command is denied.
  for (const args of [create, set, prompt]) {
    expect(args[args.indexOf("--agent") + 1]).toBe(`${AGY_BIN} acp`);
  }
  expect(create.indexOf("--approve-all")).toBeLessThan(
    create.indexOf("sessions"),
  );
  expect(set.indexOf("--approve-all")).toBeLessThan(set.indexOf("set"));
  expect(prompt.indexOf("--approve-all")).toBeLessThan(
    prompt.indexOf("prompt"),
  );

  expect(create).toContain("--name");
  expect(create).toContain(result.session!.id);

  return { result, set, prompt };
}

async function runsAgyThroughAcpxSRawAgentRoutePart2(
  scope: Awaited<ReturnType<typeof runsAgyThroughAcpxSRawAgentRoutePart1>>,
) {
  const { set, result, prompt } = scope;
  expect(set.slice(set.indexOf("set"))).toEqual([
    "set",
    "-s",
    result.session!.id,
    "thought_level",
    "high",
  ]);
  expect(prompt[prompt.indexOf("--model") + 1]).toBe("gemini-3.8-flash");
  // The raw route has no positional agent, so --model and --agent are
  // global flags; both must precede the prompt verb.
  expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("prompt"));
  expect(prompt.indexOf("--agent")).toBeLessThan(prompt.indexOf("prompt"));
  expect(prompt.slice(prompt.indexOf("prompt"))).toEqual([
    "prompt",
    "-s",
    result.session!.id,
    "Say [[text:PONG]]",
  ]);
}

function registerAcpxHarnessPart15(): void {
  it("runs agy through acpx's raw agent route and splits the effort suffix", async () => {
    const stub = createAcpxStub({
      usage: {
        totalTokens: 8883,
        inputTokens: 8783,
        cachedReadTokens: 0,
        cachedWriteTokens: 21,
        outputTokens: 79,
        thoughtTokens: 77,
      },
    });
    const harness = new AcpxHarness({
      id: "agy",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: agyAcpx(`${AGY_BIN} acp`),
      options: AGY_OPTIONS,
    });
    try {
      const scope1 = await runsAgyThroughAcpxSRawAgentRoutePart1(stub, harness);
      await runsAgyThroughAcpxSRawAgentRoutePart2(scope1);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart16(): void {
  it("resumes an agy session from a second process without creating a new one", async () => {
    const stub = createAcpxStub({
      usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
    });
    const options = {
      id: "agy",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: agyAcpx(`${AGY_BIN} acp`),
      options: AGY_OPTIONS,
    };
    try {
      const cwd = path.dirname(stub.binary);
      const first = await new AcpxHarness(options).turn(
        request(cwd, "first", { model: { id: "gemini-3.8-flash-high" } }),
      );
      const second = await new AcpxHarness(options).turn(
        request(cwd, "second [[text:ALPHA]]", {
          model: { id: "gemini-3.8-flash-high" },
          session: first.session,
        }),
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);
      expect(second.model).toEqual({
        id: "gemini-3.8-flash-high",
        effort: "high",
      });

      const calls = stub.invocations();
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(1);
      const resume = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(resume).toHaveLength(1);
      expect(resume[0]!.slice(resume[0]!.indexOf("prompt"))).toEqual([
        "prompt",
        "-s",
        first.session!.id,
        "second [[text:ALPHA]]",
      ]);
      expect(resume[0]![resume[0]!.indexOf("--cwd") + 1]).toBe(cwd);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart17(): void {
  it("keeps an agy model id whose effort word is part of the name", async () => {
    const stub = createAcpxStub({
      usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
    });
    const harness = new AcpxHarness({
      id: "agy",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: agyAcpx(`${AGY_BIN} acp`),
      options: AGY_OPTIONS,
    });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "Say [[text:PONG]]", {
          model: { id: "gpt-oss-120b-medium" },
        }),
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.model).toEqual({ id: "gpt-oss-120b-medium" });
      const calls = stub.invocations();
      expect(calls.some((args) => args.includes("set"))).toBe(false);
      const prompt = calls.at(-1)!;
      expect(prompt[prompt.indexOf("--model") + 1]).toBe("gpt-oss-120b-medium");
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart18(): void {
  it("advertises agy's static caps without inventing live effort levels", async () => {
    const harness = new AcpxHarness({
      id: "agy",
      binary: "/nonexistent/agy",
      sessionDir: path.dirname("/nonexistent/agy"),
      acpx: agyAcpx("/nonexistent/agy acp"),
      options: AGY_OPTIONS,
    });
    expect(await harness.caps({ id: "gemini-3.8-flash-high" })).toEqual({
      resume: true,
      compact: "none",
      subagents: "none",
      structuredOutput: "none",
      effort: [],
      usage: { cache: true, cost: true },
    });
  });
}

function registerAcpxHarnessPart19(): void {
  it("takes the turn config from opaque when the kernel passes one", async () => {
    const stub = createAcpxStub({
      usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
    });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(
        request(cwd, "Say [[text:PONG]]", {
          effort: "high",
          opaque: {
            ...CODEX_ACPX,
            effort: { configId: "reasoning_effort" },
          } satisfies AcpxConfig,
        }),
      );
      expect(result.stop).toEqual({ kind: "done" });
      // The opaque wins over the instance config: the codex agent ran.
      const prompt = stub
        .invocations()
        .find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;
      expect(prompt).toContain("codex");
      expect(prompt).not.toContain("pi");
      const set = stub.invocations().find((args) => args.includes("set"))!;
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "reasoning_effort",
        "high",
      ]);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart20(): void {
  it("runs a new agent from config with no code", async () => {
    const stub = createAcpxStub({
      usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 },
    });
    const harness = new AcpxHarness({
      id: "nova",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: {
        agent: "nova",
        effort: { configId: "nova_level" },
        usage: { cache: false },
      },
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(
        request(cwd, "Say [[text:PONG]]", { effort: "high" }),
      );
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.session?.harness).toBe("nova");
      expect(result.session?.id).toMatch(/^nova-/);
      const prompt = stub
        .invocations()
        .find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;
      expect(prompt[prompt.indexOf("--model") + 1]).toBe(
        "opencode-go/beam-free",
      );
      expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("nova"));
      const set = stub.invocations().find((args) => args.includes("set"))!;
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "nova_level",
        "high",
      ]);
      expect(await harness.caps({ id: "nova-model" })).toMatchObject({
        effort: [],
        usage: { cache: false, cost: true },
      });
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart21(): void {
  it("maps NO_SESSION, a bad model, provider quota and a bare exit to scrubbed stops", async () => {
    const cases = [
      {
        mode: "no_session",
        stop: (stop: any) =>
          stop.kind === "infra" &&
          stop.cause === "crash" &&
          /No acpx session found/.test(stop.details),
      },
      {
        mode: "bad_model",
        stop: (stop: any) =>
          stop.kind === "infra" &&
          stop.cause === "auth" &&
          /did not advertise/.test(stop.details) &&
          !stop.details.includes("sk-abcdefghijklmnop") &&
          stop.details.includes("[redacted]"),
      },
      {
        mode: "quota",
        stop: (stop: any) => stop.kind === "infra" && stop.cause === "quota",
      },
      {
        mode: "bare",
        stop: (stop: any) =>
          stop.kind === "infra" &&
          stop.cause === "crash" &&
          /boom/.test(stop.details) &&
          stop.details.includes("[redacted]") &&
          !stop.details.includes("supersecretvalue"),
      },
    ];

    for (const testCase of cases) {
      const stub = createAcpxStub();
      const harness = new AcpxHarness({
        id: "pi",
        binary: stub.binary,
        sessionDir: path.dirname(stub.binary),
        acpx: PI_ACPX,
        // The quota case retries; default backoff would sleep 1s + 2s.
        retry: { baseDelayMs: 1, maxDelayMs: 1 },
      });
      try {
        const result = await harness.turn(
          request(path.dirname(stub.binary), `[[mode:${testCase.mode}]]`),
        );
        expect(testCase.stop(result.stop)).toBe(true);
      } finally {
        stub.cleanup();
      }
    }
  });
}

describe("AcpxHarness", () => {
  registerAcpxHarnessPart15();

  registerAcpxHarnessPart16();

  registerAcpxHarnessPart17();

  registerAcpxHarnessPart18();

  registerAcpxHarnessPart19();

  registerAcpxHarnessPart20();

  registerAcpxHarnessPart21();
});
