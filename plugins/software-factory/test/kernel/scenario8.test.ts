import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("KERNEL0 scenario 8 — drain", () => {
  it("stops dispatching at the iteration turn limit, lets in-flight work finish and writes the summary", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 2, turns: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));
      await writeTask(runtime, task("c", { scope: ["c.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(result.cause).toContain("turn limit 1");
      expect(harness.calls.length).toBe(2);

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.a!.turns).toBe(2);
      expect(state.tasks.b!.turns).toBe(0);
      expect(state.tasks.c!.turns).toBe(0);
      expect(records.filter((r) => r.slug === "b" && r.actor === "agent").length).toBe(0);
      expect(records.filter((r) => r.slug === "c" && r.actor === "agent").length).toBe(0);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      expect(fs.existsSync(path.join(runtime.store.goalDir, "iterations/1/summary.md"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("drains on the iteration wall limit before dispatching anything", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      runtime.limits.iterationWallMs = 0;
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(result.cause).toContain("wall limit");
      expect(harness.calls.length).toBe(0);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.actor === "agent").length).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
