import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeFinding } from "../../src/core/checks/findings.js";
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
  it("strips ANSI escapes and skips blank lines in raw log output", () => {
    const output = [
      "",
      "\u001b[31merror: step failed\u001b[0m",
      "   ",
      "detail: missing artifact",
    ].join("\n");
    expect([...gateSignatures(check("shell", output))]).toEqual([
      "line: error: step failed",
      "line: detail: missing artifact",
    ]);
  });

  it("prefers structured regex findings over raw output lines", () => {
    const findings = [
      makeFinding({
        check: "shell",
        tool: "regex",
        file: "src/a.txt",
        rule: "check-alpha",
        severity: "error",
        message: "expected 1",
      }),
    ];
    const c = check("shell", "FAIL src/a.txt check-alpha [12ms]\nextra noise", {
      details: { findings },
    });
    expect([...gateSignatures(c)]).toEqual(["shell > src/a.txt > check-alpha"]);
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
  it("matches structured regex findings across timing drift and fails a new rule", async () => {
    const root = makeRoot("gate-regex-drift-", {});
    try {
      const baseGate = {
        id: "suite",
        command: 'echo "FAIL alpha::one [0.10ms]"; exit 1',
        serial: [],
        format: {
          regex: [{ pattern: "^FAIL (?<rule>\\S+)", tool: "custom" }],
        },
      };
      const runtime = (gates: unknown) =>
        ({
          paths: { repoRoot: root },
          configs: { repo: { gates } },
          store: { goalDir: root },
        }) as unknown as KernelRuntime;

      const [baseRun] = await runGates(runtime([baseGate]), root);
      const inherited = preexistingRed(base([baseRun!]));

      const [sameRun] = await runGates(
        runtime([
          {
            ...baseGate,
            command: 'echo "FAIL alpha::one [0.42ms]"; exit 1',
          },
        ]),
        root,
      );
      expect(newGateFailures([sameRun!], inherited)).toEqual([]);

      const [extraRun] = await runGates(
        runtime([
          {
            ...baseGate,
            command:
              'echo "FAIL alpha::one [0.11ms]"; echo "FAIL alpha::two [0.01ms]"; exit 1',
          },
        ]),
        root,
      );
      expect(
        newGateFailures([extraRun!], inherited).map((c) => c.name),
      ).toEqual(["suite"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
  it("matches a shell-only gate across roots and still fails a new error line", async () => {
    const script =
      'echo "missing $(pwd)/src/base.txt"; ' +
      'if [ -f "$(pwd)/extra.flag" ]; then echo "missing $(pwd)/src/extra.txt"; fi; ' +
      "exit 1";
    const baseline = makeRoot("preflight-probe-", {});
    const worktree = makeRoot("gate-worktree-", {});
    const exported = makeRoot("factory-gates.", { "extra.flag": "1" });
    const runtimeFor = (dir: string) =>
      ({
        paths: { repoRoot: dir },
        configs: {
          repo: {
            gates: [{ id: "shell", command: script }],
          },
        },
        store: { goalDir: dir },
      }) as unknown as KernelRuntime;
    try {
      const [baseRun] = await runGates(runtimeFor(baseline), baseline);
      expect([...gateSignatures(baseRun!)]).toEqual([
        "line: missing <root>/src/base.txt",
      ]);

      const inherited = preexistingRed(base([baseRun!]));
      const [worktreeRun] = await runGates(runtimeFor(worktree), worktree);
      expect(newGateFailures([worktreeRun!], inherited)).toEqual([]);

      const [extraRun] = await runGates(runtimeFor(exported), exported);
      expect(
        newGateFailures([extraRun!], inherited).map((c) => c.name),
      ).toEqual(["shell"]);
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
