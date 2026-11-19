// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import {
  type AttemptOutput,
  isRetryableInfra,
  modelChain,
  runWithFallbacks,
} from "../../src/harness/fallback.js";
import type { ModelRef, Stop } from "../../src/harness/types.js";
import { zeroUsage } from "../../src/harness/usage.js";

const A: ModelRef = { id: "provider/a" };
const B: ModelRef = { id: "provider/b" };

function output(stop: Stop, value = "ok"): AttemptOutput<string> {
  return { stop, usage: zeroUsage(), value };
}

const quota: Stop = { kind: "infra", cause: "quota" };
const auth: Stop = { kind: "infra", cause: "auth" };
const done: Stop = { kind: "done" };

// The recorded quota stops that clustered retries: a provider-stated wait in
// hours/minutes and the millisecond header a 429 carries. Both exceed any
// backoff the policy would sleep.
const statedQuotaDetails = [
  "⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 129h55m29s.",
  "429 Rate limit exceeded: free-models-per-day-high-balance. retry-after-ms=38240413",
];

describe("runWithFallbacks", () => {
  it("returns the primary result without touching fallbacks", async () => {
    const calls: string[] = [];
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 2, baseDelayMs: 0 },
      run: async (model) => {
        calls.push(model.id);
        return output(done, model.id);
      },
    });
    expect(calls).toEqual([A.id]);
    expect(result.attempts).toHaveLength(1);
    expect(result.outcome.value).toBe(A.id);
  });

  it("retries a quota failure on the same model before falling back", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const result = await runWithFallbacks({
      primary: A,
      retry: { retries: 1, baseDelayMs: 10, maxDelayMs: 10 },
      run: async (model) => {
        calls.push(model.id);
        return calls.length === 1 ? output(quota) : output(done, model.id);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(calls).toEqual([A.id, A.id]);
    expect(sleeps).toEqual([10]);
    expect(result.outcome.stop).toEqual(done);
    expect(result.attempts.map((a) => a.model.id)).toEqual([A.id, A.id]);
  });

  it("advances without retrying when a quota stop states a wait beyond the window", async () => {
    for (const details of statedQuotaDetails) {
      const calls: string[] = [];
      const stop: Stop = { kind: "infra", cause: "quota", details };
      const result = await runWithFallbacks({
        primary: A,
        fallbacks: [B],
        retry: { retries: 2, baseDelayMs: 10, maxDelayMs: 8_000 },
        run: async (model) => {
          calls.push(model.id);
          return output(stop, model.id);
        },
        sleep: async () => {
          throw new Error("must not sleep");
        },
      });
      // One call per dead leg: no retry on the primary, straight to the next.
      expect(calls).toEqual([A.id, B.id]);
      expect(result.attempts.map((a) => a.model.id)).toEqual([A.id, B.id]);
      expect(result.outcome.stop).toEqual(stop);
    }
  });

  it("keeps the bounded retries within the window and for other causes", async () => {
    const cases = [
      { cause: "quota", details: "retry-after-ms=8000" },
      { cause: "rate", details: "retry-after-ms=38240413" },
      { cause: "network", details: "retry-after-ms=38240413" },
    ] as const;
    for (const { cause, details } of cases) {
      const calls: string[] = [];
      const sleeps: number[] = [];
      const result = await runWithFallbacks({
        primary: A,
        retry: { retries: 1, baseDelayMs: 10, maxDelayMs: 8_000 },
        run: async (model) => {
          calls.push(model.id);
          return calls.length === 1
            ? output({ kind: "infra", cause, details })
            : output(done, model.id);
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      expect(calls).toEqual([A.id, A.id]);
      expect(sleeps).toEqual([10]);
      expect(result.outcome.stop).toEqual(done);
    }
  });

  it("treats a transport loss as retryable for every adapter", () => {
    expect(
      isRetryableInfra({
        kind: "infra",
        cause: "network",
        details: "ECONNRESET",
      }),
    ).toBe(true);
    expect(isRetryableInfra({ kind: "infra", cause: "auth" })).toBe(false);
    expect(isRetryableInfra({ kind: "infra", cause: "crash" })).toBe(false);
    expect(isRetryableInfra({ kind: "done" })).toBe(false);
  });

  it("backs off and retries a transient network stop before falling back", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const reset: Stop = {
      kind: "infra",
      cause: "network",
      details: "fetch failed",
    };
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 1, baseDelayMs: 10, maxDelayMs: 10 },
      run: async (model) => {
        calls.push(model.id);
        return calls.length === 1 ? output(reset) : output(done, model.id);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(calls).toEqual([A.id, A.id]);
    expect(sleeps).toEqual([10]);
    expect(result.outcome.stop).toEqual(done);
  });

  it("walks the chain after the retry budget is spent and keeps every hop", async () => {
    const calls: string[] = [];
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 1 },
      run: async (model) => {
        calls.push(model.id);
        return output(model.id === B.id ? done : quota, model.id);
      },
      sleep: async () => {},
    });
    expect(calls).toEqual([A.id, A.id, B.id]);
    expect(result.attempts.map((a) => a.model.id)).toEqual([A.id, A.id, B.id]);
    expect(result.outcome.value).toBe(B.id);
  });

  it("does not retry a non-retryable infra cause, it advances", async () => {
    const calls: string[] = [];
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 5 },
      run: async (model) => {
        calls.push(model.id);
        return output(model.id === B.id ? done : auth, model.id);
      },
      sleep: async () => {
        throw new Error("must not sleep");
      },
    });
    expect(calls).toEqual([A.id, B.id]);
    expect(result.attempts).toHaveLength(2);
  });

  it("returns the last infra stop when the chain is exhausted", async () => {
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 0 },
      run: async (model) =>
        output(model.id === A.id ? quota : { kind: "infra", cause: "rate" }),
    });
    expect(result.outcome.stop).toEqual({ kind: "infra", cause: "rate" });
    expect(result.attempts).toHaveLength(2);
  });

  it("returns task-side stops immediately without fallback", async () => {
    const calls: string[] = [];
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      run: async (model) => {
        calls.push(model.id);
        return output({ kind: "refusal", details: "no" });
      },
    });
    expect(calls).toEqual([A.id]);
    expect(result.outcome.stop.kind).toBe("refusal");
  });

  it("deduplicates a fallback identical to the primary", () => {
    expect(modelChain(A, [A, B, { id: B.id }])).toEqual([A, B]);
  });
});
