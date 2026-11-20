import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { recoverLaunch } from "../../src/kernel/recovery.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  ensureTaskWorktree,
  integrationHead,
  removeMergeScratch,
  resetMergeScratch,
  taskBranchName,
  treeSha,
} from "../../src/kernel/worktree.js";
import { recordStart, task as taskFile } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

/** A task approved on its branch, with the integration head still untouched. */
async function prepareApprovedTask(runtime: KernelRuntime) {
  const task = taskFile("task", { scope: ["task.txt"] });
  await runtime.store.writeTask(task);
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) throw new Error(ensured.error);
  fs.writeFileSync(path.join(ensured.path, "task.txt"), "task\n", "utf8");
  const commit = await commitAll(runtime.repo, ensured.path, "task work");
  if (!commit) throw new Error("no task commit");
  const tree = await treeSha(ensured.path);
  await runtime.store.appendRecord(
    recordStart({ slug: "task", step: "implement", base: ensured.startPoint }),
    { commit, tree, outcome: outcome({ summary: "implemented" }) },
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "checks", { slug: "task", round: 1 }),
    {
      ok: true,
      checks: [],
    },
  );
  await runtime.store.appendRecord(
    recordStart({ slug: "task", step: "review" }),
    {
      commit,
      tree,
      outcome: outcome({ summary: "approved", verdict: "approve" }),
    },
  );
  return { task, branch: taskBranchName(runtime, "task"), commit };
}

describe("merge queue crash recovery", () => {
  it("completes the recorded merge after a crash between the ref move and the record", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "red", command: "test -f never.txt" }],
    });
    try {
      const scope1 = await completesRecordedMergeAfterCrashPart1(repo, goal);
      await completesRecordedMergeAfterCrashPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("moves the integration ref to a planned commit recorded before the crash", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "red", command: "test -f never.txt" }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const { branch } = await prepareApprovedTask(runtime);
      const head = await integrationHead(runtime);
      const scratch = await resetMergeScratch(runtime, head);
      repo.git(["merge", "--squash", branch], { cwd: scratch });
      await commitAll(runtime.repo, scratch, "planned merge");
      const planned = repo
        .git(["rev-parse", "HEAD"], { cwd: scratch })
        .stdout.trim();
      await removeMergeScratch(runtime);
      await runtime.store.startRecord({
        ...scriptMeta(1, "merge", { slug: "task", round: 1 }),
        commit: planned,
      });

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(repo.git(["rev-parse", "factory/demo"]).stdout.trim()).toBe(
        planned,
      );
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
        ).length,
      ).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

async function completesRecordedMergeAfterCrashPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const { branch } = await prepareApprovedTask(runtime);
  const checkout = runtime.paths.goalCheckout;
  repo.git(["merge", "--squash", branch], { cwd: checkout });
  repo.git(["commit", "-m", "manual merge"], { cwd: checkout });
  const mergeCommit = repo
    .git(["rev-parse", "HEAD"], { cwd: checkout })
    .stdout.trim();
  await runtime.store.startRecord({
    ...scriptMeta(1, "merge", { slug: "task", round: 1 }),
    commit: mergeCommit,
  });

  // The next launch always runs recovery first; it seals the interrupted
  // merge, and the merge queue must still recover the recorded commit.
  await recoverLaunch(runtime);
  const sealed = (await runtime.store.listRecords()).filter(
    (r) => r.slug === "task" && r.step === "merge",
  );
  expect(sealed).toHaveLength(1);
  expect(sealed[0]!.stop).toEqual({ kind: "infra", cause: "crash" });

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
  expect(repo.git(["rev-parse", "factory/demo"]).stdout.trim()).toBe(
    mergeCommit,
  );
  expect(
    repo.git(["rev-list", "--count", "main..factory/demo"]).stdout.trim(),
  ).toBe("1");
  expect(
    records.filter(
      (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
    ).length,
  ).toBe(1);

  return { records };
}

async function completesRecordedMergeAfterCrashPart2(
  scope: Awaited<ReturnType<typeof completesRecordedMergeAfterCrashPart1>>,
) {
  const { records } = scope;
  expect(
    records.filter((r) => r.slug === "task" && r.step === "merge-checks")
      .length,
  ).toBe(0);
}
