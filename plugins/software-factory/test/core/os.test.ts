import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { darwinOs } from "../../src/core/os/darwin.js";
import { createOs } from "../../src/core/os/index.js";
import { linuxOs } from "../../src/core/os/linux.js";
import type { OsPrimitives } from "../../src/core/os/types.js";

interface SignalCall {
  pid: number;
  signal: NodeJS.Signals | 0;
}

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

/** Every primitive fails until a test replaces it, so unused reads are loud. */
function primitives(overrides: Partial<OsPrimitives> = {}): OsPrimitives {
  return {
    signal: () => {
      throw errno("ESRCH");
    },
    readText: () => {
      throw errno("ENOENT");
    },
    readLink: () => {
      throw errno("ENOENT");
    },
    listDir: () => {
      throw errno("ENOENT");
    },
    exec: () => {
      throw new Error("exec not stubbed");
    },
    ...overrides,
  };
}

const STAT =
  "1 (init) S 0 1 1 0\n" +
  "42 (gate (x)) S 7 42 42 0\n" +
  "77 (other) S 1 77 77 0\n" +
  "99 (hidden) S 7 99 99 0\n";

function linuxWithProc(): OsPrimitives {
  return primitives({
    listDir: (dir) =>
      dir === "/proc" ? ["1", "42", "55", "77", "99", "self", "version"] : [],
    readText: (file) => {
      const pid = /^\/proc\/(\d+)\/stat$/.exec(file)?.[1];
      const line = STAT.split("\n").find((row) => row.startsWith(`${pid} `));
      if (line === undefined) throw errno("ENOENT");
      return line;
    },
    readLink: (file) => {
      if (file === "/proc/1/cwd") return "/";
      if (file === "/proc/42/cwd") return "/work/wt (deleted)";
      if (file === "/proc/77/cwd") return "/elsewhere";
      throw errno("EACCES");
    },
  });
}

describe("Linux OS driver", () => {
  it("reads the process table and cwd links from the injected /proc", () => {
    const processes = linuxOs(linuxWithProc()).processes();
    expect(processes).toEqual([
      { pid: 1, ppid: 0, pgid: 1, cwd: "/" },
      { pid: 42, ppid: 7, pgid: 42, cwd: "/work/wt" },
      { pid: 77, ppid: 1, pgid: 77, cwd: "/elsewhere" },
      { pid: 99, ppid: 7, pgid: 99 },
    ]);
  });

  it("returns no processes when /proc itself cannot be read", () => {
    expect(linuxOs(primitives()).processes()).toEqual([]);
  });

  it("treats EPERM as alive and ESRCH as gone for a pid and a group", () => {
    const calls: SignalCall[] = [];
    const os = linuxOs(
      primitives({
        signal: (pid, signal) => {
          calls.push({ pid, signal });
          if (signal !== 0) return;
          if (Math.abs(pid) === 123) throw errno("EPERM");
          throw errno("ESRCH");
        },
      }),
    );
    expect(os.isProcessAlive(0)).toBe(false);
    expect(os.isProcessAlive(123)).toBe(true);
    expect(os.isProcessAlive(456)).toBe(false);
    expect(os.isGroupAlive(-1)).toBe(false);
    expect(os.isGroupAlive(123)).toBe(true);
    expect(os.isGroupAlive(456)).toBe(false);
    expect(calls).toEqual([
      { pid: 123, signal: 0 },
      { pid: 456, signal: 0 },
      { pid: -123, signal: 0 },
      { pid: -456, signal: 0 },
    ]);
  });

  it("signals the group first and the leader only when that call fails", () => {
    const calls: SignalCall[] = [];
    let failure = "EPERM";
    const os = linuxOs(
      primitives({
        signal: (pid, signal) => {
          calls.push({ pid, signal });
          if (pid < 0) throw errno(failure);
        },
      }),
    );
    os.killGroup(4242, "SIGTERM");
    expect(calls).toEqual([
      { pid: -4242, signal: "SIGTERM" },
      { pid: 4242, signal: "SIGTERM" },
    ]);
    calls.length = 0;
    failure = "ESRCH";
    os.killGroup(4242, "SIGKILL");
    expect(calls).toEqual([{ pid: -4242, signal: "SIGKILL" }]);
    calls.length = 0;
    os.killGroup(0, "SIGKILL");
    expect(calls).toEqual([]);
  });

  it("names bash and joins repo paths with forward slashes", () => {
    const os = linuxOs(primitives());
    expect(os.shell("echo hi")).toEqual({
      executable: "bash",
      args: ["-c", "echo hi"],
    });
    expect(os.repoPath(path.join("src", "kernel", "a.ts"))).toBe(
      "src/kernel/a.ts",
    );
    expect(os.repoPathParts("src/kernel/a.ts")).toEqual([
      "src",
      "kernel",
      "a.ts",
    ]);
    expect(os.joinRepoPath("src", "", "kernel", "a.ts")).toBe(
      "src/kernel/a.ts",
    );
  });
});

const PS_TABLE =
  "\n  42     7    42\n  x y z\n  77     1     1\n  -5     1     1\n  99     1    99\n";
const LSOF_TABLE = "p42\nn/Users/x/wt\np99\nn/private/var/folders/t\n";

describe("macOS OS driver", () => {
  it("reads the process table from ps and cwds from lsof", () => {
    const calls: string[][] = [];
    const os = darwinOs(
      primitives({
        exec: (executable, args) => {
          calls.push([executable, ...args]);
          if (executable === "/bin/ps") return PS_TABLE;
          if (executable === "/usr/sbin/lsof") return LSOF_TABLE;
          throw new Error(`unexpected ${executable}`);
        },
      }),
    );
    expect(os.processes()).toEqual([
      { pid: 42, ppid: 7, pgid: 42, cwd: "/Users/x/wt" },
      { pid: 77, ppid: 1, pgid: 1 },
      { pid: 99, ppid: 1, pgid: 99, cwd: "/private/var/folders/t" },
    ]);
    expect(calls).toEqual([
      ["/bin/ps", "-axo", "pid=,ppid=,pgid="],
      ["/usr/sbin/lsof", "-a", "-d", "cwd", "-Fpn"],
    ]);
  });

  it("keeps the process table when lsof cannot read a cwd", () => {
    const os = darwinOs(
      primitives({
        exec: (executable) => {
          if (executable === "/bin/ps") return PS_TABLE;
          throw errno("ENOENT");
        },
      }),
    );
    expect(os.processes()).toEqual([
      { pid: 42, ppid: 7, pgid: 42 },
      { pid: 77, ppid: 1, pgid: 1 },
      { pid: 99, ppid: 1, pgid: 99 },
    ]);
  });

  it("returns no processes when ps cannot run", () => {
    const os = darwinOs(
      primitives({
        exec: () => {
          throw errno("ENOENT");
        },
      }),
    );
    expect(os.processes()).toEqual([]);
  });

  it("names the system bash and shares the signal rules", () => {
    const calls: SignalCall[] = [];
    const os = darwinOs(primitives());
    expect(os.shell("echo hi")).toEqual({
      executable: "/bin/bash",
      args: ["-c", "echo hi"],
    });
    const signalling = createOs(
      "darwin",
      primitives({
        signal: (pid, signal) => {
          calls.push({ pid, signal });
        },
      }),
    );
    signalling.killGroup(7, "SIGTERM");
    expect(calls).toEqual([{ pid: -7, signal: "SIGTERM" }]);
  });
});

describe("host driver selection", () => {
  it("builds the driver from the platform and refuses other systems", () => {
    const probe = primitives({ exec: () => "  1     0     1\n" });
    expect(createOs("linux", probe).shell("x").executable).toBe("bash");
    expect(createOs("darwin", probe).shell("x").executable).toBe("/bin/bash");
    expect(() => createOs("win32", probe)).toThrow(/WSL/);
  });
});

const PACKAGE_ROOT = path.join(import.meta.dir, "../..");
const OS_DIR = path.join(PACKAGE_ROOT, "src", "core", "os");

/** Host calls no module outside the OS interface may make. */
const FORBIDDEN: { pattern: RegExp; call: string }[] = [
  { pattern: /process\.kill\(/, call: "kill(2)" },
  { pattern: /["'`]\/proc\//, call: "the /proc filesystem" },
  { pattern: /process\.platform/, call: "the platform" },
  { pattern: /["']bash["'][^\n]{0,40}["']-c["']/, call: "a shell" },
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

describe("OS interface boundary", () => {
  it("keeps platform calls inside src/core/os", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(PACKAGE_ROOT, "src"))) {
      if (file.startsWith(`${OS_DIR}${path.sep}`)) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const { pattern, call } of FORBIDDEN) {
          if (!pattern.test(line)) continue;
          const rel = path.relative(PACKAGE_ROOT, file);
          offenders.push(`${rel}:${index + 1} calls ${call}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
