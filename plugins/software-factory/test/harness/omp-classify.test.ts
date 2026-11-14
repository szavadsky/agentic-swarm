import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  classifyOmpError,
  classifyOmpLaunchFailure,
  classifyOmpStopReason,
} from "../../src/harness/omp/classify.js";

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
    expect((stop as { details?: string }).details).toContain("Free usage limit reached");
  });

  it("classifies auth, overflow, refusal, timeout and provider saturation", () => {
    expect(classifyOmpError({ httpStatus: 401, message: "unauthorized" })).toEqual({
      kind: "infra",
      cause: "auth",
      details: "unauthorized",
    });
    expect(classifyOmpError({ message: "context length exceeded" })).toEqual({
      kind: "infra",
      cause: "overflow",
      details: "context length exceeded",
    });
    expect(classifyOmpError({ message: "The model declined: safety policy" })).toEqual({
      kind: "refusal",
      details: "The model declined: safety policy",
    });
    expect(classifyOmpError({ message: "Request timed out" })).toEqual({
      kind: "infra",
      cause: "timeout",
      details: "Request timed out",
    });
    expect(classifyOmpError({ httpStatus: 503, message: "provider overloaded" })).toEqual({
      kind: "infra",
      cause: "rate",
      details: "provider overloaded",
    });
    expect(classifyOmpError({})).toEqual({ kind: "infra", cause: "crash" });
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
      classifyOmpError({ httpStatus: 401, message: `unauthorized api_key=${secret}` })
    ).toEqual({
      kind: "infra",
      cause: "auth",
      details: "unauthorized api_key=[redacted]",
    });
    expect(
      classifyOmpError({ message: `context length exceeded token=${secret}` })
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
      "utf8"
    );
    const stop = classifyOmpLaunchFailure(stderr);
    expect(stop.kind).toBe("infra");
    expect((stop as { cause: string }).cause).toBe("auth");
    expect((stop as { details?: string }).details).toContain("not found");
  });

  it("classifies other launch stderr as crash", () => {
    expect(classifyOmpLaunchFailure("boom")).toEqual({ kind: "infra", cause: "crash", details: "boom" });
  });
});
