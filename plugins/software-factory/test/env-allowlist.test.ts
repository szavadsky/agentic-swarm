import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRealModelCatalog } from "../src/cli/harnesses.js";
import { childEnv } from "../src/core/env.js";
import { runProcess } from "../src/core/proc.js";
import type { AcpxConfig } from "../src/harness/acpx/config.js";
import { AcpxHarness } from "../src/harness/acpx/harness.js";
import { OmpRpc } from "../src/harness/omp/rpc.js";
import { createAcpxStub } from "./harness/acpx-stub.js";

/** Planted in the factory's own environment; no child may inherit it unasked. */
const PLANTED = "FACTORY_PLANTED_SECRET";

const PI_ACPX: AcpxConfig = { agent: "pi" };

/** Parses `env`/`printenv` output into name -> value. */
function parseEnv(stdout: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) env[line.slice(0, at)] = line.slice(at + 1);
  }
  return env;
}

function readEnvFile(file: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

/** A ready-speaking omp stand-in that dumps its environment and exits on stdin EOF. */
function fakeOmpBinary(dir: string, envFile: string): string {
  const binary = path.join(dir, "fake-omp.js");
  fs.writeFileSync(
    binary,
    `#!/usr/bin/env bun
import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(envFile)}, JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
`,
    { mode: 0o755 },
  );
  return binary;
}

/** An `omp models --json` stand-in that dumps its environment first. */
function fakeOmpModelsBinary(dir: string, envFile: string): string {
  const binary = path.join(dir, "fake-omp-models.js");
  fs.writeFileSync(
    binary,
    `#!/usr/bin/env bun
import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(envFile)}, JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ models: [{ provider: "p", id: "m" }] }) + "\\n");
`,
    { mode: 0o755 },
  );
  return binary;
}

describe("child environment allowlist", () => {
  it("keeps the base toolchain and drops everything else", () => {
    const env = childEnv({
      source: {
        PATH: "/usr/bin",
        HOME: "/home/operator",
        BUN_INSTALL: "/home/operator/.bun",
        LC_ALL: "C.UTF-8",
        [PLANTED]: "s3cret",
        OPENAI_API_KEY: "sk-test",
      },
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/operator");
    expect(env.BUN_INSTALL).toBe("/home/operator/.bun");
    expect(env.LC_ALL).toBe("C.UTF-8");
    expect(env[PLANTED]).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("adds configured names, and explicit values win over inherited ones", () => {
    const env = childEnv({
      source: { [PLANTED]: "inherited", UNLISTED: "hidden" },
      allow: [PLANTED],
      set: { [PLANTED]: "explicit" },
    });

    expect(env[PLANTED]).toBe("explicit");
    expect(env.UNLISTED).toBeUndefined();
  });
});

describe("spawned child environments", () => {
  it("runProcess spawns with only the allowlisted environment", async () => {
    process.env[PLANTED] = "s3cret";
    try {
      const res = await runProcess({ cmd: ["env"], cwd: process.cwd() });

      expect(res.code).toBe(0);
      expect(res.stdout).not.toContain("s3cret");
      const env = parseEnv(res.stdout);
      expect(env[PLANTED]).toBeUndefined();
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env[PLANTED];
    }
  });

  it("runProcess inherits a name the config allows and a value the caller sets", async () => {
    process.env[PLANTED] = "inherited";
    try {
      const allowed = await runProcess({
        cmd: ["env"],
        cwd: process.cwd(),
        envAllowlist: [PLANTED],
      });
      expect(parseEnv(allowed.stdout)[PLANTED]).toBe("inherited");

      const explicit = await runProcess({
        cmd: ["env"],
        cwd: process.cwd(),
        env: { [PLANTED]: "explicit" },
      });
      expect(parseEnv(explicit.stdout)[PLANTED]).toBe("explicit");
    } finally {
      delete process.env[PLANTED];
    }
  });

  it("OmpRpc spawns with only the allowlisted environment", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-allowlist-omp-"));
    const envFile = path.join(dir, "env.json");
    process.env[PLANTED] = "s3cret";
    try {
      const rpc = await OmpRpc.launch(
        { binary: fakeOmpBinary(dir, envFile), args: [], cwd: dir },
        5_000,
      );
      await rpc.close();

      const env = readEnvFile(envFile);
      expect(env[PLANTED]).toBeUndefined();
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env[PLANTED];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the omp model catalog probe inherits the configured allowlist", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "env-allowlist-catalog-"),
    );
    const envFile = path.join(dir, "env.json");
    const unshared = "FACTORY_PLANTED_UNSHARED";
    process.env[PLANTED] = "s3cret";
    process.env[unshared] = "s3cret";
    try {
      const catalog = createRealModelCatalog(
        { omp: fakeOmpModelsBinary(dir, envFile) },
        [PLANTED],
      );
      expect(await catalog("omp", "p/m")).toBe(true);

      const env = readEnvFile(envFile);
      expect(env[PLANTED]).toBe("s3cret");
      expect(env.PATH).toBe(process.env.PATH);
      expect(env[unshared]).toBeUndefined();
    } finally {
      delete process.env[PLANTED];
      delete process.env[unshared];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AcpxHarness's prompt child inherits only the allowlisted environment", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-allowlist-acpx-"));
    const envFile = path.join(dir, "env.json");
    const stub = createAcpxStub({ envFile });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    process.env[PLANTED] = "s3cret";
    try {
      const result = await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: dir,
        prompt: "Say [[text:PONG]]",
        timeouts: { idleMs: 10_000, wallMs: 30_000 },
      });

      expect(result.stop).toEqual({ kind: "done" });
      const env = readEnvFile(envFile);
      expect(env[PLANTED]).toBeUndefined();
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env[PLANTED];
      stub.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AcpxHarness's prompt child inherits a name the config allows", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-allowlist-acpx-"));
    const envFile = path.join(dir, "env.json");
    const stub = createAcpxStub({ envFile });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
      envAllowlist: [PLANTED],
    });
    process.env[PLANTED] = "inherited";
    try {
      await harness.turn({
        model: { id: "opencode-go/beam-free" },
        cwd: dir,
        prompt: "Say [[text:PONG]]",
        timeouts: { idleMs: 10_000, wallMs: 30_000 },
      });

      expect(readEnvFile(envFile)[PLANTED]).toBe("inherited");
    } finally {
      delete process.env[PLANTED];
      stub.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
