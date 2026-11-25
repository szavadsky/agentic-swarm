import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import { repoConfigSchema } from "../../src/kernel/config.js";
import {
  formatFailingChecks,
  GATE_TIMEOUT_SEC,
  gateSignatures,
  gateTimeoutSec,
  isInfraCheck,
  newGateFailures,
  runGates,
} from "../../src/kernel/gates.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { GateConfig, KernelRuntime } from "../../src/kernel/types.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function check(patch: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "gate",
    ok: false,
    summary: "exit 1",
    output: "boom",
    fingerprint: "x",
    ...patch,
  };
}

function declaredGate(patch: Partial<GateConfig> = {}): GateConfig {
  return { id: "gate", command: "true", serial: [], ...patch };
}

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

/** Scripts the implement and review turns an advisory task runs. */
function scriptAdvisoryTask(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "feature.txt"), "ok\n");
      ctx.writeOutcome(outcome({ summary: "added the feature" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
}

/** What pytest writes: no file attribute; the classname names the module. */
const PYTEST_JUNIT = `<testsuites>
  <testsuite name="pytest" errors="0" failures="1" skipped="0" tests="2">
    <testcase classname="tests.test_calc" name="test_add" />
    <testcase classname="tests.test_calc" name="test_sub" time="0.002">
      <failure message="assert 1 == 2">tests/test_calc.py:9: AssertionError</failure>
    </testcase>
  </testsuite>
</testsuites>
`;

describe("gateSignatures", () => {
  it("includes failing JUnit cases in signatures", () => {
    const c = check({
      name: "test-junit",
      details: {
        junit: {
          cases: [
            { name: "test1", status: "pass" },
            { name: "test2", status: "fail" },
          ],
          suiteFailed: false,
        },
      },
    });
    const signatures = gateSignatures(c);
    expect(signatures).toContain("test-junit > test2");
    expect(signatures).not.toContain("test-junit > test1");
  });

  it("handles suite-level failures", () => {
    const c = check({
      name: "test-junit",
      details: {
        junit: {
          cases: [],
          suiteFailed: true,
        },
      },
    });
    const signatures = gateSignatures(c);
    expect(signatures).toContain("test-junit > suite-failure");
  });
});

describe("declared log regexes", () => {
  it("reads a repo regex into one finding, not the assertion detail", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-regex-"));
    try {
      const gate = {
        id: "py",
        command:
          "echo 'FAILED tests/test_calc.py::test_sub - AssertionError: assert 1 == 2'; exit 1",
        serial: [],
        format: {
          regex: [
            {
              pattern: "^FAILED\\s+(?<rule>\\S+)\\s+-\\s+(?<message>.*)$",
              tool: "pytest",
            },
          ],
        },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.details).toMatchObject({
        findings: [
          {
            check: "py",
            tool: "pytest",
            rule: "tests/test_calc.py::test_sub",
            severity: "error",
          },
        ],
      });
      expect([...gateSignatures(run!)]).toEqual([
        "py > tests/test_calc.py::test_sub",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a pytest-shaped JUnit gate", () => {
  it("runs a pytest-shaped JUnit gate and names its failing case", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-pytest-"));
    try {
      fs.writeFileSync(path.join(root, "pytest-junit.xml"), PYTEST_JUNIT);
      const gate = {
        id: "py",
        // The declared report path reaches the command as FACTORY_JUNIT_PATH.
        command:
          'mkdir -p reports && cp pytest-junit.xml "$FACTORY_JUNIT_PATH"',
        serial: [],
        format: { junit: "reports/junit.xml" },
      };
      const [first] = await runGates(runtimeWith(root, [gate]), root);
      expect(first!.ok).toBe(false);
      expect(first!.summary).toBe("1 failing: pytest > test_sub");
      expect([...gateSignatures(first!)]).toEqual(["py > pytest > test_sub"]);
      expect(first!.details).toMatchObject({
        findings: [
          {
            check: "py",
            tool: "py",
            rule: "pytest > test_sub",
            severity: "error",
          },
        ],
      });
      // The kernel consumed the report: a stale one cannot colour the next run.
      expect(fs.existsSync(path.join(root, "reports/junit.xml"))).toBe(false);

      // A passing test added between runs is not a new red.
      fs.writeFileSync(
        path.join(root, "pytest-junit.xml"),
        PYTEST_JUNIT.replace(
          "</testsuite>",
          '  <testcase classname="tests.test_calc" name="test_mul" />\n  </testsuite>',
        ),
      );
      const [second] = await runGates(runtimeWith(root, [gate]), root);
      expect([...gateSignatures(second!)]).toEqual(["py > pytest > test_sub"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("declared gate report failures", () => {
  it("turns a missing JUnit report into a red, not a silent pass", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-nojunit-"));
    try {
      const gate = {
        id: "py",
        command: "true",
        serial: [],
        format: { junit: "reports/junit.xml" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("JUnit report not generated");
      expect(run!.details).toMatchObject({
        error: "JUnit report not generated",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("turns an empty declared report into a red, not a silent pass", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-empty-ctrf-"));
    try {
      const gate = {
        id: "js",
        command: "mkdir -p reports && : > reports/ctrf.json",
        serial: [],
        format: { ctrf: "reports/ctrf.json" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("CTRF report is empty");
      expect(run!.details).toMatchObject({
        error: "CTRF report is empty",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("turns a report its standard rejects into a red, not a silent pass", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-bad-ctrf-"));
    try {
      const gate = {
        id: "js",
        command: "mkdir -p reports && echo not-json > reports/ctrf.json",
        serial: [],
        format: { ctrf: "reports/ctrf.json" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary.startsWith("CTRF report is not JSON")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a JUnit gate whose command cannot start", () => {
  it("keeps the infra exit summary instead of a report error", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-missing-"));
    try {
      const gate = {
        id: "py",
        command: "definitely-not-a-command-in-the-path",
        serial: [],
        format: { junit: "reports/junit.xml" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 127");
      expect(isInfraCheck(run!)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a large JUnit report", () => {
  it("stores a bounded finding list, failures first", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cap-"));
    try {
      const cases = Array.from(
        { length: 205 },
        (_, i) =>
          `<testcase classname="module" name="test_${i}"><failure message="broken">stack</failure></testcase>`,
      ).join("");
      fs.writeFileSync(
        path.join(root, "big-junit.xml"),
        `<testsuite name="big" tests="205">${cases}</testsuite>`,
      );
      const gate = {
        id: "big",
        command: 'mkdir -p reports && cp big-junit.xml "$FACTORY_JUNIT_PATH"',
        serial: [],
        format: { junit: "reports/junit.xml" },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      const stored = run!.details as { findings: { severity: string }[] };
      expect(stored.findings).toHaveLength(200);
      expect(stored.findings.every((f) => f.severity === "error")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("per-gate walls", () => {
  // The package-only export carries no `.factory/repo.yaml`, so the wall test
  // declares its gates inline; that file is the schema-validation gate's.
  it("runs a declared 1800 s tests gate at that wall and an undeclared gate at 900 s", () => {
    expect(
      gateTimeoutSec(declaredGate({ id: "tests", timeoutSec: 1800 })),
    ).toBe(1800);
    expect(gateTimeoutSec(declaredGate({ id: "typecheck" }))).toBe(
      GATE_TIMEOUT_SEC,
    );
    expect(GATE_TIMEOUT_SEC).toBe(900);
  });

  it("parses a gate's declared wall and keeps an undeclared one absent", () => {
    const repo = repoConfigSchema.parse({
      gates: [
        { id: "tests", command: "bun test", timeoutSec: 1800 },
        { id: "lint", command: "biome check" },
      ],
    });
    expect(repo.gates.map((gate) => gate.timeoutSec)).toEqual([
      1800,
      undefined,
    ]);
  });

  it("falls back to the shared wall for absent, zero, negative or non-numeric walls", () => {
    const repo = repoConfigSchema.parse({
      gates: [
        { id: "zero", command: "true", timeoutSec: 0 },
        { id: "negative", command: "true", timeoutSec: -5 },
      ],
    });
    for (const gate of repo.gates) expect(gateTimeoutSec(gate)).toBe(900);
    expect(gateTimeoutSec({})).toBe(900);
    for (const timeoutSec of [Number.NaN, "1800"]) {
      expect(
        gateTimeoutSec({
          timeoutSec,
        } as unknown as Pick<GateConfig, "timeoutSec">),
      ).toBe(900);
    }
  });

  it("stops a gate at its declared wall and names that wall", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-wall-"));
    try {
      const [run] = await runGates(
        runtimeWith(root, [
          declaredGate({ id: "slow", command: "sleep 5", timeoutSec: 0.2 }),
        ]),
        root,
      );
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("timed out after 0.2s");
      expect(run!.details).toMatchObject({ roots: [root] });
      expect(isInfraCheck(run!)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("advisory gates", () => {
  it("parses a per-gate advisory flag", () => {
    const repo = repoConfigSchema.parse({
      gates: [
        { id: "lint", command: "true", advisory: true },
        { id: "tests", command: "true" },
      ],
    });
    expect(repo.gates.map((gate) => gate.advisory)).toEqual([true, undefined]);
  });

  it("records an advisory red with its output and leaves a gating red blocking", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-advisory-"));
    try {
      const [advisory] = await runGates(
        runtimeWith(root, [
          declaredGate({
            id: "lint",
            command: "echo lint-output; exit 1",
            advisory: true,
          }),
        ]),
        root,
      );
      expect(advisory).toMatchObject({
        ok: false,
        advisory: true,
        summary: "exit 1",
      });
      expect(newGateFailures([advisory!], new Set())).toEqual([]);
      expect(formatFailingChecks([advisory!])).toBe(
        "### lint (advisory): exit 1\nlint-output",
      );

      const [gating] = await runGates(
        runtimeWith(root, [declaredGate({ id: "tests", command: "exit 1" })]),
        root,
      );
      expect(newGateFailures([gating!], new Set())).toEqual([gating!]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("advisory task checks", () => {
  it("lets an advisory task's red check reach merge", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "test -f fixed.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptAdvisoryTask(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { advisory: true }));

      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const checks = records
        .filter(
          (candidate) =>
            candidate.slug === "task" && candidate.step === "checks",
        )
        .at(-1)!;
      expect(checks.ok).toBe(true);
      expect(
        checks.checks?.find((check) => check.name === "unit"),
      ).toMatchObject({ ok: false, advisory: true });
      expect(
        records
          .filter(
            (candidate) =>
              candidate.slug === "task" && candidate.step === "merge",
          )
          .at(-1)?.ok,
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("isInfraCheck", () => {
  it("matches a marked check that could not start", () => {
    expect(
      isInfraCheck(check({ details: { kind: "infra", cause: "exit 127" } })),
    ).toBe(true);
  });

  it("matches a missing gate runner by its kernel-owned summary, details or not", () => {
    expect(isInfraCheck(check({ summary: "exit 127" }))).toBe(true);
    expect(isInfraCheck(check({ summary: "exit 126" }))).toBe(true);
    expect(
      isInfraCheck(
        check({ summary: "exit 127", details: { roots: ["/tmp/x"] } }),
      ),
    ).toBe(true);
  });

  it("leaves real reds and passes alone", () => {
    expect(isInfraCheck(check({ summary: "exit 1" }))).toBe(false);
    expect(isInfraCheck(check({ summary: "timed out after 900s" }))).toBe(
      false,
    );
    expect(isInfraCheck(check({ ok: true, summary: "pass" }))).toBe(false);
  });
});
