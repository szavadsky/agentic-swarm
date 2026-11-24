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

/** A real bun run in `root`; it must be red for the mixed report under test. */
function bunRun(root: string): string {
  const run = Bun.spawnSync(["bun", "test"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(run.exitCode).not.toBe(0);
  return `${run.stdout.toString()}\n${run.stderr.toString()}`.trim();
}

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
  // The base record carries the report's cases, not only its output lines.
  expect(recorded.checks[0]!.details).toMatchObject({
    junit: { truncated: false },
  });
  expect([...gateSignatures(recorded.checks[0]!)]).toEqual([
    "py > tests.test_calc > test_sub",
  ]);
  expect(recorded.checks[0]!.summary).toBe(
    "1 failing: tests.test_calc > test_sub",
  );

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
    expect([...gateSignatures(run!)]).toEqual([
      "py > tests.test_calc > test_sub",
    ]);
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
  it("matches two real capped runs of the same red suite", () => {
    // Enough failures that the report exceeds the gate output cap. Timing digits
    // move the byte the cap would cut at between runs, so a raw tail slice would
    // start at a different fragment of a detail line each time.
    const files: Record<string, string> = {};
    for (let file = 0; file < 8; file++) {
      const cases = [0, 1, 2, 3].map(
        (n) =>
          `it("suite ${file} > case ${n}", () => { expect({ a: ${n}, b: "value-${file}" }).toEqual({ a: ${n + 1}, b: "other-${file}" }); });`,
      );
      files[`test/many${file}.test.ts`] =
        `import { expect, it } from "bun:test";\n${cases.join("\n")}\n`;
    }
    const root = makeRoot("gate-cap-", files);
    try {
      const rawFirst = bunRun(root);
      const rawSecond = bunRun(root);
      const first = capGateOutput(rawFirst);
      const second = capGateOutput(rawSecond);
      expect(first.truncated).toBe(true);
      expect(second.truncated).toBe(true);
      // The cap keeps whole lines, never a fragment cut out of one.
      expect(rawFirst.split("\n")).toContain(first.output.split("\n")[0]!);
      expect(rawSecond.split("\n")).toContain(second.output.split("\n")[0]!);
      expect(first.output.length).toBeLessThanOrEqual(GATE_OUTPUT_CAP);

      const baseline = rooted("tests", first.output, root, first.truncated);
      const signatures = [...gateSignatures(baseline)];
      expect(signatures.length).toBeGreaterThan(0);
      // The cut's leftover detail lines and bun's banner are not identities. A
      // failure whose file header the cut removed matches as a root-independent
      // `test: <name>`; the rest keep their header's file.
      expect(
        signatures.every(
          (s) => s.startsWith("test/") || s.startsWith("test: "),
        ),
      ).toBe(true);
      expect(
        signatures.some((signature) => signature.includes("bun test v")),
      ).toBe(false);

      const inherited = preexistingRed(base([baseline]));
      expect(
        newGateFailures(
          [rooted("tests", second.output, root, second.truncated)],
          inherited,
        ),
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart8(): void {
  it("keeps a fail line below the cut before the next file header", () => {
    // The cut opened inside a failure block, so its header is gone; the block's
    // `(fail)` line and the next file's header both survive.
    const cutDetail = [
      "error: expect(received).toEqual(expected)",
      "  {",
      '-   "a": 1,',
      '+   "a": 2,',
      "  }",
      "      at <anonymous> (test/a.test.ts:8:42)",
    ];
    const inheritedReport = [
      ...cutDetail,
      "test/b.test.ts:",
      "(fail) suite > inherited case [0.40ms]",
      " 0 pass",
      " 1 fail",
    ].join("\n");
    const inherited = preexistingRed(
      base([rooted("tests", inheritedReport, "/base", true)]),
    );

    const report = [
      ...cutDetail,
      "(fail) suite > brand new case [0.02ms]",
      "test/b.test.ts:",
      "(fail) suite > inherited case [0.30ms]",
      " 0 pass",
      " 2 fail",
    ].join("\n");
    const current = rooted("tests", report, "/task", true);
    expect([...gateSignatures(current)]).toEqual([
      "test: suite > brand new case",
      "test/b.test.ts > suite > inherited case",
    ]);
    // The new failure's file header was cut, but its name still makes it the
    // task's, even though the gate was already red for the inherited case.
    expect(newGateFailures([current], inherited).map((c) => c.name)).toEqual([
      "tests",
    ]);
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart9(): void {
  it("keeps an unhandled error line whose marker the cut removed", () => {
    const report = [
      "-------------------------------",
      "error: Cannot find module './missing.js' from '/task/test/load.test.ts'",
      "-------------------------------",
      "test/other.test.ts:",
      "(fail) suite > case [0.01ms]",
      " 0 pass",
      " 2 fail",
    ].join("\n");
    expect([...gateSignatures(rooted("tests", report, "/task", true))]).toEqual(
      [
        "test: error: Cannot find module './missing.js' from '<root>/test/load.test.ts'",
        "test/other.test.ts > suite > case",
      ],
    );
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart10(): void {
  it("never emits a detail line identity when one file's block exceeds the cap", () => {
    const source = (pad: number) =>
      "// pad\n".repeat(pad) +
      'import { expect, it } from "bun:test";\n' +
      'const big = (n: number) => Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`key${i}`, `value-${n}-${i}-${"x".repeat(20)}`]));\n' +
      'it("suite > huge case", () => { expect(big(1)).toEqual(big(2)); });\n';
    const root = makeRoot("gate-block-", { "test/huge.test.ts": source(0) });
    try {
      const first = capGateOutput(bunRun(root));
      expect(first.truncated).toBe(true);
      // No file header follows the cut: the tail is the inside of the one
      // block, whose printed line numbers and values drift with any edit.
      const signatures = [
        ...gateSignatures(rooted("tests", first.output, root, first.truncated)),
      ];
      expect(signatures.length).toBeGreaterThan(0);
      expect(
        signatures.every((signature) => !signature.startsWith("line:")),
      ).toBe(true);

      fs.writeFileSync(path.join(root, "test/huge.test.ts"), source(3), "utf8");
      const second = capGateOutput(bunRun(root));
      expect(second.truncated).toBe(true);
      const inherited = preexistingRed(
        base([rooted("tests", first.output, root, first.truncated)]),
      );
      expect(
        newGateFailures(
          [rooted("tests", second.output, root, second.truncated)],
          inherited,
        ),
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart8();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart9();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart10();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart11();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart12();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart13();
});
