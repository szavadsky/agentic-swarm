import { describe, expect, it } from "bun:test";
import path from "node:path";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

// Default backoff sleeps 1s + 2s on every retryable turn; classification tests
// keep the retries (same attempts) but not the wait.
const FAST_RETRY = { baseDelayMs: 1, maxDelayMs: 1 };

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "fake-host/primary" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

function acpxZeroUsageClassificationPart14() {
  it("measures zero usage from usage config without command regardless of agent name", async () => {
    const stub = createAcpxStub({
      modelBehaviors: {
        "fake-host/primary": {
          reply: "some unclassified reply",
        },
      },
    });
    const harness = new AcpxHarness({
      retention: "short" as const,
      id: "agent-a-no-command",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: {
        agent: "fake-agent",
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
}

describe("acpx-zero-usage classification", () => {
  acpxZeroUsageClassificationPart14();
});
