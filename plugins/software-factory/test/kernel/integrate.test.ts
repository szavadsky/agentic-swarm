// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
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
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

interface GateProbe {
  dir: string;
  count: string;
  marker: string;
}

function makeProbe(): GateProbe {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-merge-skip-"));
  return {
    dir,
    count: path.join(dir, "count"),
    marker: path.join(dir, "marker"),
  };
}

function runs(probe: GateProbe): number {
  try {
    const text = fs.readFileSync(probe.count, "utf8").trim();
    return text === "" ? 0 : text.split("\n").length;
  } catch {
    return 0;
  }
}

function cleanupProbe(probe: GateProbe): void {
  fs.rmSync(probe.dir, { recursive: true, force: true });
}

const quote = (value: string): string => `'${value}'`;

function greenCommand(probe: GateProbe): string {
  return `echo run >> ${quote(probe.count)}`;
}

/** Red once with a bun-style failure, then green on the same tree. */
function flakyCommand(probe: GateProbe): string {
  return (
    `echo run >> ${quote(probe.count)}; ` +
    `if [ -f ${quote(probe.marker)} ]; then exit 0; ` +
    `else touch ${quote(probe.marker)}; ` +
    `printf 'src/a.test.ts:\\n(fail) suite > flaky test\\n'; exit 1; fi`
  );
}

async function step(
  runtime: KernelRuntime,
  file: TaskFile,
  action: Action,
): Promise<TaskState> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  await executeTaskAction(runtime, file, action, 1, state.tasks[file.slug]!);
  const after = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return after.tasks[file.slug]!;
}

describe("merge-check skip", () => {
  it("skips merge-checks when the merged tree equals the checked tree", async () => {
    const probe = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "green", command: greenCommand(probe) }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");

      // No gate run on the merged tree: only the task-checks run happened.
      expect(runs(probe)).toBe(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-checks"),
      ).toHaveLength(0);

      const merge = records.find(
        (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
      );
      expect(merge).toBeDefined();
      expect(causeText(merge!.cause)).toContain("skipped merge-checks");
      expect(causeText(merge!.cause)).toContain(
        "merged tree equals checked tree",
      );
      expect(merge!.checks).toHaveLength(1);
      expect(merge!.checks![0]!.ok).toBe(true);

      // Tree equality, not commit: the squash commit differs from the tip.
      const checks = records.find(
        (r) => r.slug === "task" && r.step === "checks",
      );
      const checkedTree = checks?.tree;
      expect(checkedTree).toBeDefined();
      const tip = repo
        .git(["rev-parse", "factory-task/demo/task"])
        .stdout.trim();
      expect(merge!.commit).toBeDefined();
      expect(merge!.commit).not.toBe(tip);
      const tipTree = repo.git(["rev-parse", `${tip}^{tree}`]).stdout.trim();
      const mergeTree = repo
        .git(["rev-parse", `${merge!.commit}^{tree}`])
        .stdout.trim();
      expect(tipTree).toBe(checkedTree!);
      expect(mergeTree).toBe(checkedTree!);
      expect(causeText(merge!.cause)).toContain(checkedTree!);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(probe);
    }
  }, 60_000);

  it("runs merge-checks when the merged tree differs", async () => {
    const probe = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "green", command: greenCommand(probe) }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
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
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      await step(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      // No separate checks step: the implement turn already gated its tree.
      await step(runtime, file, {
        kind: "step",
        slug: "task",
        step: "review",
        round: 1,
      });

      // A concurrent landing moves the head: the squash tree now differs.
      fs.writeFileSync(path.join(checkout, "other.txt"), "other\n", "utf8");
      repo.git(["add", "other.txt"], { cwd: checkout });
      repo.git(["commit", "-m", "concurrent landing"], { cwd: checkout });

      await step(runtime, file, { kind: "merge", slug: "task" });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");

      const mergeChecks = records.filter(
        (r) => r.slug === "task" && r.step === "merge-checks",
      );
      expect(mergeChecks).toHaveLength(1);
      expect(mergeChecks[0]!.ok).toBe(true);
      expect(runs(probe)).toBe(2);

      const merge = records.find(
        (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
      );
      expect(merge).toBeDefined();
      expect(merge!.cause ?? "").not.toContain("skipped merge-checks");

      const checks = records.find(
        (r) => r.slug === "task" && r.step === "checks",
      );
      const mergeTree = repo
        .git(["rev-parse", `${merge!.commit}^{tree}`])
        .stdout.trim();
      expect(checks?.tree).toBeDefined();
      expect(mergeTree).not.toBe(checks!.tree);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(probe);
    }
  }, 60_000);

  it("counts a gate-flake re-run as the checked tree result", async () => {
    const green = makeProbe();
    const flaky = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "flaky", command: flakyCommand(flaky) },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(true);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "gate-flake"),
      ).toHaveLength(1);

      // The flake re-run closed the tree green, so the merge skips its gates:
      // flaky ran checks + re-run, green ran checks, neither ran at merge.
      expect(runs(flaky)).toBe(2);
      expect(runs(green)).toBe(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-checks"),
      ).toHaveLength(0);
      const merge = records.find(
        (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
      );
      expect(causeText(merge?.cause)).toContain("skipped merge-checks");
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(flaky);
    }
  }, 60_000);
});
