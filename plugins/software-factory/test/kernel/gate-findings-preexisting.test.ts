import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeFinding } from "../../src/core/checks/findings.js";
import type { CheckResult } from "../../src/core/checks/types.js";
import {
  type BaseGateState,
  formatBaseGates,
  preexistingRed,
} from "../../src/kernel/baseline.js";
import {
  type ContextPackInput,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS } from "../../src/kernel/derive-task.js";
import { promptVars } from "../../src/kernel/flow-context-vars.js";
import { gateSignatures, newGateFailures } from "../../src/kernel/gates.js";
import { finishChecks, startChecks } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

/**
 * A red check as `runGates` records a report. Each entry is the report's stable
 * test id and, when it differs, the label it currently prints.
 */
function reportCheck(
  name: string,
  failures: [identity: string, rule?: string][],
): CheckResult {
  const findings = failures.map(([identity, rule]) =>
    makeFinding(
      {
        check: name,
        tool: "vitest",
        file: "src/a.test.ts",
        rule: rule ?? identity,
        severity: "error",
        message: "expected 1",
      },
      identity,
    ),
  );
  return {
    name,
    ok: false,
    summary: `${findings.length} failing: ${findings.map((finding) => finding.rule).join(", ")}`,
    output: "",
    fingerprint: `fp-${name}`,
    details: { findings },
  };
}

/** A red check as the finding model records a SARIF result: no stable test id. */
function sarifCheck(name: string, line: number): CheckResult {
  const finding = makeFinding({
    check: name,
    tool: "eslint",
    file: "src/a.ts",
    line,
    rule: "no-unused-vars",
    severity: "error",
    message: "'x' is assigned but never used",
  });
  return {
    name,
    ok: false,
    summary: `1 failing: src/a.ts > no-unused-vars`,
    output: "",
    fingerprint: `fp-${name}`,
    details: { findings: [finding] },
  };
}

function base(checks: CheckResult[]): BaseGateState {
  return { commit: "base", ok: false, checks };
}

/** The base run the fingerprint checks are matched against. */
const BASE_CHECKS = [reportCheck("js", [["test-adds", "adds"]])];

function registerFingerprintIdentity(): void {
  it("inherits a base fingerprint whose report label drifted", () => {
    const inherited = preexistingRed(base(BASE_CHECKS));
    const renamed = reportCheck("js", [["test-adds", "adds after the rename"]]);
    // The ad-hoc signatures differ; only the finding fingerprint matches.
    expect([...gateSignatures(renamed)]).not.toEqual([
      ...gateSignatures(BASE_CHECKS[0]!),
    ]);
    expect(newGateFailures([renamed], inherited)).toEqual([]);
  });

  it("fails a fingerprint the base did not record", () => {
    const inherited = preexistingRed(base(BASE_CHECKS));
    const current = reportCheck("js", [["test-subtracts", "adds"]]);
    expect(newGateFailures([current], inherited).map((c) => c.name)).toEqual([
      "js",
    ]);
  });

  it("fails the same report finding when its line moved", () => {
    // No stable test id: the model's fingerprint includes the line, so a result
    // that moved below inserted code is a new identity, not the base's failure.
    const inherited = preexistingRed(base([sarifCheck("lint", 7)]));
    const moved = sarifCheck("lint", 9);
    expect(gateSignatures(moved)).toEqual(
      gateSignatures(sarifCheck("lint", 7)),
    );
    expect(newGateFailures([moved], inherited).map((c) => c.name)).toEqual([
      "lint",
    ]);
  });
}

function registerFingerprintEdges(): void {
  it("keeps a new fingerprint beside its inherited sibling the task's own", () => {
    const inherited = preexistingRed(base(BASE_CHECKS));
    const current = reportCheck("js", [
      ["test-adds", "adds"],
      ["test-subtracts", "subtracts"],
    ]);
    expect(newGateFailures([current], inherited).map((c) => c.name)).toEqual([
      "js",
    ]);
  });

  it("keeps a console finding on the output reader, not on a fingerprint", () => {
    // A `log` finding repeats the console text, whose line and message drift;
    // it must not become a write-once identity just because it has a fingerprint.
    const output = "reason X: base-broken.txt";
    const inherited = preexistingRed(
      base([{ ...reportCheck("package", []), output }]),
    );
    const sameRed: CheckResult = {
      ...reportCheck("package", []),
      output,
      details: {
        findings: [
          makeFinding({
            check: "package",
            tool: "log",
            file: "base-broken.txt",
            severity: "error",
            message: "reason X",
          }),
        ],
      },
    };
    expect(newGateFailures([sameRed], inherited)).toEqual([]);
  });
}

describe("pre-existing is matched against the base by fingerprint", () => {
  registerFingerprintIdentity();

  registerFingerprintEdges();
});

/** Closes a real checks record over `checks`, matched against `base`. */
async function stampedRun(
  baseState: BaseGateState,
  checks: CheckResult[],
): Promise<StepRecord> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-stamp-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  try {
    await store.ensureLayout();
    const gate = await startChecks(store, {
      iteration: 1,
      slug: "a",
      round: 1,
    });
    return await finishChecks(gate, checks, {
      preexisting: preexistingRed(baseState),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("the pre-existing mark reaches the checks", () => {
  it("stamps the base fingerprint inherited and the new one the task's", async () => {
    const done = await stampedRun(base(BASE_CHECKS), [
      reportCheck("js", [["test-adds", "adds after the rename"]]),
      reportCheck("lint", [["test-lint", "lint rule"]]),
    ]);
    expect(done.ok).toBe(false);
    expect(
      (done.checks ?? []).map((entry) => [entry.name, entry.attribution]),
    ).toEqual([
      ["js", "inherited"],
      ["lint", "new"],
    ]);
  });
});

/** A runtime stub with only what `promptVars` reads. */
function promptVarsRuntime(): KernelRuntime {
  return {
    store: {
      goalDir: "/goal",
      pathOf: () => "/nonexistent/class.yaml",
      tasks: { path: (slug: string) => `/tasks/${slug}.md` },
      records: { checksLog: () => "/logs/checks" },
    },
    configs: {
      repo: { setup: [], gates: [] },
      process: {
        taskTypes: {
          development: {
            flow: "implement-review",
            kind: "development",
            schema: "outcome",
          },
        },
      },
    },
  } as unknown as KernelRuntime;
}

function checksRecord(seq: number, checks: CheckResult[]): StepRecord {
  return script(seq, {
    step: "checks",
    ok: false,
    checks,
    startedAt: new Date(seq).toISOString(),
  });
}

describe("the pre-existing mark reaches the reviewer's input", () => {
  it("names the base finding and withholds an inherited red from the fix ask", () => {
    const records = [
      script(1, {
        step: "baseline",
        ok: false,
        base: "c0",
        checks: BASE_CHECKS,
      }),
      rec(2, {
        step: "implement",
        round: 1,
        tree: "tree-1",
        commit: "c1",
        base: "c0",
        startedAt: new Date(2).toISOString(),
        outcome: {
          status: "done",
          summary: "implemented",
          concerns: [],
          forward: [],
        },
      }),
      checksRecord(3, [
        reportCheck("js", [["test-adds", "adds after the rename"]]),
        reportCheck("lint", [["test-lint", "lint rule"]]),
      ]),
    ];
    const vars = promptVars(
      promptVarsRuntime(),
      task("a"),
      "/worktree",
      records,
      1,
      DEFAULT_FLOWS["implement-review"]!,
      undefined,
      "implement",
    );
    expect(vars.base_gates).toContain(
      "base c0 was red before any task (pre-existing)",
    );
    expect(vars.base_gates).toContain("### js: 1 failing: adds");
    expect(vars.base_gates).not.toContain("### lint");
    expect(vars.findings).toContain("### lint: 1 failing: lint rule");
    expect(vars.findings).not.toContain("### js");
  });
});

/** A pack input with only the base gates set; every other section renders empty. */
function packInput(baseGates: BaseGateState): ContextPackInput {
  const tasks = [task("a")];
  return {
    goal: "demo",
    iteration: 1,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [],
    baseGates,
    forwarded: [],
    debts: [],
  };
}

describe("the pre-existing mark reaches the pack", () => {
  it("lists the base finding and not the task's new one", () => {
    const recorded = {
      ...base(BASE_CHECKS),
      commit: "abcdef1234567890",
    };
    const pack = renderContextPack(packInput(recorded));
    expect(pack).toContain(
      "base abcdef1234 was red before any task (pre-existing; not a task finding)",
    );
    expect(pack).toContain("js: 1 failing: adds");
    expect(pack).not.toContain("lint");
    // The reviewer's input renders the same base record, findings and output.
    expect(formatBaseGates(recorded)).toContain("### js: 1 failing: adds");
  });
});
