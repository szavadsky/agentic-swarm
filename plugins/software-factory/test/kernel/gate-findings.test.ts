import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gateSignatures, runGates } from "../../src/kernel/gates.js";
import type { KernelRuntime } from "../../src/kernel/types.js";

/** A CTRF report: one failed vitest case under a passing suite summary. */
const CTRF_REPORT = JSON.stringify({
  reportFormat: "CTRF",
  specVersion: "0.3.0",
  reportId: "00000000-0000-4000-8000-000000000011",
  results: {
    tool: { name: "vitest" },
    summary: {
      tests: 1,
      passed: 0,
      failed: 1,
      pending: 0,
      skipped: 0,
      other: 0,
      start: 0,
      stop: 1,
    },
    tests: [
      {
        name: "subtracts",
        status: "failed",
        duration: 1,
        filePath: "src/sum.test.ts",
        testId: "sum-subtracts",
        message: "expected 1 to be -1",
      },
    ],
  },
});

/** A SARIF log: one eslint error at a known file and line. */
const SARIF_LOG = JSON.stringify({
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: { name: "eslint", rules: [{ id: "no-unused-vars" }] },
      },
      results: [
        {
          ruleId: "no-unused-vars",
          level: "error",
          message: { text: "'x' is assigned a value but never used" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "src/a.ts" },
                region: { startLine: 7 },
              },
            },
          ],
        },
      ],
    },
  ],
});

function runtimeWith(
  root: string,
  gates: KernelRuntime["configs"]["repo"]["gates"],
): KernelRuntime {
  return {
    paths: { repoRoot: root },
    store: { goalDir: root },
    configs: { repo: { gates } },
  } as unknown as KernelRuntime;
}

describe("a CTRF gate", () => {
  it("names a failing CTRF case even though the command exits 0", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ctrf-"));
    try {
      fs.writeFileSync(path.join(root, "ctrf.json"), CTRF_REPORT);
      const gate = {
        id: "js",
        command: 'mkdir -p reports && cp ctrf.json "$PWD/reports/ctrf.json"',
        serial: [],
        format: { ctrf: "reports/ctrf.json" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("1 failing: src/sum.test.ts > subtracts");
      expect([...gateSignatures(run!)]).toEqual([
        "js > src/sum.test.ts > subtracts",
      ]);
      expect(run!.details).toMatchObject({
        findings: [
          {
            check: "js",
            tool: "vitest",
            file: "src/sum.test.ts",
            rule: "subtracts",
            severity: "error",
          },
        ],
      });
      expect(fs.existsSync(path.join(root, "reports/ctrf.json"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a SARIF gate", () => {
  it("names a SARIF result at its file and line", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-sarif-"));
    try {
      fs.writeFileSync(path.join(root, "sarif.json"), SARIF_LOG);
      const gate = {
        id: "lint",
        command: "mkdir -p reports && cp sarif.json reports/sarif.json; exit 1",
        serial: [],
        format: { sarif: "reports/sarif.json" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 1");
      expect(run!.details).toMatchObject({
        findings: [
          {
            tool: "eslint",
            file: "src/a.ts",
            line: 7,
            rule: "no-unused-vars",
            severity: "error",
          },
        ],
      });
      expect(fs.existsSync(path.join(root, "reports/sarif.json"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a gate with no report", () => {
  it("works by exit code and log", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-log-"));
    try {
      const gate = {
        id: "types",
        command:
          "echo \"src/a.ts(12,3): error TS2322: Type 'string' is not assignable\"; exit 1",
        serial: [],
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 1");
      expect([...gateSignatures(run!)]).toEqual(["src/a.ts:12 TS2322"]);
      expect(run!.details).toMatchObject({
        findings: [
          {
            check: "types",
            tool: "log",
            file: "src/a.ts",
            line: 12,
            severity: "error",
            message: "error TS2322: Type 'string' is not assignable",
          },
        ],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
