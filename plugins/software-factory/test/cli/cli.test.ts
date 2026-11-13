import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch, parseCliArgs } from "../../src/cli/index.js";
import {
  acquireRunLock,
  getRunLockPath,
  isRunLockFree,
  resolveRuntimeDir,
} from "../../src/cli/lock.js";

describe("CLI dispatch", () => {
  it("parses global flags and the positional command", () => {
    expect(parseCliArgs(["run", "--repo", "/tmp/x", "--max-iterations=2"])).toEqual({
      command: "run",
      repo: "/tmp/x",
      help: false,
      version: false,
    });
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-v"]).version).toBe(true);
  });

  it("prints help when called without a command", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (msg: string) => lines.push(msg);
    try {
      expect(await dispatch([])).toBe(0);
      expect(lines.join("\n")).toContain("software-factory");
    } finally {
      console.log = original;
    }
  });

  it("rejects unknown commands", async () => {
    const originalErr = console.error;
    const originalLog = console.log;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(msg);
    console.log = () => {};
    try {
      expect(await dispatch(["nope"])).toBe(1);
      expect(errors.join("\n")).toContain('unknown command "nope"');
    } finally {
      console.error = originalErr;
      console.log = originalLog;
    }
  });
});

describe("Run lock", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "factory-lock-"));
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("resolves the runtime directory outside the checkout", () => {
    const runtimeDir = resolveRuntimeDir(repo, "../wt-test");
    expect(runtimeDir).toBe(path.resolve(repo, "../wt-test", ".factory-runtime"));
  });

  it("is exclusive while held and free after release", () => {
    const task = "t1";
    const lockPath = getRunLockPath(repo, task, { runtimeDir: path.join(repo, "rt") });
    expect(isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free).toBe(true);

    const handle = acquireRunLock(repo, task, { runtimeDir: path.join(repo, "rt") });
    expect(handle).not.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free).toBe(false);
    expect(acquireRunLock(repo, task, { runtimeDir: path.join(repo, "rt") })).toBeNull();

    handle!.release();
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free).toBe(true);
  });

  it("takes over a stale lock from a dead pid on this host", () => {
    const runtimeDir = path.join(repo, "rt");
    const lockPath = getRunLockPath(repo, "t2", { runtimeDir });
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999_999_999, host: os.hostname(), start: new Date(0).toISOString() })
    );

    const handle = acquireRunLock(repo, "t2", { runtimeDir });
    expect(handle).not.toBeNull();
    const data = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    expect(data.pid).toBe(process.pid);
    handle!.release();
  });
});
