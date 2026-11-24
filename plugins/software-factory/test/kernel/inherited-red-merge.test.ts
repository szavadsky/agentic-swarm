import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { mergeGateNames } from "../../src/kernel/derive-task-facts.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { preflight } from "../../src/kernel/preflight.js";
import type {
  Action,
  KernelRuntime,
  StepRecord,
  TaskFile,
} from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** Lands a failing file on the integration checkout after the branch's checks. */
function landBrokenCheckout(repo: TmpRepo, goal: string): void {
  const checkout = goalCheckout(repo, goal);
  fs.writeFileSync(path.join(checkout, "broken.txt"), "broken\n");
  repo.git(["add", "broken.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent breakage"], { cwd: checkout });
}

/** Drives the task to the merge, then lands the check-breaking commit. */
async function driveToRedMerge(
  runtime: KernelRuntime,
  file: TaskFile,
  repo: TmpRepo,
  goal: string,
): Promise<void> {
  const drive = async (action: Action) => {
    const state = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    await executeTaskAction(runtime, file, action, 1, state.tasks[file.slug]!);
  };
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  await drive({ kind: "checks", slug: "task" });
  landBrokenCheckout(repo, goal);
  await drive({ kind: "merge", slug: "task" });
}

/** The production merge record: stamped checks and the names derive reads. */
async function expectStampedMerge(
  runtime: KernelRuntime,
  records: StepRecord[],
): Promise<void> {
  const merge = records
    .filter((record) => record.slug === "task" && record.step === "merge")
    .at(-1)!;
  expect(merge.ok).toBe(false);
  expect(causeText(merge.cause)).toBe("gates: no-broken");
  expect(
    merge
      .checks!.filter((entry) => !entry.ok)
      .map((entry) => [entry.name, entry.attribution]),
  ).toEqual([
    ["package", "inherited"],
    ["no-broken", "new"],
  ]);
  expect(mergeGateNames(merge)).toEqual(["no-broken"]);
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.gateFix).toBe(true);
  expect(state.tasks.task!.park).toBeUndefined();
}

describe("a red merge record carries the stamp", () => {
  it("stamps the merge's own checks, so its names read the attribution", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "package", command: "test -f fixed.txt" },
        { id: "no-broken", command: "! test -f broken.txt" },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await preflight({
        configs: runtime.configs,
        paths: runtime.paths,
        store: runtime.store,
        harnesses: runtime.harnesses,
      });
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "feature.txt"), "ok\n");
          ctx.writeOutcome(outcome({ summary: "added the feature" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }) },
      );
      const file = task("task", {
        flow: "just-implement",
        scope: ["feature.txt"],
      });
      await writeTask(runtime, file);
      await driveToRedMerge(runtime, file, repo, goal);
      await expectStampedMerge(runtime, await runtime.store.listRecords());
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 120_000);
});
