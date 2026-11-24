import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runGoal } from "../../src/kernel/launch.js";
import {
  cleanup,
  makeGoal,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { cause } from "./helpers.js";
import { testPriceSource } from "../helpers/price-source.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  writeTask,
} from "./s2-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";

/** The scrubbed one-line text a provider.no-route stop carries. */
const NO_ROUTE = "provider.no-route Model unavailable: local-host/missing-free";

describe("infra stop details", () => {
  registerInfraStopDetailsPart1();
  registerInfraStopDetailsPart2();
  registerInfraStopDetailsPart3();
  registerInfraStopDetailsPart4();
});

function registerInfraStopDetailsPart1(): void {
  it("shows a no-route stop's details in the dispatch cause and keeps the record verbatim", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "infra", cause: "auth", details: NO_ROUTE },
        }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toEqual({
        kind: "boundary",
        detail: `task: auth: ${NO_ROUTE}`,
      });

      const stepRecord = (await runtime.store.listRecords()).find(
        (r) => r.step === "implement",
      );
      expect(stepRecord?.stop).toEqual({
        kind: "infra",
        cause: "auth",
        details: NO_ROUTE,
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerInfraStopDetailsPart2(): void {
  it("prints a stop without details as before", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toEqual({ kind: "boundary", detail: "task: auth" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerInfraStopDetailsPart3(): void {
  it("keeps refusal details in the park cause", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy refusal" },
        }),
      );
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toEqual(
        cause("refused: content policy refusal"),
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerInfraStopDetailsPart4(): void {
  it("carries the details through the launch stop text and the iteration summary", async () => {
    const goal = makeGoal();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script((req, ctx) => {
        writePlan(
          goal.goalDir,
          "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeGoalTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "infra", cause: "auth", details: NO_ROUTE },
        }),
      );

      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      const stopText = `infrastructure stop during iteration 1: alpha: auth: ${NO_ROUTE}; relaunch to retry`;
      expect(result.stop).toBe("infra");
      expect(result.cause).toBe(stopText);

      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain(`- boundary: ${stopText}`);
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md")),
      ).toBe(false);
      const dashboard = fs.readFileSync(
        path.join(goal.goalDir, "dashboard.html"),
        "utf8",
      );
      expect(dashboard).toContain(
        '<span class="badge stop-infra">stopped: infrastructure stop</span>',
      );
      expect(dashboard).toContain(stopText);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}
