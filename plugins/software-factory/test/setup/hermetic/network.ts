import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { NETWORK_HINT, refuse } from "./violations.js";
import { isLoopbackHostname } from "./hosts.js";

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

export function installNetworkGuard(): void {
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
