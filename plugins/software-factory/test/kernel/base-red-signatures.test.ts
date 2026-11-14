import { describe, expect, it } from "bun:test";
import type { CheckResult } from "../../src/core/checks/types.js";
import { preexistingRed, type BaseGateState } from "../../src/kernel/baseline.js";
import { gateSignatures, newGateFailures } from "../../src/kernel/gates.js";

function check(name: string, output: string, patch: Partial<CheckResult> = {}): CheckResult {
  return { name, ok: false, summary: "exit 1", output, fingerprint: `${name}:${output}`, ...patch };
}

function base(checks: CheckResult[]): BaseGateState {
  return { commit: "base-commit", ok: false, checks };
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

  it("keeps bun test names unique per file and ignores timings", () => {
    const output = [
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
    expect([...gateSignatures(check("package", "reason Y: task-broken.txt"))]).toEqual([
      "line: reason Y: task-broken.txt",
    ]);
  });
});

describe("inherited red is matched per signature, not per gate", () => {
  it("drops only the signatures the base was red for", () => {
    const inherited = preexistingRed(base([check("package", "reason X: base-broken.txt")]));
    expect(newGateFailures([check("package", "reason X: base-broken.txt")], inherited)).toEqual([]);
    const fresh = newGateFailures(
      [check("package", "reason X: base-broken.txt\nreason Y: task-broken.txt")],
      inherited
    );
    expect(fresh.map((c) => c.name)).toEqual(["package"]);

    // Two inherited failures, one fixed: the remaining one is still inherited.
    const two = preexistingRed(base([check("package", "reason X: a.txt\nreason Y: b.txt")]));
    expect(newGateFailures([check("package", "reason X: a.txt")], two)).toEqual([]);
  });

  it("fails a new tsc diagnostic under an already-red typecheck gate", () => {
    const inherited = preexistingRed(base([check("typecheck", "src/a.ts(12,3): error TS2322: first")]));
    const current = check("typecheck", "src/a.ts(12,3): error TS2322: first\nsrc/b.ts(4,1): error TS7006: new");
    expect(newGateFailures([current], inherited).map((c) => c.name)).toEqual(["typecheck"]);
    expect(newGateFailures([check("typecheck", "src/a.ts(12,3): error TS2322: first")], inherited)).toEqual([]);
  });

  it("fails a new bun test under an already-red tests gate", () => {
    const baseOutput = ["suite.test.ts:", "(fail) alpha > one [0.10ms]", " 1 pass", " 1 fail"].join("\n");
    const inherited = preexistingRed(base([check("tests", baseOutput)]));
    const same = ["suite.test.ts:", "(fail) alpha > one [0.20ms]", " 1 pass", " 1 fail"].join("\n");
    expect(newGateFailures([check("tests", same)], inherited)).toEqual([]);
    const extra = [
      "suite.test.ts:",
      "(fail) alpha > one [0.11ms]",
      "(fail) alpha > two [0.01ms]",
      " 1 pass",
      " 2 fail",
    ].join("\n");
    expect(newGateFailures([check("tests", extra)], inherited).map((c) => c.name)).toEqual(["tests"]);
  });

  it("does not blame a task that fixed the inherited red", () => {
    const inherited = preexistingRed(base([check("package", "reason X: base-broken.txt")]));
    expect(newGateFailures([check("package", "", { ok: true, summary: "pass" })], inherited)).toEqual([]);
  });

  it("matches a silent red gate by name because it carries no signature", () => {
    const inherited = preexistingRed(base([check("always-red", "")]));
    expect(newGateFailures([check("always-red", "")], inherited)).toEqual([]);
  });

  it("never inherits a baseline that could not run", () => {
    const infra: CheckResult = check("baseline", "", {
      summary: "could not create baseline worktree",
      details: { kind: "infra", cause: "could not create baseline worktree" },
    });
    const inherited = preexistingRed(base([infra]));
    expect(inherited.size).toBe(0);
    expect(newGateFailures([check("package", "reason X: base-broken.txt")], inherited).map((c) => c.name)).toEqual([
      "package",
    ]);
  });
});
