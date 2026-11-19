import { describe, expect, it } from "bun:test";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

/**
 * The run config's opencode binding: acpx's built-in `opencode` route resolves
 * opencode 1.19.5 and fails on the installed 2.2.7 data dir, while the raw
 * `opencode acp` route runs the installed CLI (probe §0).
 */
const OPENCODE_ACPX: AcpxConfig = {
  agent: "opencode acp",
  raw: true,
  effort: {
    configId: "effort",
  },
  usage: { cache: true },
};

// The installed opencode 2.2.7 ACP result: output and reasoning are separate
// counters and the total sums input+output+reasoning+cache read/write.
const OPENCODE_USAGE = {
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
    model: { id: "opencode-go/deepseek-v4.1-flash" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

describe("AcpxHarness opencode raw route", () => {
  it("runs the raw agent, sets effort and records the usage_update cost", async () => {
    const stub = createAcpxStub({
      usage: OPENCODE_USAGE,
      cost: { amount: 0.0032, currency: "USD" },
    });
    const harness = new AcpxHarness({
      id: "opencode",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: OPENCODE_ACPX,
    });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "Say [[text:PONG]]", {
          effort: "high",
        }),
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.model).toEqual({
        id: "opencode-go/deepseek-v4.1-flash",
        effort: "high",
      });
      expect(result.session?.harness).toBe("opencode");
      expect(result.session?.id).toMatch(/^opencode-/);
      expect(result.usage).toEqual({
        in: 7163,
        cacheRead: 20,
        cacheWrite5m: 5,
        cacheWrite1h: 0,
        out: 20,
        reasoningOut: 12,
        costUsd: 0.0032,
      });

      expect(
        await harness.caps({ id: "opencode-go/deepseek-v4.1-flash" }),
      ).toEqual({
        resume: true,
        compact: "none",
        subagents: "none",
        structuredOutput: "none",
        effort: [],
        usage: { cache: true, cost: true },
      });

      const calls = stub.invocations();
      const create = calls.find(
        (args) => args.includes("sessions") && args.includes("new"),
      )!;
      const set = calls.find((args) => args.includes("set"))!;
      const prompt = calls.find((args) =>
        args.at(-1)?.includes("[[text:PONG]]"),
      )!;

      for (const [args, verb] of [
        [create, "sessions"],
        [set, "set"],
        [prompt, "prompt"],
      ] as const) {
        // The raw route has no positional agent: `--agent` is global and must
        // precede the subcommand.
        expect(args[args.indexOf("--agent") + 1]).toMatch(
          /(^|\/)opencode acp$/,
        );
        expect(args.indexOf("--agent")).toBeLessThan(args.indexOf(verb));
      }
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "-s",
        result.session!.id,
        "effort",
        "high",
      ]);
      expect(prompt[prompt.indexOf("--model") + 1]).toBe(
        "opencode-go/deepseek-v4.1-flash",
      );
      expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("prompt"));
      expect(prompt.slice(prompt.indexOf("prompt"))).toEqual([
        "prompt",
        "-s",
        result.session!.id,
        "Say [[text:PONG]]",
      ]);
    } finally {
      stub.cleanup();
    }
  });

  it("resumes the session without reporting the cumulative cost again", async () => {
    const stub = createAcpxStub({
      usage: OPENCODE_USAGE,
      cost: { amount: 0.004, currency: "USD" },
    });
    const options = {
      id: "opencode",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: OPENCODE_ACPX,
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

  it("leaves cost unknown when the reported currency is not USD", async () => {
    const stub = createAcpxStub({
      usage: OPENCODE_USAGE,
      cost: { amount: 5, currency: "EUR" },
    });
    const harness = new AcpxHarness({
      id: "opencode",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: OPENCODE_ACPX,
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
});
