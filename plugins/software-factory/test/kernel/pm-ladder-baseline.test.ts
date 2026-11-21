import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runGoal } from "../../src/kernel/launch.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanup,
  makeGoal,
  outcome,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

/** The graph finding a task file raises when it names a dep nothing declares. */
const baselineFinding = (slug: string, dep: string): string =>
  `task "${slug}" depends on missing task "${dep}"`;

function writeTaskText(runtime: KernelRuntime, text: string): void {
  fs.writeFileSync(
    path.join(runtime.store.tasksDir, `${/^slug:\s*(\S+)/m.exec(text)![1]}.md`),
    text,
    "utf8",
  );
}

function stallSetup() {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    },
  });
  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  return { repo, goal, harness };
}

const ALPHA_BODY = "Write alpha.txt.\nDone when: alpha.txt holds alpha.";

function pmCalls(harness: FakeHarness): number {
  return harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm")
    .length;
}

function registerPMLadderBaselinePart4(): void {
  it("routes the findings to the architect instead of blocking the goal", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n## alpha\nCreate alpha.txt.\n",
        "utf8",
      );
      writeTaskText(runtime, simpleTask("b", "b.txt", { deps: ["missing"] }));
      // Merged: the finding is history and no open work summons the checker.
      await runtime.store.appendRecord(
        { iteration: 1, slug: "b", step: "merge", round: 1, actor: "script" },
        { ok: true },
      );
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "\n## alpha note\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeTaskText(runtime, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(boundary.cause).toBe(
        `PM ladder routed to the architect: ${baselineFinding("b", "missing")}`,
      );
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "alpha.md"))).toBe(
        true,
      );
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPMLadderBaselinePart5(): void {
  it("ends the launch in progress, not blocked-by-user, when the route reaches it", async () => {
    const goal = makeGoal();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      writeGoalTask(
        goal.goalDir,
        simpleTask("b", "b.txt", { deps: ["missing"] }),
      );
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no task to file for b" }));
        return fakeTurnResult(req);
      });

      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("iteration-limit");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: in-progress");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).toContain(
        `PM ladder routed to the architect: ${baselineFinding("b", "missing")}`,
      );
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

/** The stall turn's replace route: it writes the continuation task. */
function scriptStallReplace(
  harness: FakeHarness,
  runtime: KernelRuntime,
  onPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onPrompt(req.prompt);
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha-2.md"),
        renderTaskFile(
          task("alpha-2", {
            scope: ["alpha.txt"],
            base: "alpha",
            source: "stall: 1",
            body: `Retry with the records.\nDone when: alpha.txt holds alpha.`,
            turnMinutes: 45,
            repairTurns: 2,
          }),
        ),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "continue alpha",
          stallRoutes: [
            {
              slug: "alpha",
              action: "replace",
              reason: "retry with the records",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

/** The continuation's implement and review turns. */
function scriptAlpha2Continuation(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha-2 implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha-2", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "alpha-2 approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha-2", step: "review" }) },
  );
}

/** Asserts the parked task, the in-iteration continuation and the stall prompt. */
function expectZeroMergeStall(
  runtime: KernelRuntime,
  records: StepRecord[],
  state: ReturnType<typeof derive>,
  harness: FakeHarness,
  stallPrompt: string,
): void {
  expect(state.tasks.alpha!.status).toBe("parked");
  expect(state.tasks["alpha-2"]!.status).toBe("merged");
  // The continuation ran in the same iteration, not at the next boundary.
  for (const record of records.filter((r) => r.slug === "alpha-2")) {
    expect(record.iteration).toBe(1);
  }
  expect(pmCalls(harness)).toBe(1);
  const routes = records.filter((r) => r.step === "stall-routes");
  expect(routes).toHaveLength(1);
  expect(routes[0]!.outcome?.stallRoutes).toEqual([
    { slug: "alpha", action: "replace", reason: "retry with the records" },
  ]);
  // The stall turn saw the park's cause, record paths, kept branch and spent turns.
  expect(stallPrompt).toContain("alpha stuck on the API");
  expect(stallPrompt).toContain("records/");
  expect(stallPrompt).toContain("alpha-implement");
  expect(stallPrompt).toContain("factory-task/demo/alpha");
  expect(stallPrompt).toContain("turns: 1 spent");
  const continuation = parseTaskFile(
    fs.readFileSync(path.join(runtime.store.tasksDir, "alpha-2.md"), "utf8"),
    "alpha-2",
  );
  expect(continuation.base).toBe("alpha");
  expect(continuation.source).toBe("stall: 1");
  expect(continuation.turnMinutes).toBe(45);
  expect(continuation.repairTurns).toBe(2);
}

function registerStallPMZeroMergeStallInTheRunningIterationPart1(): void {
  it("runs one stall turn on exhaustion with 0 merges and a park; the continuation merges in the same iteration", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck on the API" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      let stallPrompt = "";
      scriptStallReplace(harness, runtime, (prompt) => {
        stallPrompt = prompt;
      });
      scriptAlpha2Continuation(harness);

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expectZeroMergeStall(runtime, records, state, harness, stallPrompt);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStallPMZeroMergeStallInTheRunningIterationPart2(): void {
  it("ends at the boundary with recorded reasons when the stall turn leaves every slug parked", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck on the API" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      scriptStallLeave(
        harness,
        ["alpha"],
        "direction is wrong; needs architect",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(pmCalls(harness)).toBe(1);
      const files = await runtime.store.listDir("tasks");
      expect(files).toEqual(["alpha.md"]);
      const routes = (await runtime.store.listRecords()).filter(
        (r) => r.step === "stall-routes",
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(true);
      expect(routes[0]!.outcome?.stallRoutes).toEqual([
        {
          slug: "alpha",
          action: "leave",
          reason: "direction is wrong; needs architect",
        },
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("PM ladder baseline", () => {
  registerPMLadderBaselinePart4();

  registerPMLadderBaselinePart5();
});

describe("stall PM — zero-merge stall in the running iteration", () => {
  registerStallPMZeroMergeStallInTheRunningIterationPart1();

  registerStallPMZeroMergeStallInTheRunningIterationPart2();
});
