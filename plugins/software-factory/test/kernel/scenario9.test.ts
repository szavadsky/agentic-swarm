import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("KERNEL0 scenario 9 — no progress over the item history", () => {
  it("parks on an A, B, A sequence that only a history comparison catches", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { itemTurns: 10, flows: { "implement-review": { reviewRounds: 4 } } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const implement = (content: string, label: string) => (req: any, ctx: any) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), `${content}\n`, "utf8");
        ctx.writeOutcome(outcome({ summary: label }));
        return fakeTurnResult(req);
      };
      const changes = (label: string) => (req: any, ctx: any) => {
        ctx.writeOutcome(outcome({ summary: label, verdict: "changes" }));
        return fakeTurnResult(req);
      };
      harness.script(implement("A", "attempt A"));
      harness.script(changes("round 1 needs work"));
      harness.script(implement("B", "attempt B"));
      harness.script(changes("round 2 needs work"));
      harness.script(implement("A", "attempt A again"));

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("no-progress:")).toBe(true);
      expect(state.tasks.task!.cause).toContain("implement r3");
      expect(state.tasks.task!.turns).toBe(5);
      expect(harness.calls.length).toBe(5);

      const incidents = records.filter(
        (r) => r.slug === "task" && r.step === "park" && r.cause?.startsWith("no-progress:")
      );
      expect(incidents.length).toBe(1);
      expect(repo.git(["show", "factory/demo:task.txt"], { allowFail: true }).code).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
