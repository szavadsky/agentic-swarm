import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { priceUsage } from "../../src/kernel/pricing.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };
const CODEX_PRICE = {
  input: 0.15,
  cachedInput: 0.003,
  output: 0.6,
  reasoning: 0.6,
};
const AGY_BIN = "/opt/agy-test/bin/agy";
const PI_BANNER = "pi v1.5.2\n---\n\n## Skills\n";

const PI_ACPX: AcpxConfig = {
  agent: "pi",
  effort: {
    configId: "thought_level",
  },
  usage: { cache: false },
};
const CODEX_ACPX: AcpxConfig = {
  agent: "codex",
  effort: {
    configId: "reasoning_effort",
  },
  usage: { cache: true },
};
const agyAcpx = (agent: string): AcpxConfig => ({
  agent,
  raw: true,
  args: ["--approve-all"],
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

describe("AcpxHarness", () => {
  it("creates a named pi session, passes model and effort, and returns the last agent text", async () => {
    const stub = createAcpxStub({ banner: PI_BANNER });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const outcomePath = path.join(cwd, "outbox", "outcome.yaml");
      const result = await harness.turn(
        request(
          cwd,
          `Say [[text:PONG]]\n\n- outcome path: \`${outcomePath}\``,
          {
            effort: "high",
            outcomePath,
          },
        ),
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.model).toEqual({
        id: "opencode-go/beam-free",
        effort: "high",
      });
      expect(result.session?.harness).toBe("pi");
      expect(result.session?.id).toMatch(/^pi-/);
      // pi reports no usage on the prompt; absence stays unknown, not a fake zero cost.
      expect(result.usage.costUsd).toBeUndefined();
      expect(result.usage.in).toBe(0);

      const calls = stub.invocations();
      const create = calls.find(
        (args) => args.includes("sessions") && args.includes("new"),
      )!;
      const set = calls.find((args) => args.includes("set"))!;
      const prompt = calls.find((args) =>
        args.at(-1)?.includes("[[text:PONG]]"),
      )!;

      // The stub logs argv and never writes the outcome, so this is the path the
      // adapter actually handed the agent, not a file the stub invented.
      expect(prompt.at(-1)).toContain(`outcome path: \`${outcomePath}\``);

      for (const args of [create, set, prompt]) {
        expect(args.indexOf("--format")).toBeLessThan(args.indexOf("pi"));
        expect(args.indexOf("--cwd")).toBeLessThan(args.indexOf("pi"));
      }
      expect(create).toContain("--name");
      expect(create).toContain(result.session!.id);
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "thought_level",
        "high",
      ]);
      expect(prompt).toContain("--model");
      expect(prompt[prompt.indexOf("--model") + 1]).toBe(
        "opencode-go/beam-free",
      );
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
    const options = { id: "pi", binary: stub.binary, acpx: PI_ACPX };
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

  it("retries de novo with a new name when the resumed session is gone", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session }),
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toMatch(/^pi-/);
      expect(second.session?.id).not.toBe(first.session!.id);

      // The lost resume is recorded, not silently replaced.
      expect(second.attempts?.map((attempt) => attempt.stop)).toEqual([
        {
          kind: "infra",
          cause: "crash",
          details: expect.stringMatching(/No acpx session found/),
        },
        { kind: "done" },
      ]);

      const calls = stub.invocations();
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(2);
      const prompts = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(prompts).toHaveLength(2);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).toBe(
        first.session!.id,
      );
      expect(prompts[1]![prompts[1]!.indexOf("-s") + 1]).toBe(
        second.session!.id,
      );
      // The de-novo start carries the same task input.
      expect(prompts[1]!.at(-1)).toBe(prompts[0]!.at(-1));
    } finally {
      stub.cleanup();
    }
  });

  it("retries de novo when the resumed session's effort set answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(
        request(cwd, "first", { effort: "high" }),
      );
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", {
          session: first.session,
          effort: "high",
        }),
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toMatch(/^pi-/);
      expect(second.session?.id).not.toBe(first.session!.id);
      expect(second.attempts?.map((attempt) => attempt.stop)).toEqual([
        {
          kind: "infra",
          cause: "crash",
          details: expect.stringMatching(/No acpx session found/),
        },
        { kind: "done" },
      ]);

      const calls = stub.invocations();
      const creates = calls.filter(
        (args) => args.includes("sessions") && args.includes("new"),
      );
      expect(creates).toHaveLength(2);
      expect(creates[1]).toContain(second.session!.id);

      const sets = calls.filter((args) => args.includes("set"));
      expect(sets).toHaveLength(3);
      expect(sets[1]![sets[1]!.indexOf("-s") + 1]).toBe(first.session!.id);
      expect(sets[2]![sets[2]!.indexOf("-s") + 1]).toBe(second.session!.id);
      expect(sets[2]!.slice(sets[2]!.indexOf("set"))).toEqual([
        "set",
        "thought_level",
        "high",
      ]);

      const prompts = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).toBe(
        second.session!.id,
      );
    } finally {
      stub.cleanup();
    }
  });

  it("stops with infra details and no session when the retry also answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(
        request(cwd, "first", { effort: "high" }),
      );
      stub.closeSession(first.session!.id);

      const second = await harness.turn(
        request(cwd, "second [[mode:no_session]]", {
          session: first.session,
          effort: "high",
        }),
      );

      // Bun's toMatchObject mutates a received object when a matcher is nested,
      // and the final attempt shares this stop; assert the fields directly.
      expect(second.stop.kind).toBe("infra");
      if (second.stop.kind !== "infra")
        throw new Error("expected an infra stop");
      expect(second.stop.cause).toBe("crash");
      expect(second.stop.details).toContain("No acpx session found");
      expect(second.session).toBeUndefined();
      // The first lost record and the failed de-novo start are both recorded.
      expect(second.attempts?.map((attempt) => attempt.stop.kind)).toEqual([
        "infra",
        "infra",
      ]);
      for (const attempt of second.attempts ?? []) {
        expect(attempt.stop.kind).toBe("infra");
        if (attempt.stop.kind !== "infra") continue;
        expect(attempt.stop.cause).toBe("crash");
        expect(attempt.stop.details).toContain("No acpx session found");
      }

      const calls = stub.invocations();
      // One de-novo retry: the dead-record set, one new session, then the prompt
      // that also answers NO_SESSION must end the turn, not start another retry.
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(2);
      const prompts = calls.filter((args) =>
        args.at(-1)?.includes("[[mode:no_session]]"),
      );
      expect(prompts).toHaveLength(1);
      expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).not.toBe(
        first.session!.id,
      );
    } finally {
      stub.cleanup();
    }
  });

  it("gives two fresh sessions in the same worktree distinct names", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "implementer"));
      const second = await harness.turn(request(cwd, "reviewer"));

      expect(first.session!.id).not.toBe(second.session!.id);
      const names = stub.invocations().flatMap((args) => {
        const index = args.indexOf("--name");
        return index >= 0 ? [args[index + 1]!] : [];
      });
      expect(new Set(names)).toEqual(
        new Set([first.session!.id, second.session!.id]),
      );
    } finally {
      stub.cleanup();
    }
  });

  it("maps codex usage into Usage and leaves cost to OpenRouter pricing", async () => {
    // The live codex probe reported in 556 / cache-read 5760 / out 4.
    const stub = createAcpxStub({
      usage: {
        totalTokens: 6320,
        inputTokens: 556,
        cachedReadTokens: 5760,
        outputTokens: 4,
        thoughtTokens: 0,
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
    });
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
      expect(
        priceUsage(result.usage, "deepseek-v4.1-flash", {
          "deepseek-v4.1-flash": CODEX_PRICE,
        }),
      ).toBeCloseTo((556 * 0.15 + 5760 * 0.003 + 4 * 0.6) / 1_000_000, 12);

      const set = stub.invocations().find((args) => args.includes("set"))!;
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "reasoning_effort",
        "high",
      ]);
      const prompt = stub.invocations().at(-1)!;
      expect(prompt[prompt.indexOf("--model") + 1]).toBe("deepseek-v4.1-flash");
      expect(prompt.indexOf("--model")).toBeLessThan(prompt.indexOf("codex"));
    } finally {
      stub.cleanup();
    }
  });

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
      acpx: agyAcpx(`${AGY_BIN} acp`),
    });
    try {
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
      const prompt = calls.find((args) =>
        args.at(-1)?.includes("[[text:PONG]]"),
      )!;

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
    const options = {
      id: "agy",
      binary: stub.binary,
      acpx: agyAcpx(`${AGY_BIN} acp`),
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

  it("keeps an agy model id whose effort word is part of the name", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "agy",
      binary: stub.binary,
      acpx: agyAcpx(`${AGY_BIN} acp`),
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

  it("advertises agy's static caps without inventing live effort levels", async () => {
    const harness = new AcpxHarness({
      id: "agy",
      binary: "/nonexistent/agy",
      acpx: agyAcpx("/nonexistent/agy acp"),
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

  it("takes the turn config from opaque when the kernel passes one", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
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

  it("runs a new agent from config with no code", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "nova",
      binary: stub.binary,
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
        acpx: PI_ACPX,
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

  it("maps a cancelled stop reason to cancelled even though acpx exits 0", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
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

  it("starts de novo instead of reusing a session bound to another cwd", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
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

  it("abort kills the prompt child and reports cancelled", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "child.pid");
    process.env.ACPX_STUB_PID_FILE = pidFile;
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
      delete process.env.ACPX_STUB_PID_FILE;
      stub.cleanup();
    }
  });

  it("abort after resolve is a no-op", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    const cwd = path.dirname(stub.binary);
    const pidFile = path.join(cwd, "child.pid");
    process.env.ACPX_STUB_PID_FILE = pidFile;
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
      delete process.env.ACPX_STUB_PID_FILE;
      stub.cleanup();
    }
  });

  it("a pre-aborted signal reports cancelled without spawning", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
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
});

describe("AcpxHarness prompt result precedence", () => {
  function turnOn(
    stub: ReturnType<typeof createAcpxStub>,
    prompt: string,
    extra: Record<string, unknown> = {},
  ) {
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
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
});
