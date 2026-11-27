import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { infraPath } from "../../src/kernel/infra.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
} from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function writeInfraIncident(
  goalDir: string,
  incident: Record<string, unknown>,
): void {
  fs.writeFileSync(
    infraPath(goalDir),
    yaml.stringify({ gates: [], incident }),
    "utf8",
  );
}

async function driveMergeAction(
  runtime: KernelRuntime,
  file: TaskFile,
  action: Action,
) {
  const st = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  await executeTaskAction(runtime, file, action, 1, st.tasks[file.slug]!);
}

async function stageMergeVerdict(verdict: "red" | "infra", fixed?: string) {
  const cmd = fixed
    ? `if [ -f a.txt ] && [ -f b.txt ] && [ ! -f "${fixed}" ]; then exit 127; fi; exit 0`
    : "if [ -f a.txt ] && [ -f b.txt ]; then exit 127; fi; exit 0";
  const setup = setupFlowRepo({ gates: [{ id: "merge-gate", command: cmd }] });
  const harness = new FakeHarness({ id: "fake" });
  let implCalls = 0;
  harness.script(
    (req, ctx) => {
      const slug = fakeTurnIdentity(req).slug;
      if (slug === "a") implCalls += 1;
      fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `v${implCalls}\n`);
      if (slug === "a" && implCalls >= 2 && fixed)
        fs.writeFileSync(fixed, "ok\n", "utf8");
      ctx.writeOutcome(outcome({ summary: `${slug} impl` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }), fallback: true },
  );
  harness.script(
    (req, ctx) => {
      writeInfraIncident(
        setup.goalDir,
        verdict === "red"
          ? { verdict: "red" }
          : { verdict: "infra", handling: "stop" },
      );
      ctx.writeOutcome(outcome({ summary: `merge ${verdict}` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "infra" }), fallback: true },
  );
  const runtime = await makeRuntime(setup.repo, setup.goal, { fake: harness });
  const taskA = task("a", { flow: "just-implement", scope: ["a.txt"] });
  const taskB = task("b", { flow: "just-implement", scope: ["b.txt"] });
  await writeTask(runtime, taskA);
  await writeTask(runtime, taskB);
  await driveMergeAction(runtime, taskA, {
    kind: "step",
    slug: "a",
    step: "implement",
    round: 1,
  });
  await driveMergeAction(runtime, taskA, { kind: "checks", slug: "a" });
  await driveMergeAction(runtime, taskB, {
    kind: "step",
    slug: "b",
    step: "implement",
    round: 1,
  });
  await driveMergeAction(runtime, taskB, { kind: "checks", slug: "b" });
  await driveMergeAction(runtime, taskB, { kind: "merge", slug: "b" });
  const result = await runDispatch(runtime, { iteration: 1 });
  return { ...setup, runtime, result, implCalls: () => implCalls };
}

function testChecksRedVerdict() {
  it("routes verdict: red in task checks to normal gate adjudication and never stamps infra", async () => {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-red-c-"));
    const fixed = path.join(probeDir, "fixed");
    const { repo, goalDir, goal } = setupFlowRepo({
      gates: [{ id: "script", command: `test -f "${fixed}" || exit 127` }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      let implCalls = 0;
      harness.script(
        (req, ctx) => {
          implCalls += 1;
          fs.writeFileSync(path.join(req.cwd!, "a.txt"), `v${implCalls}\n`);
          if (implCalls >= 2) fs.writeFileSync(fixed, "ok\n", "utf8");
          ctx.writeOutcome(outcome({ summary: `impl ${implCalls}` }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }), fallback: true },
      );
      harness.script(
        (req, ctx) => {
          writeInfraIncident(goalDir, {
            verdict: "red",
            fix: { layer: "run", path: "a.txt", summary: "task broke script" },
          });
          ctx.writeOutcome(outcome({ summary: "red verdict" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "infra" }), fallback: true },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      await runDispatch(runtime, { iteration: 1 });
      expect(implCalls).toBe(2);
      const records = await runtime.store.listRecords();
      expect(
        derive(
          await runtime.store.listTasks(),
          records,
          runtime.configs.process.flows,
        ).tasks.a!.status,
      ).toBe("merged");
      const redCheck = records.find(
        (r) => r.slug === "a" && r.step === "checks" && r.ok === false,
      );
      expect(redCheck?.checks?.[0]?.details).toMatchObject({ verdict: "red" });
      expect(
        (redCheck?.checks?.[0]?.details as Record<string, unknown> | undefined)
          ?.kind,
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  }, 60_000);
}

function testMergeChecksVerdicts() {
  it("routes persistent infra and red verdicts correctly inside mergeChecks", async () => {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-merge-i-"));
    const redRun = await stageMergeVerdict("red", path.join(probeDir, "fixed"));
    try {
      expect(redRun.implCalls()).toBe(2);
      const records = await redRun.runtime.store.listRecords();
      expect(
        derive(
          await redRun.runtime.store.listTasks(),
          records,
          redRun.runtime.configs.process.flows,
        ).tasks.a!.status,
      ).toBe("merged");
      const failedMerge = records.find(
        (r) => r.slug === "a" && r.step === "merge" && r.ok === false,
      );
      expect(failedMerge?.cause?.kind).not.toBe("infra");
      expect(
        (
          failedMerge?.checks?.[0]?.details as
            | Record<string, unknown>
            | undefined
        )?.kind,
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(redRun.repo);
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
    const infraRun = await stageMergeVerdict("infra");
    try {
      expect(infraRun.result.reason).toBe("infra");
      const records = await infraRun.runtime.store.listRecords();
      const mergeCheck = records.find(
        (r) => r.slug === "a" && r.step === "merge-checks" && r.ok === false,
      );
      expect(mergeCheck?.checks?.[0]?.details).toMatchObject({ kind: "infra" });
      expect(records.filter((r) => r.step === "park")).toHaveLength(0);
    } finally {
      cleanupFlowRepo(infraRun.repo);
    }
  }, 60_000);
}

describe("infra verdict checks & merge adjudication routing", () => {
  testChecksRedVerdict();
  testMergeChecksVerdicts();
});
