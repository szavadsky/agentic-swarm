import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import {
  type BaseGateState,
  preexistingRed,
} from "../../src/kernel/baseline.js";
import {
  gateSignatures,
  newGateFailures,
  runGates,
} from "../../src/kernel/gates.js";
import type { KernelRuntime } from "../../src/kernel/types.js";

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

function gateFailureSignaturesPart1() {
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
    const lines = [
      "bun test v1.4.4 (38afee6c8)",
      "other.test.ts:",
      "error: expect(received).toBe(expected)",
      "(fail) alpha > fails one [1.21ms]",
      "sample.test.ts:",
      "(fail) alpha > fails one [0.04ms]",
      " 1 pass",
      " 2 fail",
    ];
    const signatures = (wall: string) => [
      ...gateSignatures(check("tests", [...lines, wall].join("\n"))),
    ];
    const first = signatures(
      "tests gate: wall 63.8s (--parallel=8; serial: 6 files; slowest: test/kernel/flow.test.ts 37.1s)",
    );
    // The runner always prints its wall line; a slower run must not look like
    // a new failure to the baseline signature or the gate-flake record.
    const second = signatures(
      "tests gate: wall 74.2s (--parallel=8; serial: 6 files; slowest: test/kernel/flow.test.ts 41.9s)",
    );
    const expected = [
      "other.test.ts > alpha > fails one",
      "sample.test.ts > alpha > fails one",
    ];
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
  });
}

function gateFailureSignaturesPart2() {
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
}

function gateFailureSignaturesPart3() {
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
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart1(): void {
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
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart2(): void {
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
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart3(): void {
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
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart4(): void {
  it("matches a silent red gate by name because it carries no signature", () => {
    const inherited = preexistingRed(base([check("always-red", "")]));
    expect(newGateFailures([check("always-red", "")], inherited)).toEqual([]);
  });
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart5(): void {
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
}

function registerInheritedRedIsMatchedPerSignatureNotPerGatePart6(): void {
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
        store: { goalDir: root },
      } as unknown as KernelRuntime;
      const [run] = await runGates(runtime, root);
      expect([...gateSignatures(run!)]).toEqual([
        "line: cannot read <root>/src/a/notes.txt",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("gate failure signatures", () => {
  gateFailureSignaturesPart1();

  gateFailureSignaturesPart2();

  gateFailureSignaturesPart3();
});

describe("inherited red is matched per signature, not per gate", () => {
  registerInheritedRedIsMatchedPerSignatureNotPerGatePart1();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart2();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart3();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart4();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart5();

  registerInheritedRedIsMatchedPerSignatureNotPerGatePart6();
});
