import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../src/core/proc.js";

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

  it("caps large output via maxOutputBytes retaining head and tail with truncation marker", async () => {
    const res = await runProcess({
      cmd: [
        "bash",
        "-lc",
        'printf "HEAD_START_"; head -c 1000 /dev/zero | tr "\\0" "x"; printf "_TAIL_END"',
      ],
      cwd: process.cwd(),
      maxOutputBytes: 50,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toContain("HEAD_START");
    expect(res.stdout).toContain("TAIL_END");
    expect(res.stdout).toContain("... [truncated");
  });

  it("resolves after timeout even when a setsid grandchild holds the pipes open", async () => {
    // The child exits immediately; the detached grandchild (own session,
    // immune to the process-group SIGKILL) inherits stdout and sleeps.
    // Old behavior: promise waited on `close` forever. New: grace finish.
    const res = await runProcess({
      cmd: "setsid bash -c 'sleep 30' < /dev/null & sleep 0.05; echo child-done",
      cwd: process.cwd(),
      timeoutSec: 5,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toContain("child-done");
    expect(res.timedOut).toBe(false);
  });

  it("bounds memory on unbounded output while keeping the tail", async () => {
    // 5 MiB of stdout exceeds the 1 MiB per-stream ring: the runner must
    // finish with capped output whose tail survives.
    const res = await runProcess({
      cmd: [
        "bash",
        "-lc",
        'head -c 5000000 /dev/zero | tr "\\0" "x"; echo; echo TAIL_SENTINEL',
      ],
      cwd: process.cwd(),
      timeoutSec: 15,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toContain("TAIL_SENTINEL");
    expect(res.stdout).toContain("... [truncated");
    expect(Buffer.byteLength(res.stdout, "utf8")).toBeLessThan(5000000);
  });

  it("derives TMP and TEMP from TMPDIR for the child", async () => {
    const previous = {
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proc-tmp-"));
    process.env.TMPDIR = tmp;
    process.env.TMP = path.join(tmp, "ignored-tmp");
    process.env.TEMP = path.join(tmp, "ignored-temp");
    try {
      const res = await runProcess({
        cmd: ["bash", "-c", 'printf \'%s %s %s\' "$TMPDIR" "$TMP" "$TEMP"'],
        cwd: process.cwd(),
      });
      expect(res.code).toBe(0);
      expect(res.stdout).toBe(`${tmp} ${tmp} ${tmp}`);
    } finally {
      for (const key of ["TMPDIR", "TMP", "TEMP"] as const) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
