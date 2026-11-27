import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import {
  type BaseGateState,
  checkBase,
  preexistingRed,
  recordedBaseGates,
} from "../../src/kernel/baseline.js";
import {
  capGateOutput,
  GATE_OUTPUT_CAP,
  gateSignatures,
  newGateFailures,
  runGates,
} from "../../src/kernel/gates.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

function check(
  name: string,
  output: string,
  patch: Partial<CheckResult> = {},
): CheckResult {
  return {
    name,
    ok: false,
    summary: "exit 1",
    output,
    fingerprint: `${name}:${output}`,
    ...patch,
  };
}

/** A check as `runGates`/`runBaseGates` produce it: it knows the root it ran from. */
function rooted(
  name: string,
  output: string,
  root: string,
  truncated = false,
): CheckResult {
  return check(name, output, { details: { roots: [root], truncated } });
}

function base(checks: CheckResult[]): BaseGateState {
  return { commit: "base-commit", ok: false, checks };
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

function makeRoot(prefix: string, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
  }
  return root;
}

async function recordsPytestJUnitReportBaseSoPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  repo.writeFile("pytest-junit.xml", PYTEST_JUNIT);
  const commit = repo.commit("pytest fixture");
  const runtime = await makeRuntime(repo, goal, {});
  const warn = console.warn;
  console.warn = () => {};
  let baseline: { ok: boolean };
  try {
    baseline = await checkBase(
      runtime.configs,
      runtime.store,
      repo.dir,
      "main",
      commit,
    );
  } finally {
    console.warn = warn;
  }
  expect(baseline.ok).toBe(false);
  const recorded = recordedBaseGates(await runtime.store.listRecords())!;
  // The base record carries the report's findings, not only its output lines.
  expect(recorded.checks[0]!.details).toMatchObject({
    findings: [
      {
        rule: "pytest > test_sub",
        severity: "error",
      },
    ],
  });
  expect([...gateSignatures(recorded.checks[0]!)]).toEqual([
    "py > pytest > test_sub",
  ]);
  expect(recorded.checks[0]!.summary).toBe("1 failing: pytest > test_sub");

  // The task worktree is a different absolute root and runs the same gate;
  // the failing case name, not a root-bearing output line, is the identity.
  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gate-task-"));

  return { runtime, recorded, taskRoot };
}

async function recordsPytestJUnitReportBaseSoPart2(
  scope: Awaited<ReturnType<typeof recordsPytestJUnitReportBaseSoPart1>>,
) {
  const { taskRoot, runtime, recorded } = scope;
  try {
    fs.writeFileSync(path.join(taskRoot, "pytest-junit.xml"), PYTEST_JUNIT);
    const [run] = await runGates(runtime, taskRoot);
    expect([...gateSignatures(run!)]).toEqual(["py > pytest > test_sub"]);
    expect(newGateFailures([run!], preexistingRed(recorded))).toEqual([]);

    // A different failing case under the same gate is the task's own red.
    fs.writeFileSync(
      path.join(taskRoot, "pytest-junit.xml"),
      PYTEST_JUNIT.replace('"test_sub"', '"test_new"'),
    );
    const [fresh] = await runGates(runtime, taskRoot);
    expect(
      newGateFailures([fresh!], preexistingRed(recorded)).map((c) => c.name),
    ).toEqual(["py"]);
  } finally {
    fs.rmSync(taskRoot, { recursive: true, force: true });
  }
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart7(): void {
  it("matches two capped runs of the same red log across roots and catches a new line", () => {
    const rawFor = (root: string) =>
      Array.from(
        { length: 120 },
        (_, i) => `error: check ${i} failed under ${root}/sub/item-${i}.txt`,
      ).join("\n");
    const first = capGateOutput(rawFor("/base/scratch/probe"), [
      "/base/scratch/probe",
    ]);
    const second = capGateOutput(rawFor("/task/wt"), ["/task/wt"]);
    expect(first.truncated).toBe(true);
    expect(second.truncated).toBe(true);
    expect(first.output.length).toBeLessThanOrEqual(GATE_OUTPUT_CAP);
    expect(second.output).toBe(first.output);

    const baseline = rooted(
      "shell",
      first.output,
      "/base/scratch/probe",
      first.truncated,
    );
    const inherited = preexistingRed(base([baseline]));
    expect(
      newGateFailures(
        [rooted("shell", second.output, "/task/wt", second.truncated)],
        inherited,
      ),
    ).toEqual([]);

    const extra = capGateOutput(
      `${rawFor("/task/wt")}\nerror: brand new failure`,
      ["/task/wt"],
    );
    expect(
      newGateFailures(
        [rooted("shell", extra.output, "/task/wt", extra.truncated)],
        inherited,
      ).map((c) => c.name),
    ).toEqual(["shell"]);
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart11(): void {
  it("emits no identity for a single line longer than the cap", async () => {
    const root = makeRoot("gate-line-", {});
    try {
      const runtime = {
        paths: { repoRoot: root },
        configs: {
          repo: {
            gates: [
              {
                id: "package",
                command: `printf 'x%.0s' {1..${GATE_OUTPUT_CAP + 1}}; exit 1`,
              },
            ],
          },
        },
        store: { goalDir: root },
      } as unknown as KernelRuntime;
      const [run] = await runGates(runtime, root);
      expect(run!.output).toBe("");
      expect([...gateSignatures(run!)]).toEqual([]);
      // Nothing in it names a failure, so it matches only as unidentified.
      expect(newGateFailures([run!], new Set()).map((c) => c.name)).toEqual([
        "package",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart12(): void {
  it("records the baseline root its gate ran from so a task worktree matches", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "package",
          command: 'echo "cannot read $(pwd)/src/x.txt"; exit 1',
        },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const commit = repo.git(["rev-parse", "HEAD"]).stdout.trim();
      const warn = console.warn;
      console.warn = () => {};
      let baseline: { ok: boolean };
      try {
        baseline = await checkBase(
          runtime.configs,
          runtime.store,
          repo.dir,
          "main",
          commit,
        );
      } finally {
        console.warn = warn;
      }
      expect(baseline.ok).toBe(false);
      const recorded = recordedBaseGates(await runtime.store.listRecords())!;
      expect([...gateSignatures(recorded.checks[0]!)]).toEqual([
        "line: cannot read <root>/src/x.txt",
      ]);

      // A task worktree is a different absolute root; the same red must still
      // match, or every task on this base is blamed for the inherited failure.
      const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gate-task-"));
      try {
        const [run] = await runGates(runtime, taskRoot);
        expect([...gateSignatures(run!)]).toEqual([
          "line: cannot read <root>/src/x.txt",
        ]);
        expect(newGateFailures([run!], preexistingRed(recorded))).toEqual([]);
      } finally {
        fs.rmSync(taskRoot, { recursive: true, force: true });
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart13(): void {
  it("records a pytest JUnit report on base so its failing case matches the task", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "py",
          command: "mkdir -p reports && cp pytest-junit.xml reports/junit.xml",
          format: { junit: "reports/junit.xml" },
        },
      ],
    });
    try {
      const scope1 = await recordsPytestJUnitReportBaseSoPart1(repo, goal);
      await recordsPytestJUnitReportBaseSoPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("never inherits a baseline that could not run", () => {
    const infra: CheckResult = check("baseline", "", {
      summary: "could not create baseline worktree",
      details: { kind: "infra", cause: "could not create baseline worktree" },
    });
    const inherited = preexistingRed(base([infra]));
    expect(inherited.size).toBe(0);
    expect(
      newGateFailures(
        [check("package", "reason X: base-broken.txt")],
        inherited,
      ).map((c) => c.name),
    ).toEqual(["package"]);
  });
}

describe("inherited red is matched per signature, not per gate", () => {
  registerInheritedRedIsMatchedPerSignatureNotPerGatePart7();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart11();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart12();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart13();
});
