import { describe, expect, it } from "bun:test";
import { repoConfigSchema } from "../../../src/kernel/config.js";
import { normaliseFindings } from "../../../src/kernel/gates-normalise.js";
import type { GateConfig } from "../../../src/kernel/types.js";

function gate(patch: Partial<GateConfig> = {}): GateConfig {
  return { id: "tests", command: "true", serial: [], ...patch };
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
  it("works by exit code and log when the gate writes no report", async () => {
    const findings = await normaliseFindings(gate(), {
      exitCode: 1,
      log: [
        "src/a.ts(12,3): error TS2322: Type 'string' is not assignable",
        "1 error",
      ].join("\n"),
    });
    expect(findings).toEqual([
      expect.objectContaining({
        check: "tests",
        tool: "log",
        file: "src/a.ts",
        line: 12,
        severity: "error",
      }),
    ]);
    expect(
      await normaliseFindings(gate(), { exitCode: 0, log: "all green" }),
    ).toEqual([]);
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

  it("no longer accepts a runner enum in the gate format", () => {
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
  });
}
