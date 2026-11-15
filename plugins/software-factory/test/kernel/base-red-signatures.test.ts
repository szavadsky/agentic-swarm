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

const FAILING_TEST =
  'import { expect, it } from "bun:test";\nit("alpha > one", () => { expect(1).toBe(2); });\n';
const MISSING_IMPORT =
  'import { expect, it } from "bun:test";\n' +
  'import { nope } from "./missing.js";\n' +
  'it("loads", () => { expect(nope).toBe(1); });\n';

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

describe("gate failure signatures", () => {
  it("collapses tsc diagnostics to file:line and code", () => {
    const output = [
      "src/a.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts:7:9 - error TS2345: Argument of type 'x' is not assignable.",
      "error TS2688: Cannot find type definition file for 'bun'.",
      "Found 3 errors in 2 files.",
    ].join("\n");
    expect([...gateSignatures(check("typecheck", output))]).toEqual([
      "src/a.ts:12 TS2322",
      "src/b.ts:7 TS2345",
      "tsc TS2688: Cannot find type definition file for 'bun'.",
    ]);
  });

  it("keeps bun test names unique per file and ignores timings and the banner", () => {
    const output = [
      "bun test v1.4.4 (38afee6c8)",
      "other.test.ts:",
      "error: expect(received).toBe(expected)",
      "(fail) alpha > fails one [1.21ms]",
      "sample.test.ts:",
      "(fail) alpha > fails one [0.04ms]",
      " 1 pass",
      " 2 fail",
    ].join("\n");
    expect([...gateSignatures(check("tests", output))]).toEqual([
      "other.test.ts > alpha > fails one",
      "sample.test.ts > alpha > fails one",
    ]);
  });

  it("falls back to the output lines when the gate speaks no known format", () => {
    expect([
      ...gateSignatures(check("package", "reason Y: task-broken.txt")),
    ]).toEqual(["line: reason Y: task-broken.txt"]);
  });

  it("normalises a run root it was not told about down to the basename", () => {
    const worktree = check(
      "package",
      "cannot read /home/me/worktrees/task-1/notes.txt",
    );
    const scratch = check(
      "package",
      "cannot read /home/me/.factory-runtime/preflight-probe-ab12/notes.txt",
    );
    const exported = check(
      "package",
      "cannot read /tmp/factory-gates.cd34/notes.txt",
    );
    for (const output of [worktree, scratch, exported]) {
      expect([...gateSignatures(output)]).toEqual([
        "line: cannot read <root>/notes.txt",
      ]);
    }
  });

  it("keeps failures that differ only below a known root distinct", () => {
    const inherited = preexistingRed(
      base([
        rooted(
          "package",
          "cannot read /base/root/src/a/notes.txt",
          "/base/root",
        ),
      ]),
    );
    const sameFile = rooted(
      "package",
      "cannot read /task/root/src/a/notes.txt",
      "/task/root",
    );
    expect([...gateSignatures(sameFile)]).toEqual([
      "line: cannot read <root>/src/a/notes.txt",
    ]);
    expect(newGateFailures([sameFile], inherited)).toEqual([]);
    const otherFile = rooted(
      "package",
      "cannot read /task/root/src/b/notes.txt",
      "/task/root",
    );
    expect(newGateFailures([otherFile], inherited).map((c) => c.name)).toEqual([
      "package",
    ]);
  });
});

describe("inherited red is matched per signature, not per gate", () => {
  it("drops only the signatures the base was red for", () => {
    const inherited = preexistingRed(
      base([check("package", "reason X: base-broken.txt")]),
    );
    expect(
      newGateFailures(
        [check("package", "reason X: base-broken.txt")],
        inherited,
      ),
    ).toEqual([]);
    const fresh = newGateFailures(
      [
        check(
          "package",
          "reason X: base-broken.txt\nreason Y: task-broken.txt",
        ),
      ],
      inherited,
    );
    expect(fresh.map((c) => c.name)).toEqual(["package"]);

    // Two inherited failures, one fixed: the remaining one is still inherited.
    const two = preexistingRed(
      base([check("package", "reason X: a.txt\nreason Y: b.txt")]),
    );
    expect(newGateFailures([check("package", "reason X: a.txt")], two)).toEqual(
      [],
    );
  });

  it("fails a new tsc diagnostic under an already-red typecheck gate", () => {
    const inherited = preexistingRed(
      base([check("typecheck", "src/a.ts(12,3): error TS2322: first")]),
    );
    const current = check(
      "typecheck",
      "src/a.ts(12,3): error TS2322: first\nsrc/b.ts(4,1): error TS7006: new",
    );
    expect(newGateFailures([current], inherited).map((c) => c.name)).toEqual([
      "typecheck",
    ]);
    expect(
      newGateFailures(
        [check("typecheck", "src/a.ts(12,3): error TS2322: first")],
        inherited,
      ),
    ).toEqual([]);
  });

  it("keeps an unmatched failure next to a structured diagnostic", () => {
    const output = "src/a.ts(1,2): error TS2322: first\nlink: base-missing.ts";
    const inherited = preexistingRed(base([check("typecheck", output)]));
    expect(newGateFailures([check("typecheck", output)], inherited)).toEqual(
      [],
    );
    const extra = check("typecheck", `${output}\nlink: task-missing.ts`);
    expect(newGateFailures([extra], inherited).map((c) => c.name)).toEqual([
      "typecheck",
    ]);
  });

  it("fails a new bun test under an already-red tests gate", () => {
    const baseOutput = [
      "suite.test.ts:",
      "(fail) alpha > one [0.10ms]",
      " 1 pass",
      " 1 fail",
    ].join("\n");
    const inherited = preexistingRed(base([check("tests", baseOutput)]));
    const same = [
      "suite.test.ts:",
      "(fail) alpha > one [0.20ms]",
      " 1 pass",
      " 1 fail",
    ].join("\n");
    expect(newGateFailures([check("tests", same)], inherited)).toEqual([]);
    const extra = [
      "suite.test.ts:",
      "(fail) alpha > one [0.11ms]",
      "(fail) alpha > two [0.01ms]",
      " 1 pass",
      " 2 fail",
    ].join("\n");
    expect(
      newGateFailures([check("tests", extra)], inherited).map((c) => c.name),
    ).toEqual(["tests"]);
  });

  it("does not blame a task that fixed the inherited red", () => {
    const inherited = preexistingRed(
      base([check("package", "reason X: base-broken.txt")]),
    );
    expect(
      newGateFailures(
        [check("package", "", { ok: true, summary: "pass" })],
        inherited,
      ),
    ).toEqual([]);
  });

  it("matches a silent red gate by name because it carries no signature", () => {
    const inherited = preexistingRed(base([check("always-red", "")]));
    expect(newGateFailures([check("always-red", "")], inherited)).toEqual([]);
  });

  it("matches a real mixed bun run across roots and still fails a new import", () => {
    const files = {
      "test/fail.test.ts": FAILING_TEST,
      "test/load.test.ts": MISSING_IMPORT,
    };
    // The three roots a gate runs from: the task worktree, the baseline scratch
    // worktree, and the package-only export temp dir.
    const baseline = makeRoot("preflight-probe-", files);
    const worktree = makeRoot("gate-worktree-", files);
    const exported = makeRoot("factory-gates.", {
      ...files,
      "test/extra.test.ts": MISSING_IMPORT,
    });
    try {
      const baselineOutput = bunRun(baseline);
      expect([
        ...gateSignatures(rooted("tests", baselineOutput, baseline)),
      ]).toContain(
        "test/load.test.ts > error: Cannot find module './missing.js' from '<root>/test/load.test.ts'",
      );

      // The same failing test and load error from two roots are the same red.
      const inherited = preexistingRed(
        base([rooted("tests", baselineOutput, baseline)]),
      );
      expect(
        newGateFailures(
          [rooted("tests", bunRun(worktree), worktree)],
          inherited,
        ),
      ).toEqual([]);

      // An import that fails only now is still the task's, even though the
      // gate was already red for another failure.
      const fresh = newGateFailures(
        [rooted("tests", bunRun(exported), exported)],
        inherited,
      );
      expect(fresh.map((c) => c.name)).toEqual(["tests"]);
    } finally {
      for (const root of [baseline, worktree, exported])
        fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("attaches the run root to a gate check so below-root paths stay distinct", async () => {
    const root = makeRoot("gate-root-", {});
    try {
      const runtime = {
        paths: { repoRoot: root },
        configs: {
          repo: {
            gates: [
              {
                id: "package",
                command: 'echo "cannot read $(pwd)/src/a/notes.txt"; exit 1',
              },
            ],
          },
        },
      } as unknown as KernelRuntime;
      const [run] = await runGates(runtime, root);
      expect([...gateSignatures(run!)]).toEqual([
        "line: cannot read <root>/src/a/notes.txt",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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
});
