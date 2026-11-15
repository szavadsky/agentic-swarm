import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/** A harness whose compaction backend is down; every other behaviour is the fake's. */
class FailingCompactHarness extends FakeHarness {
  override async compact(_ref: SessionRef): Promise<SessionRef> {
    throw new Error("compact backend down");
  }
}

function scriptConflict(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "task side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/**
 * Another task's merge lands on the integration branch before this task starts,
 * so the task branch's squash has a conflicting file when the queue reaches it.
 */
function landIntegrationChange(repo: TmpRepo, checkout: string): void {
  fs.writeFileSync(
    path.join(checkout, "conflict.txt"),
    "integration\n",
    "utf8",
  );
  repo.git(["add", "conflict.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent integration change"], {
    cwd: checkout,
  });
}

describe("merge conflicts", () => {
  it("lets the task's implementer resolve one conflict, then merges", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("Conflicted files: conflict.txt");
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          "resolved\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "conflict resolved" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
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
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("resolved");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-attempt")
          .length,
      ).toBe(1);
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
        ).length,
      ).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("compacts the conflict-merge turn at settle and stores the compacted ref", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          "resolved\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "conflict resolved" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      const attempt = records.find(
        (r) => r.slug === "task" && r.step === "merge-attempt",
      )!;
      // The merge attempt resumed the implementer's session and compacted it.
      expect(harness.calls[2]!.session?.id).toBe(implement.session!.id);
      expect(harness.compactions).toHaveLength(3);
      expect(harness.compactions[2]!.id).toBe(implement.session!.id);
      expect(attempt.session?.id).toBe(implement.session!.id);
      expect(attempt.session?.compacted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the uncompacted ref when compacting the conflict-merge turn fails", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FailingCompactHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          "resolved\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "conflict resolved" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      const attempt = records.find(
        (r) => r.slug === "task" && r.step === "merge-attempt",
      )!;
      expect(state.tasks.task!.status).toBe("merged");
      expect(attempt.session?.compacted).toBe(false);
      expect(harness.calls[2]!.session?.id).toBe(attempt.session!.id);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps a no-route infra stop's details when the conflict attempt fails", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "auth",
            details:
              "provider.no-route Model unavailable: opencode/does-not-exist-free",
          },
        }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toBe(
        "task: auth: provider.no-route Model unavailable: opencode/does-not-exist-free",
      );

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("ready");
      // Implement and review compacted; the infra-stopped merge attempt did not.
      expect(harness.compactions).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not compact a conflict-merge turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      // Implement and review compacted; the refused merge attempt did not.
      expect(harness.compactions).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks with conflict when the implementer attempt leaves the merge unresolved", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "could not resolve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("conflict:")).toBe(true);
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
        ).length,
      ).toBe(0);
      expect(
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("integration");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
