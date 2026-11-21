import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

async function finishesSpikeWithoutMergingKeepsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "finding.md"),
      "# Finding\n\nUse the cache.\n",
      "utf8",
    );
    fs.mkdirSync(path.join(req.cwd!, ".factory/spikes"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(req.cwd!, spikeReportPath("probe")),
      "# Finding\n\nUse the cache.\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "finding written" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "finding is sound", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
  );
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.probe!.status).toBe("finished");
  expect(
    records.filter((r) => r.slug === "probe" && r.step === "merge").length,
  ).toBe(0);

  return { records };
}

async function finishesSpikeWithoutMergingKeepsPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof finishesSpikeWithoutMergingKeepsPart1>>,
) {
  const { records } = scope;
  expect(
    records.filter(
      (r) => r.slug === "probe" && r.step === "finish" && r.ok === true,
    ).length,
  ).toBe(1);
  expect(
    repo.git(["rev-parse", "--verify", "refs/heads/factory-task/demo/probe"])
      .code,
  ).toBe(0);
  expect(
    repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code,
  ).not.toBe(0);
}

describe("spikes", () => {
  it("finishes a spike without merging and keeps its branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await finishesSpikeWithoutMergingKeepsPart1(repo, goal);
      await finishesSpikeWithoutMergingKeepsPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
