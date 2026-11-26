import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CTRFReport } from "ctrf";
import { ctrfTestRuntimes } from "../../src/core/checks/ctrf.js";
import { runGates } from "../../src/kernel/gates.js";
import {
  checkTestRuntimes,
  goalStartTestRuntimes,
  recordTestRuntimes,
  testRuntimeComparison,
} from "../../src/kernel/test-runtimes.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { rec, script } from "./helpers.js";

function makeCtrfReport(
  tests: Array<{
    name: string;
    status: "passed" | "failed" | "skipped" | "pending" | "other";
    duration: number;
    filePath?: string;
    suite?: string[];
  }>,
): CTRFReport {
  return {
    reportFormat: "CTRF",
    specVersion: "0.3.0",
    reportId: "00000000-0000-4000-8000-000000000020",
    results: {
      tool: { name: "bun" },
      summary: {
        tests: tests.length,
        passed: tests.filter((t) => t.status === "passed").length,
        failed: tests.filter((t) => t.status === "failed").length,
        skipped: tests.filter((t) => t.status === "skipped").length,
        pending: tests.filter((t) => t.status === "pending").length,
        other: tests.filter((t) => t.status === "other").length,
        start: 0,
        stop: 100,
      },
      tests,
    },
  };
}

function gateRuntime(
  root: string,
  gates: KernelRuntime["configs"]["repo"]["gates"],
): KernelRuntime {
  return {
    paths: { repoRoot: root },
    store: { goalDir: root },
    configs: { repo: { gates } },
  } as unknown as KernelRuntime;
}

describe("ctrfTestRuntimes", () => {
  it("tracks only passing tests, normalizes worktree file paths, and disambiguates duplicates", () => {
    const report = makeCtrfReport([
      {
        name: "adds",
        status: "passed",
        duration: 15,
        filePath: "/wt/task-a/src/sum.test.ts",
        suite: ["/wt/task-a/src/sum.test.ts", "math"],
      },
      {
        name: "adds",
        status: "passed",
        duration: 25,
        filePath: "/wt/task-a/src/sum.test.ts",
        suite: ["math"],
      },
      {
        name: "fails",
        status: "failed",
        duration: 999,
        filePath: "/wt/task-a/src/sum.test.ts",
      },
      {
        name: "skips",
        status: "skipped",
        duration: 5,
        filePath: "/wt/task-a/src/sum.test.ts",
      },
    ]);
    expect(ctrfTestRuntimes(report, "/wt/task-a")).toEqual({
      "src/sum.test.ts > math > adds": 15,
      "src/sum.test.ts > math > adds (#2)": 25,
    });
  });
});

describe("gate runtime extraction", () => {
  it("stores passing CTRF and JUnit per-test runtimes across different worktree roots", async () => {
    const rootA = fs.mkdtempSync(path.join(os.tmpdir(), "rt-a-"));
    const rootB = fs.mkdtempSync(path.join(os.tmpdir(), "rt-b-"));
    try {
      const ctrfA = makeCtrfReport([
        {
          name: "fast",
          status: "passed",
          duration: 12,
          filePath: `${rootA}/test/a.test.ts`,
        },
        {
          name: "broken",
          status: "failed",
          duration: 500,
          filePath: `${rootA}/test/a.test.ts`,
        },
      ]);
      fs.writeFileSync(path.join(rootA, "ctrf.json"), JSON.stringify(ctrfA));
      const ctrfGate = {
        id: "tests",
        command: "mkdir -p reports && cp ctrf.json reports/ctrf.json",
        serial: [],
        format: { ctrf: "reports/ctrf.json" },
      };
      const [checkA] = await runGates(gateRuntime(rootA, [ctrfGate]), rootA);
      expect(checkA).toBeDefined();
      expect(checkTestRuntimes(checkA as NonNullable<typeof checkA>)).toEqual({
        "test/a.test.ts > fast": 12,
      });

      const junitXml = `<testsuites>
  <testsuite name="suite" file="${rootB}/test/a.test.ts" tests="2" failures="0">
    <testcase classname="suite" name="fast" time="0.035" file="${rootB}/test/a.test.ts" />
    <testcase classname="suite" name="slow" time="1.250" file="${rootB}/test/b.test.ts" />
  </testsuite>
</testsuites>`;
      fs.writeFileSync(path.join(rootB, "junit.xml"), junitXml);
      const junitGate = {
        id: "tests",
        command: 'mkdir -p reports && cp junit.xml "$FACTORY_JUNIT_PATH"',
        serial: [],
        format: { junit: "reports/junit.xml" },
      };
      const [checkB] = await runGates(gateRuntime(rootB, [junitGate]), rootB);
      expect(checkB).toBeDefined();
      expect(checkTestRuntimes(checkB as NonNullable<typeof checkB>)).toEqual({
        "test/a.test.ts > suite > fast": 35,
        "test/b.test.ts > suite > slow": 1250,
      });
    } finally {
      fs.rmSync(rootA, { recursive: true, force: true });
      fs.rmSync(rootB, { recursive: true, force: true });
    }
  });
});

describe("testRuntimeComparison", () => {
  it("selects earliest baseline for goal start, prefers head runs for current, and ignores flakes", () => {
    const baseCheck = (testRuntimes: Record<string, number>) => [
      {
        name: "tests",
        ok: true,
        summary: "pass",
        output: "",
        fingerprint: "fp",
        details: { roots: ["/wt"], truncated: false, testRuntimes },
      },
    ];
    const records: StepRecord[] = [
      script(1, {
        iteration: 0,
        step: "baseline",
        base: "1".repeat(40),
        checks: baseCheck({ "a.test.ts > a": 100, "old.test.ts > old": 50 }),
      }),
      script(2, {
        iteration: 1,
        slug: "t1",
        step: "gate-flake",
        checks: baseCheck({ "a.test.ts > a": 9999 }),
      }),
      script(3, {
        iteration: 1,
        slug: "t1",
        step: "merge-checks",
        checks: baseCheck({
          "a.test.ts > a": 140,
          "b.test.ts > new | pipe": 60,
        }),
      }),
      script(4, {
        iteration: 1,
        slug: "t2",
        step: "checks",
        ok: false,
        checks: baseCheck({ "a.test.ts > a": 500 }),
      }),
      script(5, {
        iteration: 0,
        step: "baseline",
        base: "2".repeat(40),
        checks: baseCheck({
          "a.test.ts > a": 180,
          "b.test.ts > new | pipe": 70,
        }),
      }),
      rec(6, { step: "implement" }),
    ];

    const goalStart = goalStartTestRuntimes(records);
    expect(goalStart).toEqual({
      seq: 1,
      iteration: 0,
      step: "baseline",
      totalMs: 150,
      testCount: 2,
      tests: { "a.test.ts > a": 100, "old.test.ts > old": 50 },
    });
    expect(recordTestRuntimes(records[1] as StepRecord)).toBeUndefined();

    const comparison = testRuntimeComparison(records);
    expect(comparison?.goalStart.seq).toBe(1);
    expect(comparison?.current?.seq).toBe(5);
    expect(comparison?.deltaMs).toBe(100);
    expect(comparison?.deltaPct).toBeCloseTo((100 / 150) * 100, 5);
    expect(comparison?.rows).toEqual([
      {
        name: "a.test.ts > a",
        goalStartMs: 100,
        currentMs: 180,
        deltaMs: 80,
      },
      {
        name: "b.test.ts > new | pipe",
        goalStartMs: null,
        currentMs: 70,
        deltaMs: null,
      },
      {
        name: "old.test.ts > old",
        goalStartMs: 50,
        currentMs: null,
        deltaMs: null,
      },
    ]);
  });
});
