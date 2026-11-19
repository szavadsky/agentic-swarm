// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { recoverLaunch } from "../../src/kernel/recovery.js";
import { ensureTaskWorktree, treeSha } from "../../src/kernel/worktree.js";
import { recordStart, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

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
        recordStart({
          slug: "task",
          step: "implement",
          base: ensured.startPoint,
        }),
        {
          commit,
          tree: await treeSha(ensured.path),
          outcome: outcome({ summary: "implemented" }),
        },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "checks").length,
      ).toBe(1);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "task",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("seals the interrupted record it closes", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const legacy = await runtime.store.startRecord(
        recordStart({ slug: "old", step: "review" }),
      );
      await legacy.finish({
        ok: true,
        outcome: outcome({ summary: "old", verdict: "approve" }),
      });
      // A record closed before the kernel sealed them read-only.
      fs.chmodSync(legacy.outcomePath, 0o644);
      const turn = await runtime.store.startRecord(
        recordStart({ slug: "task", step: "implement" }),
      );
      const mode = (name: string): number =>
        fs.statSync(path.join(turn.dir, name)).mode & 0o777;
      expect(mode("started.yaml")).toBe(0o644);

      expect(await recoverLaunch(runtime)).toBe(1);

      expect(mode("started.yaml")).toBe(0o444);
      expect(mode("end.yaml")).toBe(0o444);
      expect(fs.statSync(legacy.outcomePath).mode & 0o777).toBe(0o444);
      expect(fs.existsSync(turn.outcomePath)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
