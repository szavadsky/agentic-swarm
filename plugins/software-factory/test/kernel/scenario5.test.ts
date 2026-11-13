import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("KERNEL0 scenario 5 — red gates on the merged result", () => {
  it("does not merge, runs one fix round, then parks when the merged result is red again", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "poison-gate", command: "test ! -f poison.txt" }],
    });
    try {
      const checkout = goalCheckout(repo, goal);
      let poisonCommit = "";
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "feature.txt"), "feature\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "feature implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(checkout, "poison.txt"), "poison\n", "utf8");
        repo.git(["add", "poison.txt"], { cwd: checkout });
        repo.git(["commit", "-m", "concurrent task adds poison"], { cwd: checkout });
        poisonCommit = repo.git(["rev-parse", "HEAD"], { cwd: checkout }).stdout.trim();
        ctx.writeOutcome(outcome({ summary: "feature approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("poison-gate");
        fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["feature.txt", "fix.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("gates:")).toBe(true);

      const merges = records.filter((r) => r.slug === "task" && r.step === "merge");
      expect(merges.map((r) => r.ok)).toEqual([false, false]);
      expect(merges.every((r) => r.cause?.startsWith("gates:"))).toBe(true);
      const mergeChecks = records.filter((r) => r.slug === "task" && r.step === "merge-checks");
      expect(mergeChecks.length).toBe(2);
      expect(mergeChecks.every((r) => r.ok === false)).toBe(true);

      expect(state.tasks.task!.round).toBe(1);
      expect(records.filter((r) => r.slug === "task" && r.step === "implement").length).toBe(2);
      expect(repo.git(["rev-parse", "factory/demo"]).stdout.trim()).toBe(poisonCommit);
      expect(repo.git(["show", "factory/demo:feature.txt"], { allowFail: true }).code).not.toBe(0);
      expect(harness.calls.length).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
