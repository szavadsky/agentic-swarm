/**
 * Hermetic test guard, loaded via the `[test] preload` in bunfig.toml.
 *
 * The default suite must prove it makes no network or harness call: every
 * `fetch` to a non-loopback host and every spawn of a harness binary throws
 * before the connection or process exists. Loopback servers, `git`/`bun`
 * subprocesses and stub binaries under a tmp dir stay allowed, so stub
 * harnesses and `bun test`/`gates.sh` drivers keep working.
 *
 * Every `node:child_process` spawn funnels through `Bun.spawn`/`Bun.spawnSync`
 * (exec arrives as `sh -c <payload>`), so wrapping those two covers all
 * import styles; the same is not true of `node:http`, whose object patch only
 * covers default-import/require users. `fetch` — the only network call in
 * `src/` — is a global and fully covered.
 *
 * `FACTORY_LIVE=1` disables the guard: live tests are exempt and stay opt-in.
 * `FACTORY_HERMETIC_LOG=<file>` appends one JSON line per refused attempt
 * (kind, detail, stack) before throwing; the guard's own test triggers
 * intentional violations, so audit runs filter stacks containing
 * `hermetic-guard.test.ts`.
 *
 * A refusal throws, but the code under test may swallow it (`loadPriceTable`
 * returns unpriced on any fetch failure; `spawnSync` carries it as
 * `result.error`): every refusal is also recorded, and a global `afterEach`
 * fails the running test when a recording is still pending. The guard's own
 * test drains its intentional violations via `drainViolations`.
 *
 * The guard also points `FACTORY_PRICE_CACHE` at a missing file when the
 * operator sets no override, so a test that forgets its price source attempts
 * the (refused) fetch instead of silently reading the operator's shared cache.
 */
import { afterEach } from "bun:test";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { removeAtFileEnd } from "./tmp-cleanup.js";

export class HermeticViolation extends Error {
  override readonly name = "HermeticViolation";
}

/** False only under FACTORY_LIVE=1, which exempts live tests from the guard. */
export const hermeticGuardActive: boolean = process.env.FACTORY_LIVE !== "1";

/** Harness executables no default test may spawn, by exact basename. */
const HARNESS_BINARIES = new Set([
  "omp",
  "acpx",
  "opencode",
  "claude",
  "agy",
  "codex",
  "pi",
]);

const NETWORK_HINT =
  "tests must not use the network (inject a fake, or mark the test FACTORY_LIVE=1)";

function spawnHint(name: string): string {
  return (
    `tests must not spawn the ${name} harness ` +
    `(use a stub binary under $TMPDIR, or mark the test FACTORY_LIVE=1)`
  );
}

const violationLog: string | undefined = hermeticGuardActive
  ? process.env.FACTORY_HERMETIC_LOG?.trim() || undefined
  : undefined;
let logWarned = false;

export interface RecordedViolation {
  kind: string;
  detail: string;
  stack: string;
}

const pendingViolations: RecordedViolation[] = [];

/**
 * Takes and clears the recorded refusals. The guard's own test calls this
 * after each intentional violation; any other pending recording fails the
 * running test in the global `afterEach` below.
 */
export function drainViolations(): RecordedViolation[] {
  return pendingViolations.splice(0, pendingViolations.length);
}

function refuse(kind: string, detail: string, hint: string): never {
  const stack = new Error().stack ?? "";
  pendingViolations.push({ kind, detail, stack });
  if (violationLog) {
    try {
      fs.appendFileSync(
        violationLog,
        `${JSON.stringify({ kind, detail, stack })}\n`,
      );
    } catch (err) {
      if (!logWarned) {
        logWarned = true;
        console.error(
          `hermetic guard: cannot write FACTORY_HERMETIC_LOG=${violationLog}: ${(err as Error).message}`,
        );
      }
    }
  }
  throw new HermeticViolation(
    `hermetic guard: blocked ${kind} "${detail}" — ${hint}`,
  );
}

/** First frames outside the guard itself: the test code that attempted the call. */
function blameLines(stack: string): string[] {
  return stack
    .split("\n")
    .filter((line) => !line.includes("hermetic-guard.ts"))
    .slice(0, 6);
}

/** True for localhost, 127/8 and ::1 (brackets, case and trailing dot tolerated). */
export function isLoopbackHostname(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "::" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const parts = host.split(".");
  return (
    parts.length >= 2 &&
    parts[0] === "127" &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** The harness binary a path or bare token names, by exact basename, if any. */
export function harnessName(token: string): string | undefined {
  const base = path.basename(token);
  return HARNESS_BINARIES.has(base) ? base : undefined;
}

/** Tmp roots stubs may live under; tmp-repo falls back to /tmp, so do we. */
const tmpRoots: string[] = [
  ...new Set(
    [os.tmpdir(), process.env.TMPDIR, process.env.TMP, process.env.TEMP, "/tmp"]
      .filter((d): d is string => !!d)
      .map((d) => {
        try {
          return fs.realpathSync(d);
        } catch {
          return path.resolve(d);
        }
      }),
  ),
];

/** True when a slash-carrying path resolves under a tmp root. */
function isTmpPath(file: string, cwd: string): boolean {
  if (!file.includes("/")) return false;
  const resolved = path.resolve(cwd, file);
  return tmpRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
  );
}

function assertFetchAllowed(input: unknown): void {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : undefined;
  if (raw === undefined) return;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return; // Relative or malformed: fetch reports it.
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (!isLoopbackHostname(url.hostname)) {
    refuse("fetch", url.host, NETWORK_HINT);
  }
}

interface HostOpts {
  hostname?: unknown;
  host?: unknown;
  socketPath?: unknown;
}

function stripPort(host: string): string {
  const h = host.trim();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h : h.slice(1, end);
  }
  const last = h.lastIndexOf(":");
  if (last !== -1 && h.indexOf(":") === last) return h.slice(0, last);
  return h;
}

/** The host an explicit options object names, if any. */
function overrideHost(override: HostOpts | undefined): string | undefined {
  if (!override) return undefined;
  if (typeof override.hostname === "string" && override.hostname) {
    return override.hostname;
  }
  if (typeof override.host === "string" && override.host) {
    return stripPort(override.host);
  }
  return undefined;
}

interface HttpTarget {
  host?: string;
  socketPath: boolean;
}

/** The host and socket flag request(url[, options]) or request(options) names. */
function requestTarget(a: unknown, b: unknown): HttpTarget {
  if (typeof a === "string" || a instanceof URL) {
    let fromUrl: string | undefined;
    try {
      fromUrl = new URL(a instanceof URL ? a.href : a).hostname || undefined;
    } catch {
      fromUrl = undefined;
    }
    const override =
      b !== null && typeof b === "object" ? (b as HostOpts) : undefined;
    return {
      host: overrideHost(override) ?? fromUrl,
      socketPath: typeof override?.socketPath === "string",
    };
  }
  if (a !== null && typeof a === "object") {
    const override = a as HostOpts;
    return {
      host: overrideHost(override),
      socketPath: typeof override.socketPath === "string",
    };
  }
  return { socketPath: false };
}

/** request(url[, options]) or request(options); absent host defaults to localhost. */
function assertHttpAllowed(
  kind: "http" | "https",
  a: unknown,
  b: unknown,
): void {
  const target = requestTarget(a, b);
  if (target.socketPath) return;
  if (target.host === undefined || target.host === "") return;
  if (!isLoopbackHostname(target.host)) refuse(kind, target.host, NETWORK_HINT);
}

interface TcpOpts {
  path?: unknown;
  host?: unknown;
  hostname?: unknown;
  port?: unknown;
}

function tcpOptionHost(opts: TcpOpts): string {
  if (typeof opts.host === "string") return stripPort(opts.host);
  if (typeof opts.hostname === "string") return stripPort(opts.hostname);
  return "127.0.0.1";
}

/** connect(options), connect(port[, host]) or connect(path); absent host is loopback. */
function assertTcpAllowed(kind: "tcp" | "tls", args: unknown[]): void {
  const first = args[0];
  if (typeof first === "number") {
    const host = typeof args[1] === "string" ? stripPort(args[1]) : "127.0.0.1";
    if (!isLoopbackHostname(host)) {
      refuse(kind, `${host}:${first}`, NETWORK_HINT);
    }
    return;
  }
  if (typeof first === "string") return; // Unix socket path.
  if (first === null || typeof first !== "object") return;
  const opts = first as TcpOpts;
  if (typeof opts.path === "string") return;
  const host = tcpOptionHost(opts);
  if (isLoopbackHostname(host)) return;
  const detail = typeof opts.port === "number" ? `${host}:${opts.port}` : host;
  refuse(kind, detail, NETWORK_HINT);
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

function installSpawnGuard(): void {
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

type AnyModule = {
  request: (...args: never[]) => unknown;
  get: (...args: never[]) => unknown;
};

/** Wraps one http module's request/get with the host assertion. */
function guardHttpModule(
  mod: typeof http | typeof https,
  kind: "http" | "https",
): void {
  const anyMod = mod as unknown as AnyModule;
  const rawRequest = anyMod.request.bind(mod);
  const rawGet = anyMod.get.bind(mod);
  anyMod.request = ((...args: unknown[]) => {
    assertHttpAllowed(kind, args[0], args[1]);
    return (rawRequest as (...args: unknown[]) => unknown)(...args);
  }) as typeof anyMod.request;
  anyMod.get = ((...args: unknown[]) => {
    assertHttpAllowed(kind, args[0], args[1]);
    return (rawGet as (...args: unknown[]) => unknown)(...args);
  }) as typeof anyMod.get;
}

/** Wraps net.connect/createConnection and Socket.connect with the TCP assertion. */
function guardNetConnections(): void {
  const anyNet = net as unknown as {
    connect: (...args: never[]) => unknown;
    createConnection: (...args: never[]) => unknown;
  };
  const rawConnect = anyNet.connect.bind(net);
  const rawCreateConnection = anyNet.createConnection.bind(net);
  const tcpGuard =
    (raw: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      assertTcpAllowed("tcp", args);
      return raw(...args);
    };
  anyNet.connect = tcpGuard(
    rawConnect as (...args: unknown[]) => unknown,
  ) as typeof anyNet.connect;
  anyNet.createConnection = tcpGuard(
    rawCreateConnection as (...args: unknown[]) => unknown,
  ) as typeof anyNet.createConnection;
  const socketProto = net.Socket.prototype as unknown as {
    connect: (...args: never[]) => unknown;
  };
  const rawSocketConnect = socketProto.connect;
  socketProto.connect = function (this: unknown, ...args: unknown[]) {
    assertTcpAllowed("tcp", args);
    return (rawSocketConnect as (...args: unknown[]) => unknown).apply(
      this,
      args,
    );
  } as typeof socketProto.connect;
}

/** Wraps tls.connect with the TLS assertion. */
function guardTlsConnect(): void {
  const anyTls = tls as unknown as {
    connect: (...args: never[]) => unknown;
  };
  const rawTlsConnect = anyTls.connect.bind(tls);
  anyTls.connect = ((...args: unknown[]) => {
    assertTcpAllowed("tls", args);
    return (rawTlsConnect as (...args: unknown[]) => unknown)(...args);
  }) as typeof anyTls.connect;
}

/** Wraps Bun.connect, which takes an options object instead of args. */
function guardBunConnect(): void {
  const bun = Bun as unknown as { connect?: (...args: never[]) => unknown };
  if (typeof bun.connect !== "function") return;
  const rawBunConnect = bun.connect.bind(Bun);
  bun.connect = ((opts: unknown) => {
    if (opts !== null && typeof opts === "object") {
      const o = opts as { unix?: unknown; hostname?: unknown };
      if (typeof o.unix !== "string") {
        const host = typeof o.hostname === "string" ? o.hostname : "127.0.0.1";
        if (!isLoopbackHostname(host)) refuse("tcp", host, NETWORK_HINT);
      }
    }
    return (rawBunConnect as (opts: unknown) => unknown)(opts);
  }) as typeof bun.connect;
}

function installNetworkGuard(): void {
  const rawFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: unknown) => {
    assertFetchAllowed(input);
    return (rawFetch as (...args: unknown[]) => unknown)(input, init);
  }) as typeof fetch;

  guardHttpModule(http, "http");
  guardHttpModule(https, "https");
  guardNetConnections();
  guardTlsConnect();
  guardBunConnect();
}

function redirectPriceCache(): void {
  if (process.env.FACTORY_PRICE_CACHE?.trim()) return;
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-hermetic-no-prices-"),
  );
  removeAtFileEnd(() => fs.rmSync(dir, { recursive: true, force: true }));
  process.env.FACTORY_PRICE_CACHE = path.join(dir, "openrouter-models.json");
}

if (hermeticGuardActive) {
  installSpawnGuard();
  installNetworkGuard();
  redirectPriceCache();
  // A swallowed refusal still fails its test: the recording outlives the
  // caught throw, and this hook runs before the next test starts. (A refusal
  // at import time fails the importing file first; the recording then burns
  // on the next hook run, with the blame stack pointing at the real site.)
  afterEach(() => {
    const drained = drainViolations();
    if (drained.length === 0) return;
    const report = drained
      .map(
        (v) =>
          `blocked ${v.kind} "${v.detail}"\n${blameLines(v.stack).join("\n")}`,
      )
      .join("\n");
    throw new HermeticViolation(
      `hermetic guard: ${drained.length} refused call(s) outlived the test body (swallowed by the code under test):\n${report}`,
    );
  });
}
