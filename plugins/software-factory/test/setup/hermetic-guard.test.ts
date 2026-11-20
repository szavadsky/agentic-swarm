import { describe, expect, it } from "bun:test";
import {
  exec,
  execFile,
  execFileSync,
  execSync,
  spawn,
  spawnSync,
} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../../src/core/proc.js";
import { loadPriceTable } from "../../src/kernel/openrouter.js";
import {
  HermeticViolation,
  drainViolations,
  harnessName,
  hermeticGuardActive,
  isLoopbackHostname,
} from "./hermetic-guard.js";

const LIVE = process.env.FACTORY_LIVE === "1";

describe("hermetic guard", () => {
  it("is active on the default run and exempt under FACTORY_LIVE=1", () => {
    expect(hermeticGuardActive).toBe(!LIVE);
  });

  describe.skipIf(LIVE)("refusals", () => {
    refusalsPart1();
    refusalsPart2();
    refusalsPart3();
    refusalsPart4();
  });

  describe.skipIf(LIVE)("allowances", () => {
    allowancesPart1();
    allowancesPart2();
    allowancesPart3();
    allowancesPart4();
  });
});

function allowancesPart1() {
  it("allows loopback fetch", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("pong"),
    });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(await res.text()).toBe("pong");
      const named = await fetch(`http://localhost:${server.port}/`);
      expect(await named.text()).toBe("pong");
    } finally {
      server.stop();
    }
  });
}

function allowancesPart2() {
  it("allows loopback node:http and node:net servers", async () => {
    const server = http.createServer((_req, res) => res.end("pong"));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as net.AddressInfo).port;
    try {
      const body = await new Promise<string>((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/`, (res) => {
            let text = "";
            res.on("data", (chunk) => (text += chunk));
            res.on("end", () => resolve(text));
          })
          .on("error", reject);
      });
      expect(body).toBe("pong");
      const tcp = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.end();
          resolve("tcp-ok");
        });
        socket.on("error", reject);
      });
      expect(tcp).toBe("tcp-ok");
    } finally {
      server.close();
    }
  });

  it("allows git and bun subprocesses", () => {
    expect(execFileSync("git", ["--version"], { encoding: "utf8" })).toContain(
      "git version",
    );
    const run = Bun.spawnSync(["bun", "--version"], { stdout: "pipe" });
    expect(run.exitCode).toBe(0);
  });
}

function allowancesPart3() {
  it("allows a harness-named stub by tmp path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermetic-stub-"));
    try {
      for (const name of ["acpx", "omp"]) {
        const binary = path.join(dir, name);
        fs.writeFileSync(binary, "#!/bin/sh\necho stub-ok\n", {
          mode: 0o755,
        });
        expect(execFileSync(binary, [], { encoding: "utf8" }).trim()).toBe(
          "stub-ok",
        );
      }
      expect(
        execSync(`"${path.join(dir, "acpx")}"`, { encoding: "utf8" }).trim(),
      ).toBe("stub-ok");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not mistake stub-like names for harness binaries", () => {
    expect(harnessName("acpx-stub.js")).toBeUndefined();
    expect(harnessName("fake-omp.js")).toBeUndefined();
    expect(harnessName("/tmp/x/boom-opencode.js")).toBeUndefined();
    expect(harnessName("omp")).toBe("omp");
    expect(harnessName("/usr/bin/pi")).toBe("pi");
  });
}

function allowancesPart4() {
  it("classifies loopback hosts", () => {
    for (const host of [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "127.0.0.1",
      "127.1",
      "127.0.0.2",
      "::1",
      "[::1]",
    ]) {
      expect(isLoopbackHostname(host)).toBe(true);
    }
    for (const host of [
      "example.com",
      "10.0.0.1",
      "8.8.8.8",
      "127.999.1.1",
      "localhostx",
      "127.0.0.1.evil.com",
    ]) {
      expect(isLoopbackHostname(host)).toBe(false);
    }
  });

  it("points the default price cache at a missing file", async () => {
    const cache = process.env.FACTORY_PRICE_CACHE;
    if (cache === undefined) {
      throw new Error("guard must point FACTORY_PRICE_CACHE at a missing file");
    }
    expect(fs.existsSync(cache)).toBe(false);
    // The refused fetch surfaces as unpriced, never as a network call.
    await expect(loadPriceTable()).resolves.toEqual({});
    expect(drainViolations().length).toBe(1);
  });
}

function refusalsPart1() {
  it("refuses fetch to a non-loopback host", () => {
    expect(() => fetch("https://example.invalid/models")).toThrow(
      HermeticViolation,
    );
    expect(() => fetch("http://10.0.0.1:8080/x")).toThrow(HermeticViolation);
    expect(() =>
      fetch(new Request("https://openrouter.ai/api/v1/models")),
    ).toThrow(HermeticViolation);
    const drained = drainViolations();
    expect(drained.length).toBe(3);
    expect(drained.map((v) => v.kind)).toEqual(["fetch", "fetch", "fetch"]);
  });

  it("refuses node:http(s) and node:net to a non-loopback host", () => {
    expect(() => http.get("http://example.invalid/", () => {})).toThrow(
      HermeticViolation,
    );
    expect(() => http.request("http://example.invalid/", () => {})).toThrow(
      HermeticViolation,
    );
    expect(() => https.get("https://example.invalid/", () => {})).toThrow(
      HermeticViolation,
    );
    expect(() => https.request("https://example.invalid/", () => {})).toThrow(
      HermeticViolation,
    );
    expect(() => net.connect(80, "example.invalid")).toThrow(HermeticViolation);
    expect(() => net.connect({ host: "8.8.8.8", port: 53 })).toThrow(
      HermeticViolation,
    );
    const drained = drainViolations();
    expect(drained.map((v) => v.kind)).toEqual([
      "http",
      "http",
      "https",
      "https",
      "tcp",
      "tcp",
    ]);
  });
}

function refusalsPart2() {
  it("refuses native Bun.connect to a non-loopback host", () => {
    const socket = {
      data: () => {},
      open: () => {},
      close: () => {},
      error: () => {},
    };
    expect(() =>
      Bun.connect({ hostname: "example.invalid", port: 443, socket }),
    ).toThrow(HermeticViolation);
    expect(() =>
      Bun.connect({ hostname: "8.8.8.8", port: 53, socket }),
    ).toThrow(HermeticViolation);
    const drained = drainViolations();
    expect(drained.map((v) => v.kind)).toEqual(["tcp", "tcp"]);
  });
}

function refusalsPart3() {
  it("refuses to spawn a harness binary through the spawn families", () => {
    expect(() => Bun.spawnSync(["omp", "--version"])).toThrow(
      HermeticViolation,
    );
    expect(() => Bun.spawn(["acpx", "--version"])).toThrow(HermeticViolation);
    expect(() => spawn("codex", ["--version"])).toThrow(HermeticViolation);
    expect(() => exec("pi --version", () => {})).toThrow(HermeticViolation);
    expect(() => execFile("agy", ["--version"], () => {})).toThrow(
      HermeticViolation,
    );
    // spawnSync carries a spawn failure as result.error instead of throwing.
    const synced = spawnSync("codex", ["--version"]);
    expect(synced.error).toBeInstanceOf(HermeticViolation);
    expect(() => execSync("pi --version", { stdio: "pipe" })).toThrow(
      HermeticViolation,
    );
    expect(() =>
      execFileSync("claude", ["--version"], { stdio: "pipe" }),
    ).toThrow(HermeticViolation);
    expect(() =>
      Bun.spawnSync(["/usr/local/bin/opencode", "--version"]),
    ).toThrow(HermeticViolation);
    expect(() => Bun.spawnSync(["bash", "-c", "echo hi; agy run"])).toThrow(
      HermeticViolation,
    );
    expect(() => Bun.spawnSync(["bunx", "acpx", "--version"])).toThrow(
      HermeticViolation,
    );
    const drained = drainViolations();
    expect(drained.length).toBe(11);
    expect(new Set(drained.map((v) => v.kind))).toEqual(new Set(["spawn"]));
  });
}

function refusalsPart4() {
  it("refuses every harness binary by name", () => {
    const binaries = [
      "omp",
      "acpx",
      "opencode",
      "claude",
      "agy",
      "codex",
      "pi",
    ];
    for (const binary of binaries) {
      expect(() => Bun.spawnSync([binary, "--version"])).toThrow(
        HermeticViolation,
      );
    }
    const drained = drainViolations();
    expect(drained.map((v) => v.detail)).toEqual(binaries);
  });

  it("refuses a harness spawn through the production runProcess seam", async () => {
    const result = await runProcess({
      cmd: ["omp", "--version"],
      cwd: os.tmpdir(),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("hermetic guard");
    expect(drainViolations().length).toBe(1);
  });
}
