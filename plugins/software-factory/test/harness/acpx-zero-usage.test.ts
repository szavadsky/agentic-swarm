import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { isRetryableInfra } from "../../src/harness/fallback.js";
import { countOutcomeRepairs } from "../../src/kernel/metrics.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };
// Default backoff sleeps 1s + 2s on every retryable turn; classification tests
// keep the retries (same attempts) but not the wait.
const FAST_RETRY = { baseDelayMs: 1, maxDelayMs: 1 };

const CODEX_ACPX: AcpxConfig = {
  agent: "codex",
  effort: { configId: "reasoning_effort" },
  usage: { cache: true },
};

const PI_ACPX: AcpxConfig = {
  agent: "pi",
  effort: { configId: "thought_level" },
  usage: { cache: true, command: "/session" },
};

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "opencode-go/primary" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

describe("acpx-zero-usage classification", () => {
  it("(1) codex shape (end_turn, 429 text, no usage frame) yields infra: quota with details carrying 429 text", async () => {
    const errorText =
      "exceeded retry limit, last status: 429 Too Many Requests";
    const stub = createAcpxStub({
      sessionInfoError: {
        httpStatusCode: 429,
        message: "Reconnecting... 5/5",
        additionalDetails: errorText,
        willRetry: true,
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(
        request(cwd, `Say [[text:${errorText}]]`),
      );

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: expect.stringContaining(errorText),
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("(2) pi shape (end_turn, no text, usage command reports zero tokens) yields infra: rate that fallback chain retries", async () => {
    const stub = createAcpxStub({
      sessionUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "Say [[text:]]"));

      expect(result.stop.kind).toBe("infra");
      expect(result.stop).toEqual({
        kind: "infra",
        cause: "rate",
        details: expect.stringMatching(/zero.*usage/i),
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("(3) in both shapes the next fallback model runs and no outcome-repair turn is spent", async () => {
    // 3a: codex shape hops to fallback
    const codexStub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          sessionInfoError: {
            httpStatusCode: 429,
            message: "Reconnecting... 5/5",
            additionalDetails:
              "exceeded retry limit, last status: 429 Too Many Requests",
            willRetry: true,
          },
          reply: "exceeded retry limit, last status: 429 Too Many Requests",
        },
        "opencode-go/fallback": {
          reply: "delivered by fallback",
          usage: { totalTokens: 100, inputTokens: 90, outputTokens: 10 },
        },
      },
    });
    const codexHarness = new AcpxHarness({
      id: "codex",
      binary: codexStub.binary,
      acpx: CODEX_ACPX,
      retry: { retries: 0 },
    });
    try {
      const cwd = path.dirname(codexStub.binary);
      const result = await codexHarness.turn({
        ...request(cwd, "task prompt"),
        model: { id: "opencode-go/primary" },
        fallbacks: [{ id: "opencode-go/fallback" }],
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.model.id).toBe("opencode-go/fallback");
      expect(result.text).toBe("delivered by fallback");
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts?.[0]?.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: expect.stringContaining("429 Too Many Requests"),
      });
      expect(result.attempts?.[1]?.stop).toEqual({ kind: "done" });
      expect(countOutcomeRepairs(result.attempts ?? [])).toBe(0);
    } finally {
      codexStub.cleanup();
    }

    // 3b: pi shape hops to fallback
    const piStub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          sessionUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          reply: "",
        },
        "opencode-go/fallback": {
          sessionUsage: { input: 150, output: 20, cacheRead: 5, cacheWrite: 2 },
          reply: "delivered by pi fallback",
        },
      },
    });
    const piHarness = new AcpxHarness({
      id: "pi",
      binary: piStub.binary,
      acpx: PI_ACPX,
      retry: { retries: 0 },
    });
    try {
      const cwd = path.dirname(piStub.binary);
      const result = await piHarness.turn({
        ...request(cwd, "task prompt"),
        model: { id: "opencode-go/primary" },
        fallbacks: [{ id: "opencode-go/fallback" }],
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.model.id).toBe("opencode-go/fallback");
      expect(result.text).toBe("delivered by pi fallback");
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts?.[0]?.stop).toEqual({
        kind: "infra",
        cause: "rate",
        details: expect.stringMatching(/zero.*usage/i),
      });
      expect(result.attempts?.[1]?.stop).toEqual({ kind: "done" });
      expect(countOutcomeRepairs(result.attempts ?? [])).toBe(0);
    } finally {
      piStub.cleanup();
    }
  });

  it("(4a) done stays done for completed turn with measured nonzero usage whose text mentions 429", async () => {
    const stub = createAcpxStub({
      usage: {
        totalTokens: 110,
        inputTokens: 100,
        outputTokens: 10,
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(
        request(
          cwd,
          "Say [[text:Got HTTP 429 from remote API during analysis, but recovered.]]",
        ),
      );

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toContain("429");
      expect(result.usage.in).toBe(100);
      expect(result.usage.out).toBe(10);
    } finally {
      stub.cleanup();
    }
  });

  it("(4b) done stays done for resumed pi turn whose usage is unknown (no baseline)", async () => {
    const stub = createAcpxStub({
      sessionUsage: { input: 100, output: 10, cacheRead: 5, cacheWrite: 2 },
    });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first [[text:ONE]]"));
      expect(first.stop).toEqual({ kind: "done" });
      expect(first.session).toBeDefined();
      if (!first.session) throw new Error("session missing");

      const withoutBaseline = { ...first.session };
      delete withoutBaseline.cumulativeUsage;

      const resumed = await harness.turn(
        request(cwd, "second [[text:TWO]]", { session: withoutBaseline }),
      );

      expect(resumed.stop).toEqual({ kind: "done" });
      expect(resumed.text).toBe("TWO");
      expect(resumed.usage.in).toBe(0);
      expect(resumed.usage.out).toBe(0);
    } finally {
      stub.cleanup();
    }
  });

  it("(4c) done stays done for an agent with no usage config (claude-code)", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "claude-code",
      binary: stub.binary,
      acpx: { agent: "claude-code" },
      options: { args: ["--approve-all"] },
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "Say [[text:PONG]]"));

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
    } finally {
      stub.cleanup();
    }
  });

  it("codex willRetry: true reconnect frames on a turn that later recovers are not errors", async () => {
    const stub = createAcpxStub({
      sessionInfoError: {
        httpStatusCode: 429,
        message: "Reconnecting... 1/5",
        additionalDetails:
          "exceeded retry limit, last status: 429 Too Many Requests",
        willRetry: true,
      },
      usage: {
        totalTokens: 105,
        inputTokens: 100,
        outputTokens: 5,
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "Say [[text:RECOVERED]]"));

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("RECOVERED");
      expect(result.usage.in).toBe(100);
      expect(result.usage.out).toBe(5);
    } finally {
      stub.cleanup();
    }
  });

  it("yields infra: quota from adapter error metadata when agent text carries no error pattern", async () => {
    const stub = createAcpxStub({
      sessionInfoError: {
        httpStatusCode: 429,
        message: "Reconnecting... 5/5",
        additionalDetails:
          "exceeded retry limit, last status: 429 Too Many Requests",
        willRetry: true,
      },
      modelBehaviors: {
        "opencode-go/primary": {
          reply: "task output with no error mention",
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "task prompt"));

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: expect.stringContaining("429 Too Many Requests"),
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("yields infra: quota from adapter error metadata when agent text is empty", async () => {
    const stub = createAcpxStub({
      sessionInfoError: {
        httpStatusCode: 429,
        message: "Reconnecting... 5/5",
        additionalDetails:
          "exceeded retry limit, last status: 429 Too Many Requests",
        willRetry: true,
      },
      modelBehaviors: {
        "opencode-go/primary": {
          reply: "",
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "Say [[text:]]"));

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: expect.stringContaining("429 Too Many Requests"),
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("falls through to rate stop when adapter error has no specific cause and reply is empty", async () => {
    const stub = createAcpxStub({
      sessionInfoError: {
        willRetry: true,
      },
      modelBehaviors: {
        "opencode-go/primary": {
          reply: "",
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "Say [[text:]]"));

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "rate",
        details: "completed prompt with zero measured usage",
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("falls back to zero-usage rate stop when text matches no pattern and no usage frame is sent", async () => {
    const stub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          reply: "Internal server error",
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "task prompt"));

      expect(result.stop).toEqual({
        kind: "infra",
        cause: "rate",
        details: "Internal server error",
      });
      expect(isRetryableInfra(result.stop)).toBe(true);
    } finally {
      stub.cleanup();
    }
  });

  it("edge case: first repair turn measures zero usage and stops as infra", async () => {
    // Initial turn did real work (nonzero usage) but failed to write deliverable
    const initialStub = createAcpxStub({
      usage: { totalTokens: 100, inputTokens: 90, outputTokens: 10 },
    });
    const harness1 = new AcpxHarness({
      id: "codex",
      binary: initialStub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(initialStub.binary);
      const initial = await harness1.turn(request(cwd, "Say [[text:PONG]]"));
      expect(initial.stop).toEqual({ kind: "done" });
      expect(initial.usage.in).toBe(90);

      expect(initial.session).toBeDefined();
      if (!initial.session) throw new Error("session missing");
      const sessionId = initial.session.id;

      // Subsequent repair turn on same session hits quota: zero usage
      const repairStub = createAcpxStub({
        sessionInfoError: {
          httpStatusCode: 429,
          message: "Reconnecting... 5/5",
          additionalDetails:
            "exceeded retry limit, last status: 429 Too Many Requests",
          willRetry: true,
        },
      });
      // Copy session record into repairStub's state directory so resume succeeds on first attempt
      const initialSessionFile = path.join(
        path.dirname(initialStub.binary),
        "state",
        `session-${sessionId}`,
      );
      const repairSessionFile = path.join(
        path.dirname(repairStub.binary),
        "state",
        `session-${sessionId}`,
      );
      fs.mkdirSync(path.dirname(repairSessionFile), { recursive: true });
      fs.copyFileSync(initialSessionFile, repairSessionFile);

      const harness2 = new AcpxHarness({
        id: "codex",
        binary: repairStub.binary,
        acpx: CODEX_ACPX,
        retry: { retries: 0 },
      });
      try {
        const repairTurn = await harness2.turn(
          request(
            cwd,
            "delivery-repair [[text:exceeded retry limit, last status: 429 Too Many Requests]]",
            { session: initial.session },
          ),
        );
        expect(repairTurn.attempts).toHaveLength(1);
        expect(repairTurn.attempts?.[0]?.stop).toEqual({
          kind: "infra",
          cause: "quota",
          details: expect.stringContaining("429 Too Many Requests"),
        });
        expect(repairTurn.stop).toEqual({
          kind: "infra",
          cause: "quota",
          details: expect.stringContaining("429 Too Many Requests"),
        });
      } finally {
        repairStub.cleanup();
      }
    } finally {
      initialStub.cleanup();
    }
  });

  it("edge case: pi first repair turn measures zero usage on unchanged session total and stops as infra: rate", async () => {
    const initialStub = createAcpxStub({
      sessionUsage: { input: 100, output: 20 },
    });
    const harness1 = new AcpxHarness({
      id: "pi",
      binary: initialStub.binary,
      acpx: PI_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(initialStub.binary);
      const initial = await harness1.turn(request(cwd, "initial prompt"));
      expect(initial.stop).toEqual({ kind: "done" });
      expect(initial.usage.in).toBe(100);
      expect(initial.session?.cumulativeUsage).toMatchObject({
        in: 100,
        out: 20,
      });

      // Subsequent repair turn on same session adds no tokens (unchanged cumulative)
      const repairStub = createAcpxStub({
        modelBehaviors: {
          "opencode-go/primary": {
            reply: "",
          },
        },
      });
      expect(initial.session).toBeDefined();
      if (!initial.session) throw new Error("session missing");
      const sessionId = initial.session.id;

      // Copy session and usage records into repairStub's state directory
      const initialSessionFile = path.join(
        path.dirname(initialStub.binary),
        "state",
        `session-${sessionId}`,
      );
      const repairSessionFile = path.join(
        path.dirname(repairStub.binary),
        "state",
        `session-${sessionId}`,
      );
      const initialUsageFile = path.join(
        path.dirname(initialStub.binary),
        "state",
        `usage-${sessionId}`,
      );
      const repairUsageFile = path.join(
        path.dirname(repairStub.binary),
        "state",
        `usage-${sessionId}`,
      );
      fs.mkdirSync(path.dirname(repairSessionFile), { recursive: true });
      fs.copyFileSync(initialSessionFile, repairSessionFile);
      fs.copyFileSync(initialUsageFile, repairUsageFile);

      const harness2 = new AcpxHarness({
        id: "pi",
        binary: repairStub.binary,
        acpx: PI_ACPX,
        retry: { retries: 0 },
      });
      try {
        const repairTurn = await harness2.turn({
          ...request(cwd, "delivery-repair"),
          session: initial.session,
        });
        expect(repairTurn.attempts).toHaveLength(1);
        expect(repairTurn.stop).toEqual({
          kind: "infra",
          cause: "rate",
          details: expect.stringMatching(/zero.*usage/i),
        });
      } finally {
        repairStub.cleanup();
      }
    } finally {
      initialStub.cleanup();
    }
  });

  it("redacts token-shaped secrets in zero-usage rate fallback details", async () => {
    const rawReply =
      "failed: api_key=sk-ABCDEFGHIJKLMNOP1234 and token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const stub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          reply: rawReply,
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "task prompt"));

      expect(result.stop.kind).toBe("infra");
      if (result.stop.kind === "infra") {
        expect(result.stop.cause).toBe("rate");
        expect(result.stop.details).toContain("[redacted]");
        expect(result.stop.details).not.toContain("sk-ABCDEFGHIJKLMNOP1234");
        expect(result.stop.details).not.toContain(
          "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
        );
      }
    } finally {
      stub.cleanup();
    }
  });

  it("caps zero-usage rate details over 500 chars within MAX_DETAILS_CHARS", async () => {
    const longReply = `failure: ${"x".repeat(600)}`;
    const stub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          reply: longReply,
        },
      },
    });
    const harness = new AcpxHarness({
      id: "codex",
      binary: stub.binary,
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "task prompt"));

      expect(result.stop.kind).toBe("infra");
      if (result.stop.kind === "infra") {
        expect(result.stop.cause).toBe("rate");
        expect(result.stop.details).toBeDefined();
        const details = result.stop.details ?? "";
        expect(details.length).toBeLessThanOrEqual(501);
        expect(details.startsWith("…")).toBe(true);
      }
    } finally {
      stub.cleanup();
    }
  });

  it("measures zero usage from usage config without command regardless of agent name", async () => {
    const stub = createAcpxStub({
      modelBehaviors: {
        "opencode-go/primary": {
          reply: "some unclassified reply",
        },
      },
    });
    const harness = new AcpxHarness({
      id: "pi-no-command",
      binary: stub.binary,
      acpx: {
        agent: "pi",
        usage: { cache: true },
      },
      retry: FAST_RETRY,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "task prompt"));

      expect(result.stop.kind).toBe("infra");
      if (result.stop.kind === "infra") {
        expect(result.stop.cause).toBe("rate");
        expect(result.stop.details).toBe("some unclassified reply");
      }
    } finally {
      stub.cleanup();
    }
  });
});
