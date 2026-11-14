import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import { cleanupFlowRepo, goalCheckout, makeRuntime, outcome, setupFlowRepo, writeTask } from "./s2-helpers.js";

describe("agent containment", () => {
  it("parks a turn that writes outside its worktree and switches branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const checkout = goalCheckout(repo, goal);
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(checkout, "OUTSIDE.txt"), "rogue\n", "utf8");
        repo.git(["checkout", "-b", "rogue"], { cwd: req.cwd! });
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("containment:");
      expect(state.tasks.task!.cause).toContain('not the task branch "factory-task/demo/task"');
      expect(state.tasks.task!.cause).toContain("files changed outside the worktree");
      expect(harness.calls.length).toBe(1);
      expect(records.filter((r) => r.step === "merge")).toHaveLength(0);
      expect(fs.existsSync(path.join(checkout, "OUTSIDE.txt"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("accepts a turn contained to its worktree", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
      expect(records.filter((r) => r.slug === "task" && r.step === "park")).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
