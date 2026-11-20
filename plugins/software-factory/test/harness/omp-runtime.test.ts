import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OmpRuntime } from "../../src/harness/omp/runtime.js";

const RUNTIME = fileURLToPath(
  new URL("../../src/harness/omp/runtime.ts", import.meta.url),
);

function ompBinary(options: string, env: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-omp-"));
  try {
    fs.writeFileSync(path.join(dir, "omp"), "#!/bin/sh\n", { mode: 0o755 });
    const script = path.join(dir, "probe.ts");
    fs.writeFileSync(
      script,
      `import { OmpRuntime } from ${JSON.stringify(RUNTIME)};
console.log(new OmpRuntime(${options}).binary);`,
    );
    // Bun.which reads PATH at process start, so the PATH case needs a child.
    const child = Bun.spawnSync([process.execPath, script], {
      cwd: dir,
      env: { ...process.env, PATH: dir, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("omp binary resolution", () => {
  it("takes the run-config path, ignoring OMP_PATH and PATH", () => {
    const binary = ompBinary(
      '{ binary: "/opt/omp-override", sessionDir: "/tmp" }',
      {
        OMP_PATH: "/nonexistent/omp-from-env",
      },
    );
    expect(binary).toBe("/opt/omp-override");
  });

  it("ignores OMP_PATH and resolves omp through PATH", () => {
    const binary = ompBinary('{ sessionDir: "/tmp" }', {
      OMP_PATH: "/nonexistent/omp-from-env",
    });
    expect(binary).toMatch(/\/omp$/);
    expect(binary).not.toBe("/nonexistent/omp-from-env");
  });
});

describe("omp transient agent definitions", () => {
  it("writes a content-addressed extension package and reuses it", () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-omp-"));
    try {
      const runtime = new OmpRuntime({
        binary: "/opt/omp",
        sessionDir,
      });
      const agents = [
        {
          name: "subarchitect",
          markdown: "---\nname: subarchitect\n---\nrole\n",
        },
      ];
      const first = runtime.agentsDir(agents);
      const second = runtime.agentsDir(agents);
      expect(first).toBe(second);
      expect(
        fs.readFileSync(path.join(first, "agents", "subarchitect.md"), "utf8"),
      ).toBe(agents[0]!.markdown);
      const changed = runtime.agentsDir([
        { name: "subarchitect", markdown: "different" },
      ]);
      expect(changed).not.toBe(first);
    } finally {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it("refuses a definition name that would escape the agents root", () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-omp-"));
    try {
      const runtime = new OmpRuntime({ binary: "/opt/omp", sessionDir });
      expect(() =>
        runtime.agentsDir([{ name: "../x", markdown: "role" }]),
      ).toThrow('invalid omp agent name "../x"');
    } finally {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });
});
