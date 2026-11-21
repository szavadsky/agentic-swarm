import { describe, expect, it } from "bun:test";
import {
  type AttemptOutput,
  isRetryableInfra,
  modelChain,
  runWithFallbacks,
} from "../../src/harness/fallback.js";
import type { ModelRef, PoolLatch, Stop } from "../../src/harness/types.js";
import { zeroUsage } from "../../src/harness/usage.js";
import { installFakeClock } from "../helpers/fake-clock.js";

const A: ModelRef = { id: "provider/a" };
const B: ModelRef = { id: "provider/b" };

function output(stop: Stop, value = "ok"): AttemptOutput<string> {
  return { stop, usage: zeroUsage(), value };
}

const quota: Stop = { kind: "infra", cause: "quota" };
const rate: Stop = { kind: "infra", cause: "rate" };
const auth: Stop = { kind: "infra", cause: "auth" };
const done: Stop = { kind: "done" };

/** A pool a test latches by hand, recording every stop the loop marks dead. */
function latchRecorder() {
  let live = true;
  const deadStops: Stop[] = [];
  return {
    pool: {
      live: () => live,
      dead: (stop: Stop) => {
        live = false;
        deadStops.push(stop);
      },
    } satisfies PoolLatch,
    deadStops,
    /** Latches without a stop, like a sibling leg's quota call landing mid-run. */
    latch: () => {
      live = false;
    },
  };
}

// The recorded quota stops that clustered retries: a provider-stated wait in
// hours/minutes and the millisecond header a 429 carries. Both exceed any
// backoff the policy would sleep.
const statedQuotaDetails = [
  "⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 129h55m29s.",
  "429 Rate limit exceeded: free-models-per-day-high-balance. retry-after-ms=38240413",
];

describe("runWithFallbacks", () => {
  runWithFallbacksPart1();
  runWithFallbacksPart2();
  runWithFallbacksPart3();
  runWithFallbacksPart3b();
  runWithFallbacksPart3c();
  runWithFallbacksPart4();
  runWithFallbacksPart5();
  runWithFallbacksPart6();
  runWithFallbacksPart7();
  runWithFallbacksPart8();
  runWithFallbacksPart9();
});

function runWithFallbacksPart1() {
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

  it("makes one call when a quota stop names no wait, and latches the pool", async () => {
    const calls: string[] = [];
    const recorder = latchRecorder();
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 2, baseDelayMs: 10 },
      pool: recorder.pool,
      run: async (model) => {
        calls.push(model.id);
        return output(quota, model.id);
      },
      sleep: async () => {
        throw new Error("must not sleep");
      },
    });
    expect(calls).toEqual([A.id]);
    expect(result.attempts.map((a) => a.model.id)).toEqual([A.id]);
    expect(result.outcome.stop).toEqual(quota);
    expect(recorder.deadStops).toEqual([quota]);
  });
}

function runWithFallbacksPart2() {
  it("makes one call when a quota stop states a wait beyond the window", async () => {
    for (const details of statedQuotaDetails) {
      const calls: string[] = [];
      const recorder = latchRecorder();
      const stop: Stop = { kind: "infra", cause: "quota", details };
      const result = await runWithFallbacks({
        primary: A,
        fallbacks: [B],
        retry: { retries: 2, baseDelayMs: 10, maxDelayMs: 8_000 },
        pool: recorder.pool,
        run: async (model) => {
          calls.push(model.id);
          return output(stop, model.id);
        },
        sleep: async () => {
          throw new Error("must not sleep");
        },
      });
      // The first leg's stop chooses for the pool: no retry, no later model.
      expect(calls).toEqual([A.id]);
      expect(result.attempts.map((a) => a.model.id)).toEqual([A.id]);
      expect(result.outcome.stop).toEqual(stop);
      expect(recorder.deadStops).toEqual([stop]);
    }
  });
}

function runWithFallbacksPart3() {
  it("retries a quota stop at its stated wait inside the window", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const recorder = latchRecorder();
    const stop: Stop = {
      kind: "infra",
      cause: "quota",
      details: "retry-after-ms=8000",
    };
    const result = await runWithFallbacks({
      primary: A,
      retry: { retries: 1, baseDelayMs: 10, maxDelayMs: 8_000 },
      pool: recorder.pool,
      run: async (model) => {
        calls.push(model.id);
        return calls.length === 1 ? output(stop) : output(done, model.id);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(calls).toEqual([A.id, A.id]);
    expect(sleeps).toEqual([8_000]);
    expect(result.outcome.stop).toEqual(done);
    // The retry answered, so the pool is still live for the next leg.
    expect(recorder.deadStops).toEqual([]);
  });
}

function runWithFallbacksPart3b() {
  it("latches when the retry at a stated wait also stops on quota", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const recorder = latchRecorder();
    const stop: Stop = {
      kind: "infra",
      cause: "quota",
      details: "retry-after-ms=5000",
    };
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 2, baseDelayMs: 10, maxDelayMs: 8_000 },
      pool: recorder.pool,
      run: async (model) => {
        calls.push(model.id);
        return output(stop);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(calls).toEqual([A.id, A.id]);
    expect(sleeps).toEqual([5_000]);
    expect(result.outcome.stop).toEqual(stop);
    expect(recorder.deadStops).toEqual([stop]);
  });
}

function runWithFallbacksPart3c() {
  it("keeps the bounded retries for rate and network stops", async () => {
    const cases = [
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
}

function runWithFallbacksPart4() {
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
        return output(model.id === B.id ? done : rate, model.id);
      },
      sleep: async () => {},
    });
    expect(calls).toEqual([A.id, A.id, B.id]);
    expect(result.attempts.map((a) => a.model.id)).toEqual([A.id, A.id, B.id]);
    expect(result.outcome.value).toBe(B.id);
  });
}

function runWithFallbacksPart5() {
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
        output(model.id === A.id ? rate : { kind: "infra", cause: "network" }),
    });
    expect(result.outcome.stop).toEqual({
      kind: "infra",
      cause: "network",
    });
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
}

function runWithFallbacksPart6() {
  it("deduplicates a fallback identical to the primary", () => {
    expect(modelChain(A, [A, B, { id: B.id }])).toEqual([A, B]);
  });
}

function runWithFallbacksPart7() {
  it("makes no call before a quota stop's stated reset", async () => {
    const clock = installFakeClock();
    try {
      const callsAt: number[] = [];
      const calls: string[] = [];
      const sleeps: number[] = [];
      const reset: Stop = {
        kind: "infra",
        cause: "quota",
        details: "retry-after-ms=5000",
      };
      const result = await runWithFallbacks({
        primary: A,
        retry: { retries: 1, baseDelayMs: 10, maxDelayMs: 8_000 },
        run: async (model) => {
          callsAt.push(Date.now());
          calls.push(model.id);
          return callsAt.length === 1 ? output(reset) : output(done, model.id);
        },
        sleep: async (ms) => {
          sleeps.push(ms);
          clock.advance(ms);
        },
      });
      expect(sleeps).toEqual([5_000]);
      expect(calls).toEqual([A.id, A.id]);
      expect(callsAt).toHaveLength(2);
      const [first, second] = callsAt;
      if (first === undefined || second === undefined)
        throw new Error("expected two calls");
      expect(second - first).toBe(5_000);
      expect(result.outcome.stop).toEqual(done);
    } finally {
      clock.restore();
    }
  });
}

function runWithFallbacksPart8() {
  it("makes one call when a quota stop states no reset", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 2, baseDelayMs: 10 },
      run: async (model) => {
        calls.push(model.id);
        return output(quota, model.id);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    // The reversed i7 acceptance: no cheap no-reset probes, one call decides.
    expect(calls).toEqual([A.id]);
    expect(sleeps).toEqual([]);
    expect(result.outcome.stop).toEqual(quota);
  });
}

function runWithFallbacksPart9() {
  it("makes no retry call once a concurrent leg latched the pool", async () => {
    const calls: string[] = [];
    const recorder = latchRecorder();
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 2, baseDelayMs: 10 },
      pool: recorder.pool,
      run: async (model) => {
        calls.push(model.id);
        recorder.latch();
        return output(rate);
      },
      sleep: async () => {
        throw new Error("must not sleep");
      },
    });
    expect(calls).toEqual([A.id]);
    expect(result.outcome.stop).toEqual(rate);
  });

  it("makes no fallback call once the pool is latched", async () => {
    const calls: string[] = [];
    const recorder = latchRecorder();
    const result = await runWithFallbacks({
      primary: A,
      fallbacks: [B],
      retry: { retries: 0 },
      pool: recorder.pool,
      run: async (model) => {
        calls.push(model.id);
        recorder.latch();
        return output(rate);
      },
    });
    expect(calls).toEqual([A.id]);
    expect(result.attempts.map((a) => a.model.id)).toEqual([A.id]);
    expect(result.outcome.stop).toEqual(rate);
  });
}
