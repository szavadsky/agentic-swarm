import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, outcome, setupFlowRepo, writeTask } from "./s2-helpers.js";
import { cleanup, launch, makeGoal, simpleTask, stateOf, writePlan, writeTask as writeGoalTask } from "./e2e-helpers.js";

describe("KERNEL0 scenario 4 — infra stops and the item budget", () => {
  it("retries an infra stop without consuming the item budget or a review round", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "rate" } }));
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const first = await runDispatch(runtime, { iteration: 1 });
      expect(first.reason).toBe("infra");
      let state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("ready");
      expect(state.tasks.task!.turns).toBe(0);
      expect(state.tasks.task!.round).toBe(1);
      expect(state.tasks.task!.phase).toBe("implement");

      const second = await runDispatch(runtime, { iteration: 1 });
      expect(second.reason).toBe("boundary");
      state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.turns).toBe(2);
      expect(state.tasks.task!.round).toBe(1);
      expect(state.tasks.task!.park).toBeUndefined();

      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "implement").length).toBe(2);
      expect(records.filter((r) => r.slug === "task" && r.step === "park").length).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("confines an infra stop to its slug and lets an independent task merge", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "rate" } }));
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("alpha");
      expect(result.cause).toContain("rate");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.beta!.status).toBe("merged");
      expect(records.filter((r) => r.slug === "beta" && r.step === "merge" && r.ok === true)).toHaveLength(1);
      expect(records.filter((r) => r.slug === "alpha" && r.step === "park")).toHaveLength(0);
      expect(harness.calls.length).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ends a launch with a summary and exit 1 when the harness is out of quota", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(
          goal.goalDir,
          "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n"
        );
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeGoalTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }));

      expect(await launch(goal.repo, harness, 2)).toBe(1);

      const state = await stateOf(goal.goalDir);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.alpha!.phase).toBe("implement");
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("infrastructure stop during iteration 1");
      expect(fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md"))).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("parks a task whose item budget is exhausted", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { itemTurns: 2, flows: { "implement-review": { reviewRounds: 4 } } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "needs another round", verdict: "changes" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("budget:")).toBe(true);
      expect(state.tasks.task!.turns).toBe(2);
      expect(state.tasks.task!.round).toBe(2);
      expect(harness.calls.length).toBe(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
