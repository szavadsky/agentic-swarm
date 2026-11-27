import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import yaml from "yaml";
import { GateReportError } from "../../../src/core/checks/findings.js";
import { repoConfigSchema } from "../../../src/kernel/config.js";
import { normaliseFindings } from "../../../src/kernel/gates-normalise.js";
import type { GateConfig } from "../../../src/kernel/types.js";
import { treeFile } from "../../helpers/run-configs.js";

function gate(patch: Partial<GateConfig> = {}): GateConfig {
  return { id: "tests", command: "true", serial: [], ...patch };
}

function selfBuildGate(id: string): GateConfig {
  const file = treeFile(".factory/repo.yaml");
  if (!file) throw new Error("tree carries no .factory/repo.yaml");
  const repo = repoConfigSchema.parse(
    yaml.parse(fs.readFileSync(file, "utf8")),
  );
  const found = repo.gates.find((g) => g.id === id);
  if (!found) throw new Error(`.factory/repo.yaml defines no ${id} gate`);
  return found;
}

const CTRF = {
  reportFormat: "CTRF",
  specVersion: "0.3.0",
  reportId: "00000000-0000-4000-8000-000000000001",
  results: {
    tool: { name: "vitest" },
    summary: {
      tests: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      pending: 0,
      other: 0,
      start: 0,
      stop: 1,
    },
    tests: [
      {
        name: "adds",
        status: "passed",
        duration: 1,
        filePath: "src/sum.test.ts",
      },
      {
        name: "subtracts",
        status: "failed",
        duration: 1,
        filePath: "src/sum.test.ts",
        line: 12,
        testId: "sum-subtracts",
        message: "Expected 1, received 2",
      },
    ],
  },
};

const JUNIT = `<testsuites name="bun test" tests="2" failures="1">
  <testsuite name="test/red.test.ts" file="test/red.test.ts" tests="2" failures="1">
    <testcase name="passes alpha" classname="" file="test/red.test.ts" />
    <testcase name="fails beta" classname="" file="test/red.test.ts">
      <failure type="AssertionError" message="expected 1">stack</failure>
    </testcase>
  </testsuite>
</testsuites>
`;

const SARIF = {
  $schema:
    "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
  version: "2.1.0",
  runs: [
    {
      tool: { driver: { name: "eslint" } },
      results: [
        {
          ruleId: "no-unused-vars",
          level: "error",
          message: { text: "'unused' is assigned but never used" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "src/a.ts" },
                region: { startLine: 7 },
              },
            },
          ],
        },
        {
          ruleId: "no-console",
          level: "warning",
          message: { text: "unexpected console call" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "src/b.ts" },
                region: { startLine: 2 },
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("normaliseFindings", () => {
  registerReportFormats();
  registerLogFallback();
});

function registerReportFormats(): void {
  registerCtrfFindings();
  registerJunitFindings();
  registerSarifFindings();
}

function registerCtrfFindings(): void {
  it("reads a CTRF report into one failing finding per test", async () => {
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      ctrf: JSON.stringify(CTRF),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: "tests",
      tool: "vitest",
      file: "src/sum.test.ts",
      line: 12,
      rule: "subtracts",
      severity: "error",
      message: "Expected 1, received 2",
    });
    expect(findings[0]!.fingerprint).toBeString();
  });

  it("keeps a test's fingerprint when its assertion values drift", async () => {
    const changed = {
      ...CTRF,
      reportId: "00000000-0000-4000-8000-000000000002",
      results: {
        ...CTRF.results,
        tests: CTRF.results.tests.map((test) =>
          test.name === "subtracts"
            ? { ...test, message: "Expected 9, received 4" }
            : test,
        ),
      },
    };
    const first = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      ctrf: JSON.stringify(CTRF),
    });
    const second = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      ctrf: JSON.stringify(changed),
    });
    expect(second[0]!.fingerprint).toBe(first[0]!.fingerprint);
  });
}

function registerJunitFindings(): void {
  it("keeps same-named tests in different files distinct", async () => {
    const report = {
      ...CTRF,
      results: {
        ...CTRF.results,
        tests: [
          {
            ...CTRF.results.tests[1]!,
            filePath: "src/a.test.ts",
            testId: "a-test",
          },
          {
            ...CTRF.results.tests[1]!,
            filePath: "src/b.test.ts",
            testId: "b-test",
          },
        ],
      },
    };
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      ctrf: JSON.stringify(report),
    });
    expect(findings[0]!.fingerprint).not.toBe(findings[1]!.fingerprint);
  });

  it("keeps same-named JUnit cases in different modules distinct", async () => {
    const report = `<testsuites>
  <testsuite name="pytest" failures="2">
    <testcase classname="tests.a" name="test_same"><failure message="x">s</failure></testcase>
    <testcase classname="tests.b" name="test_same"><failure message="x">s</failure></testcase>
  </testsuite>
</testsuites>`;
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      junit: report,
    });
    expect(findings).toHaveLength(2);
    expect(findings[0]!.fingerprint).not.toBe(findings[1]!.fingerprint);
  });

  it("converts a JUnit report through junit-to-ctrf", async () => {
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      junit: JUNIT,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: "tests",
      tool: "tests",
      file: "test/red.test.ts",
      rule: "fails beta",
      severity: "error",
    });
  });
}

function registerSarifFindings(): void {
  it("validates a SARIF 2.1.0 log and maps its results", async () => {
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: "",
      sarif: JSON.stringify(SARIF),
    });
    expect(findings.map((finding) => finding.rule)).toEqual([
      "no-unused-vars",
      "no-console",
    ]);
    expect(findings[0]).toMatchObject({
      tool: "eslint",
      file: "src/a.ts",
      line: 7,
      severity: "error",
      message: "'unused' is assigned but never used",
    });
    expect(findings[1]!.severity).toBe("warning");
  });

  it("rejects a report the standard's schema rejects", async () => {
    await expect(
      normaliseFindings(gate(), {
        exitCode: 1,
        log: "",
        ctrf: JSON.stringify({ reportFormat: "CTRF" }),
      }),
    ).rejects.toThrow("CTRF report is invalid");
    await expect(
      normaliseFindings(gate(), {
        exitCode: 1,
        log: "",
        sarif: JSON.stringify({ version: "2.0.0", runs: [] }),
      }),
    ).rejects.toThrow("SARIF report is invalid");
  });
}

function registerLogFallback(): void {
  it("filters runner noise declared by the self-build repo config", async () => {
    const typecheck = selfBuildGate("typecheck");
    const tscFindings = await normaliseFindings(typecheck, {
      exitCode: 1,
      log: [
        "src/a.ts(12,3): error TS2322: Type 'string' is not assignable",
        "1 error",
        "Found 1 error in 1 file.",
      ].join("\n"),
    });
    expect(tscFindings).toEqual([
      expect.objectContaining({
        check: "typecheck",
        tool: "log",
        file: "src/a.ts",
        line: 12,
        severity: "error",
      }),
    ]);

    const tests = selfBuildGate("tests");
    const bunFindings = await normaliseFindings(tests, {
      exitCode: 1,
      log: [
        "bun test v1.4.4 (38afee6c8)",
        "---",
        "tests gate: wall 1.2s (--parallel=4; slowest: a.test.ts 0.5s)",
        "test/a.test.ts:5:10: error: expected 1 to be 2",
        "0 pass",
        "1 fail",
        "1 expect() calls",
        "Ran 1 test across 1 file.",
      ].join("\n"),
    });
    expect(bunFindings).toEqual([
      expect.objectContaining({
        check: "tests",
        tool: "log",
        file: "test/a.test.ts",
        line: 5,
        severity: "error",
        message: "error: expected 1 to be 2",
      }),
    ]);

    expect(
      await normaliseFindings(tests, { exitCode: 0, log: "all green" }),
    ).toEqual([]);
  });

  it("keeps runner lines as findings when no noise patterns are configured", async () => {
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: [
        "bun test v1.4.4 (38afee6c8)",
        "src/a.ts(12,3): error TS2322: Type 'string' is not assignable",
        "1 error",
        "Found 1 error in 1 file.",
      ].join("\n"),
    });
    expect(findings.map((finding) => finding.message)).toEqual([
      "bun test v1.4.4 (38afee6c8)",
      "error TS2322: Type 'string' is not assignable",
      "1 error",
      "Found 1 error in 1 file.",
    ]);
  });

  it("filters another runner's declared noise patterns", async () => {
    const findings = await normaliseFindings(
      gate({
        id: "py",
        format: {
          noise: ["^=+ .* =+$", "^\\d+ failed, \\d+ passed in "],
        },
      }),
      {
        exitCode: 1,
        log: [
          "=== test session starts ===",
          "tests/test_calc.py:9: AssertionError",
          "1 failed, 2 passed in 0.12s",
        ].join("\n"),
      },
    );
    expect(findings).toEqual([
      expect.objectContaining({
        check: "py",
        tool: "log",
        file: "tests/test_calc.py",
        line: 9,
        message: "AssertionError",
      }),
    ]);
  });

  it("rejects an invalid noise regex", async () => {
    await expect(
      normaliseFindings(gate({ format: { noise: ["["] } }), {
        exitCode: 0,
        log: "",
      }),
    ).rejects.toThrow(GateReportError);
  });

  it("uses a declared regex as the escape hatch before the raw log", async () => {
    const findings = await normaliseFindings(
      gate({
        format: {
          regex: [
            {
              pattern: "^FAILED (?<file>\\S+)::(?<rule>\\S+) - (?<message>.*)$",
              tool: "pytest",
            },
          ],
        },
      }),
      {
        exitCode: 1,
        log: "FAILED tests/test_calc.py::test_sub - assert 1 == 2",
      },
    );
    expect(findings[0]).toMatchObject({
      tool: "pytest",
      file: "tests/test_calc.py",
      rule: "test_sub",
      severity: "error",
      message: "assert 1 == 2",
    });
  });

  it("validates gate format schemas including noise patterns", () => {
    expect(
      repoConfigSchema.safeParse({
        gates: [{ id: "py", command: "pytest", format: { pattern: "pytest" } }],
      }).success,
    ).toBe(false);
    expect(
      repoConfigSchema.safeParse({
        gates: [
          {
            id: "py",
            command: "pytest",
            format: { regex: [{ pattern: "^FAILED (?<rule>\\S+)$" }] },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      repoConfigSchema.safeParse({
        gates: [
          {
            id: "py",
            command: "pytest",
            format: { noise: ["^=+ .* =+$"] },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      repoConfigSchema.safeParse({
        gates: [{ id: "py", command: "pytest", format: { noise: [] } }],
      }).success,
    ).toBe(false);
    expect(
      repoConfigSchema.safeParse({
        gates: [{ id: "py", command: "pytest", format: { noise: [""] } }],
      }).success,
    ).toBe(false);
  });
}
