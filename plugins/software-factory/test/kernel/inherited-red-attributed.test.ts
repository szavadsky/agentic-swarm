import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  CheckAttribution,
  CheckResult,
} from "../../src/core/checks/types.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  type BaseGateState,
  preexistingRed,
} from "../../src/kernel/baseline.js";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context-vars.js";
import { preflight } from "../../src/kernel/preflight.js";
import { finishChecks, startChecks } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  FlowDefinition,
  KernelRuntime,
  StepRecord,
} from "../../src/kernel/types.js";
import { cause, causeText, rec, script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function check(
  name: string,
  ok: boolean,
  patch: Partial<CheckResult> = {},
): CheckResult {
  return {
    name,
    ok,
    summary: ok ? "pass" : "exit 1",
    output: ok ? "" : `${name} failed`,
    fingerprint: `fp-${name}`,
    ...patch,
  };
}

function red(
  name: string,
  attribution: CheckAttribution,
  patch: Partial<CheckResult> = {},
): CheckResult {
  return check(name, false, { attribution, ...patch });
}

function checksRecord(seq: number, checks: CheckResult[]): StepRecord {
  return script(seq, {
    step: "checks",
    ok: false,
    checks,
    startedAt: new Date(seq).toISOString(),
  });
}

function implement(seq: number, tree = "tree-1"): StepRecord {
  return rec(seq, {
    step: "implement",
    round: 1,
    tree,
    commit: `c${seq}`,
    base: "c0",
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
  });
}

/** A flow whose checks step allows one fix, so the second red parks. */
const ONE_FIX_FLOW: FlowDefinition = {
  steps: [
    { id: "implement", prompt: "implementer", alias: "implementer" },
    { id: "checks", changeRequests: 0 },
    { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
  ],
};

/** The base run every stamping check is matched against. */
const STAMP_BASE: BaseGateState = {
  commit: "base",
  ok: false,
  checks: [
    check("unit", false, { output: "(fail) suite > old case [0.1ms]" }),
    check("lint", false, { output: "lint error on line 3" }),
    check("quiet", false, { output: "" }),
  ],
};

function stampRunChecks(): CheckResult[] {
  return [
    // The same gate, one inherited signature and one of the task's own.
    check("unit", false, {
      output:
        "(fail) suite > old case [0.2ms]\n(fail) suite > new case [0.2ms]",
    }),
    check("lint", false, { output: "lint error on line 3" }),
    // A silent red gate offers only its name: the base name decides it.
    check("quiet", false, { output: "" }),
    check("freshQuiet", false, { output: "" }),
    check("readme", true),
    check("boot", false, {
      summary: "timed out after 900s",
      details: { kind: "infra", cause: "timed out after 900s" },
    }),
  ];
}

/** Closes a real checks record over the stamped fixture. */
async function stampedChecks(): Promise<StepRecord> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-stamp-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  try {
    await store.ensureLayout();
    const gate = await startChecks(store, {
      iteration: 1,
      slug: "a",
      round: 1,
    });
    return await finishChecks(gate, stampRunChecks(), {
      preexisting: preexistingRed(STAMP_BASE),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("checks attribution stamp", () => {
  it("stamps each failing check new or inherited from the preexisting set", async () => {
    const done = await stampedChecks();
    const stamped = new Map(
      (done.checks ?? []).map((entry) => [entry.name, entry]),
    );
    expect(done.ok).toBe(false);
    expect(stamped.get("unit")!.attribution).toBe("new");
    expect(stamped.get("lint")!.attribution).toBe("inherited");
    expect(stamped.get("quiet")!.attribution).toBe("inherited");
    expect(stamped.get("freshQuiet")!.attribution).toBe("new");
    // A green check and an infra red are never attributed to the task.
    expect(stamped.get("readme")!.attribution).toBeUndefined();
    expect(stamped.get("boot")!.attribution).toBeUndefined();
  });

  it("keeps an older record's reading: every red it holds is charged", () => {
    const reds = [check("package", false), check("cleanliness", false)];
    const reduction = derive(
      [task("a")],
      [
        implement(1),
        checksRecord(2, reds),
        implement(3, "tree-2"),
        checksRecord(4, reds),
      ],
      { "implement-review": ONE_FIX_FLOW },
    );
    expect(reduction.tasks.a!.park).toBeUndefined();
    expect(reduction.tasks.a!.pendingSignal).toEqual({
      kind: "gates",
      evidence: "task checks red after 1 fix turn: cleanliness, package",
    });
  });
});

describe("a stamped record charges only the task's failures", () => {
  it("gives the cleanliness revision turn beside an inherited red gate", () => {
    const reds = [red("package", "inherited"), red("cleanliness", "new")];
    const first = reduceTask(
      task("a"),
      [implement(1), checksRecord(2, reds)],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(first.phase).toBe("implement");
    expect(first.cleanlinessRevision).toBe(true);
    expect(first.gateFix).toBeUndefined();

    const justified = rec(3, {
      ...implement(3),
      outcome: {
        status: "done",
        summary: "kept the fixture: it is the benchmark data",
        concerns: [],
        forward: [],
        replies: [{ finding: 1, reply: "the fixture stays" }],
      },
    });
    const second = reduceTask(
      task("a"),
      [implement(1), checksRecord(2, reds), justified, checksRecord(4, reds)],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(second.phase).toBe("qa");
    expect(second.cleanlinessJustified).toBe(true);
    expect(second.cleanlinessRevision).toBeUndefined();
    expect(second.gateFix).toBeUndefined();
    expect(second.park).toBeUndefined();
  });
});

describe("a stamped record still charges a new failure", () => {
  it("charges a new failure under an already-red gate", () => {
    const reds = [red("package", "inherited"), red("unit", "new")];
    const first = reduceTask(
      task("a"),
      [implement(1), checksRecord(2, reds)],
      ONE_FIX_FLOW,
    );
    expect(first.phase).toBe("implement");
    expect(first.gateFix).toBe(true);
    expect(first.cleanlinessRevision).toBeUndefined();

    const parked = reduceTask(
      task("a"),
      [
        implement(1),
        checksRecord(2, reds),
        implement(3, "tree-2"),
        checksRecord(4, reds),
      ],
      ONE_FIX_FLOW,
    );
    expect(parked.phase).toBe("decide");
    expect(parked.park).toBeUndefined();
    expect(parked.pendingSignal).toEqual({
      kind: "gates",
      evidence: "task checks red after 1 fix turn: unit",
    });
  });
});

describe("a stamped record keeps a non-task red out of the fix", () => {
  it("keeps an infra red off gateFix and never parks as gate could not start, ignoring the inherited red", () => {
    const reduction = reduceTask(
      task("a"),
      [
        implement(1),
        checksRecord(2, [
          red("package", "inherited"),
          check("boot", false, {
            summary: "exit 127",
            details: { kind: "infra", cause: "exit 127" },
          }),
        ]),
      ],
      ONE_FIX_FLOW,
    );
    expect(reduction.phase).toBe("checks");
    expect(reduction.gateFix).toBeFalsy();
    expect(reduction.park).toBeUndefined();
  });

  it("blocks a merge on a new failure under an already-red merge gate", () => {
    const mergeRed = script(3, {
      step: "merge",
      ok: false,
      cause: cause("gates: unit"),
      checks: [red("package", "inherited"), red("unit", "new")],
      startedAt: new Date(3).toISOString(),
    });
    const reduction = reduceTask(
      task("a", { flow: "just-implement" }),
      [
        implement(1),
        script(2, { step: "checks", ok: true, checks: [] }),
        mergeRed,
      ],
      DEFAULT_FLOWS["just-implement"]!,
    );
    expect(reduction.phase).toBe("implement");
    expect(reduction.gateFix).toBe(true);
    expect(reduction.park).toBeUndefined();
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

describe("the fix ask reads the close-time attribution", () => {
  it("names only the task's own red, not the inherited gate", () => {
    const records = [
      implement(1),
      checksRecord(2, [
        red("package", "inherited"),
        red("cleanliness", "new", { output: "Large file: big.ts" }),
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
    expect(vars.findings).toContain("### cleanliness: exit 1");
    expect(vars.findings).not.toContain("### package");
  });
});

/** The implement turns of the dispatch scenario: work, then the justification. */
function scriptImplementTurns(harness: FakeHarness, prompts: string[]): void {
  harness.script(
    (req, ctx) => {
      prompts.push(req.prompt ?? "");
      fs.writeFileSync(
        path.join(req.cwd!, "big.ts"),
        Buffer.alloc(1024 * 1024 + 16, "x"),
      );
      ctx.writeOutcome(outcome({ summary: "added the benchmark fixture" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      prompts.push(req.prompt ?? "");
      ctx.writeOutcome(
        outcome({
          summary: "kept big.ts: it is the benchmark fixture",
          replies: [
            {
              finding: 1,
              reply: "the fixture belongs in the branch and stays",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
}

/** The landed run's shape: revision turn, stamped checks, no park, one merge. */
function expectLandedRun(prompts: string[], records: StepRecord[]): void {
  expect(prompts).toHaveLength(2);
  const revision = prompts[1]!;
  expect(revision).toContain("## Cleanliness revision");
  // The base gates still name the inherited red; the fix ask must not.
  const findingsLine = revision
    .split("\n")
    .find((line) => line.startsWith("- previous acceptance findings:"))!;
  expect(findingsLine).toContain("### cleanliness");
  expect(findingsLine).not.toContain("### package");

  const taskRecords = records.filter((record) => record.slug === "task");
  const checks = taskRecords.filter((record) => record.step === "checks");
  expect(checks).toHaveLength(2);
  expect(checks[0]!.ok).toBe(false);
  expect(
    checks[0]!
      .checks!.filter((entry) => !entry.ok)
      .map((entry) => [entry.name, entry.attribution]),
  ).toEqual([
    ["package", "inherited"],
    ["cleanliness", "new"],
  ]);
  expect(taskRecords.filter((record) => record.step === "park")).toEqual([]);
  expect(
    taskRecords.filter(
      (record) => record.step === "merge" && record.ok === true,
    ),
  ).toHaveLength(1);
}

describe("inherited red attribution on a dispatch run", () => {
  it("gives the cleanliness revision and lands despite the red base gate", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: "test -f fixed.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const pre = await preflight({
        configs: runtime.configs,
        paths: runtime.paths,
        store: runtime.store,
        harnesses: runtime.harnesses,
      });
      expect(pre.base?.ok).toBe(false);

      const prompts: string[] = [];
      scriptImplementTurns(harness, prompts);
      await writeTask(
        runtime,
        task("task", { flow: "just-implement", scope: ["big.ts"] }),
      );
      await runDispatch(runtime, { iteration: 1 });

      expectLandedRun(prompts, await runtime.store.listRecords());
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 120_000);
});
