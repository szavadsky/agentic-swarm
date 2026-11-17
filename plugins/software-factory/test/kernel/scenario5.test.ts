import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import { integrationHead } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  writeTask,
} from "./s2-helpers.js";

/** Drives one real action and returns the freshly derived state. */
async function step(
  runtime: KernelRuntime,
  file: TaskFile,
  action: Action,
  iteration = 1,
): Promise<TaskState> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  await executeTaskAction(
    runtime,
    file,
    action,
    iteration,
    state.tasks[file.slug]!,
  );
  const after = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return after.tasks[file.slug]!;
}

describe("KERNEL0 scenario 5 — red gates on the merged result", () => {
  it("records a red base once and does not tax the task or block its merge", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "always-red", command: "test -f never.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("always-red");
        expect(req.prompt).toContain("pre-existing");
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "feature implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const head = await integrationHead(runtime);
      await runtime.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: head,
        },
        {
          ok: false,
          checks: [
            {
              name: "always-red",
              ok: false,
              summary: "exit 1",
              // The gate is silent (`test -f` prints nothing); the real base run
              // records that silence, so the inherited failure has no signature.
              output: "",
              fingerprint: "red",
            },
          ],
        },
      );
      await writeTask(runtime, task("task", { scope: ["feature.txt"] }));

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
        records.filter((r) => r.slug === "task" && r.step === "implement"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-checks"),
      ).toHaveLength(0);
      const merges = records.filter(
        (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
      );
      expect(merges).toHaveLength(1);
      expect(merges[0]!.cause).toContain("skipped merge-checks");
      // The inherited red travels with the reused checks.
      expect(merges[0]!.checks![0]!.ok).toBe(false);
      expect(harness.calls.length).toBe(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not merge, runs one fix round, then parks when the merged result is red again", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "poison-gate", command: "test ! -f poison.txt" }],
    });
    try {
      const checkout = goalCheckout(repo, goal);
      let poisonCommit = "";
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "feature implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "feature approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("poison-gate");
        fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["feature.txt", "fix.txt"] });
      await writeTask(runtime, file);

      await step(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      await step(runtime, file, { kind: "checks", slug: "task" });
      await step(runtime, file, {
        kind: "step",
        slug: "task",
        step: "review",
        round: 1,
      });

      // A concurrent task lands poison on the integration branch while the
      // review ran; the merged result is red but the task worktree is not.
      fs.writeFileSync(path.join(checkout, "poison.txt"), "poison\n", "utf8");
      repo.git(["add", "poison.txt"], { cwd: checkout });
      repo.git(["commit", "-m", "concurrent task adds poison"], {
        cwd: checkout,
      });
      poisonCommit = repo
        .git(["rev-parse", "HEAD"], { cwd: checkout })
        .stdout.trim();

      await step(runtime, file, { kind: "merge", slug: "task" });
      await step(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      await step(runtime, file, { kind: "checks", slug: "task" });
      await step(runtime, file, { kind: "merge", slug: "task" });
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("gates:")).toBe(true);

      const merges = records.filter(
        (r) => r.slug === "task" && r.step === "merge",
      );
      expect(merges.map((r) => r.ok)).toEqual([false, false]);
      expect(merges.every((r) => r.cause?.startsWith("gates:"))).toBe(true);
      const mergeChecks = records.filter(
        (r) => r.slug === "task" && r.step === "merge-checks",
      );
      expect(mergeChecks.length).toBe(2);
      expect(mergeChecks.every((r) => r.ok === false)).toBe(true);

      expect(state.tasks.task!.round).toBe(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "implement")
          .length,
      ).toBe(2);
      expect(repo.git(["rev-parse", "factory/demo"]).stdout.trim()).toBe(
        poisonCommit,
      );
      expect(
        repo.git(["show", "factory/demo:feature.txt"], { allowFail: true })
          .code,
      ).not.toBe(0);
      expect(harness.calls.length).toBe(4);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
