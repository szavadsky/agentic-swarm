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
    expect(classifyOmpError(error)).toEqual({ kind: "infra", cause: "quota" });
  });

  it("classifies auth, overflow, refusal, timeout and provider saturation", () => {
    expect(classifyOmpError({ httpStatus: 401, message: "unauthorized" })).toEqual({
      kind: "infra",
      cause: "auth",
    });
    expect(classifyOmpError({ message: "context length exceeded" })).toEqual({
      kind: "infra",
      cause: "overflow",
    });
    expect(classifyOmpError({ message: "The model declined: safety policy" })).toEqual({
      kind: "refusal",
      details: "The model declined: safety policy",
    });
    expect(classifyOmpError({ message: "Request timed out" })).toEqual({
      kind: "infra",
      cause: "timeout",
    });
    expect(classifyOmpError({ httpStatus: 503, message: "provider overloaded" })).toEqual({
      kind: "infra",
      cause: "rate",
    });
    expect(classifyOmpError({})).toEqual({ kind: "infra", cause: "crash" });
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
    expect(classifyOmpLaunchFailure(stderr)).toEqual({ kind: "infra", cause: "auth" });
  });

  it("classifies other launch stderr as crash", () => {
    expect(classifyOmpLaunchFailure("boom")).toEqual({ kind: "infra", cause: "crash" });
  });
});
