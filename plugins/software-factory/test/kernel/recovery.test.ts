import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { commitAll } from "../../src/core/git/commit.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree, treeSha } from "../../src/kernel/worktree.js";
import { recordStart, task } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, outcome, setupFlowRepo } from "./s2-helpers.js";

describe("script-step recovery", () => {
  it("re-runs branch checks when an implement turn ended without a checks record", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const taskFile = task("task", { scope: ["task.txt"] });
      await runtime.store.writeTask(taskFile);
      const ensured = await ensureTaskWorktree(runtime, taskFile);
      if (ensured.error) throw new Error(ensured.error);
      fs.writeFileSync(path.join(ensured.path, "task.txt"), "task\n", "utf8");
      const commit = await commitAll(runtime.repo, ensured.path, "task work");
      if (!commit) throw new Error("no commit");
      await runtime.store.appendRecord(
        recordStart({ slug: "task", step: "implement", base: ensured.startPoint }),
        {
          commit,
          tree: await treeSha(ensured.path),
          outcome: outcome({ summary: "implemented" }),
        }
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
      expect(records.filter((r) => r.slug === "task" && r.step === "checks").length).toBe(1);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe("task");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
