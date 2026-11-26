import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CTRFReport } from "ctrf";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { packageRoot } from "../../src/kernel/config.js";
import {
  contextPackRelPath,
  renderContextData,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runGates } from "../../src/kernel/gates.js";
import { outcomeExampleVar } from "../../src/kernel/outcome-example.js";
import { tierNamesVar } from "../../src/kernel/prompt-schema.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { finishChecks, startChecks } from "../../src/kernel/record.js";
import { testRuntimeComparison } from "../../src/kernel/test-runtimes.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { TEST_TASK_TYPES_VAR, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

function makeCtrfReport(
  tests: Array<{
    name: string;
    status: "passed" | "failed" | "skipped" | "pending" | "other";
    duration: number;
    filePath?: string;
  }>,
): CTRFReport {
  return {
    reportFormat: "CTRF",
    specVersion: "0.3.0",
    reportId: "00000000-0000-4000-8000-000000000021",
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

function basePackInput(
  testRuntimes?: ReturnType<typeof testRuntimeComparison>,
) {
  const tasks = [task("alpha")];
  return {
    goal: "demo",
    iteration: 2,
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
    ...(testRuntimes ? { testRuntimes } : {}),
    forwarded: [],
    debts: [],
  };
}

describe("test runtimes pack rendering", () => {
  it("handles zero goal-start total without NaN and renders single-run state", () => {
    const single = [
      script(1, {
        iteration: 0,
        step: "baseline",
        checks: [
          {
            name: "tests",
            ok: true,
            summary: "pass",
            output: "",
            fingerprint: "fp",
            details: { testRuntimes: { "fast.test.ts > zero": 0 } },
          },
        ],
      }),
    ];
    const singlePack = renderContextPack(
      basePackInput(testRuntimeComparison(single)),
    );
    expect(singlePack).toContain("## Test runtimes (current vs goal start)");
    expect(singlePack).toContain("- goal-start: 0ms across 1 test (baseline)");
    expect(singlePack).toContain("- current: not recorded");

    const two = [
      ...single,
      script(2, {
        iteration: 1,
        slug: "t1",
        step: "checks",
        checks: [
          {
            name: "tests",
            ok: true,
            summary: "pass",
            output: "",
            fingerprint: "fp",
            details: { testRuntimes: { "fast.test.ts > zero": 25 } },
          },
        ],
      }),
    ];
    const cmp = testRuntimeComparison(two);
    expect(cmp?.deltaMs).toBe(25);
    expect(cmp?.deltaPct).toBeNull();
    const pack = renderContextPack(basePackInput(cmp));
    expect(pack).toContain(
      "- total: 25ms across 1 test vs goal-start 0ms across 1 test (+25ms)",
    );
  });

  it("caps the markdown table at 20 rows while keeping every test in context-data.json", () => {
    const many = (offset: number) =>
      Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [
          `test/f${i}.test.ts > case ${i}`,
          10 + i + offset,
        ]),
      );
    const records = [
      script(1, {
        iteration: 0,
        step: "baseline",
        checks: [
          {
            name: "tests",
            ok: true,
            summary: "pass",
            output: "",
            fingerprint: "fp",
            details: { testRuntimes: many(0) },
          },
        ],
      }),
      script(2, {
        iteration: 1,
        slug: "t1",
        step: "goal-head",
        checks: [
          {
            name: "tests",
            ok: true,
            summary: "pass",
            output: "",
            fingerprint: "fp",
            details: { testRuntimes: many(5) },
          },
        ],
      }),
    ];
    const input = basePackInput(testRuntimeComparison(records));
    const pack = renderContextPack(input);
    expect(pack).toContain(
      "- ... +5 more tests (full list in context-data.json)",
    );
    const data = JSON.parse(renderContextData(input));
    expect(Object.keys(data.testRuntimes.goalStart.tests)).toHaveLength(25);
    expect(Object.keys(data.testRuntimes.current.tests)).toHaveLength(25);
  });
});

describe("boundary pack CTRF comparison", () => {
  it("renders current versus goal start from two recorded CTRF runs in context-pack.md", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Milestone 1\n\n## later\nPending.\n",
        "utf8",
      );

      const workA = fs.mkdtempSync(path.join(os.tmpdir(), "ctrf-run-a-"));
      const workB = fs.mkdtempSync(path.join(os.tmpdir(), "ctrf-run-b-"));
      try {
        const ctrfGate = {
          id: "tests",
          command: "mkdir -p reports && cp ctrf.json reports/ctrf.json",
          serial: [],
          format: { ctrf: "reports/ctrf.json" },
        };
        fs.writeFileSync(
          path.join(workA, "ctrf.json"),
          JSON.stringify(
            makeCtrfReport([
              {
                name: "alpha",
                status: "passed",
                duration: 200,
                filePath: `${workA}/test/a.test.ts`,
              },
              {
                name: "beta",
                status: "passed",
                duration: 1200,
                filePath: `${workA}/test/b.test.ts`,
              },
            ]),
          ),
        );
        const [baseCheck] = await runGates(
          gateRuntime(workA, [ctrfGate]),
          workA,
        );
        if (!baseCheck) throw new Error("expected baseCheck");
        await runtime.store.appendRecord(
          { iteration: 0, step: "baseline", round: 1, actor: "script" },
          { ok: true, checks: [baseCheck] },
        );

        fs.writeFileSync(
          path.join(workB, "ctrf.json"),
          JSON.stringify(
            makeCtrfReport([
              {
                name: "alpha",
                status: "passed",
                duration: 350,
                filePath: `${workB}/test/a.test.ts`,
              },
              {
                name: "beta",
                status: "passed",
                duration: 900,
                filePath: `${workB}/test/b.test.ts`,
              },
              {
                name: "gamma",
                status: "passed",
                duration: 50,
                filePath: `${workB}/test/c.test.ts`,
              },
            ]),
          ),
        );
        const [curCheck] = await runGates(
          gateRuntime(workB, [ctrfGate]),
          workB,
        );
        if (!curCheck) throw new Error("expected curCheck");
        const turn = await startChecks(runtime.store, {
          iteration: 1,
          slug: "alpha",
          round: 1,
        });
        await finishChecks(turn, [curCheck]);
      } finally {
        fs.rmSync(workA, { recursive: true, force: true });
        fs.rmSync(workB, { recursive: true, force: true });
      }

      harness.script(
        (req, ctx) => {
          fs.appendFileSync(
            path.join(runtime.store.goalDir, "plan.md"),
            "\n## next\n",
            "utf8",
          );
          ctx.writeOutcome(
            outcome({ summary: "reviewed runtimes", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "no tasks" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      await runBoundary(runtime, { relaunch: false, iteration: 2 });
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("## Test runtimes (current vs goal start)");
      expect(pack).toContain(
        "- total: 1.30s across 3 tests vs goal-start 1.40s across 2 tests (-100ms, -7.1%)",
      );
      expect(pack).toContain(
        "| test/b.test.ts > beta | 900ms | 1.20s | -300ms |",
      );
      expect(pack).toContain(
        "| test/a.test.ts > alpha | 350ms | 200ms | +150ms |",
      );
      expect(pack).toContain("| test/c.test.ts > gamma | 50ms | - | new |");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("invites the architect to reduce test time on merit", () => {
    const lib = loadPromptLibrary({
      builtinDir: path.join(packageRoot, "prompts"),
    });
    const rendered = lib.render("architect", {
      turn: "boundary",
      iteration: "3",
      intent_path: "/goal/intent.md",
      plan_path: "/goal/plan.md",
      checkout: "/worktrees/demo",
      pack_path: "/goal/iterations/3/context-pack.md",
      digest_path: "/goal/iterations/3/digest.md",
      steers: "none",
      outcome_path: "/goal/records/00042-i3-architect-r1/outcome.yaml",
      validate_cmd: "bun /factory/bin/factory.ts validate",
      outcome_schema: outcomeExampleVar("architect", "architect"),
      task_types: TEST_TASK_TYPES_VAR,
      tiers: tierNamesVar({ implementer: {}, escalation: {} }),
      depth: "1",
      subarchitect_block: "",
      saga_reminder: "",
    });
    expect(rendered).toContain(
      "reduce test time while keeping tests on their merits",
    );
  });
});
