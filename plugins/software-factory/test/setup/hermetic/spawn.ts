import path from "node:path";
import { refuse } from "./violations.js";
import { harnessName, isTmpPath } from "./hosts.js";

function spawnHint(name: string): string {
  return (
    `tests must not spawn the ${name} harness ` +
    `(use a stub binary under $TMPDIR, or mark the test FACTORY_LIVE=1)`
  );
}

const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh"]);
const SHORT_C_FLAG = /^-[a-zA-Z]*c[a-zA-Z]*$/;

/** Refuses a harness token in a shell command line; quoted tmp paths with spaces excepted. */
function scanShellPayload(payload: string, cwd: string): void {
  for (const token of payload.split(/[\s;&|()<>`$"']+/)) {
    if (!token) continue;
    const name = harnessName(token);
    if (name && !isTmpPath(token, cwd)) refuse("spawn", name, spawnHint(name));
  }
}

/** Scans the payload after a shell's `-c` flag, when the command has one. */
function scanShellCommands(cmds: string[], cwd: string): void {
  for (let i = 1; i < cmds.length; i += 1) {
    const flag = cmds[i];
    if (flag === undefined || !SHORT_C_FLAG.test(flag)) continue;
    const payload = cmds[i + 1];
    if (payload !== undefined) scanShellPayload(payload, cwd);
    return;
  }
}

/** The on-demand `bunx acpx` route: raw args only, never tokenized. */
function scanBunxArgs(exe: string, cmds: string[], cwd: string): void {
  for (const arg of cmds.slice(1)) {
    if (harnessName(arg) === "acpx" && !isTmpPath(arg, cwd)) {
      refuse("spawn", `${exe} ${arg}`, spawnHint("acpx"));
    }
  }
}

function assertSpawnAllowed(cmds: string[], cwd: string): void {
  const exe = cmds[0];
  if (exe === undefined) return;
  const base = path.basename(exe);
  const name = harnessName(exe);
  if (name && !isTmpPath(exe, cwd)) {
    refuse("spawn", exe, spawnHint(name));
  }
  if (SHELLS.has(base)) {
    scanShellCommands(cmds, cwd);
    return;
  }
  if (base === "bun" || base === "bunx") scanBunxArgs(exe, cmds, cwd);
}

/** Bun.spawn(cmds, opts) or Bun.spawn({ cmd, cwd, ... }); strings scan as shell. */
function checkBunSpawn(args: unknown[]): void {
  const first = args[0];
  const opts = (args.length > 1 ? args[1] : first) as
    | { cwd?: unknown }
    | undefined;
  const cwd = typeof opts?.cwd === "string" ? opts.cwd : process.cwd();
  if (typeof first === "string") {
    scanShellPayload(first, cwd);
    return;
  }
  let cmds: string[] | undefined;
  if (Array.isArray(first) && first.every((x) => typeof x === "string")) {
    cmds = first as string[];
  } else if (first !== null && typeof first === "object") {
    const cmd = (first as { cmd?: unknown }).cmd;
    if (Array.isArray(cmd) && cmd.every((x) => typeof x === "string")) {
      cmds = cmd as string[];
    }
  }
  if (cmds) assertSpawnAllowed(cmds, cwd);
}

export function installSpawnGuard(): void {
  const bun = Bun as unknown as {
    spawn: (...args: never[]) => unknown;
    spawnSync: (...args: never[]) => unknown;
  };
  const rawSpawn = bun.spawn.bind(Bun);
  const rawSpawnSync = bun.spawnSync.bind(Bun);
  bun.spawn = ((...args: unknown[]) => {
    checkBunSpawn(args);
    return (rawSpawn as (...args: unknown[]) => unknown)(...args);
  }) as typeof bun.spawn;
  bun.spawnSync = ((...args: unknown[]) => {
    checkBunSpawn(args);
    return (rawSpawnSync as (...args: unknown[]) => unknown)(...args);
  }) as typeof bun.spawnSync;
}
