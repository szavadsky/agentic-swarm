import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, outcome, setupFlowRepo, writeTask } from "./s2-helpers.js";

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
