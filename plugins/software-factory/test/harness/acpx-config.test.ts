import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAcpxCommand } from "../../src/harness/acpx/command.js";
import { ConfigError, loadConfigs } from "../../src/kernel/config.js";

const PACKAGE = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ACPX_COMMAND = path.join(PACKAGE, "src/harness/acpx/command.ts");
const HARNESSES = path.join(PACKAGE, "src/cli/harnesses.ts");

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-binary-"));
}

function executable(dir: string, name: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, "#!/bin/sh\n", { mode: 0o755 });
  return file;
}

/**
 * Bun.which reads PATH at process start, so a PATH case runs in a child with
 * PATH limited to `dir`; that is the only way to prove which lookup wins.
 */
function probe(
  dir: string,
  source: string,
  env: Record<string, string> = {},
): string {
  const script = path.join(dir, "probe.ts");
  fs.writeFileSync(script, source);
  const child = Bun.spawnSync([process.execPath, script], {
    cwd: dir,
    env: { ...process.env, PATH: dir, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}

describe("harness binary resolution", () => {
  harnessBinaryResolutionPart1();
  harnessBinaryResolutionPart2();
  harnessBinaryResolutionPart3();
  harnessBinaryResolutionPart4();
});

function harnessBinaryResolutionPart1() {
  it("takes the configured acpx path over PATH", () => {
    const dir = tmpDir();
    try {
      const override = executable(dir, "acpx-override");
      expect(resolveAcpxCommand(override)).toEqual({
        binary: override,
        prefix: [],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores ACPX_PATH and resolves acpx through PATH", () => {
    const dir = tmpDir();
    try {
      const onPath = executable(dir, "acpx");
      const out = probe(
        dir,
        `import { resolveAcpxCommand } from ${JSON.stringify(ACPX_COMMAND)};
console.log(JSON.stringify(resolveAcpxCommand()));`,
        { ACPX_PATH: "/nonexistent/acpx-from-env" },
      );
      expect(JSON.parse(out)).toEqual({ binary: onPath, prefix: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the bunx acpx fallback when acpx is not on PATH", () => {
    const dir = tmpDir();
    try {
      const bunx = executable(dir, "bunx");
      const out = probe(
        dir,
        `import { resolveAcpxCommand } from ${JSON.stringify(ACPX_COMMAND)};
console.log(JSON.stringify(resolveAcpxCommand()));`,
      );
      expect(JSON.parse(out)).toEqual({ binary: bunx, prefix: ["acpx"] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function harnessBinaryResolutionPart2() {
  it("resolves each harness from its config override, then PATH", () => {
    const dir = tmpDir();
    try {
      const onPath = executable(dir, "acpx");
      const out = probe(
        dir,
        `import { resolveHarnessBinaries } from ${JSON.stringify(HARNESSES)};
console.log(JSON.stringify(resolveHarnessBinaries({
  omp: { binary: "/opt/omp-override" },
  plain: { acpx: { agent: "plain" } },
  pinned: { binary: "/opt/acpx-pinned", acpx: { agent: "pinned" } },
  nova: { acpx: { agent: "/opt/nova/bin/nova acp", raw: true } },
})));`,
      );
      expect(JSON.parse(out)).toEqual({
        omp: "/opt/omp-override",
        plain: onPath,
        pinned: "/opt/acpx-pinned",
        // A raw agent names its own executable; `binary` is the dispatcher.
        nova: "/opt/nova/bin/nova",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves omp through PATH when the run config sets no binary", () => {
    const dir = tmpDir();
    try {
      const omp = executable(dir, "omp");
      const out = probe(
        dir,
        `import { resolveHarnessBinaries } from ${JSON.stringify(HARNESSES)};
console.log(JSON.stringify(resolveHarnessBinaries().omp));`,
        { OMP_PATH: "/nonexistent/omp-from-env" },
      );
      expect(JSON.parse(out)).toBe(omp);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

function harnessBinaryResolutionPart3() {
  it("reads per-harness binary overrides from the run config", () => {
    const root = tmpDir();
    try {
      fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".factory/run.yaml"),
        [
          "harnesses:",
          "  omp:",
          "    binary: /opt/omp-override",
          "    compaction: { enabled: true }",
          "  pi:",
          "    binary: /opt/acpx-override",
          "    acpx: { agent: pi }",
          "    compaction: { enabled: false, reason: no compact command }",
          "",
        ].join("\n"),
      );
      const configs = loadConfigs(root);
      expect(configs.run.harnesses!.omp).toEqual({
        binary: "/opt/omp-override",
        compaction: { enabled: true },
      });
      expect(configs.run.harnesses!.pi!.binary).toBe("/opt/acpx-override");
      expect(configs.run.harnesses!.pi!.acpx!.agent).toBe("pi");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function harnessBinaryResolutionPart4() {
  it("rejects a harness entry that neither binds an adapter nor a binary", () => {
    const root = tmpDir();
    try {
      fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".factory/run.yaml"),
        "harnesses:\n  pi: {}\n",
      );
      expect(() => loadConfigs(root)).toThrow(ConfigError);
      try {
        loadConfigs(root);
      } catch (err) {
        expect((err as ConfigError).findings).toContainEqual(
          expect.objectContaining({
            key: "harnesses.pi",
            message: expect.stringContaining("acpx"),
          }),
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
