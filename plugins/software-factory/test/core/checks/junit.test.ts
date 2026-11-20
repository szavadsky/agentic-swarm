import { describe, expect, it } from "bun:test";
import {
  capJunit,
  failedFiles,
  failedTests,
  parseJunit,
} from "../../../src/core/checks/junit.js";

/** bun's report: the file is on both the suite and each case. */
const BUN = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" failures="1">
  <testsuite name="test/red.test.ts" file="test/red.test.ts" tests="2" failures="1">
    <testcase name="suite > passes alpha" classname="" file="test/red.test.ts" />
    <testcase name="suite > fails beta" classname="" file="test/red.test.ts">
      <failure type="AssertionError" message="expect(received).toBe(expected)">stack</failure>
    </testcase>
  </testsuite>
</testsuites>
`;

/** pytest's report: no file attribute; `classname` names the module. */
const PYTEST = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" errors="1" failures="1" skipped="0" tests="3">
    <testcase classname="tests.test_calc" name="test_add" time="0.001" />
    <testcase classname="tests.test_calc" name="test_sub" time="0.002">
      <failure message="assert 1 == 2">tests/test_calc.py:9: AssertionError</failure>
    </testcase>
    <testcase classname="tests.test_calc" name="test_div" time="0.003">
      <error message="ZeroDivisionError">tests/test_calc.py:14: ZeroDivisionError</error>
    </testcase>
  </testsuite>
</testsuites>
`;

/** jest-junit's report: the classname is the test file. */
const JEST = `<testsuites name="jest tests" tests="2" failures="1">
  <testsuite name="sum" errors="0" failures="1" skipped="0" tests="2">
    <testcase classname="src/sum.test.js" name="sum &#8250; adds" time="0.01" />
    <testcase classname="src/sum.test.js" name="sum &#8250; subtracts" time="0.01">
      <failure>Expected: 1 Received: 2</failure>
    </testcase>
  </testsuite>
</testsuites>
`;

/** libtest/cargo's report, rooted at the suite rather than a `testsuites`. */
const CARGO = `<testsuite name="pkg" tests="2" failures="1">
  <testcase name="tests::alpha" classname="pkg" time="0.001" />
  <testcase name="tests::beta" classname="pkg" time="0.002">
    <failure message="panicked">thread panicked</failure>
  </testcase>
</testsuite>
`;

describe("parseJunit", () => {
  it("reads bun's report and names each failed file and test", () => {
    const report = parseJunit(BUN);
    expect(report.cases).toEqual([
      {
        name: "suite > passes alpha",
        status: "pass",
        file: "test/red.test.ts",
      },
      { name: "suite > fails beta", status: "fail", file: "test/red.test.ts" },
    ]);
    expect(report.suiteFailed).toBe(true);
    expect(report.truncated).toBe(false);
    expect(failedFiles(report)).toEqual(["test/red.test.ts"]);
    expect(failedTests(report)).toEqual([
      "test/red.test.ts > suite > fails beta",
    ]);
  });

  it("reads a pytest-shaped report: classname is the file, error is a failure", () => {
    const report = parseJunit(PYTEST);
    expect(report.cases).toEqual([
      { name: "test_add", status: "pass", file: "tests.test_calc" },
      { name: "test_sub", status: "fail", file: "tests.test_calc" },
      { name: "test_div", status: "fail", file: "tests.test_calc" },
    ]);
    expect(failedTests(report)).toEqual([
      "tests.test_calc > test_sub",
      "tests.test_calc > test_div",
    ]);
  });

  it("reads jest-junit's and cargo's reports", () => {
    expect(parseJunit(JEST).cases).toEqual([
      { name: "sum › adds", status: "pass", file: "src/sum.test.js" },
      { name: "sum › subtracts", status: "fail", file: "src/sum.test.js" },
    ]);
    expect(parseJunit(CARGO).cases).toEqual([
      { name: "tests::alpha", status: "pass", file: "pkg" },
      { name: "tests::beta", status: "fail", file: "pkg" },
    ]);
  });

  it("keeps a suite-level failure even when it names no case", () => {
    const report = parseJunit(
      '<testsuite name="broken"><failure message="collect failed">x</failure></testsuite>',
    );
    expect(report.cases).toEqual([]);
    expect(report.suiteFailed).toBe(true);
  });

  it("rejects a malformed report instead of reading part of it", () => {
    expect(() => parseJunit("<testsuite><testcase")).toThrow();
  });
});

describe("capJunit", () => {
  it("keeps failing cases first and reports what the caps dropped", () => {
    const report = parseJunit(PYTEST);
    const capped = capJunit(report, { cases: 2, nameChars: 3 });
    expect(capped.cases).toEqual([
      { name: "tes", status: "fail", file: "tests.test_calc" },
      { name: "tes", status: "fail", file: "tests.test_calc" },
    ]);
    expect(capped.truncated).toBe(true);
    expect(capped.suiteFailed).toBe(true);
    // The stored subset still names the failures it kept.
    expect(failedFiles(capped)).toEqual(["tests.test_calc"]);
  });

  it("stops at the character cap and keeps the failures it already has", () => {
    const capped = capJunit(parseJunit(PYTEST), { chars: 40, nameChars: 100 });
    expect(capped.cases).toHaveLength(1);
    expect(capped.cases[0]!.status).toBe("fail");
    expect(capped.truncated).toBe(true);
  });

  it("is not truncated when every case fits", () => {
    const capped = capJunit(parseJunit(BUN), { cases: 10, nameChars: 100 });
    expect(capped.truncated).toBe(false);
    expect(capped.cases).toHaveLength(2);
  });
});
