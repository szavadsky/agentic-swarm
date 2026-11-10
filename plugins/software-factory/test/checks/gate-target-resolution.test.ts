import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  resolveGateTarget,
  normalizeDeveloperTarget,
  formatKnownGateTargets,
} from "../../src/core/checks/gate-target.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import type { InfraArtifact } from "../../src/core/artifacts.js";

// (a) Gate command -> name mapping. Merge verify received `{gate: "uv run
// pytest tests -q"}` while the configured gate id was `test`, and failed with
// "Unknown gate target" although the gate existed. Recorded commands must map
// to configured gates; genuinely unknown values still fail loudly.

const modernizeInfra: InfraArtifact = {
  setup: ["uv sync"],
  gates: [
    { id: "format", command: "uv run ruff format --check --config config/ruff.toml src tests" },
    { id: "lint", command: "uv run lint --tools 'tach check,ruff check'" },
    { id: "test", command: "uv run pytest -q" },
    { id: "test-integration", command: "uv run pytest tests/integration.py -q" },
  ],
  testRunner: {
    command: "uv run pytest",
    selectorArgs: ["-k"],
    junitArg: "--junitxml={path}",
  },
};

describe("gate-target resolution: recorded command -> configured gate id", () => {
  it("resolves exact and case-insensitive gate ids", () => {
    expect(resolveGateTarget("test", modernizeInfra)?.id).toBe("test");
    expect(resolveGateTarget("TEST", modernizeInfra)?.id).toBe("test");
    expect(resolveGateTarget("test-integration", modernizeInfra)?.id).toBe("test-integration");
  });

  it("resolves exact commands and command extensions on word boundaries", () => {
    expect(resolveGateTarget("uv run pytest -q", modernizeInfra)?.id).toBe("test");
    expect(resolveGateTarget("uv  run   pytest -q", modernizeInfra)?.id).toBe("test");
    // Recorded command extends the gate command (extra flag).
    expect(resolveGateTarget("uv run pytest -q -x", modernizeInfra)?.id).toBe("test");
  });

  it("maps the modernize evidence value to the base test gate", () => {
    // Journal: target {"gate": "uv run pytest tests -q"} vs gate id `test`
    // (`uv run pytest -q`) and `test-integration` (`uv run pytest
    // tests/integration.py -q`). The positional `tests` must not select the
    // integration gate.
    expect(resolveGateTarget("uv run pytest tests -q", modernizeInfra)?.id).toBe("test");
  });

  it("maps explicit integration invocations to the integration gate", () => {
    expect(
      resolveGateTarget("uv run pytest tests/integration.py -q", modernizeInfra)?.id
    ).toBe("test-integration");
    expect(
      resolveGateTarget("uv run pytest tests/integration.py -q -k foo", modernizeInfra)?.id
    ).toBe("test-integration");
  });

  it("returns undefined for genuinely unknown targets and names commands in the catalogue", () => {
    expect(resolveGateTarget("cargo test", modernizeInfra)).toBeUndefined();
    expect(resolveGateTarget("", modernizeInfra)).toBeUndefined();
    expect(resolveGateTarget("test", undefined)).toBeUndefined();
    const known = formatKnownGateTargets(modernizeInfra);
    expect(known).toContain("test = `uv run pytest -q`");
    expect(known).toContain("test-integration = `uv run pytest tests/integration.py -q`");
    expect(formatKnownGateTargets(undefined)).toBe("(no gates configured)");
  });

  it("normalizeDeveloperTarget rewrites command forms to the gate id", () => {
    expect(
      normalizeDeveloperTarget({ gate: "uv run pytest tests -q" }, modernizeInfra)
    ).toEqual({ gate: "test" });
    expect(normalizeDeveloperTarget({ gate: "test" }, modernizeInfra)).toEqual({ gate: "test" });
    expect(normalizeDeveloperTarget({ gate: "cargo test" }, modernizeInfra)).toEqual({
      gate: "cargo test",
    });
    expect(
      normalizeDeveloperTarget({ selectors: ["a"], expectRed: ["a"] }, modernizeInfra)
    ).toEqual({ selectors: ["a"], expectRed: ["a"] });
    expect(normalizeDeveloperTarget(undefined, modernizeInfra)).toBeUndefined();
  });

  it("target-green resolves a recorded command target and runs the gate command", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-target-"));
    try {
      const marker = path.join(dir, "gate-ran.txt");
      const infra: InfraArtifact = {
        setup: [],
        gates: [{ id: "test", command: `touch "${marker}"` }],
        testRunner: { command: "touch" },
      };
      const ctx: CheckContext = {
        repo: undefined as any,
        wt: dir,
        base: "main",
        project: { orchestrationFolder: ".factory" } as any,
        pipeline: { limits: {}, models: { roles: {} }, agents: {}, flows: { simple: { steps: [] }, story: {}, spike: {} } } as any,
        infra,
        kind: "dev",
        task: "t",
        taskWt: dir,
        taskDir: dir,
        target: { gate: "touch" }, // recorded command == testRunner command
        limits: {},
        outputBytes: 4096,
      };
      const res = await runCheck("target-green", ctx);
      expect(res.ok).toBe(true);
      expect(res.summary).toContain("Gate test passed");
      expect((res.details as { command: string }).command).toBe(`touch "${marker}"`);
      expect(fs.existsSync(marker)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("target-green still fails loudly for an unknown target and lists commands", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-target-bad-"));
    try {
      const ctx: CheckContext = {
        repo: undefined as any,
        wt: dir,
        base: "main",
        project: { orchestrationFolder: ".factory" } as any,
        pipeline: { limits: {}, models: { roles: {} }, agents: {}, flows: { simple: { steps: [] }, story: {}, spike: {} } } as any,
        infra: modernizeInfra,
        kind: "dev",
        task: "t",
        taskWt: dir,
        taskDir: dir,
        target: { gate: "cargo test" },
        limits: {},
        outputBytes: 4096,
      };
      const res = await runCheck("target-green", ctx);
      expect(res.ok).toBe(false);
      expect(res.summary).toContain('Unknown gate target: "cargo test"');
      expect(res.summary).toContain("test = `uv run pytest -q`");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
