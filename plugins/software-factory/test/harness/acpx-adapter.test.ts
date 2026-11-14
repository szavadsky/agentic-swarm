import { describe, expect, it } from "bun:test";
import path from "node:path";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { priceUsage } from "../../src/kernel/pricing.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };
const CODEX_PRICE = { input: 0.15, cachedInput: 0.003, output: 0.6, reasoning: 0.6 };
const AGY_BIN = "/opt/agy-test/bin/agy";

function request(cwd: string, prompt: string, extra: Record<string, unknown> = {}) {
  return {
    model: { id: "opencode-go/beam-free" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

describe("AcpxHarness", () => {
  it("creates a named pi session, passes model and effort, and returns the last agent text", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const outcomePath = path.join(cwd, "outbox", "outcome.yaml");
      const result = await harness.turn(
        request(cwd, `Say [[text:PONG]]\n\n- outcome path: \`${outcomePath}\``, {
          effort: "high",
          outcomePath,
        })
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.model).toEqual({ id: "opencode-go/beam-free", effort: "high" });
      expect(result.session?.harness).toBe("pi");
      expect(result.session?.id).toMatch(/^pi-/);
      // pi reports no usage on the prompt; absence stays unknown, not a fake zero cost.
      expect(result.usage.costUsd).toBeUndefined();
      expect(result.usage.in).toBe(0);

      const calls = stub.invocations();
      const create = calls.find((args) => args.includes("sessions") && args.includes("new"))!;
      const set = calls.find((args) => args.includes("set"))!;
      const prompt = calls.find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;

      // The stub logs argv and never writes the outcome, so this is the path the
      // adapter actually handed the agent, not a file the stub invented.
      expect(prompt.at(-1)).toContain(`outcome path: \`${outcomePath}\``);

      for (const args of [create, set, prompt]) {
        expect(args.indexOf("--format")).toBeLessThan(args.indexOf("pi"));
        expect(args.indexOf("--cwd")).toBeLessThan(args.indexOf("pi"));
      }
      expect(create).toContain("--name");
      expect(create).toContain(result.session!.id);
      expect(set.slice(set.indexOf("set"))).toEqual(["set", "thought_level", "high"]);
      expect(prompt).toContain("--model");
      expect(prompt[prompt.indexOf("--model") + 1]).toBe("opencode-go/beam-free");
      // acpx parses the positional agent with enablePositionalOptions: a global
      // --model after `pi` is `unknown option '--model'`, exit 2.
      expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("pi"));
      expect(prompt[prompt.indexOf("-s") + 1]).toBe(result.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("resumes the same named session from a second process without creating a new one", async () => {
    const stub = createAcpxStub();
    const options = { agent: "pi" as const, binary: stub.binary };
    const harness = new AcpxHarness(options);
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      // A fresh harness object stands in for the next kernel process.
      const restart = new AcpxHarness(options);
      const second = await restart.turn(request(cwd, "second [[text:ALPHA]]", { session: first.session }));

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);

      const calls = stub.invocations();
      expect(calls.filter((args) => args.includes("sessions") && args.includes("new"))).toHaveLength(1);
      const resumed = calls.at(-1)!;
      expect(resumed[resumed.indexOf("-s") + 1]).toBe(first.session!.id);
      expect(resumed).not.toContain("--name");
    } finally {
      stub.cleanup();
    }
  });

  it("retries de novo with a new name when the resumed session is gone", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session })
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toMatch(/^pi-/);
      expect(second.session?.id).not.toBe(first.session!.id);

      const calls = stub.invocations();
      expect(calls.filter((args) => args.includes("sessions") && args.includes("new"))).toHaveLength(2);
      const prompts = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(prompts).toHaveLength(2);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).toBe(first.session!.id);
      expect(prompts[1]![prompts[1]!.indexOf("-s") + 1]).toBe(second.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("retries de novo when the resumed session's effort set answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first", { effort: "high" }));
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session, effort: "high" })
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toMatch(/^pi-/);
      expect(second.session?.id).not.toBe(first.session!.id);

      const calls = stub.invocations();
      const creates = calls.filter((args) => args.includes("sessions") && args.includes("new"));
      expect(creates).toHaveLength(2);
      expect(creates[1]).toContain(second.session!.id);

      const sets = calls.filter((args) => args.includes("set"));
      expect(sets).toHaveLength(3);
      expect(sets[1]![sets[1]!.indexOf("-s") + 1]).toBe(first.session!.id);
      expect(sets[2]![sets[2]!.indexOf("-s") + 1]).toBe(second.session!.id);
      expect(sets[2]!.slice(sets[2]!.indexOf("set"))).toEqual(["set", "thought_level", "high"]);

      const prompts = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).toBe(second.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("stops with infra details and no session when the retry also answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first", { effort: "high" }));
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[mode:no_session]]", { session: first.session, effort: "high" })
      );

      expect(second.stop).toMatchObject({
        kind: "infra",
        cause: "crash",
        details: expect.stringMatching(/No acpx session found/),
      });
      expect(second.session).toBeUndefined();

      const calls = stub.invocations();
      // One de-novo retry: the dead-record set, one new session, then the prompt
      // that also answers NO_SESSION must end the turn, not start another retry.
      expect(calls.filter((args) => args.includes("sessions") && args.includes("new"))).toHaveLength(2);
      const prompts = calls.filter((args) => args.at(-1)?.includes("[[mode:no_session]]"));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).not.toBe(first.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("gives two fresh sessions in the same worktree distinct names", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "implementer"));
      const second = await harness.turn(request(cwd, "reviewer"));

      expect(first.session!.id).not.toBe(second.session!.id);
      const names = stub.invocations().flatMap((args) => {
        const index = args.indexOf("--name");
        return index >= 0 ? [args[index + 1]!] : [];
      });
      expect(new Set(names)).toEqual(new Set([first.session!.id, second.session!.id]));
    } finally {
      stub.cleanup();
    }
  });

  it("maps codex usage into Usage and leaves cost to the price table", async () => {
    // The live codex probe reported in 556 / cache-read 5760 / out 4.
    const stub = createAcpxStub({
      codexUsage: { totalTokens: 6320, inputTokens: 556, cachedReadTokens: 5760, outputTokens: 4, thoughtTokens: 0 },
    });
    const harness = new AcpxHarness({ agent: "codex", binary: stub.binary });
    try {
      const result = await harness.turn({
        ...request(path.dirname(stub.binary), "Say [[text:PONG]]"),
        model: { id: "deepseek-v4.1-flash" },
        effort: "high",
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.usage).toEqual({
        in: 556,
        cacheRead: 5760,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 4,
        reasoningOut: 0,
      });
      expect(result.usage.costUsd).toBeUndefined();
      expect(priceUsage(result.usage, "deepseek-v4.1-flash", { "deepseek-v4.1-flash": CODEX_PRICE })).toBeCloseTo(
        (556 * 0.15 + 5760 * 0.003 + 4 * 0.6) / 1_000_000,
        12
      );

      const set = stub.invocations().find((args) => args.includes("set"))!;
      expect(set.slice(set.indexOf("set"))).toEqual(["set", "reasoning_effort", "high"]);
      const prompt = stub.invocations().at(-1)!;
      expect(prompt[prompt.indexOf("--model") + 1]).toBe("deepseek-v4.1-flash");
      expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("codex"));
    } finally {
      stub.cleanup();
    }
  });

  it("runs agy through acpx's raw agent route and splits the effort suffix", async () => {
    const stub = createAcpxStub({
      agyUsage: {
        totalTokens: 8883,
        inputTokens: 8783,
        cachedReadTokens: 0,
        cachedWriteTokens: 21,
        outputTokens: 79,
        thoughtTokens: 77,
      },
    });
    const harness = new AcpxHarness({ agent: "agy", binary: stub.binary, agyBinary: AGY_BIN });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(
        request(cwd, "Say [[text:PONG]]", { model: { id: "gemini-3.8-flash-high" } })
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      // The alias's model id is recorded; only acpx's --model gets the base id.
      expect(result.model).toEqual({ id: "gemini-3.8-flash-high", effort: "high" });
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
      const create = calls.find((args) => args.includes("sessions") && args.includes("new"))!;
      const set = calls.find((args) => args.includes("set"))!;
      const prompt = calls.find((args) => args.at(-1)?.includes("[[text:PONG]]"))!;

      // agy's built-in acpx route spawns an absent binary, so the resolved agy
      // executable is the raw ACP agent; it needs approve-all or every shell
      // command is denied.
      for (const args of [create, set, prompt]) {
        expect(args[args.indexOf("--agent") + 1]).toBe(`${AGY_BIN} acp`);
      }
      expect(create.indexOf("--approve-all")).toBeLessThan(create.indexOf("sessions"));
      expect(set.indexOf("--approve-all")).toBeLessThan(set.indexOf("set"));
      expect(prompt.indexOf("--approve-all")).toBeLessThan(prompt.indexOf("prompt"));

      expect(create).toContain("--name");
      expect(create).toContain(result.session!.id);
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
    } finally {
      stub.cleanup();
    }
  });

  it("resumes an agy session from a second process without creating a new one", async () => {
    const stub = createAcpxStub();
    const options = { agent: "agy" as const, binary: stub.binary, agyBinary: AGY_BIN };
    try {
      const cwd = path.dirname(stub.binary);
      const first = await new AcpxHarness(options).turn(
        request(cwd, "first", { model: { id: "gemini-3.8-flash-high" } })
      );
      const second = await new AcpxHarness(options).turn(
        request(cwd, "second [[text:ALPHA]]", {
          model: { id: "gemini-3.8-flash-high" },
          session: first.session,
        })
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);
      expect(second.model).toEqual({ id: "gemini-3.8-flash-high", effort: "high" });

      const calls = stub.invocations();
      expect(calls.filter((args) => args.includes("sessions") && args.includes("new"))).toHaveLength(1);
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

  it("keeps an agy model id whose effort word is part of the name", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "agy", binary: stub.binary, agyBinary: AGY_BIN });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "Say [[text:PONG]]", {
          model: { id: "gpt-oss-120b-medium" },
        })
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

  it("spawns the agy binary pre-flight resolved from AGY_PATH", async () => {
    const stub = createAcpxStub();
    const previous = process.env.AGY_PATH;
    process.env.AGY_PATH = "/opt/agy-from-env/agy";
    try {
      const harness = new AcpxHarness({ agent: "agy", binary: stub.binary });
      await harness.turn(request(path.dirname(stub.binary), "Say [[text:PONG]]"));

      const prompt = stub.invocations().at(-1)!;
      expect(prompt[prompt.indexOf("--agent") + 1]).toBe("/opt/agy-from-env/agy acp");
    } finally {
      if (previous === undefined) delete process.env.AGY_PATH;
      else process.env.AGY_PATH = previous;
      stub.cleanup();
    }
  });

  it("advertises agy's session effort levels and cache usage", async () => {
    const harness = new AcpxHarness({ agent: "agy", binary: "/nonexistent/agy" });
    expect(await harness.caps({ id: "gemini-3.8-flash-high" })).toEqual({
      resume: true,
      compact: "none",
      fork: false,
      subagents: "none",
      structuredOutput: "none",
      effort: ["low", "medium", "high"],
      usage: { cache: true, cost: false },
    });
  });

  it("maps NO_SESSION, a bad model, provider quota and a bare exit to scrubbed stops", async () => {
    const cases = [
      {
        mode: "no_session",
        stop: (stop: any) => stop.kind === "infra" && stop.cause === "crash" && /No acpx session found/.test(stop.details),
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
      const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
      try {
        const result = await harness.turn(
          request(path.dirname(stub.binary), `[[mode:${testCase.mode}]]`)
        );
        expect(testCase.stop(result.stop)).toBe(true);
      } finally {
        stub.cleanup();
      }
    }
  });

  it("maps a cancelled stop reason to cancelled even though acpx exits 0", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "codex", binary: stub.binary });
    try {
      const result = await harness.turn(
        request(path.dirname(stub.binary), "[[mode:cancelled]]")
      );
      expect(result.stop).toEqual({ kind: "cancelled" });
    } finally {
      stub.cleanup();
    }
  });

  it("rejects a session bound to another cwd instead of reusing its acpx record", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({ agent: "pi", binary: stub.binary });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      await expect(
        harness.turn(request(path.join(cwd, "elsewhere"), "second", { session: first.session }))
      ).rejects.toThrow(/cwd-bound/);
    } finally {
      stub.cleanup();
    }
  });
});
