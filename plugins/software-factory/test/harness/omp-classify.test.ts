// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  classifyOmpError,
  classifyOmpLaunchFailure,
  classifyOmpStopReason,
  classifyOmpTurn,
} from "../../src/harness/omp/classify.js";
import { zeroUsage } from "../../src/harness/usage.js";

const FIXTURES = path.resolve(import.meta.dir, "../fixtures/omp");

function promptError(file: string): any {
  const frames = fs
    .readFileSync(path.join(FIXTURES, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return frames.find((frame) => frame.type === "prompt_result")?.error;
}

describe("classifyOmpError", () => {
  it("classifies the recorded free-tier 429 prompt_result as quota", () => {
    const error = promptError("rpc-quota.ndjson");
    expect(error.httpStatus).toBe(429);
    const stop = classifyOmpError(error);
    expect(stop).toMatchObject({ kind: "infra", cause: "quota" });
    expect((stop as { details?: string }).details).toContain(
      "Free usage limit reached",
    );
  });

  it("classifies auth, overflow, refusal, timeout and provider saturation", () => {
    expect(
      classifyOmpError({ httpStatus: 401, message: "unauthorized" }),
    ).toEqual({
      kind: "infra",
      cause: "auth",
      details: "unauthorized",
    });
    expect(classifyOmpError({ message: "context length exceeded" })).toEqual({
      kind: "infra",
      cause: "overflow",
      details: "context length exceeded",
    });
    expect(
      classifyOmpError({ message: "The model declined: safety policy" }),
    ).toEqual({
      kind: "refusal",
      details: "The model declined: safety policy",
    });
    expect(classifyOmpError({ message: "Request timed out" })).toEqual({
      kind: "infra",
      cause: "timeout",
      details: "Request timed out",
    });
    expect(
      classifyOmpError({ httpStatus: 503, message: "provider overloaded" }),
    ).toEqual({
      kind: "infra",
      cause: "rate",
      details: "provider overloaded",
    });
    expect(classifyOmpError({})).toEqual({ kind: "infra", cause: "crash" });
    // No transport token, so the abort word still means a user cancel.
    expect(classifyOmpError({ message: "Request aborted by user" })).toEqual({
      kind: "cancelled",
    });
  });

  it("classifies transport loss and a provider retryable flag as transient network", () => {
    expect(
      classifyOmpError({ message: "fetch failed", code: "ECONNRESET" }),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "fetch failed ECONNRESET",
    });
    expect(classifyOmpError({ message: "socket closed" })).toEqual({
      kind: "infra",
      cause: "network",
      details: "socket closed",
    });
    // `ECONNABORTED` is a transport code, not a user abort, whether it
    // arrives alone or beside node's abort wording.
    expect(classifyOmpError({ code: "ECONNABORTED" })).toEqual({
      kind: "infra",
      cause: "network",
      details: "ECONNABORTED",
    });
    expect(
      classifyOmpError({
        code: "ECONNABORTED",
        message: "The operation was aborted",
      }),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "The operation was aborted ECONNABORTED",
    });
    // A refused socket and a connect timeout are transport, not a model
    // refusal and not the deliberately frozen `timeout` cause.
    expect(
      classifyOmpError({ message: "connect ECONNREFUSED 127.0.0.1:443" }),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "connect ECONNREFUSED 127.0.0.1:443",
    });
    expect(classifyOmpError({ message: "connection refused" })).toEqual({
      kind: "infra",
      cause: "network",
      details: "connection refused",
    });
    expect(
      classifyOmpError({ message: "connect ETIMEDOUT 1.2.3.4:443" }),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "connect ETIMEDOUT 1.2.3.4:443",
    });
    expect(
      classifyOmpError({
        message: "provider asked for another try",
        retryable: true,
      }),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "provider asked for another try",
    });
    // The edge: a provider flag never overrides a fatal auth classification.
    expect(
      classifyOmpError({
        httpStatus: 401,
        message: "unauthorized",
        retryable: true,
      }),
    ).toEqual({ kind: "infra", cause: "auth", details: "unauthorized" });
  });

  it("masks and truncates a refusal message that carries a token", () => {
    const secret = "sk-live-TOPSECRETTOKEN1234567890";
    const message = `The model declined: safety policy ${"x".repeat(600)} token=${secret}`;
    const stop = classifyOmpError({ message });
    expect(stop.kind).toBe("refusal");
    const details = stop.kind === "refusal" ? stop.details : undefined;
    expect(details).toBeDefined();
    expect(details).not.toContain(secret);
    expect(details).toContain("token=[redacted]");
    expect(details?.startsWith("…")).toBe(true);
    expect(details?.length).toBeLessThanOrEqual(501);
  });

  it("carries scrubbed details on auth and overflow stops", () => {
    const secret = "sk-live-TOPSECRETTOKEN1234567890";
    expect(
      classifyOmpError({
        httpStatus: 401,
        message: `unauthorized api_key=${secret}`,
      }),
    ).toEqual({
      kind: "infra",
      cause: "auth",
      details: "unauthorized api_key=[redacted]",
    });
    expect(
      classifyOmpError({ message: `context length exceeded token=${secret}` }),
    ).toEqual({
      kind: "infra",
      cause: "overflow",
      details: "context length exceeded token=[redacted]",
    });
  });
});

describe("classifyOmpStopReason", () => {
  it("recognises the real aborted spelling and truncation", () => {
    expect(classifyOmpStopReason("aborted")).toEqual({ kind: "cancelled" });
    expect(classifyOmpStopReason("max_tokens")).toEqual({
      kind: "truncated",
      cause: "max-tokens",
    });
    expect(classifyOmpStopReason("length")).toEqual({
      kind: "truncated",
      cause: "max-tokens",
    });
    expect(classifyOmpStopReason("stop")).toBeUndefined();
    expect(classifyOmpStopReason("toolUse")).toBeUndefined();
  });
});

describe("classifyOmpLaunchFailure", () => {
  it("classifies the recorded model-not-found stderr as auth", () => {
    const stderr = fs.readFileSync(
      path.join(FIXTURES, "turn-error-model-not-found.txt"),
      "utf8",
    );
    const stop = classifyOmpLaunchFailure(stderr);
    expect(stop.kind).toBe("infra");
    expect((stop as { cause: string }).cause).toBe("auth");
    expect((stop as { details?: string }).details).toContain("not found");
  });

  it("classifies other launch stderr as crash", () => {
    expect(classifyOmpLaunchFailure("boom")).toEqual({
      kind: "infra",
      cause: "crash",
      details: "boom",
    });
  });

  it("classifies a dead socket on launch as transient network", () => {
    expect(
      classifyOmpLaunchFailure("Error: fetch failed: read ECONNRESET"),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "Error: fetch failed: read ECONNRESET",
    });
    // Auth keeps precedence over a transport-looking tail.
    expect(
      classifyOmpLaunchFailure("invalid api key; connection reset"),
    ).toMatchObject({ kind: "infra", cause: "auth" });
  });
});

describe("classifyOmpTurn", () => {
  it("classifies zero-usage no-output as glitch", () => {
    const stop = classifyOmpTurn({
      usage: zeroUsage(),
      text: "",
      promptResult: { status: "completed" },
    });
    expect(stop).toMatchObject({ kind: "infra", cause: "glitch" });
  });

  it("returns done for completed with usage", () => {
    const stop = classifyOmpTurn({
      usage: {
        in: 1,
        out: 1,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        reasoningOut: 0,
      },
      text: "hello",
      promptResult: { status: "completed" },
    });
    expect(stop).toMatchObject({ kind: "done" });
  });

  it("returns truncated for completed with max_tokens stop reason", () => {
    const stop = classifyOmpTurn({
      usage: {
        in: 1,
        out: 1,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        reasoningOut: 0,
      },
      text: "hello",
      promptResult: { status: "completed" },
      lastStopReason: "max_tokens",
    });
    expect(stop).toMatchObject({ kind: "truncated", cause: "max-tokens" });
  });

  it("prefers refusal over glitch", () => {
    const stop = classifyOmpTurn({
      usage: zeroUsage(),
      text: "",
      promptResult: { status: "completed" },
      lastStopReason: "refusal",
    });
    expect(stop).toMatchObject({ kind: "refusal" });
  });

  it("returns done for zero usage with text", () => {
    const stop = classifyOmpTurn({
      usage: zeroUsage(),
      text: "some output",
      promptResult: { status: "completed" },
    });
    expect(stop).toMatchObject({ kind: "done" });
  });
});
