import { describe, expect, it } from "bun:test";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

/**
 * A run config binds a harness via acpx's built-in route, which resolves
 * against the installed agent and fails on the installed data dir, while the
 * raw `agent-c acp` route runs the installed CLI (probe §0).
 */
const AGENT_C_ACPX: AcpxConfig = {
  agent: "agent-c acp",
  raw: true,
  effort: {
    configId: "effort",
  },
  usage: { cache: true },
};

// The installed agent's ACP result: output and reasoning are separate
// counters and the total sums input+output+reasoning+cache read/write.
const AGENT_C_USAGE = {
  totalTokens: 7220,
  inputTokens: 7163,
  cachedReadTokens: 20,
  cachedWriteTokens: 5,
  outputTokens: 20,
  thoughtTokens: 12,
};

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "vendor/mini-flash" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

describe("AcpxHarness raw route", () => {
  registerAcpxHarnessRawRoutePart1();
  registerAcpxHarnessRawRoutePart2();
  registerAcpxHarnessRawRoutePart3();
});

async function runsRawAgentSetsEffortRecordsUsagePart1(
  harness: AcpxHarness,
  stub: ReturnType<typeof createAcpxStub>,
) {
  const result = await harness.turn(
    request(path.dirname(stub.binary), "Say [[text:PONG]]", {
      effort: "high",
    }),
  );

  expect(result.stop).toEqual({ kind: "done" });
  expect(result.text).toBe("PONG");
  expect(result.model).toEqual({
    id: "vendor/mini-flash",
    effort: "high",
  });
  expect(result.session?.harness).toBe("agent-c");
  expect(result.session?.id).toMatch(/^agent-c-/);
  expect(result.usage).toEqual({
    in: 7163,
    cacheRead: 20,
    cacheWrite5m: 5,
    cacheWrite1h: 0,
    out: 20,
    reasoningOut: 12,
    costUsd: 0.0032,
  });

  expect(await harness.caps({ id: "vendor/mini-flash" })).toEqual({
    resume: true,
    compact: "none",
    subagents: "none",
    structuredOutput: "none",
    usage: { cache: true, cost: true },
  });

  const calls = stub.invocations();
  const create = calls.find(
    (args) => args.includes("sessions") && args.includes("new"),
  )!;
  const set = calls.find((args) => args.includes("set"))!;
  const prompt = calls.find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;

  return { result, create, set, prompt };
}

async function runsRawAgentSetsEffortRecordsUsagePart2(
  scope: Awaited<ReturnType<typeof runsRawAgentSetsEffortRecordsUsagePart1>>,
) {
  const { create, set, prompt, result } = scope;
  for (const [args, verb] of [
    [create, "sessions"],
    [set, "set"],
    [prompt, "prompt"],
  ] as const) {
    // The raw route has no positional agent: `--agent` is global and must
    // precede the subcommand.
    expect(args[args.indexOf("--agent") + 1]).toMatch(/(^|\/)agent-c acp$/);
    expect(args.indexOf("--agent")).toBeLessThan(args.indexOf(verb));
  }
  expect(set.slice(set.indexOf("set"))).toEqual([
    "set",
    "-s",
    result.session!.id,
    "effort",
    "high",
  ]);
  expect(prompt[prompt.indexOf("--model") + 1]).toBe("vendor/mini-flash");
  expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("prompt"));
  expect(prompt.slice(prompt.indexOf("prompt"))).toEqual([
    "prompt",
    "-s",
    result.session!.id,
    "Say [[text:PONG]]",
  ]);
}

function registerAcpxHarnessRawRoutePart1(): void {
  it("runs the raw agent, sets effort and records the usage_update cost", async () => {
    const stub = createAcpxStub({
      usage: AGENT_C_USAGE,
      cost: { amount: 0.0032, currency: "USD" },
    });
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-c",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_C_ACPX,
    });
    try {
      const scope1 = await runsRawAgentSetsEffortRecordsUsagePart1(
        harness,
        stub,
      );
      await runsRawAgentSetsEffortRecordsUsagePart2(scope1);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessRawRoutePart2(): void {
  it("resumes the session without reporting the cumulative cost again", async () => {
    const stub = createAcpxStub({
      usage: AGENT_C_USAGE,
      cost: { amount: 0.004, currency: "USD" },
    });
    const options = {
      retention: "short" as const,
      id: "agent-c",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_C_ACPX,
    };
    try {
      const cwd = path.dirname(stub.binary);
      const first = await new AcpxHarness(options).turn(
        request(cwd, "first [[text:PONG]]"),
      );
      const second = await new AcpxHarness(options).turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session }),
      );

      expect(first.usage.costUsd).toBe(0.004);
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);
      // `usage_update.cost` is session-cumulative: reusing it on a resumed
      // turn would count the first turn again.
      expect(second.usage.costUsd).toBeUndefined();
      expect(second.usage).toMatchObject({
        in: 7163,
        cacheWrite5m: 5,
        out: 20,
        reasoningOut: 12,
      });

      const calls = stub.invocations();
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(1);
      const prompt = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(prompt).toHaveLength(1);
      expect(prompt[0]!.slice(prompt[0]!.indexOf("prompt"))).toEqual([
        "prompt",
        "-s",
        first.session!.id,
        "second [[text:ALPHA]]",
      ]);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessRawRoutePart3(): void {
  it("leaves cost unknown when the reported currency is not USD", async () => {
    const stub = createAcpxStub({
      usage: AGENT_C_USAGE,
      cost: { amount: 5, currency: "EUR" },
    });
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-c",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: AGENT_C_ACPX,
    });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "Say [[text:PONG]]"),
      );
      expect(result.stop).toEqual({ kind: "done" });
      expect(result.usage.costUsd).toBeUndefined();
      expect(result.usage.in).toBe(7163);
      expect(result.usage.out).toBe(20);
      expect(result.usage.reasoningOut).toBe(12);
    } finally {
      stub.cleanup();
    }
  });
}
