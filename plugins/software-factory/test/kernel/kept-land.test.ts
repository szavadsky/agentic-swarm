import { describe, expect, it } from "bun:test";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { runKeptLand } from "../../src/kernel/integrate.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { task } from "./helpers.js";

describe("kept-land", () => {
  it("writes a kept-land record when branch does not exist", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const taskFile = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, taskFile);

      // Manually add a park record and approve
      const commit = repo.git(["rev-parse", "main"]).stdout.trim();
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "task",
          round: 1,
          step: "review",
          actor: "agent",
          commit,
        },
        {
          ok: true,
          outcome: {
            status: "done",
            summary: "ok",
            verdict: "approve",
            concerns: [],
            forward: [],
          },
        },
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "task",
          round: 1,
          step: "park",
          actor: "agent",
          commit,
        },
        { ok: true, cause: "parked" },
      );

      // Run kept-land
      const result = await runKeptLand(runtime, 1);
      expect(result.attempted).toContain("task");
      expect(result.landed).not.toContain("task");

      // Verify kept-land record exists
      const records = await runtime.store.listRecords();
      const keptLand = records.find(
        (r) => r.slug === "task" && r.step === "kept-land" && r.iteration === 1,
      );
      expect(keptLand).toBeDefined();
      expect(keptLand!.ok).toBe(false);
      expect(keptLand!.cause).toContain("does not exist");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
