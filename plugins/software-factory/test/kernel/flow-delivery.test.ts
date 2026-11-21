import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

interface GateProbe {
  dir: string;
  count: string;
  marker: string;
}

function makeProbe(): GateProbe {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flake-"));
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

/** Always green; its count proves green gates never re-run. */
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

async function reRunsRedGateOnceMergesGateFlakePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  flaky: ReturnType<typeof makeProbe>,
  green: ReturnType<typeof makeProbe>,
) {
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
  // No fix turn: one implement turn, QA and the review.
  expect(harness.calls).toHaveLength(3);

  const checks = records.filter(
    (r) => r.slug === "task" && r.step === "checks",
  );
  expect(checks).toHaveLength(1);
  expect(checks[0]!.ok).toBe(true);
  expect(typeof checks[0]!.tree).toBe("string");

  const flakes = records.filter(
    (r) => r.slug === "task" && r.step === "gate-flake",
  );
  expect(flakes).toHaveLength(1);
  expect(causeText(flakes[0]!.cause)).toContain("flaky");
  expect(causeText(flakes[0]!.cause)).toContain("src/a.test.ts");
  expect(causeText(flakes[0]!.cause)).toContain("flaky test");

  // Only the red gate re-ran, and the merge skipped its gates on the
  // already-judged tree: flaky ran first + re-run, green ran checks.
  expect(runs(flaky)).toBe(2);
  expect(runs(green)).toBe(1);

  await writeMetrics(runtime.store, {
    iteration: 1,
    status: "in-progress",
    records,
  });

  return { runtime, records, state };
}

async function reRunsRedGateOnceMergesGateFlakePart2(
  scope: Awaited<ReturnType<typeof reRunsRedGateOnceMergesGateFlakePart1>>,
) {
  const { runtime, state, records } = scope;
  const metrics = yaml.parse(
    (await runtime.store.readFile("metrics.yaml"))!,
  ) as GoalMetrics;
  expect(metrics.iterations[0]!.incidents.gateFlakes).toBe(1);
  expect(metrics.totals.incidents.gateFlakes).toBe(1);

  await writeIterationSummary(runtime.store, {
    iteration: 1,
    state,
    records,
    status: "in-progress",
  });
  const summary = fs.readFileSync(
    path.join(runtime.store.goalDir, "iterations/1/summary.md"),
    "utf8",
  );
  expect(summary).toContain("- gate flakes: 1");
}

function registerGateFlakeReRunPart1(): void {
  it("re-runs a red gate once and merges with a gate-flake record when the re-run is green", async () => {
    const green = makeProbe();
    const flaky = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "flaky", command: flakyCommand(flaky) },
      ],
    });
    try {
      const scope1 = await reRunsRedGateOnceMergesGateFlakePart1(
        repo,
        goal,
        flaky,
        green,
      );
      await reRunsRedGateOnceMergesGateFlakePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(flaky);
    }
  }, 60_000);
}

function registerDeliveryGuardPart1(): void {
  it("parks an implement turn that delivers no outcome, naming the outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

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
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "no outcome after repair",
      );
      expect(harness.calls).toHaveLength(3);
      expect(harness.calls[1]!.prompt).toContain(
        "You are the implementer. Your turn did not deliver its outcome.",
      );
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDeliveryGuardPart2(): void {
  it("parks a review that delivers no verdict, naming the verdict", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no verdict yet" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "still no verdict" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

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
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "verdict is required",
      );
      expect(harness.calls).toHaveLength(5);
      expect(harness.calls[3]!.prompt).toContain(
        "You are the reviewer. Your turn did not deliver its verdict.",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDeliveryGuardPart3(): void {
  it("merges after the second repair delivers the implement outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "v1 recovered" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 2 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(5);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      expect(implement.attempts).toHaveLength(3);
      expect(state.tasks.task!.turns).toBe(5);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDeliveryGuardPart4(): void {
  it("honours a task repairTurns override of zero", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 0 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(2);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain("no outcome");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("delivery guard", () => {
  registerDeliveryGuardPart1();

  registerDeliveryGuardPart2();

  registerDeliveryGuardPart3();

  registerDeliveryGuardPart4();
});

describe("gate flake re-run", () => {
  /**
   * A bun-style red report longer than the `tail -25` the implementer used
   * live: the `(fail)` line sits above 30 detail lines, so a truncated run
   * loses the only line that names the failure.
   */
  registerGateFlakeReRunPart1();
});
