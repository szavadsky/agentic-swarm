import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/index.js";

/** A stand-in binary that answers the two probes `caps` makes. */
function ompBinary(sessionDir: string, version: string): string {
  const dir = path.join(sessionDir, "bin");
  fs.mkdirSync(dir, { recursive: true });
  const binary = path.join(dir, "omp");
  fs.writeFileSync(
    binary,
    [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then',
      `  echo "omp/${version}"`,
      "  exit 0",
      "fi",
      'if [ "$1" = "models" ]; then',
      "  echo '{\"models\":[]}'",
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return binary;
}

describe("omp caps", () => {
  it("advertises steer only on the binary that has the subagent RPC commands", async () => {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-omp-"));
    try {
      const modern = new OmpHarness({
        retention: "short",
        binary: ompBinary(sessionDir, "18.22.2"),
        sessionDir,
      });
      expect((await modern.caps({ id: "opencode-go/test" })).subagents).toBe(
        "steer",
      );
      const older = new OmpHarness({
        retention: "short",
        binary: ompBinary(sessionDir, "18.20.0"),
        sessionDir,
      });
      expect((await older.caps({ id: "opencode-go/test" })).subagents).toBe(
        "spawn",
      );
    } finally {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });
});
