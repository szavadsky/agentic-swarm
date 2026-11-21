import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { isRetryableInfra } from "../../src/harness/fallback.js";
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

async function edgeCaseFirstRepairTurnMeasuresPart1(
  initialStub: ReturnType<typeof createAcpxStub>,
  harness1: AcpxHarness,
) {
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
    sessionDir: path.dirname(repairStub.binary),
    acpx: CODEX_ACPX,
    retry: { retries: 0 },
  });

  return { cwd, initial, repairStub, harness2 };
}

async function edgeCaseFirstRepairTurnMeasuresPart2(
  scope: Awaited<ReturnType<typeof edgeCaseFirstRepairTurnMeasuresPart1>>,
) {
  const { harness2, cwd, initial, repairStub } = scope;
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
}

async function edgeCasePiFirstRepairTurnMeasuresPart1(
  initialStub: ReturnType<typeof createAcpxStub>,
  harness1: AcpxHarness,
) {
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

  return { cwd, initial, repairStub };
}

async function edgeCasePiFirstRepairTurnMeasuresPart2(
  scope: Awaited<ReturnType<typeof edgeCasePiFirstRepairTurnMeasuresPart1>>,
) {
  const { repairStub, cwd, initial } = scope;
  const harness2 = new AcpxHarness({
    id: "pi",
    binary: repairStub.binary,
    sessionDir: path.dirname(repairStub.binary),
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
}

function acpxZeroUsageClassificationPart8() {
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
      sessionDir: path.dirname(stub.binary),
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
}

function acpxZeroUsageClassificationPart9() {
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
      sessionDir: path.dirname(stub.binary),
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
}

function acpxZeroUsageClassificationPart10() {
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
      sessionDir: path.dirname(stub.binary),
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
}

function acpxZeroUsageClassificationPart11() {
  it("edge case: first repair turn measures zero usage and stops as infra", async () => {
    // Initial turn did real work (nonzero usage) but failed to write deliverable
    const initialStub = createAcpxStub({
      usage: { totalTokens: 100, inputTokens: 90, outputTokens: 10 },
    });
    const harness1 = new AcpxHarness({
      id: "codex",
      binary: initialStub.binary,
      sessionDir: path.dirname(initialStub.binary),
      acpx: CODEX_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const scope1 = await edgeCaseFirstRepairTurnMeasuresPart1(
        initialStub,
        harness1,
      );
      await edgeCaseFirstRepairTurnMeasuresPart2(scope1);
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
      sessionDir: path.dirname(initialStub.binary),
      acpx: PI_ACPX,
      retry: FAST_RETRY,
    });
    try {
      const scope1 = await edgeCasePiFirstRepairTurnMeasuresPart1(
        initialStub,
        harness1,
      );
      await edgeCasePiFirstRepairTurnMeasuresPart2(scope1);
    } finally {
      initialStub.cleanup();
    }
  });
}

function acpxZeroUsageClassificationPart12() {
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
      sessionDir: path.dirname(stub.binary),
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
}

function acpxZeroUsageClassificationPart13() {
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
      sessionDir: path.dirname(stub.binary),
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
}

describe("acpx-zero-usage classification", () => {
  acpxZeroUsageClassificationPart8();

  acpxZeroUsageClassificationPart9();

  acpxZeroUsageClassificationPart10();

  acpxZeroUsageClassificationPart11();

  acpxZeroUsageClassificationPart12();

  acpxZeroUsageClassificationPart13();
});
