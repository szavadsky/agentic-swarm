import { describe, expect, it } from "bun:test";
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

async function retriesDeNovoWhenResumedSessionSPart1(
  stub: ReturnType<typeof createAcpxStub>,
  harness: AcpxHarness,
) {
  const cwd = path.dirname(stub.binary);
  const first = await harness.turn(request(cwd, "first", { effort: "high" }));
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

  return { second, prompts };
}

async function retriesDeNovoWhenResumedSessionSPart2(
  scope: Awaited<ReturnType<typeof retriesDeNovoWhenResumedSessionSPart1>>,
) {
  const { prompts, second } = scope;
  expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).toBe(second.session!.id);
}

function registerAcpxHarnessPart10(): void {
  it("retries de novo with a new name when the resumed session is gone", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
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
}

function registerAcpxHarnessPart11(): void {
  it("retries de novo when the resumed session's effort set answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const scope1 = await retriesDeNovoWhenResumedSessionSPart1(stub, harness);
      await retriesDeNovoWhenResumedSessionSPart2(scope1);
    } finally {
      stub.cleanup();
    }
  });
}

/** Asserts the second NO_SESSION answer ends the turn after one de-novo retry. */
function expectNoSessionRetry(
  second: Awaited<ReturnType<AcpxHarness["turn"]>>,
  calls: string[][],
  firstSessionId: string,
): void {
  // Bun's toMatchObject mutates a received object when a matcher is nested,
  // and the final attempt shares this stop; assert the fields directly.
  expect(second.stop.kind).toBe("infra");
  if (second.stop.kind !== "infra") throw new Error("expected an infra stop");
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
  // One de-novo retry: the dead-record set, one new session, then the prompt
  // that also answers NO_SESSION must end the turn, not start another retry.
  expect(
    calls.filter((args) => args.includes("sessions") && args.includes("new")),
  ).toHaveLength(2);
  const prompts = calls.filter((args) =>
    args.at(-1)?.includes("[[mode:no_session]]"),
  );
  expect(prompts).toHaveLength(1);
  expect(prompts[0]![prompts[0]!.indexOf("-s") + 1]).not.toBe(firstSessionId);
}

function registerAcpxHarnessPart12(): void {
  it("stops with infra details and no session when the retry also answers NO_SESSION", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
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

      expectNoSessionRetry(second, stub.invocations(), first.session!.id);
    } finally {
      stub.cleanup();
    }
  });
}

function registerAcpxHarnessPart13(): void {
  it("gives two fresh sessions in the same worktree distinct names", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
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
}

function registerAcpxHarnessPart14(): void {
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
      retention: "short" as const,
      id: "codex",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
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
}

describe("AcpxHarness", () => {
  registerAcpxHarnessPart10();

  registerAcpxHarnessPart11();

  registerAcpxHarnessPart12();

  registerAcpxHarnessPart13();

  registerAcpxHarnessPart14();
});
