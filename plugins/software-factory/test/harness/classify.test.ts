import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { classifyOmpOutcome } from "../../src/harness/omp/classify.js";

const FIXTURES_DIR = path.resolve(import.meta.dir, "../fixtures/omp");

describe("classifyOmpOutcome", () => {
  it("classifies timeout as transient", () => {
    const res = classifyOmpOutcome({
      exitCode: 143,
      stderr: "",
      timedOut: true,
    });
    expect(res.transient).toBe(true);
    expect(res.sessionLost).toBe(false);
    expect(res.error).toContain("timed out");
  });

  it("classifies SIGTERM exit (143) as transient", () => {
    const res = classifyOmpOutcome({
      exitCode: 143,
      stderr: "[Stopped by SIGTERM]",
    });
    expect(res.transient).toBe(true);
    expect(res.sessionLost).toBe(false);
  });

  it("classifies SIGKILL exit (137) as transient", () => {
    const res = classifyOmpOutcome({
      exitCode: 137,
      stderr: "Killed",
    });
    expect(res.transient).toBe(true);
    expect(res.sessionLost).toBe(false);
  });

  it("classifies session not found when resumeRequested as sessionLost", () => {
    const stderr = fs.readFileSync(path.join(FIXTURES_DIR, "turn-error-session-lost.txt"), "utf8");
    const res = classifyOmpOutcome({
      exitCode: 1,
      stderr,
      resumeRequested: true,
    });
    expect(res.sessionLost).toBe(true);
    expect(res.transient).toBe(false);
  });

  it("classifies 429 rate limit error as transient", () => {
    const stderr = fs.readFileSync(path.join(FIXTURES_DIR, "turn-error-rate-limit.txt"), "utf8");
    const res = classifyOmpOutcome({
      exitCode: 1,
      stderr,
    });
    expect(res.transient).toBe(true);
    expect(res.sessionLost).toBe(false);
  });

  it("classifies 503 overloaded provider error as transient", () => {
    const stderr = fs.readFileSync(path.join(FIXTURES_DIR, "turn-error-overloaded.txt"), "utf8");
    const res = classifyOmpOutcome({
      exitCode: 1,
      stderr,
    });
    expect(res.transient).toBe(true);
    expect(res.sessionLost).toBe(false);
  });

  it("classifies permanent model not found / client error as non-transient agent failure", () => {
    const stderr = fs.readFileSync(path.join(FIXTURES_DIR, "turn-error-model-not-found.txt"), "utf8");
    const res = classifyOmpOutcome({
      exitCode: 1,
      stderr,
    });
    expect(res.transient).toBe(false);
    expect(res.sessionLost).toBe(false);
    expect(res.error).toContain("not found");
  });

  it("classifies stopReason abort as non-transient agent failure", () => {
    const res = classifyOmpOutcome({
      exitCode: 0,
      stderr: "",
      parsed: {
        finalAssistantText: "",
        usage: {},
        stopReason: "abort",
        rawEvents: [],
        toolCallCount: 0,
        errors: ["Context aborted"],
      },
    });
    expect(res.transient).toBe(false);
    expect(res.sessionLost).toBe(false);
    expect(res.error).toContain("abort");
  });

  it("classifies stopReason error as failure", () => {
    const res = classifyOmpOutcome({
      exitCode: 0,
      stderr: "",
      parsed: {
        finalAssistantText: "",
        usage: {},
        stopReason: "error",
        rawEvents: [],
        toolCallCount: 0,
        errors: ["Fatal model error"],
      },
    });
    expect(res.transient).toBe(false);
    expect(res.error).toContain("error");
  });

  it("classifies tool/flag errors as launch errors, not agent failures", () => {
    for (const stderr of [
      "Error: Built-in tools unavailable in this session: checkpoint, rewind.\nRun `omp --help` for available flags.",
      "Error: unknown flag --frobnicate",
    ]) {
      const res = classifyOmpOutcome({ exitCode: 1, stderr });
      expect(res.launchError).toBe(true);
      expect(res.transient).toBe(false);
      expect(res.sessionLost).toBe(false);
    }
  });

  it("does not classify agent failures as launch errors", () => {
    const res = classifyOmpOutcome({ exitCode: 1, stderr: "Error: model request failed: bad response" });
    expect(res.launchError).toBeFalsy();
  });
});
