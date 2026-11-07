import { describe, it, expect } from "bun:test";
import { runProcess, tail, capOutput } from "../src/core/proc.js";

describe("Process runner & output capping (§5, §9)", () => {
  it("executes an argument array directly", async () => {
    const res = await runProcess({
      cmd: ["echo", "hello", "world"],
      cwd: process.cwd(),
    });

    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("hello world");
    expect(res.timedOut).toBe(false);
  });

  it("executes a shell command string via bash -lc with environment variables", async () => {
    const res = await runProcess({
      cmd: "echo $GREETING $TARGET",
      cwd: process.cwd(),
      env: { GREETING: "hi", TARGET: "factory" },
    });

    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("hi factory");
  });

  it("pipes stdin into child process", async () => {
    const res = await runProcess({
      cmd: ["cat"],
      cwd: process.cwd(),
      stdin: "input payload\nsecond line",
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toBe("input payload\nsecond line");
  });

  it("kills process group on timeout and sets timedOut flag", async () => {
    const res = await runProcess({
      cmd: "sleep 10",
      cwd: process.cwd(),
      timeoutSec: 0.1, // 100ms
    });

    expect(res.timedOut).toBe(true);
  });

  it("caps large output retaining head and tail with truncation marker", () => {
    const original = "HEAD_START_" + "x".repeat(1000) + "_TAIL_END";
    const capped = capOutput(original, 50);

    expect(capped).toContain("HEAD_START");
    expect(capped).toContain("TAIL_END");
    expect(capped).toContain("... [truncated");
  });

  it("tail helper extracts trailing bytes safely", () => {
    const text = "0123456789";
    expect(tail(text, 4)).toBe("6789");
    expect(tail(text, 20)).toBe("0123456789");
  });
});
